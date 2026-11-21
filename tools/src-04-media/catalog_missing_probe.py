"""Read-only location probe for icon GUIDs absent from the exact SRC-04 map.

Uses SHA-pinned Addressables catalog indexes and SRC-01 original Item IDs.
Reports only GUID dependencies and candidate bundle names. Never decodes image
pixels or treats bundle co-location as proof of image identity.
"""
import argparse
import collections
import hashlib
import json
import re
import struct
from pathlib import Path

DIGESTS = {
    'InternalIds': '09d7a580c211d1a3606488403ea6431fdae3c63aa281152ccf3bccab7402b4c6',
    'bucketData': 'bcfdf91e4206bc09ea7a013a298f4f2432b9f84905deebc753776e800b07bc9e',
    'entryData': 'fc4a579b494b4e80c0ebfba5ca0d8d2d4abca10c34f3555b9ad84146b6aba866',
    'keyData': '20be86edc02effe8f236e722ac0125459790de5415e9ba2f1456e3c85b5f6176',
}
GUID = re.compile(r'^[0-9a-f]{32}$')
BUNDLE = re.compile(r'(?i)([a-z0-9_-]+\.bundle)(?:\b|$)')


def require(ok, code):
    if not ok:
        raise ValueError('SRC04_MISSING_' + code)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def parse_key(blob, offset):
    if offset < 4 or offset + 5 > len(blob) or blob[offset] != 0:
        return None
    n = struct.unpack_from('<I', blob, offset + 1)[0]
    if n > 4096 or offset + 5 + n > len(blob):
        return None
    try:
        return blob[offset + 5:offset + 5 + n].decode('utf-8')
    except UnicodeError:
        return None


def parse_buckets(blob):
    require(len(blob) >= 4, 'BUCKET_HEADER')
    count = struct.unpack_from('<I', blob)[0]
    require(0 < count <= 2_000_000, 'BUCKET_COUNT')
    pos, result = 4, []
    for _ in range(count):
        require(pos + 8 <= len(blob), 'BUCKET_TRUNCATED')
        offset, size = struct.unpack_from('<ii', blob, pos)
        pos += 8
        require(0 <= size <= 1_000_000 and pos + size * 4 <= len(blob), 'BUCKET_ENTRY_RANGE')
        indices = struct.unpack_from('<' + str(size) + 'i', blob, pos) if size else ()
        result.append((offset, indices))
        pos += 4 * size
    require(pos == len(blob), 'BUCKET_TRAILING')
    return result


def load_catalog(root):
    blobs = {}
    for name, expected in DIGESTS.items():
        data = (root / ('catalog.' + name + '.bin')).read_bytes()
        require(hashlib.sha256(data).hexdigest() == expected, 'CATALOG_HASH_' + name)
        blobs[name] = data
    ids = blobs['InternalIds'].decode('utf-8-sig').splitlines()
    entries = blobs['entryData']
    require(len(entries) >= 4, 'ENTRY_HEADER')
    n = struct.unpack_from('<I', entries)[0]
    require(len(entries) == 4 + 28 * n, 'ENTRY_SIZE')
    buckets = parse_buckets(blobs['bucketData'])
    require(len(blobs['keyData']) >= 4 and
            struct.unpack_from('<I', blobs['keyData'])[0] == len(buckets), 'KEY_COUNT')
    return blobs['keyData'], buckets, entries, n, ids


def source_guids(output):
    root = output / 'source-items'
    manifest = read_json(root / 'manifest.json')
    original = (root / 'items.jsonl').read_bytes()
    require(hashlib.sha256(original).hexdigest() == manifest['itemsSha256'], 'SRC01_SHA')
    values = collections.defaultdict(list)
    categories = collections.defaultdict(collections.Counter)
    count = 0
    for line in original.splitlines():
        row = json.loads(line)
        icon = row.get('iconGuid', '')
        require(isinstance(icon, str) and icon.startswith('guid:') and
                GUID.fullmatch(icon[5:]), 'SRC01_GUID')
        key = icon[5:]
        values[key].append(row['itemId'])
        categories[key][row['nativeCategory']] += 1
        count += 1
    require(count == manifest.get('itemCount'), 'SRC01_COUNT')
    return values, categories, manifest


def inspect(output, game):
    values, categories, source = source_guids(output)
    links = read_json(output / 'catalog-identity-links-private.json')
    require(links.get('schema') == 'wand.src04.identity-links@2' and
            links.get('publicationApproved') is False and
            len(links.get('guidToImage', {})) == links.get('verifiedGuidCount'), 'LINK_SCHEMA')
    matched = set(links['guidToImage'])
    require(matched <= set(values), 'LINKS_OUTSIDE_SOURCE')
    missing = set(values) - matched
    keys, buckets, entries, n_entries, ids = load_catalog(
        game / 'ddv_Data' / 'StreamingAssets' / 'aa')

    def entry(index):
        return struct.unpack_from('<7i', entries, 4 + index * 28) if 0 <= index < n_entries else None

    dependencies = collections.defaultdict(set)
    located = set()
    for offset, refs in buckets:
        name = parse_key(keys, offset)
        if not name or name.lower() not in missing:
            continue
        guid = name.lower()
        located.add(guid)
        for index in refs:
            record = entry(index)
            require(record is not None, 'BAD_ITEM_ENTRY')
            dep = record[2]
            require(0 <= dep < len(buckets), 'BAD_DEPENDENCY_INDEX')
            dependencies[guid].add(dep)

    groups = {}
    for dep in sorted(set().union(*dependencies.values()) if dependencies else set()):
        offset, refs = buckets[dep]
        key = parse_key(keys, offset)
        names, locations = set(), []
        for index in refs:
            record = entry(index)
            require(record is not None and 0 <= record[0] < len(ids), 'BAD_DEPENDENCY_ENTRY')
            loc = ids[record[0]]
            names.update(x.lower() for x in BUNDLE.findall(loc))
            if len(locations) < 4:
                locations.append(loc[:240])
        groups[dep] = {'groupKey': (key or '')[:160],
                       'bundleFilenames': sorted(names), 'sampleLocations': locations}

    by_bundle = collections.defaultdict(lambda: {
        'guids': set(), 'items': set(), 'categories': collections.Counter()})
    rows = []
    for guid in sorted(missing):
        deps = sorted(dependencies[guid])
        bundles = sorted({b for dep in deps for b in groups[dep]['bundleFilenames']})
        for bundle in bundles:
            by_bundle[bundle]['guids'].add(guid)
            by_bundle[bundle]['items'].update(values[guid])
            by_bundle[bundle]['categories'].update(categories[guid])
        rows.append({
            'iconGuid': 'guid:' + guid, 'itemCount': len(values[guid]),
            'categories': dict(sorted(categories[guid].items())),
            'dependencyGroups': deps, 'bundleFilenames': bundles,
            'status': 'has_bundle_reference' if bundles else (
                'catalog_key_without_bundle' if guid in located else 'not_in_catalog')})
    category_totals = collections.Counter()
    for guid in missing:
        category_totals.update(categories[guid])
    report = {
        'schema': 'wand.src04.missing-locations@1', 'publicationApproved': False,
        'sourceItemsSha256': source['itemsSha256'],
        'verifiedGuidCount': len(matched), 'unresolvedGuidCount': len(missing),
        'unresolvedItemCount': sum(len(values[g]) for g in missing),
        'unresolvedCategories': dict(sorted(category_totals.items())),
        'catalogLocatedGuidCount': len(located),
        'withBundleCount': sum(bool(row['bundleFilenames']) for row in rows),
        'bundles': [
            {'filename': name, 'guids': len(value['guids']),
             'items': len(value['items']),
             'categories': dict(sorted(value['categories'].items()))}
            for name, value in sorted(by_bundle.items(),
                key=lambda pair: (-len(pair[1]['guids']), pair[0]))],
        'dependencyGroups': {str(k): v for k, v in sorted(groups.items())},
        'guids': rows, 'complete': len(located) == len(missing),
        'note': 'Bundle co-location is not proof of individual GUID-to-image identity.'
    }
    dest = output / 'catalog-missing-report.json'
    tmp = dest.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) +
                   '\n', encoding='utf-8')
    tmp.replace(dest)
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--game', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = inspect(args.out, args.game)
    print(json.dumps({
        'verifiedGuidCount': result['verifiedGuidCount'],
        'unresolvedGuidCount': result['unresolvedGuidCount'],
        'catalogLocatedGuidCount': result['catalogLocatedGuidCount'],
        'withBundleCount': result['withBundleCount'],
        'bundleCount': len(result['bundles']),
        'report': str(args.out / 'catalog-missing-report.json')
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
