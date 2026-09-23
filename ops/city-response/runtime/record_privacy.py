"""Closed source rules produce cleaned evidence; regex absence never approves text."""
from __future__ import annotations
from datetime import date, datetime
import csv
import hashlib
import io
import json
import re

VERSION='record-privacy-v1'
MADISON_VERSION='madison-heights-enforcement-list-v1'
HEADER=['Enforcement Number','Address/ Parcel Number','Category','Date Filed','Status','Next Action','Next Action Date','Date Closed']
CATEGORIES={'OTHER','LANDLORD LICENSE','IPMC','DEBRIS','WEEDS','UNLIC/INOPS','PARK UNAP. SURFACE','SIGNS','VEGETATION OVER SIDWALK','12 HR TRASH REMOVAL','TRASH','NO C/O','BRUSH AT CURB','ANIMAL','BUSINESS LICENSE','DANG/DEAD/DIS TREES','VACANT','FENCES','OUTDOOR STORAGE','RODENTS','NO PERMIT','GROUND FEEDING'}
STATUSES={'COMPLIED':'complied','VIOLATION':'reported_violation','NO VIOLATION SEEN':'no_violation_seen','CANCELLED':'cancelled','':'not_supplied'}

def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
def sha(v):return hashlib.sha256(v if isinstance(v,bytes) else canonical(v).encode()).hexdigest()
def require(v,code):
    if not v: raise ValueError(code)

def privacy_check(description,*,rule=None,structured_fields=None):
    """Only reviewed, closed-vocabulary fields can generate an accepted description.

    Original narratives remain solely in the private source. There is deliberately
    no best-effort masking path which could silently retain an unidentified person.
    """
    original_hash=sha(description)
    reasons=[]
    if description is not None and not isinstance(description,str):
        return dict(status='needs_review',cleaned_description=None,original_hash=original_hash,cleaned_hash=None,rule_version=VERSION,reasons=['invalid_description_type'])
    if rule!=MADISON_VERSION or not isinstance(structured_fields,dict):
        return dict(status='needs_review',cleaned_description=None,original_hash=original_hash,cleaned_hash=None,rule_version=VERSION,reasons=['unreviewed_narrative_transformation'])
    category=structured_fields.get('category');status=structured_fields.get('source_status')
    if category not in CATEGORIES:reasons.append('unmapped_or_missing_category')
    if status not in STATUSES:reasons.append('unclear_source_status')
    # This reviewed layout contains no narrative description. A new narrative
    # column/value invalidates the rule; we never discard actual condition facts.
    if description is not None:reasons.append('unexpected_source_narrative')
    cleaned=None if reasons else ('Agency enforcement case category: '+category+'. '+
        ('Agency status: '+status+'.' if status else 'The agency did not supply a case status.'))
    return dict(status='needs_review' if reasons else 'passed',cleaned_description=cleaned,
        original_hash=original_hash,cleaned_hash=sha(cleaned) if cleaned is not None else None,
        rule_version=VERSION+':'+rule,reasons=reasons,
        rules=['closed_category_allowlist','closed_status_allowlist','no_narrative_in_source_schema','exclude_parcel_from_description'])

def source_date(v):
    if not v:return None
    require(bool(re.fullmatch(r'\d{2}/\d{2}/\d{4}',v)),'source_date_format_changed')
    try:return datetime.strptime(v,'%m/%d/%Y').date().isoformat()
    except ValueError:raise ValueError('source_date_invalid') from None

def madison_rows(raw):
    """Account for every physical row, including parcel continuations and footer."""
    require(isinstance(raw,bytes) and 0<len(raw)<=20_000_000,'source_size_invalid')
    try: rows=list(csv.reader(io.StringIO(raw.decode('utf-8-sig'),newline=''),strict=True))
    except (UnicodeError,csv.Error):raise ValueError('source_csv_invalid') from None
    require(6<=len(rows)<=50000 and all(len(r)==8 for r in rows),'source_layout_changed')
    require(rows[0][0]=='Enforcement List' and all(not x for x in rows[0][1:7]) and rows[1]==HEADER,'source_header_changed')
    report_date=source_date(rows[0][7]);require(report_date,'report_date_missing')
    require(not any(x.strip() for x in rows[2]),'source_header_separator_changed')
    require(rows[-3][0]=='Records:' and rows[-3][1].isdigit() and not any(rows[-3][2:]),'source_count_footer_missing')
    require(rows[-2]==['Population:','All Records','','','','','',''],'source_population_changed')
    period=re.fullmatch(r'Enforcement\.DateFiled  Between  (\d{1,2}/\d{1,2}/\d{4}) 12:00:00 AM AND (\d{1,2}/\d{1,2}/\d{4}) 11:59:59 PM',rows[-1][0])
    require(period and not any(rows[-1][1:]),'source_period_footer_changed')
    try: source_start,source_end=[datetime.strptime(v,'%m/%d/%Y').date().isoformat() for v in period.groups()]
    except ValueError:raise ValueError('source_period_invalid') from None
    require(source_start<=source_end<=report_date,'source_period_invalid')
    results=[];i=3
    while i<len(rows)-3:
        r=rows[i]
        require(re.fullmatch(r'E\d{2}-\d{5}',r[0]),'source_case_identifier_or_layout_changed')
        entry=dict(zip(HEADER,r));indices=[i+1];i+=1
        require(i<len(rows)-3 and not rows[i][0] and re.fullmatch(r'\d{2}-\d{2}-\d{2}-\d{3}-\d{3}',rows[i][1]) and not any(rows[i][2:]),'source_parcel_continuation_changed')
        entry['parcel_id']=rows[i][1];indices.append(i+1);i+=1
        results.append(dict(source_rows=indices,original=entry,source_row_hash=sha([r,rows[i-1]])))
    require(len(results)==int(rows[-3][1]),'source_row_count_mismatch')
    return dict(adapter_version=MADISON_VERSION,original_sha256=sha(raw),physical_rows=len(rows),
                case_rows=len(results),report_date=report_date,source_period_text=rows[-1][0],
                source_period_start=source_start,source_period_end=source_end,rows=results)

def normalize_address(value):
    return re.sub(r'\s+',' ',value.strip().upper()) if isinstance(value,str) else ''

def exact_property_match(record,candidates):
    """No inferred street suffixes, fuzzy cross-city joins, or invented unit numbers."""
    required=('address','city','state')
    if any(not record.get(k) for k in required):return dict(status='needs_review',reason='property_address_incomplete',property_id=None)
    matches=[p for p in candidates if all(normalize_address(p.get(k))==normalize_address(record[k]) for k in required)]
    ids={p.get('id') for p in matches}
    if len(ids)==1 and None not in ids:return dict(status='matched',property_id=next(iter(ids)))
    return dict(status='needs_review',property_id=None,reason='ambiguous_property_match' if ids else 'property_not_matched')

def clean_madison(raw,*,agency_key,expected_agency_key,request_id,receipt_id,period_start,period_end):
    require(agency_key==expected_agency_key and bool(agency_key),'verified_agency_binding_required')
    require(request_id and receipt_id,'request_and_receipt_required')
    start,end=date.fromisoformat(period_start),date.fromisoformat(period_end);require(start<=end,'request_period_invalid')
    report=madison_rows(raw);records=[];seen={}
    # Detect a conflicting case across the whole file before any row can pass.
    versions={}
    for item in report['rows']:
        versions.setdefault(item['original']['Enforcement Number'],set()).add(item['source_row_hash'])
    for item in report['rows']:
        source=item['original'];reasons=[];warnings=[]
        privacy=privacy_check(None,rule=MADISON_VERSION,structured_fields={'category':source['Category'],'source_status':source['Status']})
        reasons.extend(privacy['reasons'])
        dates={}
        for native,target in [('Date Filed','filed_date'),('Next Action Date','next_action_date'),('Date Closed','closed_date')]:
            try: dates[target]=source_date(source[native])
            except ValueError as e:dates[target]=None;reasons.append(str(e))
        if not dates['filed_date']:reasons.append('missing_filed_date')
        elif not period_start<=dates['filed_date']<=period_end:reasons.append('outside_original_request_period')
        if dates['filed_date'] and not report['source_period_start']<=dates['filed_date']<=report['source_period_end']:reasons.append('outside_agency_report_period')
        if dates['closed_date'] and dates['filed_date'] and dates['closed_date']<dates['filed_date']:reasons.append('closed_before_filed')
        if any(d and d>report['report_date'] for k,d in dates.items() if k!='next_action_date'):reasons.append('event_after_report_date')
        if source['Next Action']:reasons.append('unreviewed_next_action_text')
        address=source['Address/ Parcel Number']
        if not re.fullmatch(r'\d+[A-Za-z]? [A-Za-z0-9 .#/-]{2,160}',address):reasons.append('unrecognized_property_address')
        record_key=sha([agency_key,'case',source['Enforcement Number']])
        if len(versions[source['Enforcement Number']])>1:reasons.append('conflicting_source_case')
        prior=seen.get(record_key)
        if prior:reasons.append('duplicate_source_case' if prior==item['source_row_hash'] else 'conflicting_source_case')
        seen[record_key]=item['source_row_hash']
        evidence=dict(agency_key=agency_key,request_id=request_id,receipt_id=receipt_id,
          original_sha256=report['original_sha256'],source_rows=item['source_rows'],source_row_hash=item['source_row_hash'],adapter_version=MADISON_VERSION)
        canonical_record=dict(record_key=record_key,record_kind='case',case_id=source['Enforcement Number'],violation_id=None,
          address=address,city='Madison Heights',state='MI',unit=None,category=source['Category'] if source['Category'] in CATEGORIES else None,
          source_status=source['Status'] if source['Status'] in STATUSES else None,status=STATUSES.get(source['Status']),**dates,
          cleaned_description=privacy['cleaned_description'],privacy=privacy,evidence=evidence,
          accuracy_status='needs_review' if reasons else 'passed',review_reasons=sorted(set(reasons)),warnings=warnings,
          import_status='not_imported',insight_status='not_generated')
        records.append(canonical_record)
    return dict(version=VERSION,adapter_version=MADISON_VERSION,original_sha256=report['original_sha256'],
        physical_rows=report['physical_rows'],input_records=report['case_rows'],passed_records=sum(r['accuracy_status']=='passed' for r in records),
        held_records=sum(r['accuracy_status']!='passed' for r in records),records=records)

def insight_evidence(record):
    """Exclusive projection. Older/unapproved/raw descriptions are never a fallback."""
    p=record.get('privacy') or {};d=record.get('cleaned_description')
    require(record.get('accuracy_status')=='passed' and record.get('import_status')=='imported' and p.get('status')=='passed'
        and isinstance(d,str) and bool(d.strip()) and sha(d)==p.get('cleaned_hash'),'cleaned_accepted_evidence_required')
    e=record.get('evidence') or {}
    require(all(e.get(k) for k in ('request_id','receipt_id','original_sha256','source_rows','source_row_hash','adapter_version')),'source_citation_required')
    require(record.get('record_kind') in ('case','complaint','inspection','violation'),'record_meaning_required')
    return dict(record_key=record['record_key'],record_kind=record['record_kind'],description=d,source=e,
        documented_condition=False if record['record_kind']!='violation' else None)
