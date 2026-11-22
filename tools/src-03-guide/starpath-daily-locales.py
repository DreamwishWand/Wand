"""Reproduce v1.26.2 original-source Star Path daily task locales for one fixed cache.

Usage: python starpath-daily-locales.py --cache /PRIVATE/battlepasses.dat \
 --locales-dir /PRIVATE/Localization --output-dir public/guide
No original ZIP/cache is copied into a public directory. This script uses the
existing source-pinned weekly exporter parser and its SHA-256 source provenance.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('source_pinned_weekly', HERE / 'starpath-weekly-locales.py')
assert spec is not None and spec.loader is not None
weekly = importlib.util.module_from_spec(spec)
spec.loader.exec_module(weekly)

OUTPUTS = {
    'HauntingElegance2026': ('starpath-daily-haunting-2026-11-22.json', 121, 45280, '5cb5a3809eec14be3cc24191b6bd8f39a20624c69eafcc57e61246bd85ffaddc'),
    'Seafaring2026': ('starpath-daily-seafaring-2026-11-22.json', 25, 10315, '6d308bd67caceea376054ae18f4b6e8953cecfdd8aff2507bc9dae058dd45beb'),
}

def require(ok, name):
    if not ok:
        raise ValueError('DB03_STARPATH_DAILY_' + name)

def daily_keys(cache_bytes):
    require(len(cache_bytes) == 186442 and weekly.sha(cache_bytes) == weekly.CACHE_SHA, 'PRIVATE_CACHE_CHANGED')
    archive = json.loads(cache_bytes)
    require(isinstance(archive, dict) and isinstance(archive.get('Data'), dict)
        and set(archive['Data']) == set(OUTPUTS), 'CACHE_SEASONS_CHANGED')
    by_season = {}
    for season,encoded in archive['Data'].items():
        source = json.loads(encoded)
        require(source.get('OnlineId') == season and source.get('Language') == 'en-US', 'CACHE_IDENTITY')
        tasks = source['TaskConfig']['Tasks']
        require(len(tasks) == OUTPUTS[season][1], 'TASK_COUNT')
        originals = {}
        for t in tasks:
            name = t['InternalName']
            require(bool(re.fullmatch(r'Task[0-9]{2,3}',name)), 'TASK_ID')
            key = season + '_' + name + '_Description'
            require(key not in originals and isinstance(t['Description'], str), 'DUPLICATE_OR_UNVERIFIED_DESCRIPTION')
            originals[key] = t['Description']
        by_season[season] = originals
    require(sum(map(len,by_season.values())) == 146, 'TASK_TOTAL')
    return by_season

def normalized(text):
    # The exact rendered plain text, removing only original nonsemantic layout tags.
    value = text.replace('<nobr>', '').replace('</nobr>', '').replace('<nbsp>', '\u00a0')
    return value.replace('\u200b', '').replace('\u00ad', '').replace('\u2060', '')

def read_original_locale(source_file, language, keys):
    src = source_file.read_bytes()
    require(weekly.sha(src) == weekly.SOURCE_SHA[language], 'LOCALE_ZIP_SHA_' + language)
    with zipfile.ZipFile(source_file) as archive:
        entry = archive.getinfo('Liveops.locbin')
        require(0 < entry.file_size <= 2_000_000, 'LOCBIN_SIZE')
        data = archive.read(entry)
    matches,seen = {},set()
    for field,entry in weekly.protobuf_fields(data):
        require(field == 1, 'FIELD_SHAPE')
        pair = list(weekly.protobuf_fields(entry))
        require(len(pair) in (1,2) and pair[0][0] == 1
            and (len(pair) == 1 or pair[1][0] == 2), 'ENTRY_SHAPE')
        key = pair[0][1].decode('utf-8')
        require(key not in seen,'DUPLICATE_LIVEOPS_KEY')
        seen.add(key)
        if key not in keys:
            continue
        require(len(pair) == 2, 'MISSING_VALUE_' + key)
        text = normalized(pair[1][1].decode('utf-8'))
        require(0 < len(text) <= 300 and not re.search(r'[<>\x00-\x1f]',text), 'BAD_TEXT_' + key)
        matches[key] = text
    require(set(matches) == keys, 'MISSING_KEYS_' + language)
    return matches

def project(cache_file, locale_folder):
    originals = daily_keys(cache_file.read_bytes())
    needed = set().union(*(set(x) for x in originals.values()))
    columns = {
        language:read_original_locale(locale_folder/('LocDB_'+language+'.zip'),language,needed)
        for language in weekly.SOURCE_SHA
    }
    for original_tasks in originals.values():
        for key,english in original_tasks.items():
            # Independent identity evidence: exact English from season cache ↔ Liveops.locbin.
            actual = columns['en-US'][key]
            require(actual.replace('\xa0',' ').strip() == english.replace('\xa0',' ').strip(), 'ENGLISH_MISMATCH_'+key)
    outputs = {}
    for season,(filename,count,size,expected_hash) in OUTPUTS.items():
        result = {key:{lang:columns[lang][key] for lang in weekly.SOURCE_SHA} for key in originals[season]}
        raw = (json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(',',':'))+'\n').encode('utf-8')
        require(len(result) == count and len(raw) == size and weekly.sha(raw) == expected_hash, 'PUBLIC_DATA_CHANGED_'+season)
        outputs[filename] = raw
    return outputs

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--cache',type=Path,required=True)
    p.add_argument('--locales-dir',type=Path,required=True)
    p.add_argument('--output-dir',type=Path,required=True)
    a=p.parse_args()
    data = project(a.cache,a.locales_dir)
    a.output_dir.mkdir(parents=True,exist_ok=True)
    for file,raw in data.items():
        (a.output_dir/file).write_bytes(raw)
        print(file,len(raw),'bytes SHA-256',weekly.sha(raw))
if __name__ == '__main__':main()