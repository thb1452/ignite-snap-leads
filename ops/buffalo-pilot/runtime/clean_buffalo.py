#!/usr/bin/env python3
"""Prepare a reviewed Buffalo residential Code batch offline. Never writes to Snap.

The input must be the retained residential-eligible CSV or CSV.GZ. Existing-key
matching is conservative and state-wide; it can hold a genuinely different case.
No owner/contact enrichment, property-type inference, network, or database writes.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import gzip
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
import math
from pathlib import Path
import re

SOURCE_ID = "SRC_2c09ff0ee9f5da4d"
SOURCE_URL = "https://data.buffalony.gov/resource/ivrf-k9vm.json"
AGENCY = "City of Buffalo, NY"
RESIDENTIAL_CLASSES = frozenset({"200", "210", "215", "220", "230", "240", "250", "260", "270", "271", "280", "281"})
RESIDENTIAL_EVIDENCE = "Official NYS residential property-class code in source propclass; mixed residential/agricultural and incidental-commercial classes excluded."
REPLACEMENTS = {'NORTH':'N','SOUTH':'S','EAST':'E','WEST':'W','NORTHEAST':'NE','NORTHWEST':'NW','SOUTHEAST':'SE','SOUTHWEST':'SW','STREET':'ST','AVENUE':'AVE','ROAD':'RD','BOULEVARD':'BLVD','DRIVE':'DR','LANE':'LN','COURT':'CT','PLACE':'PL','TERRACE':'TER','CIRCLE':'CIR','PARKWAY':'PKWY','HIGHWAY':'HWY','EXPRESSWAY':'EXPY','TRAIL':'TRL','CENTER':'CTR','MOUNT':'MT','SAINT':'ST'}
FIELDS = ["batch_state", "record_type", "source_id", "agency_name", "agency_record_id", "case_number", "case_type", "violation_code", "code_section", "violation_description", "comments", "violation_location", "violation_date", "source_date_raw", "source_status", "normalized_status", "address", "city", "state", "zip", "property_class", "residential_evidence", "parcel_id", "latitude", "longitude", "source_url", "snapshot_finished_at", "source_content_hash", "input_file_sha256", "source_row_number"]


def basic(value):
    return re.sub('[^A-Z0-9]', '', str(value or '').upper())


def canonical(value):
    # Reproduces the checked NY inventory's normalization. Used ONLY to HOLD
    # possible existing records, never to merge output addresses or units.
    value = str(value or '').upper().split(',')[0]
    value = re.sub(r'\s+(?:APT|APARTMENT|UNIT|SUITE|STE|FLOOR|FL)\b.*$|#.*$', '', value)
    value = re.sub('[^A-Z0-9]+', ' ', value).strip()
    return basic(' '.join(REPLACEMENTS.get(token, token) for token in value.split()))


def digest(value):
    return hashlib.md5(value.encode('utf-8')).hexdigest()


def case_key(value):
    value = basic(value)
    return 'c:' + digest(value) if value else None


def address_keys(value):
    return {'a:' + digest(v) for v in (basic(value), canonical(value)) if v}


def stable_json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def source_fields(row):
    # Retain original agency values, omitting audit enrichment from row hashes.
    return {k: v for k, v in row.items() if not k.startswith('audit_')}


def business_fields(row):
    # Distinct agency IDs with identical content require review, not a merge.
    return {k: v for k, v in source_fields(row).items() if k not in {'uniquekey', ':id'}}


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pieces = []
        self.ignored_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style'}:
            self.ignored_depth += 1
        elif tag in {'br', 'p', 'div', 'tr', 'td', 'li'}:
            self.pieces.append(' ')

    def handle_endtag(self, tag):
        if tag in {'script', 'style'}:
            self.ignored_depth = max(0, self.ignored_depth - 1)
        elif tag in {'p', 'div', 'tr', 'td', 'li'}:
            self.pieces.append(' ')

    def handle_data(self, data):
        if not self.ignored_depth:
            self.pieces.append(data)


def clean_text(value):
    parser = TextExtractor()
    parser.feed(str(value or ''))
    parser.close()
    return re.sub(r'\s+', ' ', unescape(''.join(parser.pieces))).strip()


def parse_date(value):
    value = str(value or '').strip()
    # Source uses ISO date/timestamp. Never infer a year or parse ambiguous dates.
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?', value):
        raise ValueError('invalid or missing ISO source date')
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00')) if 'T' in value else dt.date.fromisoformat(value)
    return parsed.date() if isinstance(parsed, dt.datetime) else parsed


def normalized_record(row, row_number, snapshot_at, input_hash):
    try:
        date_value = parse_date(row.get('date')).isoformat()
    except ValueError:
        date_value = ''
    return {
        'batch_state': 'PREPARED_ONLY', 'record_type': 'Code', 'source_id': SOURCE_ID,
        'agency_name': AGENCY, 'agency_record_id': row.get('uniquekey', '').strip(),
        'case_number': row.get('case_number', '').strip(), 'case_type': row.get('case_type', '').strip(),
        'violation_code': row.get('code', '').strip(), 'code_section': clean_text(row.get('code_section')),
        'violation_description': clean_text(row.get('description')), 'comments': clean_text(row.get('comments')),
        'violation_location': clean_text(row.get('violation_location')), 'violation_date': date_value,
        'source_date_raw': row.get('date', ''), 'source_status': row.get('status', ''),
        'normalized_status': 'active' if row.get('status', '').strip() == 'ACTIVE' else '',
        'address': row.get('address', '').strip(), 'city': row.get('city', '').strip(),
        'state': row.get('state', '').strip(), 'zip': row.get('zip', '').strip(),
        'property_class': row.get('propclass', '').strip(), 'residential_evidence': RESIDENTIAL_EVIDENCE,
        'parcel_id': row.get('sbl', '').strip(), 'latitude': row.get('latitude', '').strip(),
        'longitude': row.get('longitude', '').strip(), 'source_url': SOURCE_URL,
        'snapshot_finished_at': snapshot_at,
        'source_content_hash': hashlib.sha256(stable_json(source_fields(row)).encode('utf-8')).hexdigest(),
        'input_file_sha256': input_hash, 'source_row_number': str(row_number),
    }


def validate_row(row, date_error=False):
    reasons = []
    if date_error:
        reasons.append('invalid_or_missing_source_date')
    if row.get('audit_source_id') != SOURCE_ID:
        reasons.append('wrong_or_missing_source_id')
    if row.get('propclass', '').strip() not in RESIDENTIAL_CLASSES:
        reasons.append('unverified_residential_property_class')
    address = row.get('address', '').strip()
    if not re.match(r'^\d', address) or not re.search('[A-Za-z]', address) or re.match(r'^0(?:\s|$)', address):
        reasons.append('invalid_or_missing_street_address')
    if row.get('city', '').strip().upper() != 'BUFFALO':
        reasons.append('city_not_buffalo')
    if row.get('state', '').strip().upper() != 'NY':
        reasons.append('state_not_ny')
    if not re.fullmatch(r'\d{5}(?:-\d{4})?', row.get('zip', '').strip()):
        reasons.append('invalid_or_missing_zip')
    if not re.fullmatch(r'\d+', row.get('uniquekey', '').strip()):
        reasons.append('invalid_or_missing_agency_record_id')
    for field in ('case_number', 'code', 'description'):
        value = row.get(field, '').strip()
        if not value or value.upper() in {'NULL', 'NONE', 'N/A'} or (field == 'description' and not clean_text(value)):
            reasons.append('invalid_or_missing_' + field)
    try:
        lat, lon = float(row.get('latitude', '')), float(row.get('longitude', ''))
        if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180 or lat == 0 or lon == 0:
            raise ValueError('invalid coordinates')
    except (TypeError, ValueError):
        reasons.append('invalid_or_missing_coordinates')
    return reasons


def prepare_records(rows, as_of, days, keys, snapshot_at, input_hash):
    date_from = as_of - dt.timedelta(days=days)
    selected, skipped = [], collections.Counter()
    id_fingerprints, conflicting_ids = {}, set()
    input_count = 0
    for row_number, row in enumerate(rows, start=2):
        input_count += 1
        if None in row or any(v is None for v in row.values()):
            raise ValueError(f'Malformed CSV row at line {row_number}; aborting')
        record_id = row.get('uniquekey', '').strip()
        fingerprint = hashlib.sha256(stable_json(business_fields(row)).encode('utf-8')).hexdigest()
        if record_id:
            if record_id in id_fingerprints and id_fingerprints[record_id] != fingerprint:
                conflicting_ids.add(record_id)
            else:
                id_fingerprints[record_id] = fingerprint
        if row.get('status', '').strip() != 'ACTIVE':
            skipped['status_not_active'] += 1
            continue
        date_error = False
        try:
            source_date = parse_date(row.get('date'))
            if not date_from <= source_date <= as_of:
                skipped['date_outside_window'] += 1
                continue
        except ValueError:
            date_error = True
        selected.append({'raw': row, 'source_row_number': row_number, 'fingerprint': fingerprint, 'date_error': date_error})

    fingerprints = collections.defaultdict(set)
    for item in selected:
        fingerprints[item['fingerprint']].add(item['raw'].get('uniquekey', '').strip())
    duplicate_business = {h for h, ids in fingerprints.items() if len(ids) > 1}
    seen_ids, cleaned, held, reason_counts = set(), [], [], collections.Counter()
    for item in selected:
        row, row_number = item['raw'], item['source_row_number']
        record_id = row.get('uniquekey', '').strip()
        record = normalized_record(row, row_number, snapshot_at, input_hash)
        reasons = validate_row(row, item['date_error'])
        if record_id in conflicting_ids:
            reasons.append('duplicate_agency_id_conflicting_revisions')
        elif record_id and record_id in seen_ids:
            reasons.append('repeated_identical_agency_record')
        seen_ids.add(record_id)
        if item['fingerprint'] in duplicate_business:
            reasons.append('same_business_content_different_agency_ids')
        if case_key(row.get('case_number')) in keys:
            reasons.append('matches_existing_case_key_in_checked_ny_inventory')
        if address_keys(row.get('address')) & keys:
            reasons.append('matches_existing_address_key_in_checked_ny_inventory')
        if reasons:
            reason_counts.update(reasons)
            held.append(dict(record, hold_reasons='; '.join(reasons)))
        else:
            cleaned.append(record)
    cleaned.sort(key=lambda r: (r['violation_date'], r['case_number'], r['agency_record_id']))
    held.sort(key=lambda r: (r['violation_date'], r['case_number'], r['agency_record_id']))
    stats = {'input_rows': input_count, 'selected_rows': len(selected), 'cleaned_rows': len(cleaned), 'held_rows': len(held), 'skipped_rows': dict(skipped), 'hold_reason_counts': dict(reason_counts), 'same_business_content_different_id_groups': len(duplicate_business), 'conflicting_agency_ids_in_full_input': len(conflicting_ids), 'date_from': date_from.isoformat(), 'date_through': as_of.isoformat()}
    assert input_count == len(selected) + sum(skipped.values())
    assert len(selected) == len(cleaned) + len(held)
    assert len({r['agency_record_id'] for r in cleaned}) == len(cleaned)
    return selected, cleaned, held, stats


def property_summary(records):
    groups = collections.defaultdict(list)
    for row in records:
        # Exact complete address, including unit text. Never use canonical()
        # here: its unit stripping is only for conservative prior-record holds.
        groups[(row['address'], row['city'], row['state'], row['zip'])].append(row)
    output = []
    for key, rows in sorted(groups.items()):
        address, city, state, zipcode = key
        output.append({'batch_state':'PREPARED_ONLY', 'address':address, 'city':city, 'state':state, 'zip':zipcode, 'complete_address':f'{address}, {city}, {state} {zipcode}', 'violation_rows':len(rows), 'case_count':len({r['case_number'] for r in rows}), 'case_numbers':'; '.join(sorted({r['case_number'] for r in rows})), 'agency_record_ids':'; '.join(sorted(r['agency_record_id'] for r in rows)), 'property_classes':'; '.join(sorted({r['property_class'] for r in rows})), 'earliest_violation_date':min(r['violation_date'] for r in rows), 'latest_violation_date':max(r['violation_date'] for r in rows)})
    return output


def write_csv(path, fields, rows):
    with path.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='raise')
        writer.writeheader()
        writer.writerows(rows)


def inventory_summary(metadata):
    """Use the supplied current combined scope, not stale per-snapshot notes."""
    snapshots = metadata.get('inventories') or [metadata]
    keep = ('project_id', 'checked_at', 'returned', 'query_limit', 'configured_by', 'connection')
    return {
        'projects_checked': [item['project_id'] for item in snapshots],
        'checked_at': metadata.get('checked_at'),
        'returned': metadata.get('returned'),
        'scope': metadata.get('scope'),
        'inventories': [{key: item[key] for key in keep if key in item} for item in snapshots],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--keys', required=True, type=Path)
    parser.add_argument('--keys-metadata', required=True, type=Path)
    parser.add_argument('--source-manifest', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--as-of', required=True, type=dt.date.fromisoformat)
    parser.add_argument('--days', type=int, default=30)
    args = parser.parse_args()
    if args.days < 0:
        parser.error('--days must be nonnegative')
    source_manifest = json.loads(args.source_manifest.read_text())
    if source_manifest.get('source_id') != SOURCE_ID or source_manifest.get('source_url') != SOURCE_URL:
        raise ValueError('Source manifest does not identify the expected Buffalo dataset')
    snapshot_at = source_manifest.get('finished_at', '')
    dt.datetime.fromisoformat(snapshot_at.replace('Z', '+00:00'))
    key_metadata = json.loads(args.keys_metadata.read_text())
    keys = set(args.keys.read_text().splitlines())
    if any(not re.fullmatch('[ac]:[0-9a-f]{32}', key) for key in keys):
        raise ValueError('Malformed existing-key inventory')
    if len(keys) != key_metadata.get('returned'):
        raise ValueError('Existing-key count does not match saved metadata')
    if key_metadata.get('returned', 0) >= key_metadata.get('query_limit', 0):
        raise ValueError('Existing-key result may be truncated; require complete inventory')
    input_hash = sha256_file(args.input)
    opener = gzip.open if args.input.suffix == '.gz' else open
    with opener(args.input, 'rt', encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        required = {'uniquekey','case_number','date','status','code','description','address','city','state','zip','propclass','latitude','longitude','audit_source_id'}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('Input missing required columns: ' + ', '.join(sorted(required - set(reader.fieldnames or []))))
        selected, cleaned, held, stats = prepare_records(reader, args.as_of, args.days, keys, snapshot_at, input_hash)
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    write_csv(output / 'cleaned_records.csv', FIELDS, cleaned)
    write_csv(output / 'held_records.csv', FIELDS + ['hold_reasons'], held)
    properties = property_summary(cleaned)
    property_fields = ['batch_state','address','city','state','zip','complete_address','violation_rows','case_count','case_numbers','agency_record_ids','property_classes','earliest_violation_date','latest_violation_date']
    write_csv(output / 'property_summary.csv', property_fields, properties)
    # Deterministic gzip, raw original column strings preserved for all selected
    # rows, including held records. This is original retained data, not a download.
    with (output / 'raw_selected_records.jsonl.gz').open('wb') as raw_file:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw_file, mtime=0) as compressed:
            for item in selected:
                payload = {'input_row_number':item['source_row_number'], 'source_record':item['raw']}
                compressed.write((stable_json(payload) + '\n').encode('utf-8'))
    artifact_names = ['cleaned_records.csv','held_records.csv','property_summary.csv','raw_selected_records.jsonl.gz']
    manifest = {
        'batch_state':'PREPARED_ONLY', 'cleared_for_import':False,
        'blocker':'The current general Snap importer is paused and its matching logic does not preserve government unique violation IDs. A reviewed source-ID-preserving import path and deployment configuration must be verified before upload. Duplicate checks cover both supplied database inventories; they do not release the existing upload hold.',
        'as_of':args.as_of.isoformat(), 'selection':{'record_type':'Code','source_status_exact':'ACTIVE','date_from_inclusive':stats['date_from'],'date_through_inclusive':stats['date_through'],'residential_classes_allowed':sorted(RESIDENTIAL_CLASSES)},
        'source':{'id':SOURCE_ID,'agency':AGENCY,'url':SOURCE_URL,'snapshot_finished_at':snapshot_at,'manifest_sha256':sha256_file(args.source_manifest),'input_name':args.input.name,'input_sha256':input_hash,'input_is_previously_collected_residential_eligible_data':True},
        'counts':dict(stats, distinct_prepared_properties=len(properties), distinct_prepared_cases=len({r['case_number'] for r in cleaned}), selected_distinct_addresses=len({(i['raw'].get('address'),i['raw'].get('city'),i['raw'].get('state'),i['raw'].get('zip')) for i in selected})),
        'prepared_violation_date_range':{'minimum':min((r['violation_date'] for r in cleaned),default=None),'maximum':max((r['violation_date'] for r in cleaned),default=None)},
        'duplicate_check':dict(inventory_summary(key_metadata),inventory_sha256=sha256_file(args.keys),metadata_sha256=sha256_file(args.keys_metadata),inventory_unique_keys=len(keys),method='State-wide case and address MD5 keys using copied prior-audit normalization. All supplied project inventories are combined before matching. Address canonicalization strips units ONLY to hold possible prior matches; output properties retain exact complete addresses and units.'),
        'status_rule':'ACTIVE mapped to active; unknown, blank, closed and complied statuses are not selected. Source date is kept as the agency date and is not replaced by retrieval/import date.',
        'identity_rule':'Agency plus uniquekey identifies each violation. Different defects sharing case/code/date/address remain separate. All different-ID rows with identical business content are held. Conflicting revisions of one agency ID are held.',
        'limitations':['Prepared CSV is a rich staging schema, not a confirmed current Snap upload template.','No owner/contact enrichment or property-subtype inference performed.','A residential property-class code establishes the retained residential classification, not current ownership or willingness to sell.','The latest selected agency date is October 5; retrieval time does not prove every case remains active today.','Existing state-wide matches are conservative and may exclude cross-agency cases or separate units.','Coordinates are validated as finite, nonzero legal latitude/longitude values; no new geocoding performed.'],
        'artifacts':[{'name':name,'bytes':(output/name).stat().st_size,'sha256':sha256_file(output/name)} for name in artifact_names],
    }
    (output/'batch_manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({'output':str(output.resolve()),'batch_state':manifest['batch_state'],'counts':manifest['counts'],'artifacts':manifest['artifacts']},indent=2))


if __name__ == '__main__':
    main()
