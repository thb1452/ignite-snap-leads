#!/usr/bin/env python3
"""Build the single Buffalo pilot envelope offline; never connects to a database."""
import argparse
import csv
import gzip
import hashlib
import json
from pathlib import Path

from clean_buffalo import normalized_record, source_fields, stable_json

MANIFEST_SHA = 'e8a160bb048efb984f54008248ceba5c9cc6fa83f564483743038e00428a2e68'
HELD = {'538939', '538938', '539418', '539421'}


def sha(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def build(pilot):
    manifest_text = (pilot / 'batch_manifest.json').read_text(encoding='utf-8')
    assert sha(manifest_text) == MANIFEST_SHA, 'Unreviewed manifest'
    manifest = json.loads(manifest_text)
    for artifact in manifest['artifacts']:
        data = (pilot / artifact['name']).read_bytes()
        assert len(data) == artifact['bytes']
        assert hashlib.sha256(data).hexdigest() == artifact['sha256'], artifact['name']
    with gzip.open(pilot / 'raw_selected_records.jsonl.gz', 'rt', encoding='utf-8') as stream:
        raw = [json.loads(line) for line in stream]
    originals = {str(r['source_record']['uniquekey']): r for r in raw}
    assert len(originals) == len(raw) == 988
    with (pilot / 'cleaned_records.csv').open(newline='', encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == len({r['agency_record_id'] for r in rows}) == 984
    assert len({r['case_number'] for r in rows}) == 322
    assert len({tuple(r[k] for k in ('address','city','state','zip')) for r in rows}) == 307
    assert not (HELD & {r['agency_record_id'] for r in rows})
    assert set(originals) - {r['agency_record_id'] for r in rows} == HELD
    rows.sort(key=lambda r: int(r['source_row_number']))
    records = []
    evidence = []
    for row in rows:
        original = originals[row['agency_record_id']]
        assert normalized_record(original['source_record'], original['input_row_number'],
            manifest['source']['snapshot_finished_at'], manifest['source']['input_sha256']) == row
        raw_text = stable_json(source_fields(original['source_record']))
        cleaned_text = stable_json(row)
        assert sha(raw_text) == row['source_content_hash']
        records.append({'cleaned_text': cleaned_text, 'cleaned_sha256': sha(cleaned_text),
            'raw_source_text': raw_text, 'raw_content_sha256': sha(raw_text)})
        evidence.append('|'.join((row['source_id'], row['agency_record_id'],
            row['source_row_number'], sha(raw_text), sha(cleaned_text))))
    payload = stable_json({'version': 'buffalo-pilot-import-v1', 'manifest_text': manifest_text,
        'manifest_sha256': MANIFEST_SHA, 'records': records})
    return payload, {'preparation_sha256': sha(payload), 'manifest_sha256': MANIFEST_SHA,
        'records_sha256': sha('\n'.join(evidence)), 'payload_bytes': len(payload.encode('utf-8')),
        'event_count': 984, 'case_count': 322, 'address_count': 307,
        'distinct_source_parcels': len({r['parcel_id'] for r in rows}), 'held_count': 4}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pilot', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    payload, proof = build(args.pilot)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'payload.json').write_text(payload, encoding='utf-8')
    (args.output / 'payload_proof.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(proof, indent=2))
