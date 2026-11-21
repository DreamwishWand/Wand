"""Private, source-faithful on-demand quest detail shards for DDV Guide.

Shards are *byte-verified projections* of owner-private native Guide records,
not a current quest availability, player progress, or reward computation.  Public
GitHub contains only this tool and synthetic tests; no licensed game text.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path

SCHEMA = 'wand.db03.quest-detail-shards@1'
SOURCE_FILE = 'ddv_Data/StreamingAssets/itemlist/Mission.json'
SHARD_COUNT = 32
MAX_SOURCE_BYTES = 256 * 1024 * 1024
MAX_SHARD_BYTES = 16 * 1024 * 1024
KINDS = ('mission', 'questGroup', 'unclassified')


def _digest(raw):
    return hashlib.sha256(raw).hexdigest()


def _valid_hash(value):
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def _canonical(record):
    return json.dumps(record, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':')).encode('utf-8')


def bucket_for(record_id):
    if not isinstance(record_id, str) or not record_id.isascii() or not record_id.isdecimal() or int(record_id) <= 0:
        raise ValueError('QUEST_SHARD_INVALID_NATIVE_ID')
    return int.from_bytes(hashlib.sha256(record_id.encode('ascii')).digest()[:4], 'big') % SHARD_COUNT


def _source_contract(records, target):
    if not isinstance(target, dict) or not isinstance(target.get('gameVersion'), str) or not target['gameVersion'] or not isinstance(target.get('platform'), str) or not target['platform']:
        raise ValueError('QUEST_SHARD_TARGET_REQUIRED')
    if not isinstance(records, list):
        raise ValueError('QUEST_SHARD_RECORDS_REQUIRED')
    if not records:
        return None
    source_shas = set()
    seen = set()
    for row in records:
        if not isinstance(row, dict):
            raise ValueError('QUEST_SHARD_INVALID_RECORD')
        rid = row.get('id')
        bucket_for(rid)
        if rid in seen:
            raise ValueError('QUEST_SHARD_DUPLICATE_NATIVE_ID')
        seen.add(rid)
        if row.get('recordKind') not in KINDS or not _valid_hash(row.get('nativeWireSha256')):
            raise ValueError('QUEST_SHARD_UNVERIFIED_NATIVE_RECORD')
        source = row.get('source')
        if not isinstance(source, dict) or source.get('file') != SOURCE_FILE or not _valid_hash(source.get('sha256')):
            raise ValueError('QUEST_SHARD_MISSING_SOURCE_PROVENANCE')
        source_shas.add(source['sha256'])
    if len(source_shas) != 1:
        raise ValueError('QUEST_SHARD_MIXED_SOURCE_VERSIONS')
    return source_shas.pop()


def project_quest_shards(records, target, out, save):
    """Produce each immutable shard and a small lookup index using native rows."""
    source_sha = _source_contract(records, target)
    if source_sha is None:
        return {'status': 'native_source_unavailable', 'records': 0, 'shards': 0}
    out = Path(out)
    buckets = collections.defaultdict(list)
    for row in records:
        buckets[bucket_for(row['id'])].append(row)
    by_id = {}
    shards = []
    for bucket_id, rows in sorted(buckets.items()):
        rows.sort(key=lambda item: int(item['id']))
        relative = f'quest-shards/part-{bucket_id:02d}.json'
        target_file = out / 'guide' / relative
        doc = {'schema': SCHEMA, 'target': target, 'source': {'file': SOURCE_FILE,
                'sha256': source_sha}, 'bucket': bucket_id, 'records': rows,
               'evaluation': 'static_definition_only'}
        save(target_file, doc)
        nbytes = target_file.stat().st_size
        if nbytes > MAX_SHARD_BYTES:
            target_file.unlink()
            raise ValueError('QUEST_SHARD_EXCEEDS_MAX_BYTES')
        shards.append({'bucket': bucket_id, 'file': relative, 'sha256': _digest(target_file.read_bytes()),
                       'bytes': nbytes, 'records': len(rows)})
        for row in rows:
            by_id[row['id']] = {'bucket': bucket_id, 'file': relative, 'kind': row['recordKind'],
                               'nativeWireSha256': row['nativeWireSha256'],
                               'recordSha256': _digest(_canonical(row))}
    index = {'schema': SCHEMA, 'target': target,
             'source': {'file': SOURCE_FILE, 'sha256': source_sha},
             'partition': {'algorithm': 'sha256-first-32bits-big-endian-modulo-32',
                           'buckets': SHARD_COUNT},
             'meaning': 'source-faithful static quest detail, not player progress or live availability',
             'counts': {'records': len(records), 'shards': len(shards),
                        'recordKinds': dict(sorted(collections.Counter(x['recordKind'] for x in records).items()))},
             'shards': shards, 'byId': dict(sorted(by_id.items(), key=lambda entry: int(entry[0])))}
    save(out / 'database' / 'quest-detail-shard-index.json', index)
    return {'status': 'source_faithful_static_shards', 'records': len(records),
            'shards': len(shards), 'maxShardBytes': max(x['bytes'] for x in shards),
            'indexBytes': (out/'database'/'quest-detail-shard-index.json').stat().st_size}


def verify_quest_shards(root, original=None):
    """Verify each hash, exact record coverage, bucket, and optional full source."""
    root = Path(root)
    index_path = root / 'database' / 'quest-detail-shard-index.json'
    if index_path.is_symlink() or not index_path.is_file() or index_path.stat().st_size > MAX_SHARD_BYTES:
        raise ValueError('QUEST_SHARD_INDEX_MISSING_OR_OVERSIZED')
    index = json.loads(index_path.read_text(encoding='utf-8'))
    if index.get('schema') != SCHEMA or index.get('partition') != {
            'algorithm': 'sha256-first-32bits-big-endian-modulo-32', 'buckets': SHARD_COUNT}:
        raise ValueError('QUEST_SHARD_INDEX_SCHEMA_MISMATCH')
    if not isinstance(index.get('shards'), list) or not isinstance(index.get('byId'), dict) or not index['shards']:
        raise ValueError('QUEST_SHARD_INDEX_INVALID')
    source = index.get('source')
    if not isinstance(source, dict) or source.get('file') != SOURCE_FILE or not _valid_hash(source.get('sha256')):
        raise ValueError('QUEST_SHARD_INDEX_SOURCE_INVALID')
    expected = index['byId']
    found = {}
    seen_buckets = set()
    counts = collections.Counter()
    for desc in index['shards']:
        bucket = desc.get('bucket')
        if type(bucket) is not int or bucket not in range(SHARD_COUNT) or bucket in seen_buckets:
            raise ValueError('QUEST_SHARD_INVALID_BUCKET')
        seen_buckets.add(bucket)
        rel = f'quest-shards/part-{bucket:02d}.json'
        if desc.get('file') != rel:
            raise ValueError('QUEST_SHARD_INVALID_PATH')
        path = root/'guide'/rel
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_SHARD_BYTES:
            raise ValueError('QUEST_SHARD_MISSING_OR_OVERSIZED')
        payload = path.read_bytes()
        if _digest(payload) != desc.get('sha256') or len(payload) != desc.get('bytes'):
            raise ValueError('QUEST_SHARD_CHECKSUM_MISMATCH')
        data = json.loads(payload)
        rows = data.get('records')
        if data.get('schema') != SCHEMA or data.get('target') != index.get('target') or data.get('source') != source or data.get('bucket') != bucket or not isinstance(rows, list) or len(rows) != desc.get('records'):
            raise ValueError('QUEST_SHARD_ENVELOPE_MISMATCH')
        for row in rows:
            rid = row.get('id') if isinstance(row, dict) else None
            if bucket_for(rid) != bucket or rid in found or rid not in expected:
                raise ValueError('QUEST_SHARD_BAD_OR_DUPLICATE_RECORD')
            locator = expected[rid]
            if locator != {'bucket': bucket, 'file': rel, 'kind': row.get('recordKind'),
                           'nativeWireSha256': row.get('nativeWireSha256'),
                           'recordSha256': _digest(_canonical(row))}:
                raise ValueError('QUEST_SHARD_RECORD_CHECKSUM_MISMATCH')
            record_source = row.get('source')
            if not isinstance(record_source, dict) or any(record_source.get(key) != value for key, value in source.items()):
                raise ValueError('QUEST_SHARD_RECORD_SOURCE_MISMATCH')
            found[rid] = row
            counts[row['recordKind']] += 1
    if len(found) != index['counts'].get('records') or len(seen_buckets) != index['counts'].get('shards') or set(found) != set(expected) or dict(sorted(counts.items())) != index['counts'].get('recordKinds'):
        raise ValueError('QUEST_SHARD_COVERAGE_MISMATCH')
    if original is not None:
        original = Path(original)
        if original.is_symlink() or not original.is_file() or original.stat().st_size > MAX_SOURCE_BYTES:
            raise ValueError('QUEST_SHARD_ORIGINAL_UNAVAILABLE')
        payload = json.loads(original.read_text(encoding='utf-8'))
        if payload.get('family') != 'quests' or payload.get('target') != index['target'] or not isinstance(payload.get('records'), list):
            raise ValueError('QUEST_SHARD_ORIGINAL_TARGET_MISMATCH')
        source_rows = {row['id']: row for row in payload['records']}
        if len(source_rows) != len(payload['records']) or set(source_rows) != set(found):
            raise ValueError('QUEST_SHARD_ORIGINAL_COVERAGE_MISMATCH')
        for rid, row in source_rows.items():
            if _digest(_canonical(row)) != expected[rid]['recordSha256']:
                raise ValueError('QUEST_SHARD_ORIGINAL_CONTENT_MISMATCH')
    return {'status': 'verified', 'records': len(found), 'shards': len(seen_buckets),
            'recordKinds': dict(sorted(counts.items())), 'comparedToOriginal': original is not None}


def main():
    ap = argparse.ArgumentParser(description='Private DDV Guide quest detail shard builder/validator')
    ap.add_argument('--input', type=Path, help='Private original guide/quests.json, required for build')
    ap.add_argument('--output', type=Path, required=True, help='Private output root containing guide/ and database/')
    ap.add_argument('--verify', action='store_true', help='Verify existing shards; optional --input compares original')
    args = ap.parse_args()
    try:
        output = args.output.resolve()
        if args.verify:
            result = verify_quest_shards(output, args.input)
        else:
            if args.input is None:
                raise ValueError('QUEST_SHARD_ORIGINAL_INPUT_REQUIRED')
            source = args.input.resolve(strict=True)
            if args.input.is_symlink() or not source.is_file() or source.stat().st_size > MAX_SOURCE_BYTES or source == output or output in source.parents:
                raise ValueError('QUEST_SHARD_INVALID_ORIGINAL_PATH')
            doc = json.loads(source.read_text(encoding='utf-8'))
            if doc.get('family') != 'quests':
                raise ValueError('QUEST_SHARD_NOT_QUEST_SOURCE')
            from native_guide import save
            result = project_quest_shards(doc.get('records'), doc.get('target'), output, save)
            if result['status'] != 'native_source_unavailable':
                verify_quest_shards(output, source)
        print(json.dumps(result, sort_keys=True))
    except (OSError, ValueError, KeyError, TypeError) as error:
        ap.exit(1, f'DB-03 quest shard error: {error}\n')


if __name__ == '__main__':
    main()
