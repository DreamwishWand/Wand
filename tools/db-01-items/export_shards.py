"""Export query-sharded, integrity-pinned PRIVATE DB-01 read assets from SQLite.

Not a publication command. No output may be written inside a Git checkout.
The TypeScript client loads only the requested ID bucket, category or locale.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections import defaultdict
from pathlib import Path

SHARD_SCHEMA = 'wand.db01.private-shards@2'
BUCKETS = 256
LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')
CATEGORY = re.compile(r'^[A-Za-z][A-Za-z0-9]*$')


def req(condition: bool, why: str) -> None:
    if not condition:
        raise ValueError('DB01_EXPORT_' + why)


def packed(data) -> bytes:
    return (json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def write(dest: Path, rel: str, value, files: dict) -> None:
    path = dest / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    data = packed(value)
    path.write_bytes(data)
    files[rel] = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'count': len(value)}


def require_private_output(output: Path) -> None:
    req(not output.exists(), 'REFUSE_OVERWRITE')
    for parent in (output.parent, *output.parent.parents):
        req(not (parent / '.git').exists(), 'OUTPUT_INSIDE_GIT')
        req(not ((parent / 'src').exists() and (parent / 'package.json').exists()), 'OUTPUT_INSIDE_APP')


def export(source: Path, output: Path, include_historical: bool = False) -> dict:
    source, output = source.resolve(), output.resolve()
    req(source.is_file() and source.suffix in ('.sqlite', '.db'), 'SOURCE_NOT_SQLITE')
    require_private_output(output)
    req(source not in output.parents and output not in source.parents, 'OUTPUT_OVERLAPS_DB')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.db01-export-', dir=output.parent) as tmp:
        dest = Path(tmp)
        con = sqlite3.connect(f'file:{source.as_posix()}?mode=ro&immutable=1', uri=True)
        try:
            req(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'SOURCE_CORRUPTED')
            snap = con.execute('SELECT store_schema,source_schema,platform,game_version,manifest_sha256,items_sha256,definition_count,source_files_verified,source_files_total,full_corpus_parsed,publication_authorized,historical_manifest_sha256,historical_items_sha256,native_source_manifest_sha256 FROM catalog WHERE id=1').fetchone()
            req(snap is not None and snap[0] == 'wand.db01.sqlite@2' and snap[10] == 0, 'SOURCE_NOT_PRIVATE_STORE')
            req(snap[6] == con.execute('SELECT count(*) FROM definition').fetchone()[0], 'SOURCE_COUNT')
            cats = defaultdict(list)
            buckets = [[] for _ in range(BUCKETS)]
            item_ids = set()
            native_keys = set()
            for (item_id, cat, domain, loc_key, native_key, sha, record_json) in con.execute('SELECT item_id,native_category,catalog_domain,localization_key,native_key,source_sha256,record_json FROM definition ORDER BY item_id'):
                req(CATEGORY.fullmatch(cat) and item_id not in item_ids, 'CATEGORY_OR_ID')
                item_ids.add(item_id)
                native_identity = (cat, native_key)
                req(isinstance(native_key, str) and native_key.strip() == native_key and
                    0 < len(native_key) <= 256 and all(ord(c) >= 32 for c in native_key) and
                    native_identity not in native_keys, 'INVALID_OR_DUPLICATE_NATIVE_KEY')
                native_keys.add(native_identity)
                source_record = json.loads(record_json)
                req(source_record.get('nativeNameField') == native_key, 'NATIVE_KEY_SOURCE_MISMATCH')
                icon = source_record['image']['iconGuid']
                row = {'itemId': item_id, 'nativeCategory': cat, 'catalogDomain': domain,
                       'verifiedIconGuid': icon,
                       'localizationKey': loc_key, 'nativeKey': native_key, 'sourceSha256': sha,
                       'names': {loc: None for loc in LOCALES}}
                cats[cat].append(row)
                buckets[item_id % BUCKETS].append(row)
            lookup = {r['itemId']: r for bucket in buckets for r in bucket}
            indices = {loc: [] for loc in LOCALES}
            for item_id, locale, value in con.execute('SELECT item_id,locale,value FROM exact_name ORDER BY item_id,locale'):
                req(item_id in lookup and locale in indices and isinstance(value, str) and value.strip(), 'EXACT_NAME_INTEGRITY')
                lookup[item_id]['names'][locale] = value
                indices[locale].append([item_id, value])
            # Avoid authorizing historical value replacement: keep separate assets.
            history = [[] for _ in range(BUCKETS)]
            if include_historical:
                req(bool(snap[11]) and bool(snap[12]), 'MISSING_HISTORY_SOURCE')
                for item_id, locale, value, baseline, status in con.execute('SELECT item_id,locale,value,baseline_game_version,evidence FROM historical_name_candidate ORDER BY item_id,locale'):
                    req(item_id in lookup and locale in LOCALES and
                        status == 'historical_prefix_crc_correlated_unverified_current', 'BAD_HISTORY')
                    history[item_id % BUCKETS].append([item_id, locale, value, baseline])
            files = {}
            for bucket, records in enumerate(buckets):
                write(dest, f'id/{bucket:02x}.json', records, files)
            for cat, records in sorted(cats.items()):
                write(dest, f'category/{cat}.json', records, files)
            for loc in LOCALES:
                write(dest, f'locale/{loc}.json', indices[loc], files)
            if include_historical:
                for bucket, names in enumerate(history):
                    write(dest, f'historical/{bucket:02x}.json', names, files)
            m = {'schema': SHARD_SCHEMA, 'platform': snap[2], 'gameVersion': snap[3],
                 'sourceManifestSha256': snap[4], 'nativeSourceManifestSha256': snap[13], 'sourceItemsSha256': snap[5],
                 'definitions': snap[6], 'currentNativeItemDefinitions':sum(1 for item in item_ids if lookup[item]['catalogDomain']=='item'), 'sourceFilesVerified': snap[7], 'sourceFilesTotal': snap[8],
                 'fullCorpusParsed': bool(snap[9]), 'privateOnly': True, 'publicationAuthorized': False,
                 'bucketCount': BUCKETS, 'categories': sorted(cats), 'locales': list(LOCALES),
                 'historicalCandidatesIncluded': include_historical,
                 'historicalManifestSha256': snap[11] if include_historical else None,
                 'files': files}
            (dest / 'manifest.json').write_bytes(packed(m))
            # Non-atomic directory rename will only occur after every file is fully materialized.
            req(not output.exists(), 'REFUSE_OVERWRITE')
            os.rename(dest, output)
            return {'schema':SHARD_SCHEMA,'definitions':snap[6], 'files':len(files),
                    'categories':len(cats),'nativeKeys':len(native_keys),'exactNames':sum(map(len,indices.values())),
                    'historicalEntries':sum(map(len,history)), 'privateOnly':True,
                    'output':str(output)}
        finally:
            con.close()


def main() -> None:
    p=argparse.ArgumentParser(description='Export private SHA-verified DB-01 lazy TypeScript assets')
    p.add_argument('--sqlite',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--include-historical',action='store_true')
    args=p.parse_args()
    print(json.dumps(export(args.sqlite,args.out,args.include_historical),sort_keys=True))


if __name__=='__main__':
    main()