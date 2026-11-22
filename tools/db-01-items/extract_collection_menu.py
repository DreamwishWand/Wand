"""Extract directly listed CollectionSubMenu / CollectionSet associations from DDV originals.

The CollectionSet protobuf carries both explicit item lists and dynamic
predicate selectors. Only non-ignored, explicitly listed current Item IDs are
reported. Dynamic selector membership, final UI visibility, availability,
DLC license and player ownership are NOT evaluated or inferred.

Inputs: SHA-pinned current private SQLite, original itemlist/CollectionSet.json,
and the independently anchored same-version IL2CPP dump. Outputs stay private.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import extract_classification as wire
import extract_item_types as il2cpp

SCHEMA = 'wand.db01.collection-menu-direct@1'
EVIDENCE = 'current_original_collectionset_explicit_item_list'
SUBMENU_CLASS = re.compile(
    r'// Namespace: Definitions\.Items\s+public enum CollectionSubMenu '
    r'// TypeDefIndex: \d+\s*\{(?P<body>.*?)\n\}', re.S
)
SUBMENU_MEMBER = re.compile(r'public const CollectionSubMenu ([A-Za-z][A-Za-z0-9_]*) = (\d+);')


def require(ok: object, code: str) -> None:
    if not ok:
        raise ValueError('DB01_COLLECTION_MENU_' + code)


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for part in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()


def field_single(record: list, number: int, kind: int, default=None):
    values = [v for f, w, v in record if f == number and w == kind]
    require(len(values) <= 1, 'DUPLICATE_SINGLETON')
    return values[0] if values else default


def item_list_ids(record: list) -> list[int]:
    ids = []
    for number, kind, value in record:
        if number != 2:
            continue
        if kind == 0:
            ids.append(value)
        elif kind == 2:
            ids.extend(wire.packed_ids(value))
        else:
            raise ValueError('DB01_COLLECTION_MENU_INVALID_ITEM_LIST_WIRE')
    require(len(ids) <= 10000, 'TOO_MANY_LIST_IDS')
    return ids


def submenu_definitions(dump: Path) -> dict[int, str]:
    text = dump.read_text(encoding='utf-8')
    matches = list(SUBMENU_CLASS.finditer(text))
    require(len(matches) == 1, 'COLLECTION_SUBMENU_ENUM_MISSING')
    result = {}
    used = set()
    for name, raw_code in SUBMENU_MEMBER.findall(matches[0].group('body')):
        code = int(raw_code)
        require(code not in result and name not in used, 'DUPLICATE_SUBMENU_ENUM')
        result[code] = name
        used.add(name)
    require(len(result) >= 15 and result.get(0) == 'Crop', 'INCOMPLETE_SUBMENU_ENUM')
    return result


def extract(sqlite_path: Path, collectionset: Path, il2cpp_dump: Path,
            out: Path, *, expected_sqlite_sha256: str,
            expected_il2cpp_sha256: str) -> dict:
    paths = [Path(p).expanduser().resolve() for p in
             (sqlite_path, collectionset, il2cpp_dump, out)]
    sqlite_path, collectionset, il2cpp_dump, out = paths
    require(all(p.is_file() for p in paths[:3]) and
            not out.exists(), 'INPUT_MISSING_OR_OUTPUT_EXISTS')
    # Prevent leaking original bytes or generated game data into the
    # public repository and prevent writing onto any existing inputs.
    for ancestor in (out, *out.parents):
        require(not (ancestor / '.git').exists() and not
                ((ancestor / 'package.json').is_file() and
                 (ancestor / 'src').is_dir()), 'OUTPUT_INSIDE_GIT')
    for source in paths[:3]:
        require(out != source and out not in source.parents and
                source not in out.parents, 'OUTPUT_INPUT_OVERLAP')
    require(type(expected_sqlite_sha256) is str and
            wire.SHA.fullmatch(expected_sqlite_sha256) and
            sha(sqlite_path) == expected_sqlite_sha256, 'SQLITE_SHA_MISMATCH')
    require(type(expected_il2cpp_sha256) is str and
            wire.SHA.fullmatch(expected_il2cpp_sha256) and
            sha(il2cpp_dump) == expected_il2cpp_sha256, 'IL2CPP_SHA_MISMATCH')
    menu_names = submenu_definitions(il2cpp_dump)
    db = sqlite3.connect('file:' + sqlite_path.as_posix() +
                         '?mode=ro&immutable=1', uri=True)
    try:
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok',
                'SQLITE_CORRUPT')
        catalog = db.execute(
            'SELECT platform,game_version,items_sha256,definition_count,'
            'publication_authorized FROM catalog WHERE id=1').fetchone()
        require(catalog and catalog[0] == 'Steam' and
                re.fullmatch(r'\d+\.\d+\.\d+', catalog[1]) and
                catalog[4] == 0, 'PRIVATE_STEAM_CATALOG_REQUIRED')
        canonical = {}
        source_hash = None
        for item_id, category, name, original_sha in db.execute(
                'SELECT item_id,native_category,native_key,source_sha256 FROM definition'):
            require(item_id not in canonical and type(item_id) is int and
                    0 < item_id < 2**53, 'CANONICAL_ID')
            canonical[item_id] = (category, name, original_sha)
            if category == 'CollectionSet':
                if source_hash is None:
                    source_hash = original_sha
                require(source_hash == original_sha, 'COLLECTIONSET_SOURCE_HASH_CONFLICT')
        require(len(canonical) == catalog[3] and source_hash is not None,
                'CANONICAL_SOURCE_COVERAGE')
        require(sha(collectionset) == source_hash, 'COLLECTIONSET_ORIGINAL_SHA_MISMATCH')
        menus = []
        direct = defaultdict(list)
        seen_set = set()
        selector_count = 0
        ignored_ids = 0
        empty_groups = 0
        direct_pairs = set()
        for record in wire.source_frames(collectionset.read_bytes()):
            set_id = field_single(record, 1, 0)
            key = field_single(record, 2, 2)
            require(type(set_id) is int and type(key) is bytes and
                    0 < set_id < 2**53 and set_id not in seen_set,
                    'SET_ID')
            seen_set.add(set_id)
            name = key.decode('utf-8')
            require(canonical.get(set_id) ==
                    ('CollectionSet', name, source_hash),
                    'COLLECTIONSET_NATIVE_IDENTITY_MISMATCH')
            submenu_code = field_single(record, 8, 0, 0)
            require(submenu_code in menu_names, 'UNKNOWN_CURRENT_SUBMENU_ENUM')
            submenu = menu_names[submenu_code]
            label_field = field_single(record, 7, 2)
            require(label_field is None or type(label_field) is bytes,
                    'INVALID_LOCALIZATION_FIELD')
            label_key = label_field.decode('utf-8') if label_field else None
            group_payloads = [v for f,w,v in record if f==9 and w==2]
            group_selector_count = 0
            group_direct_ids = set()
            for group_index, packed in enumerate(group_payloads):
                group = wire.fields(packed)
                if not group:
                    empty_groups += 1
                group_selector_count += sum(f == 2 and w == 2 for f,w,_ in group)
                for n,w,listed in group:
                    if n != 1:
                        continue
                    require(w == 2, 'INVALID_COLLECTION_LIST_WIRE')
                    specification = wire.fields(listed)
                    ignore_flag = field_single(specification, 1, 0, 0)
                    require(ignore_flag in (0,1), 'BAD_IGNORE_FLAG')
                    for target_id in item_list_ids(specification):
                        # Ignore lists may contain a 0 sentinel in the current
                        # original. Never promote or resolve ignored entries.
                        if ignore_flag:
                            ignored_ids += 1
                            continue
                        require(type(target_id) is int and 0 < target_id < 2**53,
                                'UNSAFE_TARGET_ITEM_ID')
                        require(target_id in canonical, 'UNRESOLVED_CURRENT_ITEM_ID')
                        identity = (set_id, group_index, target_id)
                        require(identity not in direct_pairs, 'DUPLICATE_DIRECT_ITEM')
                        direct_pairs.add(identity)
                        group_direct_ids.add(target_id)
                        direct[target_id].append({
                            'setId':set_id,'setKey':name,
                            'submenuCode':submenu_code,
                            'submenu':submenu,
                            'collectionLabelKey':label_key,
                            'groupIndex':group_index,
                            'evidence':EVIDENCE,
                            'gameUiVisibilityVerified':False,
                            'worldAvailabilityVerified':False,
                            'dlcOwnershipVerified':False,
                        })
            selector_count += group_selector_count
            menus.append({
                'setId':set_id,'setKey':name,
                'submenuCode':submenu_code,'submenu':submenu,
                'collectionLabelKey':label_key,
                'sortPriority':field_single(record,6,0,0),
                'groupCount':len(group_payloads),
                'directListedItemCount':len(group_direct_ids),
                'dynamicSelectorsUnresolved':group_selector_count,
                'gameUiVisibilityVerified':False,
            })
        require(len(seen_set) == sum(cat == 'CollectionSet'
                   for cat,_,_ in canonical.values()), 'MISSING_OR_EXTRA_COLLECTIONSETS')
        require(sha(collectionset) == source_hash and
                sha(il2cpp_dump) == expected_il2cpp_sha256 and
                sha(sqlite_path) == expected_sqlite_sha256, 'INPUT_CHANGED')
        by_submenu = Counter(m['submenu'] for m in menus)
        direct_by_submenu = Counter(
            member['submenu'] for members in direct.values() for member in members)
        manifest = {
            'schema':SCHEMA,'platform':catalog[0], 'gameVersion':catalog[1],
            'privateOnly':True,'publicationAuthorized':False,
            'sourceSqliteSha256':expected_sqlite_sha256,
            'sourceItemsSha256':catalog[2],
            'sourceCollectionSetSha256':source_hash,
            'sourceIl2cppDumpSha256':expected_il2cpp_sha256,
            'catalogDefinitions':len(canonical),
            'collectionSetDefinitions':len(menus),
            'directListedItemIds':len(direct),
            'directListedAssociations':sum(len(v) for v in direct.values()),
            'dynamicSelectorsUnresolved':selector_count,
            'ignoredExplicitListEntries':ignored_ids,
            'emptySourceGroups':empty_groups,
            'menusBySubmenu':dict(sorted(by_submenu.items())),
            'directAssociationsBySubmenu':dict(sorted(direct_by_submenu.items())),
            'gameUiVisibilityComplete':False,
            'dynamicSelectorsEvaluated':False,
            'worldAvailabilityVerified':False,'dlcOwnershipVerified':False,
            'files':{},
        }
        menus.sort(key=lambda m:m['setId'])
        direct_rows = [{'itemId':item_id,
                        'memberships':sorted(members,key=lambda x:(x['setId'],x['groupIndex']))}
                       for item_id,members in sorted(direct.items())]
        output_files = {
            'menus.json':wire.packed_json(menus),
            'direct-items.json':wire.packed_json(direct_rows),
        }
        for filename, content in output_files.items():
            manifest['files'][filename]={
                'sha256':hashlib.sha256(content).hexdigest(),
                'bytes':len(content),
                'count':len(menus) if filename == 'menus.json' else len(direct_rows),
            }
        out.mkdir(parents=True, exist_ok=False)
        for filename, content in output_files.items():
            wire.write_atomic(out / filename, content)
        wire.write_atomic(out/'manifest.json',wire.packed_json(manifest))
        return {
            'status':'PASS','gameVersion':catalog[1],
            'collectionSetDefinitions':len(menus),
            'directListedItemIds':len(direct),
            'directListedAssociations':manifest['directListedAssociations'],
            'dynamicSelectorsUnresolved':selector_count,
            'ignoredExplicitListEntries':ignored_ids,
            'sourceCollectionSetSha256':source_hash,
            'privateOnly':True,
        }
    finally:
        db.close()


def main():
    p = argparse.ArgumentParser(description='Private source-exact CollectionSet menu extractor')
    p.add_argument('--sqlite',type=Path,required=True)
    p.add_argument('--collectionset',type=Path,required=True)
    p.add_argument('--il2cpp-dump',type=Path,required=True)
    p.add_argument('--expected-sqlite-sha256',required=True)
    p.add_argument('--expected-il2cpp-sha256',required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    try:
        report=extract(a.sqlite,a.collectionset,a.il2cpp_dump,a.out,
                       expected_sqlite_sha256=a.expected_sqlite_sha256,
                       expected_il2cpp_sha256=a.expected_il2cpp_sha256)
    except (ValueError,OSError,UnicodeError,sqlite3.Error,TypeError) as exc:
        p.exit(1,'DB-01 CollectionSet extraction failed: '+str(exc)+'\n')
    print(json.dumps(report,ensure_ascii=False,sort_keys=True))


if __name__=='__main__':
    main()
