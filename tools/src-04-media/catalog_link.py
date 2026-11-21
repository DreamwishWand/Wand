"""Read-only Addressables GUID linker for an existing SRC-04 extraction.

Reads the local Unity catalog and the saved SRC-01 / SRC-04 JSON files.
Never reopens Unity bundles, decodes images, modifies saves, or publishes data.
Only an exact Addressables internal ID == Unity container path constitutes a
verified image relationship. The catalog GUID -> location edge is separate.
"""
import argparse
import collections
import hashlib
import json
import re
import struct
from pathlib import Path

PROBE_DIGESTS = {
    'catalog.InternalIds.bin': '09d7a580c211d1a3606488403ea6431fdae3c63aa281152ccf3bccab7402b4c6',
    'catalog.bucketData.bin': 'bcfdf91e4206bc09ea7a013a298f4f2432b9f84905deebc753776e800b07bc9e',
    'catalog.entryData.bin': 'fc4a579b494b4e80c0ebfba5ca0d8d2d4abca10c34f3555b9ad84146b6aba866',
    'catalog.keyData.bin': '20be86edc02effe8f236e722ac0125459790de5415e9ba2f1456e3c85b5f6176',
}
GUID = re.compile(r'^[0-9a-f]{32}$')
BUNDLE = re.compile(r'([a-z0-9_\-.]+\.bundle)', re.I)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write('\n')
    tmp.replace(path)


def load_catalog(game, strict=True):
    base = game / 'ddv_Data' / 'StreamingAssets' / 'aa'
    blobs = {}
    for filename, expected in PROBE_DIGESTS.items():
        path = base / filename
        data = path.read_bytes()
        actual = sha256(data)
        if strict and actual != expected:
            raise ValueError(f'Catalog changed since supplied probe: {filename} {actual}')
        blobs[filename] = data
    # In this game the catalog InternalIds are newline-separated UTF-8 records.
    # Report the observed count rather than assuming it matches keys or entries.
    ids = blobs['catalog.InternalIds.bin'].decode('utf-8-sig').splitlines()
    keys = blobs['catalog.keyData.bin']
    buckets = blobs['catalog.bucketData.bin']
    entries = blobs['catalog.entryData.bin']
    key_count = struct.unpack_from('<I', keys)[0]
    bucket_count = struct.unpack_from('<I', buckets)[0]
    entry_count = struct.unpack_from('<I', entries)[0]
    if not (1 <= key_count <= 2_000_000 and key_count == bucket_count):
        raise ValueError('Key and bucket counts differ or are out of bounds')
    if len(entries) != 4 + entry_count * 28:
        raise ValueError('Entry table does not consist of seven 32-bit fields per entry')
    return ids, keys, buckets, entries, {'keyCount': key_count,
        'bucketCount': bucket_count, 'entryCount': entry_count,
        'internalIdCount': len(ids), 'catalogDigests': {
            name: sha256(data) for name, data in blobs.items()}}


def read_guid_key(data, offset):
    # Unity SerializedObjectDecoder: 0=ASCII string, next 4 bytes = length.
    if offset < 4 or offset + 5 > len(data) or data[offset] != 0:
        return None
    length = struct.unpack_from('<I', data, offset + 1)[0]
    if length not in (32, 37) or offset + 5 + length > len(data):
        return None
    raw = data[offset + 5: offset + 5 + length]
    try:
        value = raw.decode('ascii').lower()
    except UnicodeDecodeError:
        return None
    if value.startswith('guid:'):
        value = value[5:]
    return value if GUID.fullmatch(value) else None


def guid_buckets(keys, bucket_data, wanted):
    count = struct.unpack_from('<I', bucket_data)[0]
    pos = 4
    matches = collections.defaultdict(set)
    seen_guids = set()
    for _ in range(count):
        if pos + 8 > len(bucket_data):
            raise ValueError('Truncated bucket header')
        offset, n = struct.unpack_from('<ii', bucket_data, pos)
        pos += 8
        if n < 0 or n > 2_000_000 or pos + 4 * n > len(bucket_data):
            raise ValueError('Truncated or invalid bucket entry list')
        value = read_guid_key(keys, offset)
        if value in wanted:
            seen_guids.add(value)
            for (index,) in struct.iter_unpack('<i', bucket_data[pos:pos + 4 * n]):
                matches[value].add(index)
        pos += 4 * n
    if pos != len(bucket_data):
        raise ValueError(f'Unexpected bytes after bucket table: {len(bucket_data) - pos}')
    return matches, seen_guids


def load_src_items(output):
    path = output / 'source-items' / 'items.jsonl'
    manifest = json.loads((output / 'source-items' / 'manifest.json').read_text(encoding='utf-8'))
    if sha256(path.read_bytes()) != manifest['itemsSha256']:
        raise ValueError('SRC-01 cache sha256 mismatch')
    guids = collections.defaultdict(list)
    with path.open(encoding='utf-8') as stream:
        for line in stream:
            obj = json.loads(line)
            raw = str(obj['iconGuid']).lower()
            if raw.startswith('guid:') and GUID.fullmatch(raw[5:]):
                guids[raw[5:]].append(str(obj['itemId']))
    return guids


def load_extracted(output):
    # Small checkpoint JSONs reuse the existing images, without UnityPy.
    matches = collections.defaultdict(list)
    bundle_dir = output / 'bundles'
    for path in sorted(bundle_dir.glob('*.json')):
        checkpoint = json.loads(path.read_text(encoding='utf-8'))
        if not checkpoint.get('complete'):
            continue
        for image in checkpoint.get('images', []):
            for raw in image.get('containerPaths', []):
                # Do not strip path prefixes or match by basename.
                if raw:
                    matches[raw.casefold()].append(image)
    return matches


def link(game, output, strict=True):
    item_index = load_src_items(output)
    ids, keys, buckets, entries, catalog_meta = load_catalog(game, strict)
    found, seen = guid_buckets(keys, buckets, set(item_index))
    images = load_extracted(output)
    report = {'schema': 'wand.src04.catalog-link@1', 'status': 'analysis_only',
              'publicationApproved': False, 'complete': False,
              'catalog': catalog_meta, 'uniqueItemGuids': len(item_index),
              'catalogGuidKeys': len(seen), 'catalogGuidEntryLinks': sum(map(len, found.values())),
              'missingGuidKeys': sorted(set(item_index) - seen)[:40],
              'exactContainerPathMatchCount': 0, 'linkedItemCount': 0,
              'ambiguousGuidCount': 0, 'outOfRangeEntryCount': 0,
              'outOfRangeInternalIdCount': 0, 'sampleCatalogLocations': [],
              'sampleExactMatches': [], 'linkPolicy': 'exact_internal_id_equals_container_path_only'}
    verified = {}
    candidate_count = collections.Counter()
    for guid in sorted(found):
        internal_locations = []
        candidate_images = {}
        for entry_idx in sorted(found[guid]):
            if not 0 <= entry_idx < catalog_meta['entryCount']:
                report['outOfRangeEntryCount'] += 1
                continue
            internal_idx, provider_idx, dependency_idx, dependency_hash, data_idx, primary_idx, type_idx = struct.unpack_from('<7i', entries, 4 + entry_idx * 28)
            if not 0 <= internal_idx < len(ids):
                report['outOfRangeInternalIdCount'] += 1
                continue
            location = ids[internal_idx]
            internal_locations.append({'entry': entry_idx, 'internalId': location,
                'provider': provider_idx, 'dependencyKey': dependency_idx,
                'primaryKey': primary_idx, 'resourceType': type_idx})
            for image in images.get(location.casefold(), []):
                candidate_images[image['decodedSha256']] = image
        candidate_count[len(candidate_images)] += 1
        if len(report['sampleCatalogLocations']) < 20:
            report['sampleCatalogLocations'].append({'guid': 'guid:' + guid,
                'locations': internal_locations[:3], 'locationCount': len(internal_locations),
                'exactMatchingImageCount': len(candidate_images)})
        if len(candidate_images) == 1:
            img = next(iter(candidate_images.values()))
            verified[guid] = {'itemIds': item_index[guid], 'imageAssetId': img['assetId'],
                'decodedSha256': img['decodedSha256'], 'variants': img['variants'],
                'evidence': 'catalog_guid_bucket_entry_internal_id_equals_unity_container_path',
                'publicationApproved': False}
            if len(report['sampleExactMatches']) < 20:
                report['sampleExactMatches'].append({'guid':'guid:' + guid,
                    'itemIds':item_index[guid], 'assetId':img['assetId']})
        elif len(candidate_images) > 1:
            report['ambiguousGuidCount'] += 1
    report['exactContainerPathMatchCount'] = len(verified)
    report['linkedItemCount'] = sum(len(row['itemIds']) for row in verified.values())
    report['candidateMultiplicity'] = dict(sorted((str(n), cnt) for n, cnt in candidate_count.items()))
    report['complete'] = (len(seen) == len(item_index) and
        report['outOfRangeEntryCount'] == report['outOfRangeInternalIdCount'] == 0)
    write_json(output / 'catalog-link-report.json', report)
    write_json(output / 'catalog-links-private.json', {'schema': report['schema'],
        'publicationApproved': False, 'guids': verified})
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--game', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--allow-catalog-change', action='store_true')
    opts = parser.parse_args()
    report = link(opts.game.resolve(), opts.out.resolve(), not opts.allow_catalog_change)
    print(json.dumps({key: report[key] for key in ('uniqueItemGuids',
        'catalogGuidKeys', 'catalogGuidEntryLinks', 'exactContainerPathMatchCount',
        'linkedItemCount', 'ambiguousGuidCount', 'complete')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
