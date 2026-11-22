"""Version-locked offline ItemType and subtype extraction from original IL2CPP.

The 39,067 current Steam source IDs in the PRIVATE SQLite are the authority.
The independent same-version C# IL2CPP dump supplies actual enum identities.
Never infer future IDs, in-game Collection menu categories or DLC ownership.
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

SCHEMA = 'wand.db01.il2cpp-types@1'
SHA = re.compile(r'^[0-9a-f]{64}$')
VERSION = re.compile(r'^\d+\.\d+\.\d+$')
TYPE_DIVISOR = 10_000_000
SUBTYPE_DIVISOR = 100_000
BUCKETS = 256
OVERRIDE = {
    'ActivityItem': 'ActivityItemType',
    'ActivityData': 'ActivityDataItemType',
    'Currency': 'CurrencyType',
    'RecurringEvent': 'RecurringEventType',
}
ENUM_OPEN = re.compile(r'^// Namespace: Definitions\.Items\r?\npublic enum ([A-Za-z][A-Za-z0-9_]*) // TypeDefIndex: \d+\r?\n\{', re.M)
ENUM_VALUE = re.compile(r'\bpublic const ([A-Za-z][A-Za-z0-9_]*) ([A-Za-z][A-Za-z0-9_]*) = (-?\d+);')


def require(value: object, label: str) -> None:
    if not value:
        raise ValueError('DB01_ENUM_' + label)


def sha_file(path: Path) -> str:
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(2 * 1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def decode_enums(text: str) -> dict[str, dict[int, str]]:
    enums: dict[str, dict[int, str]] = {}
    for match in ENUM_OPEN.finditer(text):
        name = match.group(1)
        end = text.find('\n}', match.end())
        require(end >= 0 and end - match.end() < 150_000, 'ENUM_NOT_TERMINATED')
        definition = text[match.end():end]
        values = {}
        member_names = set()
        for owner, key, raw_code in ENUM_VALUE.findall(definition):
            require(owner == name, 'ENUM_OWNER')
            code = int(raw_code)
            require(code not in values and key not in member_names, 'DUPLICATE_ENUM_ENTRY')
            member_names.add(key)
            values[code] = key
        require(name not in enums and values, 'EMPTY_OR_DUPLICATE_ENUM')
        enums[name] = values
    require('ItemType' in enums and 'TagItemType' in enums, 'ITEMTYPE_MISSING')
    return enums


def private_path(output: Path, input_paths: tuple[Path, ...]) -> None:
    require(not output.exists(), 'REFUSE_OVERWRITE')
    for path in input_paths:
        require(output != path and output not in path.parents and
                path not in output.parents, 'OUTPUT_INPUT_OVERLAP')
    for directory in (output, *output.parents):
        require(not (directory / '.git').exists() and not
                ((directory / 'package.json').is_file() and (directory / 'src').is_dir()),
                'OUTPUT_INSIDE_PUBLIC_REPO')


def serialize(rows) -> bytes:
    return (json.dumps(rows, sort_keys=True, ensure_ascii=False,
                       separators=(',', ':'))+'\n').encode('utf-8')


def write_new(path: Path, content: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.db01-enum-', dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temp,0o600)
        require(not path.exists(), 'REFUSE_OVERWRITE')
        os.link(temp,path)
    finally:
        Path(temp).unlink(missing_ok=True)


def build(sqlite_path: Path, dump_path: Path, output: Path, *,
          expected_sqlite_sha256: str, expected_dump_sha256: str) -> dict:
    sqlite_path, dump_path, output = (
        Path(p).expanduser().resolve() for p in (sqlite_path, dump_path, output)
    )
    require(sqlite_path.is_file() and dump_path.is_file() and
            not sqlite_path.is_symlink() and not dump_path.is_symlink(),
            'MISSING_OR_UNSAFE_INPUT')
    private_path(output,(sqlite_path,dump_path))
    require(type(expected_sqlite_sha256) is str and SHA.fullmatch(expected_sqlite_sha256) and
            sha_file(sqlite_path) == expected_sqlite_sha256, 'SQLITE_SHA_MISMATCH')
    require(type(expected_dump_sha256) is str and SHA.fullmatch(expected_dump_sha256) and
            sha_file(dump_path) == expected_dump_sha256, 'DUMP_SHA_MISMATCH')
    # Input is a versioned, SHA-pinned original dump supplied separately from
    # SQLite's source itemlist. Do not use another platform/version's schema.
    enums = decode_enums(dump_path.read_text(encoding='utf-8'))
    c = sqlite3.connect('file:'+sqlite_path.as_posix()+'?mode=ro&immutable=1',uri=True)
    try:
        require(c.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLITE_CORRUPT')
        meta = c.execute('''SELECT platform,game_version,items_sha256,
                                    definition_count,publication_authorized
                             FROM catalog WHERE id=1''').fetchone()
        require(meta and meta[0]=='Steam' and isinstance(meta[1],str) and
                VERSION.fullmatch(meta[1]) and meta[4]==0,'PRIVATE_STEAM_REQUIRED')
        by_category=Counter()
        named_by_category=Counter()
        unknown_by_category=Counter()
        ids_seen=set()
        buckets=[[] for _ in range(BUCKETS)]
        exact_type=0
        subtype_verified=0
        type_enum=enums['ItemType']
        for item_id,category,source_sha in c.execute(
                'SELECT item_id,native_category,source_sha256 FROM definition ORDER BY item_id'):
            require(type(item_id) is int and 0<item_id<2**53 and
                    item_id not in ids_seen and type(category) is str and
                    type(source_sha) is str and SHA.fullmatch(source_sha),
                    'BAD_CANONICAL_IDENTITY')
            ids_seen.add(item_id)
            type_code=item_id//TYPE_DIVISOR
            type_name=type_enum.get(type_code)
            # Fail the ENTIRE release when any current source ItemType does
            # not match the actual C# ItemType enumeration.
            require(type_name==category,'NATIVE_ITEM_TYPE_MISMATCH')
            exact_type+=1
            by_category[category]+=1
            subtype_code=(item_id%TYPE_DIVISOR)//SUBTYPE_DIVISOR
            subtype_enum_name=OVERRIDE.get(category,category+'ItemType')
            subtype_enum=enums.get(subtype_enum_name)
            subtype_name=subtype_enum.get(subtype_code) if subtype_enum else None
            if subtype_name is not None:
                subtype_verified+=1
                named_by_category[category]+=1
            else:
                unknown_by_category[category]+=1
                subtype_enum_name=subtype_enum_name if subtype_enum else None
            row={
                'itemId':item_id,'nativeCategory':category,'sourceSha256':source_sha,
                'itemTypeCode':type_code,'itemTypeName':type_name,
                'subtypeCode':subtype_code,'subtypeEnumName':subtype_enum_name,
                'subtypeName':subtype_name,
                'subtypeNameVerified':subtype_name is not None,
                'sourceIl2cppDumpSha256':expected_dump_sha256,
                'gameUiCategoryVerified':False,
                'worldAvailabilityVerified':False,
                'dlcOwnershipVerified':False,
            }
            buckets[item_id%BUCKETS].append(row)
        require(len(ids_seen)==meta[3] and exact_type==meta[3],'SOURCE_COUNT_MISMATCH')
        require(len(by_category)>0,'EMPTY_ITEM_TYPES')
        # Recheck input SHA after parsing against modifications in flight.
        require(sha_file(sqlite_path)==expected_sqlite_sha256 and
                sha_file(dump_path)==expected_dump_sha256,'INPUT_CHANGED')
        manifest_files={}
        output.mkdir(parents=True,exist_ok=False)
        for index, rows in enumerate(buckets):
            content=serialize(rows)
            name=f'id/{index:02x}.json'
            write_new(output/name,content)
            manifest_files[name]={
                'sha256':hashlib.sha256(content).hexdigest(),
                'bytes':len(content),'count':len(rows),
            }
        manifest={
            'schema':SCHEMA,'privateOnly':True,'publicationAuthorized':False,
            'platform':meta[0],'gameVersion':meta[1],
            'sourceSqliteSha256':expected_sqlite_sha256,
            'sourceItemsSha256':meta[2],
            'sourceIl2cppDumpSha256':expected_dump_sha256,
            'itemTypeEnumName':'Definitions.Items.ItemType',
            'definitionCount':meta[3],
            'sourceItemTypeVerified':exact_type,
            'sourceSubtypeNameVerified':subtype_verified,
            'sourceSubtypeNameUnverified':meta[3]-subtype_verified,
            'byNativeCategory':dict(sorted(by_category.items())),
            'subtypeVerifiedByCategory':dict(sorted(named_by_category.items())),
            'subtypeUnverifiedByCategory':dict(sorted(unknown_by_category.items())),
            'bucketCount':BUCKETS,'gameUiTaxonomyComplete':False,
            'worldAvailabilityVerified':False,'dlcOwnershipVerified':False,
            'files':manifest_files,
        }
        write_new(output/'manifest.json',serialize(manifest))
        return {
            'status':'PASS','privateOnly':True,
            'gameVersion':meta[1],'definitions':meta[3],
            'sourceItemTypesVerified':exact_type,
            'namedSubtypes':subtype_verified,
            'unnamedSubtypes':meta[3]-subtype_verified,
            'sourceSqliteSha256':expected_sqlite_sha256,
            'sourceIl2cppDumpSha256':expected_dump_sha256,
            'shards':BUCKETS,
        }
    finally:
        c.close()


def main():
    parser=argparse.ArgumentParser(description='Full original IL2CPP ItemType enum source join (private)')
    parser.add_argument('--sqlite',type=Path,required=True)
    parser.add_argument('--il2cpp-dump',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--expected-sqlite-sha256',required=True)
    parser.add_argument('--expected-dump-sha256',required=True)
    args=parser.parse_args()
    try:
        result=build(args.sqlite,args.il2cpp_dump,args.out,
                     expected_sqlite_sha256=args.expected_sqlite_sha256,
                     expected_dump_sha256=args.expected_dump_sha256)
    except (ValueError,OSError,UnicodeError,TypeError,sqlite3.Error) as error:
        parser.exit(1,'DB-01 original enum extraction failed: '+str(error)+'\n')
    print(json.dumps(result,ensure_ascii=False,sort_keys=True))


if __name__=='__main__':
    main()
