#!/usr/bin/env python3
"""SHA-authenticated Steam 1.26.2 Tag.locbin translations, owner-private.

Only TagItemData.DisplayName -> Tag.locbin pairs are joined. Full game
localization archives stay private and are never written or exported.
"""
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path
from zipfile import ZipFile, BadZipFile

from extract_tag_evidence import (
    TAG_SHA256, PARENT_SHA256, SCHEMA as NATIVE_TAG_SCHEMA, digest,
    canonical, regular_bytes, require, reject_git_output,
)
from steam1262 import varint

SCHEMA = 'wand.db02.native-tag-locales@1'
NATIVE_TAG_MANIFEST_SHA256 = '26eb6d5e84683aae8e26b8720fd98fa7d0b5a3e607650b380c97e4f7de519ba6'
LOCALES = {'en': ('en-US', '792b400f79bd29440d2d6d624c16e92ce380a3b927ebf2c7e9b7f19121acda86'),
           'fr': ('fr', '2769b7694887f0cd4331c01ebe63faa2b933f45c4e25b54434a2ba32249ec970'),
           'it': ('it', 'dae2f265496cb60a525cd170f82f82b5e21f8194dcf9140865a57284360cbdbf'),
           'de': ('de', 'bf545ab41e59ae2a28974d4ce8ff1d3e926ee0b7a196caf5fa1f46d5d9802538'),
           'es-ES': ('es', '7daabcde7b39e152eee704216f5ed80e0c7a0a3ed7235f5b474e045c02cedaf5'),
           'ja': ('ja', '071e495bc199898078f75c3c5aef51f1c7abc92da699a65578d109fbb9bd7758'),
           'zh-CN': ('zh-CN', '977b8f9b8568cf6e2aac8d46f558e2748ba32e54bd9bf443c8175227ca80993c'),
           'pt-BR': ('pt-BR', 'ef5e376fc1f9f0f72e82bd85839d4241c7c037412c7fe68c7cddbaa6e5c67b16')}


def read_string_fields(frame: bytes) -> dict[int, str]:
    cursor, result = 0, {}
    while cursor < len(frame):
        tag, cursor = varint(frame, cursor)
        field, kind = tag >> 3, tag & 7
        require(kind == 2 and field in (1, 2) and field not in result,
                'INVALID_LOCBIN_FIELD')
        length, cursor = varint(frame, cursor)
        require(length <= len(frame) - cursor and length <= 2048, 'LOCBIN_STRING_BOUNDS')
        try:
            value = frame[cursor:cursor + length].decode('utf-8', errors='strict')
        except UnicodeDecodeError as exc:
            raise ValueError('DB02_TAG_LOCBIN_INVALID_UTF8') from exc
        cursor += length
        require(0 < len(value) <= 512 and value.strip() and
                all(ord(ch) >= 32 for ch in value), 'LOCBIN_UNSAFE_STRING')
        result[field] = value
    require(set(result) == {1, 2}, 'LOCBIN_MISSING_KEY_OR_VALUE')
    return result


def parse_tag_locbin(payload: bytes) -> dict[str, str]:
    require(0 < len(payload) <= 512*1024, 'LOCBIN_SIZE')
    offset, strings = 0, {}
    while offset < len(payload):
        tag, offset = varint(payload, offset)
        require(tag == 10, 'UNSUPPORTED_LOCBIN_ENTRY')
        length, offset = varint(payload, offset)
        require(0 < length <= 4096 and length <= len(payload) - offset, 'LOCBIN_FRAME_BOUNDS')
        entry = read_string_fields(payload[offset:offset + length]);offset += length
        require(entry[1] not in strings, 'DUPLICATE_LOCALIZATION_KEY')
        strings[entry[1]] = entry[2]
        require(len(strings) <= 5000, 'EXCESSIVE_LOCALIZATION_ROWS')
    return strings


def extract_native_rows(tag_dir: Path) -> list[dict]:
    manifest_bytes = regular_bytes(tag_dir/'manifest.json', 1024*1024)
    require(digest(manifest_bytes) == NATIVE_TAG_MANIFEST_SHA256,
            'UNTRUSTED_TAG_PARENT')
    manifest = json.loads(manifest_bytes)
    require(manifest.get('schema') == NATIVE_TAG_SCHEMA and
            manifest.get('nativeTagSourceSha256') == TAG_SHA256 and
            manifest.get('parentSrc02ManifestSha256') == PARENT_SHA256 and
            manifest.get('privateOnly') is True and
            manifest.get('publicationAuthorized') is False,
            'TAG_SOURCE_PROVENANCE')
    rows_bytes = regular_bytes(tag_dir/'tags.jsonl', 2*1024*1024)
    require(digest(rows_bytes) == manifest['files']['tags.jsonl'], 'TAMPERED_NATIVE_TAG_ROWS')
    records = [json.loads(line) for line in rows_bytes.splitlines() if line]
    require(len(records) == manifest['counts']['nativeTagDefinitions'], 'TAG_ROW_COUNT')
    seen = set()
    for record in records:
        require(type(record.get('tagId')) is int and
                record['tagId'] not in seen and
                record.get('displayNameKey', '').startswith('Tag.') and
                len(record['displayNameKey']) > 4,
                'INVALID_NATIVE_TAG')
        seen.add(record['tagId'])
    return records


def extract(tag_dir: Path, locale_dir: Path, output: Path) -> dict:
    tag_dir = tag_dir.resolve(strict=True)
    locale_dir = locale_dir.resolve(strict=True)
    output = output.resolve()
    require(tag_dir.is_dir() and locale_dir.is_dir(), 'INPUT_NOT_DIRECTORY')
    reject_git_output(output)
    native = extract_native_rows(tag_dir)
    lookup = {r['displayNameKey'][4:]:r['tagId'] for r in native}
    require(len(lookup) == len(native), 'DUPLICATE_NATIVE_DISPLAY_NAME_KEY')
    localized: dict[int, dict[str,str]] = {r['tagId']: {} for r in native}
    verified = {}
    for locale, (suffix, expected_sha) in LOCALES.items():
        path = locale_dir/f'LocDB_{suffix}.zip'
        data = regular_bytes(path, 20*1024*1024)
        require(digest(data) == expected_sha, 'WRONG_VERSION_LOCALE_'+locale)
        try:
            with ZipFile(path) as archive:
                infos = archive.infolist()
                tag_info = next((entry for entry in infos if entry.filename == 'Tag.locbin'), None)
                require(tag_info is not None and tag_info.file_size <= 512*1024 and
                        not tag_info.is_dir(), 'TAG_MEMBER_MISSING_'+locale)
                tag_data = archive.read(tag_info)
        except (BadZipFile, RuntimeError, OSError, EOFError) as exc:
            raise ValueError('DB02_TAG_BAD_LOCALE_ARCHIVE_'+locale) from exc
        names = parse_tag_locbin(tag_data)
        require(set(names) == set(lookup), 'TAG_LOCALIZATION_COVERAGE_'+locale)
        for key, value in names.items():
            localized[lookup[key]][locale] = value
        verified[locale] = {'zipSha256':expected_sha, 'tagMemberSha256':digest(tag_data),
                            'tagMemberBytes':len(tag_data),'localizations':len(names)}
    ordered = [{'tagId':r['tagId'], 'localizedNames':localized[r['tagId']]}
               for r in sorted(native,key=lambda v:v['tagId'])]
    require(all(set(r['localizedNames']) == set(LOCALES) for r in ordered), 'INCOMPLETE_LOCALIZATION')
    counts = {'nativeTagDefinitions':len(ordered), 'languages':len(LOCALES),
              'translatedTagStrings':sum(len(r['localizedNames']) for r in ordered)}
    report = {'schema':'wand.db02.native-tag-locales-report@1',
              'status':'current_exact_tag_locbin_join_private',
              'counts':counts, 'allTagKeysResolved':True,
              'gameVersion':'1.26.2','platform':'Steam',
              'completeGameLocalizationClaim':False,
              'nativeTagNamesTranslated':True,
              'verifiedArchives':verified}
    names_bytes = b''.join(canonical(x) for x in ordered)
    report_bytes = canonical(report)
    manifest = {'schema':SCHEMA,'platform':'Steam','gameVersion':'1.26.2',
                'privateOnly':True,'publicationAuthorized':False,
                'parentTagManifestSha256':NATIVE_TAG_MANIFEST_SHA256,
                'parentSrc02R5ManifestSha256':PARENT_SHA256,
                'nativeTagSha256':TAG_SHA256,
                'localeArchiveSha256':{k:v[1] for k,v in LOCALES.items()},
                'localizationCategory':'Tag.locbin',
                'sourceKeyTransform':'Tag.<key> => <key> in Tag.locbin',
                'counts':counts,
                'files':{'tag-locales.jsonl':digest(names_bytes),'report.json':digest(report_bytes)}}
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.db02-tags-locale-',dir=output.parent) as tmp:
        stage=Path(tmp)
        (stage/'tag-locales.jsonl').write_bytes(names_bytes)
        (stage/'report.json').write_bytes(report_bytes)
        (stage/'manifest.json').write_bytes(canonical(manifest))
        require(not output.exists(), 'REFUSE_OVERWRITE')
        os.rename(stage,output)
    return {'schema':SCHEMA,'status':'verified_private_localizations',
            'manifestSha256':digest(canonical(manifest)),
            'counts':counts,'privateOnly':True,'publicationAuthorized':False}


def main():
    parser=argparse.ArgumentParser(description='Owner-private Steam 1.26.2 eight-language Tag translations')
    parser.add_argument('--tag-evidence',type=Path,required=True)
    parser.add_argument('--locales',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(extract(args.tag_evidence,args.locales,args.out),sort_keys=True))


if __name__=='__main__':
    main()