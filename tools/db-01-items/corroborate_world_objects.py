"""Private DB-01 ↔ DB-04 exact-original-source evidence overlay.

Produces only native-name localization keys and source-derived footprint dimensions
for Furniture/Building. This is NOT a full game-version/placement/save join.
Requires independently pinned SQLite and DB-04 archive SHA-256 at admission.
No project repository/game originals are modified or published.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import stat
import tempfile
import zipfile
from collections import Counter
from pathlib import Path

SCHEMA = 'wand.db01.db04-native-evidence@1'
DB01_SCHEMA = 'wand.db01.sqlite@2'
DB04_SCHEMA = 'wand.db04.world@1'
CATEGORIES = ('Building', 'Furniture')
BUCKETS = 256
SOURCE_PREFIX = 'ddv_Data/StreamingAssets/itemlist/'
SHA = re.compile(r'[0-9a-f]{64}\Z')
NATIVE_KEY = re.compile(r'[^\x00-\x1f]+\Z')
MAX_ZIP_BYTES = 80_000_000
MAX_OBJECTS_BYTES = 50_000_000


def fail_if(condition, message):
    if condition:
        raise ValueError('DB01_WORLD_' + message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open('rb') as source:
        for part in iter(lambda: source.read(1024 * 1024), b''):
            hasher.update(part)
    return hasher.hexdigest()


def canonical(obj) -> bytes:
    return (json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


def json_exact(data: bytes):
    def reject_duplicate(pairs):
        d = {}
        for key, value in pairs:
            fail_if(key in d, 'DUPLICATE_JSON_KEY')
            d[key] = value
        return d
    return json.loads(data.decode('utf-8'), object_pairs_hook=reject_duplicate)


def validate_source_archive(archive: Path, expected_sha: str):
    fail_if(not archive.is_file() or archive.is_symlink() or archive.stat().st_size > MAX_ZIP_BYTES,
            'INVALID_WORLD_ARCHIVE')
    fail_if(not isinstance(expected_sha, str) or not SHA.fullmatch(expected_sha) or
            file_sha(archive) != expected_sha, 'WORLD_ARCHIVE_PIN_MISMATCH')
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        fail_if(len(names) != len(set(names)), 'DUPLICATE_ARCHIVE_MEMBER')
        for info in z.infolist():
            fail_if(info.filename.startswith(('/', '\\')) or '..' in info.filename.split('/') or
                    info.filename.count('\\') or
                    (info.external_attr >> 16 & 0o170000) == stat.S_IFLNK,
                    'UNSAFE_ARCHIVE_MEMBER')
        fail_if('manifest.json' not in names or 'objects.json' not in names,
                'WORLD_ARCHIVE_MISSING_DATA')
        fail_if(z.getinfo('objects.json').file_size > MAX_OBJECTS_BYTES or
                z.getinfo('manifest.json').file_size > 1_000_000, 'ARCHIVE_OVERSIZE')
        mbytes = z.read('manifest.json')
        obytes = z.read('objects.json')
        manifest = json_exact(mbytes)
        fail_if(not isinstance(manifest, dict) or manifest.get('schema') != DB04_SCHEMA or
                manifest.get('status') != 'partial_game_native_evidence' or
                manifest.get('platform') != 'Steam' or
                not isinstance(manifest.get('gameVersion'), str), 'WORLD_MANIFEST_CONTRACT')
        fail_if(manifest.get('outputSha256', {}).get('objects.json') != digest(obytes),
                'WORLD_OBJECT_LEDGER_MISMATCH')
        objects = json_exact(obytes)
        fail_if(not isinstance(objects, list), 'WORLD_OBJECTS_NOT_LIST')
        sources = {}
        for src in manifest.get('sources', []):
            if isinstance(src, dict) and src.get('path') in {
                    SOURCE_PREFIX + category + '.json' for category in CATEGORIES}:
                key = src['path']
                fail_if(key in sources or not SHA.fullmatch(src.get('sha256', '')),
                        'DUPLICATE_OR_INVALID_WORLD_SOURCE')
                sources[key] = src['sha256']
        fail_if(len(sources) != len(CATEGORIES), 'WORLD_SOURCE_PROOF_MISSING')
        return manifest, objects, sources, digest(mbytes), digest(obytes)


def validate_footprint(raw):
    if raw is None:
        return None
    fail_if(not isinstance(raw, dict), 'FOOTPRINT_SHAPE')
    x, y = raw.get('sizeX'), raw.get('sizeY')
    mask = raw.get('acceptedFloorTypesFlag')
    layers = raw.get('layerValues')
    fail_if(type(x) is not int or type(y) is not int or not 1 <= x <= 256 or
            not 1 <= y <= 256 or x * y > 16384 or not isinstance(layers, list) or
            len(layers) != x * y or any(type(v) is not int or v < 0 or v > 0xffffffff for v in layers) or
            type(mask) is not int or mask < 0 or mask > 0xffffffff or
            raw.get('cellIndexToXYVerified') is not False or
            raw.get('layerMaskSemanticsVerified') is not False, 'FOOTPRINT_NOT_NATIVE_EVIDENCE')
    return {'sizeX': x, 'sizeY': y, 'acceptedFloorTypesFlag': mask,
            'layerValuesSha256': digest(canonical(layers)),
            'nativeDimensionsVerified': True, 'placementLegalityVerified': False,
            'cellIndexToXYVerified': False, 'layerMaskSemanticsVerified': False}


def build(sqlite_file: Path, archive: Path, out: Path,
          *, expected_sqlite_sha256: str, expected_world_archive_sha256: str):
    sqlite_file, archive, out = sqlite_file.resolve(), archive.resolve(), out.resolve()
    fail_if(out.exists(), 'REFUSE_OVERWRITE')
    for parent in (out.parent, *out.parent.parents):
        fail_if((parent / '.git').exists() or
                ((parent / 'src').exists() and (parent / 'package.json').exists()),
                'OUTPUT_INSIDE_REPOSITORY')
    fail_if(not sqlite_file.is_file() or sqlite_file.is_symlink() or
            not isinstance(expected_sqlite_sha256, str) or
            not SHA.fullmatch(expected_sqlite_sha256) or
            file_sha(sqlite_file) != expected_sqlite_sha256, 'SQLITE_PIN_MISMATCH')
    manifest, objects, sources, world_manifest_sha, objects_sha = validate_source_archive(
        archive, expected_world_archive_sha256)
    con = sqlite3.connect(f'file:{sqlite_file.as_posix()}?mode=ro&immutable=1', uri=True)
    try:
        fail_if(con.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or
                con.execute('PRAGMA foreign_key_check').fetchall() != [], 'DB01_INTEGRITY')
        snapshot = con.execute('''SELECT store_schema, platform, game_version, items_sha256,
            definition_count, full_corpus_parsed, publication_authorized
            FROM catalog WHERE id=1''').fetchone()
        fail_if(snapshot is None or snapshot[0] != DB01_SCHEMA or snapshot[1] != 'Steam' or
                snapshot[6] != 0, 'DB01_STORE_CONTRACT')
        current = {}
        for item_id, category, native_key, label_key, source_sha in con.execute('''
            SELECT item_id,native_category,native_key,localization_key,source_sha256
            FROM definition WHERE native_category IN ('Building','Furniture')'''):
            fail_if(type(item_id) is not int or item_id in current, 'DB01_DUPLICATE_ITEM')
            fail_if(source_sha != sources[SOURCE_PREFIX + category + '.json'],
                    'GAME_SOURCE_BYTES_DIFFER')
            current[item_id] = (category, native_key, label_key, source_sha)
        fail_if(not current or len(current) != len(objects), 'MISSING_OR_EXTRA_WORLD_DEFINITIONS')
        by_cat = Counter()
        label_recovered = Counter()
        footprints = Counter()
        output = [[] for _ in range(BUCKETS)]
        observed = set()
        for obj in objects:
            fail_if(not isinstance(obj, dict), 'WORLD_OBJECT_SHAPE')
            item_id = obj.get('itemId')
            category = obj.get('nativeType')
            raw_name = obj.get('nativeName')
            label_key = obj.get('localizationKey')
            fail_if(type(item_id) is not int or item_id <= 0 or item_id in observed or
                    category not in CATEGORIES or item_id not in current or
                    not isinstance(raw_name, str) or not NATIVE_KEY.fullmatch(raw_name) or
                    raw_name.strip() != raw_name or len(raw_name) > 256 or
                    not isinstance(label_key, str) or not label_key or
                    not NATIVE_KEY.fullmatch(label_key) or
                    label_key.strip() != label_key or
                    len(label_key) > 512, 'WORLD_ITEM_IDENTITY')
            observed.add(item_id)
            expected_cat, expected_name, db01_label, sha = current[item_id]
            fail_if(category != expected_cat or raw_name != expected_name or
                    obj.get('source', {}).get('path') != SOURCE_PREFIX + category + '.json' or
                    (db01_label is not None and db01_label != label_key),
                    'DB01_WORLD_NATIVE_IDENTITY_MISMATCH')
            footprint = validate_footprint(obj.get('footprint'))
            by_cat[category] += 1
            label_recovered[category] += db01_label is None
            footprints[category] += footprint is not None
            output[item_id % BUCKETS].append({
                'itemId': item_id, 'nativeCategory': category, 'nativeKey': raw_name,
                'localizationKey': label_key, 'sourceSha256': sha, 'footprint': footprint,
            })
        fail_if(len(observed) != len(current), 'MISSING_CURRENT_ITEMS')
        out.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.db01-world-', dir=out.parent) as temp:
            root = Path(temp)
            files = {}
            for i, rows in enumerate(output):
                rows.sort(key=lambda row: row['itemId'])
                data = canonical(rows)
                path = root / f'{i:02x}.json'
                path.write_bytes(data)
                files[path.name] = {'bytes': len(data), 'sha256': digest(data), 'count': len(rows)}
            overlay_manifest = {
                'schema': SCHEMA, 'privateOnly': True, 'publicationAuthorized': False,
                'platform': 'Steam', 'db01GameVersion': snapshot[2],
                'worldGameVersion': manifest['gameVersion'],
                'db01SourceItemsSha256': snapshot[3],
                'db01SqliteSha256': expected_sqlite_sha256,
                'worldArchiveSha256': expected_world_archive_sha256,
                'worldManifestSha256': world_manifest_sha,
                'worldObjectsSha256': objects_sha,
                'sourceSha256ByCategory': {cat: sources[SOURCE_PREFIX + cat + '.json']
                                           for cat in CATEGORIES},
                'categories': list(CATEGORIES), 'bucketCount': BUCKETS,
                'itemCount': len(observed), 'byCategory': dict(sorted(by_cat.items())),
                'recoveredLocalizationKeys': dict(sorted(label_recovered.items())),
                'verifiedFootprints': dict(sorted(footprints.items())),
                'fullWorldHierarchyVerified': False,
                'placementLegalityVerified': False,
                'saveStateOrOwnershipVerified': False,
                'files': files,
            }
            (root / 'manifest.json').write_bytes(canonical(overlay_manifest))
            fail_if(file_sha(sqlite_file) != expected_sqlite_sha256 or
                    file_sha(archive) != expected_world_archive_sha256,
                    'INPUT_CHANGED_DURING_BUILD')
            fail_if(out.exists(), 'REFUSE_OVERWRITE')
            os.rename(root, out)
    finally:
        con.close()
    return {'status': 'private_exact_source_corroborated_not_placement_verified',
            'schema': SCHEMA, 'items': len(observed),
            'byCategory': dict(sorted(by_cat.items())),
            'localizationKeysRecovered': dict(sorted(label_recovered.items())),
            'nativeFootprints': dict(sorted(footprints.items())),
            'shards': BUCKETS, 'sourceHashMatches': len(CATEGORIES),
            'privateOnly': True, 'out': str(out)}


def main():
    parser = argparse.ArgumentParser(description='Corroborate private DB-01 source records with DB-04 original-source object definitions')
    parser.add_argument('--sqlite', type=Path, required=True)
    parser.add_argument('--world-zip', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--expected-sqlite-sha256', required=True)
    parser.add_argument('--expected-world-archive-sha256', required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.sqlite, args.world_zip, args.out,
          expected_sqlite_sha256=args.expected_sqlite_sha256,
          expected_world_archive_sha256=args.expected_world_archive_sha256), sort_keys=True))


if __name__ == '__main__':
    main()