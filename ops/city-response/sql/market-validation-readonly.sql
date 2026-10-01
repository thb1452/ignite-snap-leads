-- Read-only evidence queries. These neither accept a source nor call ingestion.
-- Always pin an approved receipt when reading private rows for offline review.

SELECT receipt_id, original_sha256, received_at, imported_at,
       original_row_count, passing_row_count,
       result->>'imported' AS imported,
       result->>'held' AS import_stage_held
FROM snap_relaunch.receipt_imports_v1
ORDER BY imported_at DESC LIMIT 5;

SELECT agency_key, source_status, count(*) AS cases,
       count(*) FILTER (WHERE closed_date IS NOT NULL) AS closed_date_present,
       count(*) FILTER (WHERE customer_property_id IS NOT NULL) AS legacy_property_match_present,
       count(*) FILTER (WHERE closed_date < filed_date OR filed_date > report_date
                         OR closed_date > report_date) AS invalid_date_order,
       count(*) FILTER (WHERE city <> 'Madison Heights' OR state <> 'MI'
                         OR agency_key <> 'us:mi:madisonheights') AS invalid_jurisdiction,
       count(*) FILTER (WHERE cleaned_description <>
         'Agency enforcement case category: ' || category || '. ' ||
         CASE WHEN source_status = '' THEN 'The agency did not supply a case status.'
              ELSE 'Agency status: ' || source_status || '.' END) AS changed_description
FROM snap_relaunch.cleaned_receipt_records_v1
GROUP BY agency_key, source_status ORDER BY agency_key, source_status;

SELECT count(*) AS cases, count(DISTINCT source_property_key) AS source_properties,
       count(DISTINCT record_key) AS distinct_record_keys,
       count(DISTINCT source_row_sha256) AS distinct_row_hashes,
       count(DISTINCT original_sha256) AS distinct_original_hashes,
       count(DISTINCT archive_id) AS distinct_archives,
       count(*) FILTER (WHERE cleaned_sha256 <>
         encode(sha256(convert_to(to_json(cleaned_description)::text, 'UTF8')), 'hex'))
         AS invalid_cleaned_hash
FROM snap_relaunch.cleaned_receipt_records_v1;

SELECT (SELECT count(*) FROM snap_relaunch.customer_source_acceptances) AS source_acceptances,
       (SELECT count(*) FROM snap_relaunch.source_crm_links) AS source_crm_links;
