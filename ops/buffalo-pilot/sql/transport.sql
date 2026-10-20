-- Temporary privileged-SQL transport for the already reviewed Buffalo payload.
-- This only works around a query-request size limit. It is not an API import
-- path and does not grant any new identity, table access or ingestion authority.
-- The unchanged fn_import_buffalo_pilot_v1 must verify the fully reconstructed
-- text and perform the import. Do not import individual chunks as records.
--
-- Chunk protocol: Python text slices payload_text[n*96000:(n+1)*96000], n=0..30.
-- SHA-256 values are lowercase hex digests of UTF-8 bytes, not character codes.
-- After importing and reading back the receipt/events, the operator may DROP
-- this single transport table; immutable batch payload/evidence remains stored.
BEGIN;

CREATE TABLE snap_relaunch.buffalo_pilot_transfer_chunks_v1 (
  preparation_sha256 text NOT NULL
    CHECK (preparation_sha256 = '3b183a7897deb2e919f364a6131d501e6bf67ce010c6ea097a1e31c3f0a8499b'),
  chunk_number integer NOT NULL CHECK (chunk_number BETWEEN 0 AND 30),
  chunk_count integer NOT NULL DEFAULT 31 CHECK (chunk_count = 31),
  chunk_text text NOT NULL,
  chunk_sha256 text NOT NULL CHECK (chunk_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (preparation_sha256, chunk_number),
  CHECK (char_length(chunk_text) BETWEEN 1 AND 96000),
  CHECK (chunk_number = 30 OR char_length(chunk_text) = 96000),
  CHECK (chunk_sha256 = encode(sha256(convert_to(chunk_text, 'UTF8')), 'hex'))
);

ALTER TABLE snap_relaunch.buffalo_pilot_transfer_chunks_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON snap_relaunch.buffalo_pilot_transfer_chunks_v1 FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE snap_relaunch.buffalo_pilot_transfer_chunks_v1 IS
  'Admin SQL transport only for the pinned first Buffalo pilot. No API access or UI reader. Reconstruct all 31 chunks in numeric order and call the unchanged hash-verifying private importer. Remove transport after verified import.';

COMMIT;

-- Operator validation before calling the private importer must check all of:
-- count(*) = 31; min(chunk_number) = 0; max(chunk_number) = 30;
-- encode(sha256(convert_to(string_agg(chunk_text, '' ORDER BY chunk_number),
--   'UTF8')), 'hex') = preparation_sha256.
-- The primary key plus these checks proves the complete contiguous sequence.
-- Use string_agg(chunk_text, '' ORDER BY chunk_number) without separators.
