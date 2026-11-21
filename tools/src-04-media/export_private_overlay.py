"""Export a private SHA-pinned SRC-04 icon overlay for lazy DB-01 consumers.

No game images, WebP bytes, source files, or public URLs are copied. Never
writes inside a Git checkout. Future game versions use the same contract.
"""
import argparse
import hashlib
import json
import os
import re
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

SCHEMA = 'wand.src04.media-overlay@1'
SHARD = 'wand.src04.media-overlay-shard@1'
SHA = re.compile(r'^[0-9a-f]{64}$')
GUID = re.compile(r'^guid:[0-9a-f]{32}$')
CATEGORIES = {'ActivityItem', 'Furniture', 'Clothing', 'Trimming'}
EVIDENCE = 'exact_catalog_key_and_serialized_bundle_path_id'


def need(ok, code):
    if not ok:
        raise ValueError('SRC04_OVERLAY_' + code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(Path(path).read_bytes())


def store(path, obj):
    data = (json.dumps(obj, ensure_ascii=False, sort_keys=True,
                       separators=(',', ':')) + '\n').encode('utf-8')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {'bytes': len(data), 'sha256': digest(data)}


def variant(raw, kind, source_sha):
    need(isinstance(raw, dict), 'VARIANT')
    path, sha = raw.get('path'), raw.get('sha256')
    need(isinstance(path, str) and re.fullmatch(
        rf'images/{kind}/[0-9a-f]{{2}}/{source_sha}\.webp', path), 'VARIANT_PATH')
    need(isinstance(sha, str) and SHA.fullmatch(sha), 'VARIANT_HASH')
    need(type(raw.get('width')) is int and raw['width'] > 0 and
         type(raw.get('height')) is int and raw['height'] > 0, 'VARIANT_SIZE')
    return {'path': path, 'sha256': sha, 'width': raw['width'], 'height': raw['height']}


def icon_image(raw):
    need(isinstance(raw, dict) and raw.get('identityEvidence') == EVIDENCE, 'EVIDENCE')
    cls, asset, other = raw.get('assetClass'), raw.get('assetId'), raw.get('counterpartAssetId')
    need(cls in ('Sprite', 'Texture2D') and isinstance(asset, str) and
         asset.startswith('unity:') and asset.endswith(':' + cls), 'ASSET_ID')
    need((cls == 'Texture2D' and other is None) or
         (cls == 'Sprite' and (other is None or
          isinstance(other, str) and other.endswith(':Texture2D'))), 'POINTER_PAIR')
    sha = raw.get('decodedSha256')
    need(isinstance(sha, str) and SHA.fullmatch(sha), 'SOURCE_SHA')
    variants = raw.get('variants')
    need(isinstance(variants, dict), 'MISSING_VARIANTS')
    return {'class': cls, 'unityAssetId': asset, 'textureAssetId': other,
            'sourceSha256': sha, 'identityEvidence': EVIDENCE,
            'detail': variant(variants.get('detail'), 'detail', sha),
            'thumbnail': variant(variants.get('thumbnail'), 'thumbnail', sha)}


def export(source_items, source_manifest, mapping_path, join_report_path, output):
    output = Path(output).resolve()
    need(not output.exists(), 'REFUSE_OVERWRITE')
    for parent in (output, *output.parents):
        need(not (parent / '.git').exists() and not
             ((parent / 'package.json').exists() and (parent / 'src').exists()),
             'OUTPUT_INSIDE_REPOSITORY')
    source = read(source_manifest)
    originals = Path(source_items).read_bytes()
    need(source.get('schema') == 'wand.src01.steam-native@1' and
         digest(originals) == source.get('itemsSha256'), 'SRC01_DIGEST')
    source_rows = [json.loads(line) for line in originals.splitlines() if line]
    need(len(source_rows) == source.get('itemCount') and len(source_rows) > 0, 'SRC01_COUNT')
    original = {}
    for row in source_rows:
        item_id, guid, category = row.get('itemId'), row.get('iconGuid'), row.get('nativeCategory')
        need(type(item_id) is int and item_id > 0 and item_id not in original, 'SRC01_ID')
        need(isinstance(guid, str) and GUID.fullmatch(guid), 'SRC01_GUID')
        need(category in CATEGORIES, 'SRC01_CATEGORY')
        original[item_id] = (guid, category)
    report = read(join_report_path)
    mapped_bytes = Path(mapping_path).read_bytes()
    need(report.get('schema') == 'wand.src04.item-icon-join@1' and
         report.get('publicationApproved') is False and
         report.get('source', {}).get('sourceItemSha256') == digest(originals) and
         report.get('files', {}).get('itemMapJsonl', {}).get('sha256') == digest(mapped_bytes),
         'JOIN_DIGEST')
    rows = [json.loads(line) for line in mapped_bytes.splitlines() if line]
    need(len(rows) == len(original), 'MAP_COUNT')
    buckets = defaultdict(list)
    counts = Counter()
    unique = {'verified': set(), 'unresolved': set()}
    seen = set()
    for row in rows:
        item_id = row.get('itemId')
        need(type(item_id) is int and item_id in original and item_id not in seen, 'MAP_ID')
        seen.add(item_id)
        guid, category = original[item_id]
        need(row.get('iconGuid') == guid and row.get('nativeCategory') == category, 'SOURCE_MISMATCH')
        status = row.get('status')
        need(status in ('verified', 'unresolved') and
             (status == 'verified') == (row.get('image') is not None), 'MAP_STATUS')
        image = icon_image(row['image']) if status == 'verified' else None
        buckets[f'{item_id % 256:02x}'].append({
            'itemId': item_id, 'iconGuid': guid, 'status': status, 'image': image})
        counts[status] += 1
        unique[status].add(guid)
    totals = report.get('totals', {})
    need(seen == set(original) and len(buckets) == 256 and
         counts['verified'] == totals.get('verifiedItemCount') and
         counts['unresolved'] == totals.get('unresolvedItemCount') and
         len(unique['verified']) == totals.get('verifiedGuidCount') and
         len(unique['unresolved']) == totals.get('unresolvedGuidCount') and
         len(unique['verified'] | unique['unresolved']) == totals.get('uniqueGuidCount') and
         len(original) == totals.get('itemCount') and
         unique['verified'].isdisjoint(unique['unresolved']), 'COVERAGE')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='src04-overlay-', dir=output.parent) as temporary:
        stage = Path(temporary)
        files = {}
        for key, values in sorted(buckets.items()):
            rows = sorted(values, key=lambda r: r['itemId'])
            name = f'id/{key}.json'
            meta = store(stage / name, {'schema': SHARD, 'bucket': key, 'rows': rows})
            files[name] = {**meta, 'count': len(rows),
                           'verified': sum(v['status'] == 'verified' for v in rows)}
        manifest = {
            'schema': SCHEMA, 'privateOnly': True, 'publicationAuthorized': False,
            'source': {'itemsSha256': digest(originals), 'itemMapSha256': digest(mapped_bytes),
                       'sourcePlatformProvenance': source.get('platform'),
                       'sourceVersionProvenance': source.get('gameVersion')},
            'coverage': {'totalItems': len(original), 'verifiedItems': counts['verified'],
                         'unresolvedItems': counts['unresolved'],
                         'verifiedGuids': len(unique['verified']),
                         'unresolvedGuids': len(unique['unresolved']),
                         'scope': 'four_native_item_categories_partial_icon_coverage',
                         'complete': False},
            'bucketCount': 256, 'files': files,
            'imageByteVerification': 'not_performed',
            'publicationNote': 'Private-only image paths; no hosting or publication authorized.'}
        store(stage / 'manifest.json', manifest)
        for name, meta in files.items():
            raw = (stage / name).read_bytes()
            need(len(raw) == meta['bytes'] and digest(raw) == meta['sha256'], 'SHARD_DIGEST')
        os.rename(stage, output)
    return manifest


def main():
    parser = argparse.ArgumentParser()
    for name in ('source-items', 'source-manifest', 'map', 'join-report', 'out'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    result = export(args.source_items, args.source_manifest,
                    args.map, args.join_report, args.out)
    print(json.dumps({'shards': len(result['files']),
                      'coverage': result['coverage']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
