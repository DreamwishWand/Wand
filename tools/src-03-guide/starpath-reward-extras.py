#!/usr/bin/env python3
"""Reproduce a sanitized 17-reward ID crosswalk from exact Steam v1.26.2 originals.

Original database, private SQLite shards, source ZIPs and credentials must remain
outside public Git. Only exact original names (9 IDs x 8 locales) and native
categories (17 IDs) are published. The eight TouchOfMagic motif objects have
no native localization keys, hence no invented display names.

python starpath-reward-extras.py --db01-private-zip PRIVATE.zip \
  --locales-dir PRIVATE/Localization --out public/starpath-reward-extras-2026-11-22.json
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import runpy
import shutil
import sqlite3
import tempfile
import zipfile
from pathlib import Path

DB01_PACKAGE_SHA = '0a1286655a0c4d2ceb91aa61a06c257d2cf485076c8a11dbf3484ad3b7bb5f25'
EXPECTED_OUT_SHA = 'e8e720ce43610e4e049baa31270ae586d1d03313c85a0c7833083eff5acd8ab2'
EXPECTED_BYTES = 4075
EXPECTED = {
    20500163:'Building', 80100000:'Currency',
    100000775:'TouchOfMagic', 100000776:'TouchOfMagic',
    100000777:'TouchOfMagic', 100000778:'TouchOfMagic',
    100000779:'TouchOfMagic', 100000780:'TouchOfMagic',
    100000782:'TouchOfMagic', 100000783:'TouchOfMagic',
    110800069:'Tool', 120000253:'Companion', 120000263:'Companion',
    140500052:'Makeup', 170000115:'Skin',
    190000033:'PhotoMode', 190000034:'PhotoMode',
}
LOCALES = ('de','en-US','es','fr','it','ja','pt-BR','zh-CN')

def check(condition, label):
    if not condition:
        raise ValueError('DB03_REWARD_EXTRA_' + label)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def get_names(zip_path, needed, language, wire_fields, expected_zip_sha):
    raw = zip_path.read_bytes()
    check(sha(raw) == expected_zip_sha, 'SOURCE_ZIP_SHA_' + language)
    with zipfile.ZipFile(zip_path) as archive:
        required = {name.split('.',1)[0] + '.locbin' for name in needed.values()}
        translations = {}
        for member in required:
            info = archive.getinfo(member)
            check(info.file_size <= 2*1024*1024, 'LOCBIN_TOO_LARGE')
            entries = {}
            for field, body in wire_fields(archive.read(member)):
                check(field == 1, 'LOC_CONTAINER_FIELD')
                parts = list(wire_fields(body))
                check(len(parts) in (1,2) and parts[0][0] == 1 and
                      (len(parts) == 1 or parts[1][0] == 2), 'LOC_ENTRY_SHAPE')
                key = parts[0][1].decode('utf8')
                check(key not in entries, 'LOC_DUPLICATE_KEY')
                entries[key] = parts[1][1].decode('utf8') if len(parts) == 2 else None
            translations[member] = entries
        names = {}
        for numeric_id, key in needed.items():
            member, token = key.split('.',1)
            value = translations[member + '.locbin'].get(token)
            check(isinstance(value,str) and value, 'SOURCE_LABEL_MISSING')
            value = (value.replace('<nobr>', '').replace('</nobr>', '')
                     .replace('\u200b','').replace('\u00ad','').replace('\u2060',''))
            check(0 < len(value) <= 300 and not re.search(r'[<>\x00-\x1f]',value),
                  'INVALID_SOURCE_LABEL')
            names[str(numeric_id)] = value
    return names

def project(package, locales_dir):
    package_raw = package.read_bytes()
    check(sha(package_raw) == DB01_PACKAGE_SHA, 'DB01_PRIVATE_PACKAGE_SHA')
    native_keys = {}
    with tempfile.TemporaryDirectory(prefix='db03-reward-id-') as temp:
        db_path = Path(temp) / 'original.sqlite'
        with zipfile.ZipFile(package) as archive:
            info = archive.getinfo('private-1262.sqlite')
            check(70_000_000 < info.file_size < 100_000_000, 'SQLITE_SIZE')
            with archive.open(info) as source, db_path.open('wb') as out:
                shutil.copyfileobj(source, out)
        connection = sqlite3.connect('file:' + str(db_path) + '?mode=ro', uri=True)
        try:
            (platform, version, total, files_ok, files_all, published) = connection.execute(
                'SELECT platform,game_version,definition_count,source_files_verified,source_files_total,publication_authorized FROM catalog'
            ).fetchone()
            check((platform,version,total,files_ok,files_all,published) ==
                  ('Steam','1.26.2',33627,38,39,0),'CATALOG_METADATA')
            rows = {}
            for numeric_id,category in EXPECTED.items():
                row=connection.execute('SELECT native_category,localization_key,source_file,source_sha256 FROM definition WHERE item_id=?', (numeric_id,)).fetchone()
                check(row is not None and row[0] == category, 'ID_NATIVE_CATEGORY')
                actual_category, localization_key,source_file,source_sha = row
                check(source_file == 'ddv_Data/StreamingAssets/itemlist/'+category+'.json' and
                      re.fullmatch(r'[0-9a-f]{64}',source_sha) is not None,'SOURCE_PATH')
                if category == 'TouchOfMagic':
                    check(localization_key is None,'MOTIF_WITH_LOCALE_KEY')
                else:
                    check(isinstance(localization_key,str) and localization_key.startswith(category+'.'),
                          'BAD_LOCALIZATION_KEY')
                    native_keys[numeric_id] = localization_key
                rows[str(numeric_id)] = {'category':category,'names':{} if localization_key else None}
        finally:
            connection.close()
    reference = runpy.run_path(str(Path(__file__).with_name('starpath-weekly-locales.py')))
    source_sha = reference['SOURCE_SHA']
    check(set(source_sha) == set(LOCALES), 'SOURCE_LOCALE_SCOPE')
    for language in LOCALES:
        names = get_names(locales_dir / ('LocDB_'+language+'.zip'),native_keys,
                          language,reference['protobuf_fields'],source_sha[language])
        check(len(names) == 9, 'EXPECTED_NAMED_REWARDS')
        for ident,value in names.items():
            rows[ident]['names'][language] = value
    check(len(rows) == 17 and sum(r['names'] is None for r in rows.values()) == 8 and
          all(len(r['names']) == 8 for r in rows.values() if r['names'] is not None),
          'COVERAGE')
    return {'schema':'wand.db03.starpath-reward-extra@1',
        'source':{'gameVersion':'Steam 1.26.2',
                  'database':'original 33,627-definition owner-private SQLite v2',
                  'privatePackageSha256':DB01_PACKAGE_SHA,
                  'locdbZipSha256':{lang:source_sha[lang] for lang in LOCALES},
                  'published':{'localizedNames':9,'sourceCategories':17,'unlabeledMotifs':8},
                  'catalogComplete':False},
        'rows':rows}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--db01-private-zip',type=Path,required=True)
    p.add_argument('--locales-dir',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    artifact = project(a.db01_private_zip,a.locales_dir)
    raw=(json.dumps(artifact,sort_keys=True,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf8')
    check(len(raw) == EXPECTED_BYTES and sha(raw) == EXPECTED_OUT_SHA,
          'PUBLIC_PROJECTION_CHANGED')
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_bytes(raw)
    print('17 verified native categories, 9 x 8 exact native labels, 8 unnamed motif definitions')

if __name__ == '__main__':
    main()