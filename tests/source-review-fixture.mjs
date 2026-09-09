export const batchId = 'a'.repeat(64);
export function reviewPage(offset=0) {
  return {version:'owner-source-review-v1',status:'available',checked_at:'2026-09-09T04:20:00Z',
    batch:{preparation_sha256:batchId,event_count:63,property_count:29,review_status:'pending_review',
      collected_at:'2026-09-07T22:47:08Z',source_name:'Synthetic government fixture',source_url:'https://example.gov/records',
      limitations:['Test fixture only. No government delivery or release is established.']},
    events:Array.from({length:Math.min(25,Math.max(0,63-offset))},(_,i)=>{
      const n=offset+i+1;return {record_key:n.toString(16).padStart(64,'0'),source_row:n,
        case_id:'SHARED-CASE',government_violation_id:String(n),published_violation_number:'V-'+n,
        original_description:'Original ordinance description '+n+' <img src=x onerror=alert(1)>',
        source_status:'Open',normalized_status:'open',violation_date:'2026-09-01',violation_timestamp_utc:'2026-09-01T12:00:00Z',
        opened_date:'2026-08-15',status_changed_utc:null,compliance_due_utc:null,source_attribution:'Synthetic fixture',
        source_notice:'Use the original records when reviewing.',review_reasons:['unit_not_provided','customer_release_approval_missing'],
        property:{property_id:'11111111-1111-5111-8111-'+String(n%29).padStart(12,'0'),source_parcel_reference:'SBL-'+n%29,address:n+' Example Street',city:'Syracuse',state:'NY',zip:'13202'},
        parcel_evidence:{source_scope:'dated_parcel_snapshot',source_item_id:'fixture',source_retrieved_at:'2026-09-09T03:40:00Z',source_url:'https://example.gov/parcels',map_title:'Dated parcel test',map_data_edited_at:'2026-02-02T00:00:00Z',
          vintage_note:'August 2025 geometry and January 2026 extract.',field_notes:{n_ResUnits:'Calculated residential-unit count; no unit roster supplied.',yr_built:'May be effective year built, not construction year.',ACRES:'May be calculated from frontage and depth.'},
          recorded_residential_units:2,recorded_year_built:1920,recorded_lot_acres:0.12,latitude:43.04,longitude:-76.14,
          limitations:['Not a current occupancy or affected-unit finding.']}};
    }),next_offset:offset+25<63?offset+25:null};
}
