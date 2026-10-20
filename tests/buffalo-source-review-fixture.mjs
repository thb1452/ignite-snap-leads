export function buffaloPage(offset = 0) {
  const total = 984;
  return {
    version: 'owner-buffalo-source-review-v1', status: 'available', checked_at: '2026-10-20T18:00:00Z',
    batch: {
      preparation_sha256: 'a'.repeat(64), source_name: 'City of Buffalo, NY',
      source_url: 'https://data.buffalony.gov/resource/ivrf-k9vm.json',
      collected_at: '2026-10-19T23:43:46.001147+00:00', event_count: total, case_count: 322,
      address_count: 307, held_count: 4, limitations: ['Residential classification is supplied by the agency.'],
    },
    events: Array.from({length: Math.min(25, Math.max(0, total - offset))}, (_, i) => {
      const n = offset + i;
      return {
        agency_record_id: String(538401 + n), case_number: `GEN22-${Math.floor(n / 4)}`,
        case_type: 'GENERAL', violation_code: '2025PMCNYS-302.1', code_section: 'Exterior Property Areas',
        violation_description: 'Sanitation', comments: 'Agency description of an exterior condition.',
        violation_location: '', violation_date: '2026-09-21', source_date_raw: '2026-09-21T00:00:00.000',
        source_status: 'ACTIVE', normalized_status: 'active', address: `${n + 1} TEST STREET`,
        city: 'BUFFALO', state: 'NY', zip: '14207', property_class: '210',
        residential_evidence: 'Official NYS residential class in agency source.', parcel_id: String(770000 + n),
        source_content_hash: n.toString(16).padStart(64, '0'), source_row_number: 200897 + n,
      };
    }),
    next_offset: offset + 25 < total ? offset + 25 : null,
  };
}
