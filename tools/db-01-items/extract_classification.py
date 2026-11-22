"""Extract exact original Tag-ID metadata for private DB-01 classification reads.

The authoritative Item IDs and names stay in the existing SQLite v2 store.
This is a separate, SHA-bound, read-only layer; no product JS or game bytes in git.
Tag references prove associations, NOT UI hierarchy, acquisition, DLC rights,
world availability, or inferred semantic enum names.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

SCHEMA = 'wand.db01.native-tag-overlay@1'
SHA = re.compile(r'^[a-f0-9]{64}$')
SAFE_CATEGORY = re.compile(r'^[A-Za-z][A-Za-z0-9]*$')
MAX_BYTES = 32 * 1024 * 1024
BUCKETS = 256
# These fields have original Tag-ID references, observed independently on
# the current Steam originals. Other unknown wire fields are not classified.
TAG_FIELDS = {
    'ActivityItem': {8, 9, 10, 11, 12, 13, 14, 15, 16, 30, 31},
    'Furniture': {9, 10}, 'Clothing': {9}, 'Trimming': {10},
    'Character': {12}, 'Set': {6}, 'TouchOfMagic': {6, 9},
    'Building': {30}, 'Companion': {6, 7, 10},
    'ActivityData': {8}, 'MemoryShard': {8, 15},
    'Makeup': {15}, 'AvatarFeature': {15}, 'Story': {17},
    'BoardGame': {13}, 'Tool': {12}, 'Skin': {11, 18},
    'Upgrade': {7}, 'MountGear': {6},
}
# Grouping applies ONLY to exact Tag.json records. It is a source Tag-ID
# namespace, not an Item-ID numeric range classifier.
TAG_GROUP_RANGES = {
    'clothingSlot': (2000100000, 2000100999),
    'furnitureKind': (2000300000, 2000300999),
    'disneyUniverse': (2000500000, 2000500999),
    'ingredientKind': (2001400000, 2001400999),
    'mealKind': (2001500000, 2001500999),
    'furnitureStyle': (2000200000, 2000200999),
    'clothingStyle': (2000000000, 2000000999),
    'color': (2000700000, 2000700999),
}
WORLD_TAG_KEYS = frozenset({
    'IsDreamlightValley', 'IsEternityIsle', 'IsStorybookVale',
    'IsWishBlossomMountains', 'isSeaOfSecrets', 'isHoneywood',
    'isUnderwaterScene',
})


def require(condition: object, reason: str) -> None:
    if not condition:
        raise ValueError('DB01_TAG_' + reason)


def digest(source: bytes) -> str:
    return hashlib.sha256(source).hexdigest()


def varint(source: bytes, pos: int) -> tuple[int, int]:
    start = pos
    value = 0
    for index in range(10):
        require(pos < len(source), 'TRUNCATED_VARINT')
        byte = source[pos]
        pos += 1
        require(not (index == 9 and byte > 1), 'VARINT_OVERFLOW')
        value |= (byte & 127) << (7 * index)
        if byte < 128:
            # Disallow a noncanonical encoding that might conceal different
            # original source structures.
            require(index == 0 or value >= 1 << (7 * index), 'NONCANONICAL_VARINT')
            return value, pos
    raise ValueError('DB01_TAG_UNTERMINATED_VARINT')


def fields(blob: bytes) -> list[tuple[int, int, int | bytes]]:
    pos = 0
    result: list[tuple[int, int, int | bytes]] = []
    while pos < len(blob):
        tag, pos = varint(blob, pos)
        number, wire = tag >> 3, tag & 7
        require(number > 0 and wire in (0, 1, 2, 5), 'INVALID_WIRE')
        if wire == 0:
            value, pos = varint(blob, pos)
        elif wire == 2:
            length, pos = varint(blob, pos)
            require(length <= len(blob) - pos, 'TRUNCATED_FIELD')
            value = blob[pos:pos + length]
            pos += length
        else:
            count = 8 if wire == 1 else 4
            require(count <= len(blob) - pos, 'TRUNCATED_FIXED')
            value = blob[pos:pos + count]
            pos += count
        result.append((number, wire, value))
    return result


def source_frames(content: bytes):
    pos = 0
    seen: set[int] = set()
    while pos < len(content):
        offset, pos = varint(content, pos)
        size, pos = varint(content, pos)
        require(size > 0 and size <= 4 * 1024 * 1024 and
                size <= len(content) - pos and offset not in seen,
                'DUPLICATE_OR_BROKEN_FRAME')
        seen.add(offset)
        yield fields(content[pos:pos + size])
        pos += size


def one(values: list[tuple[int, int, int | bytes]], number: int, wire: int):
    matches = [value for n, w, value in values if n == number and w == wire]
    require(len(matches) == 1, 'MISSING_OR_DUPLICATE_IDENTITY_FIELD')
    return matches[0]


def packed_ids(value: bytes) -> list[int]:
    ids = []
    pos = 0
    while pos < len(value):
        item, pos = varint(value, pos)
        ids.append(item)
        require(len(ids) <= 1000, 'EXCESSIVE_TAG_REFERENCE')
    return ids


def tag_group(tag_id: int, key: str) -> str:
    if key in WORLD_TAG_KEYS:
        return 'worldContextTag'
    for group, (low, high) in TAG_GROUP_RANGES.items():
        if low <= tag_id <= high:
            return group
    return 'otherTag'


def read_original(original_dir: Path, category: str) -> bytes:
    require(SAFE_CATEGORY.fullmatch(category), 'BAD_NATIVE_CATEGORY')
    filename = category + '.json'
    candidates = (original_dir / filename,
                  original_dir / 'ddv_Data' / 'StreamingAssets' / 'itemlist' / filename)
    matches = [p for p in candidates if p.is_file() and not p.is_symlink()]
    require(len(matches) == 1, 'ORIGINAL_MISSING_OR_AMBIGUOUS_' + category)
    content = matches[0].read_bytes()
    require(len(content) <= MAX_BYTES, 'ORIGINAL_TOO_LARGE_' + category)
    return content


def load_tag_dictionary(content: bytes) -> dict[int, str]:
    tags: dict[int, str] = {}
    seen_names: set[str] = set()
    for record in source_frames(content):
        item_id = one(record, 1, 0)
        raw_name = one(record, 2, 2)
        require(type(item_id) is int and type(raw_name) is bytes and
                0 < len(raw_name) <= 256, 'BAD_TAG_ID_OR_NAME')
        key = raw_name.decode('utf-8')
        require(key and key.strip() == key and item_id not in tags and
                key not in seen_names, 'DUPLICATE_TAG')
        seen_names.add(key)
        tags[item_id] = key
    require(len(tags) > 0, 'EMPTY_TAG_DICTIONARY')
    return tags


def tag_refs(native_category: str,
             record: list[tuple[int, int, int | bytes]],
             tags: dict[int, str]) -> list[dict]:
    result: list[dict] = []
    seen: set[tuple[int, int]] = set()
    for number, wire, value in record:
        if number not in TAG_FIELDS.get(native_category, set()):
            continue
        if wire == 0:
            candidate = [value]
        elif wire == 2:
            require(type(value) is bytes, 'INVALID_TAG_FIELD')
            try:
                candidate = packed_ids(value)
            except ValueError:
                # The same wire position can hold an unrelated structured
                # field or GUID. Only a complete Tag-ID list is evidence.
                continue
        else:
            continue
        # A wire field is accepted as a Tag-ID reference only when its
        # complete value decodes to existing original Tag.json IDs.
        if not candidate or any(tag_id not in tags for tag_id in candidate):
            continue
        for tag_id in candidate:
            identity = (number, tag_id)
            if identity in seen:
                continue
            seen.add(identity)
            tag_key = tags[tag_id]
            result.append({
                'tagId': tag_id, 'tagKey': tag_key,
                'wireField': number, 'facet': tag_group(tag_id, tag_key),
            })
    return result


def row_from_original(category: str,
                      record: list[tuple[int, int, int | bytes]],
                      source_hash: str, tags: dict[int, str]) -> dict:
    item_id = one(record, 1, 0)
    native_name = one(record, 2, 2)
    require(type(item_id) is int and 0 < item_id < 2**53 and
            type(native_name) is bytes, 'BAD_ITEM_ID_OR_KEY')
    native_key = native_name.decode('utf-8')
    refs = tag_refs(category, record, tags)
    facets: dict[str, list[str]] = defaultdict(list)
    for ref in refs:
        group = ref['facet']
        if group != 'otherTag' and ref['tagKey'] not in facets[group]:
            facets[group].append(ref['tagKey'])
    # Keep *all* tags and multiple possible universes/world-context tags.
    # None of the following proves DLC ownership, location of acquisition,
    # or the display menu's parent/child taxonomy.
    possible_enum = 8 if category == 'Trimming' else 7
    enums = [v for n, w, v in record if n == possible_enum and w == 0]
    return {
        'itemId': item_id, 'nativeCategory': category,
        'nativeKey': native_key, 'sourceSha256': source_hash,
        'tagReferences': refs,
        'facets': dict(sorted(facets.items())),
        'wireSubtypeCode': enums[0] if len(enums) == 1 and category in
            ('Furniture', 'Clothing', 'Trimming') else None,
        'wireSubtypeMeaningVerified': False,
        'gameUiCategoryVerified': False,
        'dlcOwnershipVerified': False,
        'worldAvailabilityVerified': False,
    }


def packed_json(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(',', ':')) + '\n').encode('utf-8')


def write_atomic(path: Path, content: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.db01-tag-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, 0o600)
        require(not path.exists(), 'REFUSE_OVERWRITE')
        os.link(temp, path)
    finally:
        Path(temp).unlink(missing_ok=True)


def build(sqlite_path: Path, original_dir: Path, output: Path, *,
          expected_sqlite_sha256: str,
          expected_tag_sha256: str | None = None) -> dict:
    sqlite_path, original_dir, output = (p.resolve() for p in
                                         (sqlite_path, original_dir, output))
    require(sqlite_path.is_file() and original_dir.is_dir() and
            output != original_dir and output not in original_dir.parents and
            original_dir not in output.parents and
            output != sqlite_path.parent and output not in sqlite_path.parents,
            'INVALID_INPUT_OR_OUTPUT')
    for ancestor in (output, *output.parents):
        require(not (ancestor / '.git').exists() and
                not ((ancestor / 'package.json').is_file() and
                     (ancestor / 'src').is_dir()), 'OUTPUT_INSIDE_GIT')
    require(not output.exists(), 'REFUSE_OVERWRITE')
    sqlite_hash = hashlib.sha256(sqlite_path.read_bytes()).hexdigest()
    require(type(expected_sqlite_sha256) is str and
            SHA.fullmatch(expected_sqlite_sha256) and
            expected_sqlite_sha256 == sqlite_hash, 'SQLITE_SHA_MISMATCH')
    con = sqlite3.connect(f'file:{sqlite_path.as_posix()}?mode=ro&immutable=1',
                          uri=True)
    try:
        require(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok',
                'SQLITE_CORRUPT')
        catalog = con.execute('''SELECT game_version,items_sha256,
            definition_count,publication_authorized FROM catalog WHERE id=1''').fetchone()
        require(catalog and catalog[3] == 0 and
                re.fullmatch(r'\d+\.\d+\.\d+', catalog[0]),
                'INVALID_PRIVATE_CATALOG')
        sources: dict[str, str] = {}
        expected: dict[int, tuple[str, str, str]] = {}
        for item_id, category, native_key, sha in con.execute('''
            SELECT item_id,native_category,native_key,source_sha256
            FROM definition ORDER BY item_id'''):
            require(type(item_id) is int and item_id not in expected and
                    type(native_key) is str and type(sha) is str and
                    SHA.fullmatch(sha), 'BAD_SOURCE_ROW')
            previous = sources.setdefault(category, sha)
            require(previous == sha, 'CONFLICTING_CATEGORY_SHA')
            expected[item_id] = (category, native_key, sha)
        require(len(expected) == catalog[2], 'SQLITE_COUNT_MISMATCH')
        raw_tag = read_original(original_dir, 'Tag')
        tag_hash = digest(raw_tag)
        if 'Tag' in sources:
            require(sources['Tag'] == tag_hash, 'TAG_SOURCE_SHA_MISMATCH')
        else:
            require(expected_tag_sha256 is not None and
                    expected_tag_sha256 == tag_hash and
                    SHA.fullmatch(expected_tag_sha256), 'UNTRUSTED_TAG_SOURCE')
        tags = load_tag_dictionary(raw_tag)
        all_rows = []
        seen: set[int] = set()
        original_hashes: dict[str, str] = {}
        by_category = Counter()
        facet_coverage = Counter()
        tagged_records = 0
        tag_reference_count = 0
        for category, expected_sha in sorted(sources.items()):
            content = raw_tag if category == 'Tag' else read_original(original_dir, category)
            actual_sha = digest(content)
            require(actual_sha == expected_sha, 'ORIGINAL_SHA_MISMATCH_' + category)
            original_hashes[category] = actual_sha
            for raw in source_frames(content):
                row = row_from_original(category, raw, actual_sha, tags)
                item_id = row['itemId']
                require(item_id in expected and item_id not in seen and
                        expected[item_id] == (category, row['nativeKey'], actual_sha),
                        'SOURCE_ID_OR_NATIVE_KEY_MISMATCH')
                seen.add(item_id)
                by_category[category] += 1
                tag_reference_count += len(row['tagReferences'])
                if row['tagReferences']:
                    tagged_records += 1
                for facet in row['facets']:
                    facet_coverage[facet] += 1
                all_rows.append(row)
        require(seen == set(expected), 'ORIGINAL_COVERAGE_MISMATCH')
        buckets = [[] for _ in range(BUCKETS)]
        for record in sorted(all_rows, key=lambda r: r['itemId']):
            buckets[record['itemId'] % BUCKETS].append(record)
        files = {}
        output.mkdir(parents=True, exist_ok=False)
        for i, rows in enumerate(buckets):
            name = f'id/{i:02x}.json'
            content = packed_json(rows)
            write_atomic(output / name, content)
            files[name] = {'sha256':digest(content),
                           'bytes':len(content),'count':len(rows)}
        manifest = {
            'schema':SCHEMA, 'platform':'Steam', 'gameVersion':catalog[0],
            'privateOnly':True, 'publicationAuthorized':False,
            'sourceSqliteSha256':sqlite_hash, 'sourceItemsSha256':catalog[1],
            'tagOriginalSha256':tag_hash,
            'sourceFilesSha256':dict(sorted(original_hashes.items())),
            'definitionCount':len(all_rows), 'tagDefinitionCount':len(tags),
            'tagReferenceCount':tag_reference_count,
            'taggedDefinitions':tagged_records,
            'byNativeCategory':dict(sorted(by_category.items())),
            'facetCoverage':dict(sorted(facet_coverage.items())),
            'bucketCount':BUCKETS,
            'gameUiTaxonomyComplete':False,
            'worldAvailabilityVerified':False,
            'dlcOwnershipVerified':False,
            'files':files,
        }
        write_atomic(output / 'manifest.json', packed_json(manifest))
        return {
            'status':'PASS', 'privateOnly':True,
            'gameVersion':catalog[0], 'definitions':len(all_rows),
            'tagDefinitions':len(tags),
            'taggedDefinitions':tagged_records,
            'tagReferences':tag_reference_count,
            'facets':dict(sorted(facet_coverage.items())),
            'shards':BUCKETS, 'sourceSqliteSha256':sqlite_hash,
            'tagOriginalSha256':tag_hash,
        }
    finally:
        con.close()


def main():
    parser = argparse.ArgumentParser(description='Exact private original-tag metadata extraction')
    parser.add_argument('--sqlite',type=Path,required=True)
    parser.add_argument('--original-dir',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--expected-sqlite-sha256',required=True)
    parser.add_argument('--expected-tag-sha256')
    args=parser.parse_args()
    try:
        result=build(args.sqlite,args.original_dir,args.out,
                     expected_sqlite_sha256=args.expected_sqlite_sha256,
                     expected_tag_sha256=args.expected_tag_sha256)
    except (OSError,ValueError,UnicodeError,sqlite3.Error) as exc:
        parser.exit(1,f'DB-01 native tags failed: {exc}\n')
    print(json.dumps(result,sort_keys=True,ensure_ascii=False))


if __name__ == '__main__':
    main()
