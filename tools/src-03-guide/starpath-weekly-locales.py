"""Reproduce source-verified public weekly Star Path texts from owner-private LocDB ZIPs.

Original files, ZIP members outside Liveops.locbin, and user-specific data are
never written to Git. The static 2026-11-22 capture is SHA-pinned and immutable.
"""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

CACHE_SHA = '4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14'
SOURCE_SHA = {
    'en-US': '792b400f79bd29440d2d6d624c16e92ce380a3b927ebf2c7e9b7f19121acda86',
    'ja': '071e495bc199898078f75c3c5aef51f1c7abc92da699a65578d109fbb9bd7758',
    'de': 'bf545ab41e59ae2a28974d4ce8ff1d3e926ee0b7a196caf5fa1f46d5d9802538',
    'es': '7daabcde7b39e152eee704216f5ed80e0c7a0a3ed7235f5b474e045c02cedaf5',
    'fr': '2769b7694887f0cd4331c01ebe63faa2b933f45c4e25b54434a2ba32249ec970',
    'it': 'dae2f265496cb60a525cd170f82f82b5e21f8194dcf9140865a57284360cbdbf',
    'pt-BR': 'ef5e376fc1f9f0f72e82bd85839d4241c7c037412c7fe68c7cddbaa6e5c67b16',
    'zh-CN': '977b8f9b8568cf6e2aac8d46f558e2748ba32e54bd9bf443c8175227ca80993c',
}
OUTPUT_SHA = '6efa52893a3b3a475e00987940e50b0815f39904350e1e76731aac823ca71507'

def must(ok, reason):
    if not ok:
        raise ValueError('DB03_STARPATH_LOCALE_' + reason)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def uint(data, i):
    value, shift = 0, 0
    while i < len(data) and shift <= 63:
        x = data[i]
        i += 1
        value |= (x & 0x7f) << shift
        if x < 0x80:
            return value, i
        shift += 7
    raise ValueError('DB03_STARPATH_LOCALE_INVALID_VARINT')

def protobuf_fields(data):
    i = 0
    while i < len(data):
        tag, i = uint(data, i)
        field, wire = tag >> 3, tag & 7
        must(field > 0 and wire == 2, 'UNEXPECTED_WIRE')
        size, i = uint(data, i)
        must(size >= 0 and i + size <= len(data), 'TRUNCATED_FIELD')
        yield field, data[i:i + size]
        i += size

def cache_keys(raw):
    must(len(raw) == 186442 and sha(raw) == CACHE_SHA, 'CACHE_SHA')
    data = json.loads(raw)
    must(isinstance(data.get('Data'), dict) and len(data['Data']) == 2, 'CACHE_SEASONS')
    names = []
    for encoded in data['Data'].values():
        season = json.loads(encoded)
        for week in season['WeeklyTasksConfig']['WeeklyTasks']:
            for task in week['Tasks']:
                key = task['Description']
                must(isinstance(key, str) and re.fullmatch(r'Liveops\.[A-Za-z0-9_]+_Description', key), 'TASK_KEY')
                names.append(key[len('Liveops.'):])
    must(len(names) == 39 and len(set(names)) == 39, 'TASK_COUNT')
    return set(names)

def read_liveops(zip_path, lang, needed):
    raw = zip_path.read_bytes()
    must(sha(raw) == SOURCE_SHA[lang], 'ZIP_SHA_' + lang)
    with zipfile.ZipFile(zip_path) as z:
        must(z.getinfo('Liveops.locbin').file_size <= 2_000_000, 'OVERSIZED_LOCBIN')
        source = z.read('Liveops.locbin')
    result = {}
    seen = set()
    for f, payload in protobuf_fields(source):
        must(f == 1, 'INVALID_ENTRY_FIELD')
        entry = list(protobuf_fields(payload))
        must(len(entry) in (1, 2) and entry[0][0] == 1
             and (len(entry) == 1 or entry[1][0] == 2), 'INVALID_ENTRY_SHAPE')
        key = entry[0][1].decode('utf-8')
        must(key not in seen, 'DUPLICATE_LOC_KEY')
        seen.add(key)
        if key in needed:
            must(len(entry) == 2, 'MISSING_TRANSLATION')
            value = entry[1][1].decode('utf-8')
            value = value.replace('<nobr>', '').replace('</nobr>', '')
            value = value.replace('\u200b', '').replace('\u00ad', '').replace('\u2060', '')
            must(0 < len(value) <= 300 and not re.search(r'[<>\x00-\x1f]', value), 'INVALID_TRANSLATION')
            result[key] = value
    must(set(result) == needed, 'INCOMPLETE_LOCALE_' + lang)
    return result

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--cache', type=Path, required=True)
    p.add_argument('--locales-dir', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    keys = cache_keys(a.cache.read_bytes())
    table = {key: {} for key in keys}
    for lang in SOURCE_SHA:
        phrases = read_liveops(a.locales_dir / ('LocDB_' + lang + '.zip'), lang, keys)
        for key in keys:
            table[key][lang] = phrases[key]
    output = (json.dumps(table, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode('utf-8')
    must(len(output) == 15252 and sha(output) == OUTPUT_SHA, 'PUBLIC_PROJECTION_CHANGED')
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_bytes(output)
    print('39 weekly task keys × 8 original locales = 312 entries; pinned checksum:', sha(output))

if __name__ == '__main__':
    main()
