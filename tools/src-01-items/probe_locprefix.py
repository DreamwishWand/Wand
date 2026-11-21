"""Observe exact locale-key matches inside *truncated* LocDB member probes.

This produces private diagnostic name observations, never official/full-archive-
verified current names. The native item IDs are verified against the full
13,202-row SRC-01 extraction; the truncated LocDB members are NOT independently
verifiable against their original full ZIP/member SHA/CRC values.
"""
import argparse
import base64
import binascii
import hashlib
import importlib.util
import json
import zlib
from collections import defaultdict
from pathlib import Path

import localize1262
import probe_prefix

SOURCE_SCHEMA = 'wand.src01.format-probe@1'
SCHEMA = 'wand.src01.locale-prefix-evidence@1'

# Reuse the existing evidence checks, including manifest hashes/unique IDs and
# the four canonical-native category source contracts. No copy of rules here.
_DB01_BUILD = Path(__file__).resolve().parents[1] / 'db-01-items' / 'build.py'
_spec = importlib.util.spec_from_file_location('db01_native_validation', _DB01_BUILD)
_db01 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_db01)


def entries_in_locbin_prefix(raw):
    """Only complete length-delimited wire-2 entries; no partial final entry."""
    names, position = {}, 0
    while position < len(raw):
        beginning = position
        try:
            tag, position = localize1262.varint(raw, position)
            length, position = localize1262.varint(raw, position)
        except ValueError as error:
            if 'TRUNCATED_VARINT' in str(error):
                position = beginning
                break
            raise
        if tag != 10 or not 0 < length <= localize1262.MAX_LOC_FILE_BYTES:
            raise ValueError('INVALID_LOCALIZATION_PREFIX_FRAME')
        if position + length > len(raw):
            position = beginning
            break
        key, value = localize1262.decode_entry(raw[position:position + length])
        if key in names:
            raise ValueError('DUPLICATE_LOCALIZATION_PREFIX_KEY')
        names[key] = value
        position += length
        if len(names) > localize1262.MAX_ENTRIES:
            raise ValueError('TOO_MANY_LOCALIZATION_PREFIX_ENTRIES')
    return names, position


def member_prefix_spec(spec, sample_bytes, locale, category):
    """Check observed bytes, verify CRC only for actually complete members."""
    if type(spec.get('bytes')) is not int or not 0 < spec['bytes'] <= localize1262.MAX_LOC_FILE_BYTES:
        raise ValueError(f'INVALID_LOCALIZATION_MEMBER_SIZE:{locale}:{category}')
    try:
        raw = base64.b64decode(spec.get('headBase64', ''), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f'INVALID_MEMBER_BASE64:{locale}:{category}') from exc
    if len(raw) != min(spec['bytes'], sample_bytes):
        raise ValueError(f'INCONSISTENT_MEMBER_PREFIX_SIZE:{locale}:{category}')
    complete = len(raw) == spec['bytes']
    if not isinstance(spec.get('crc32'), str) or len(spec['crc32']) != 8:
        raise ValueError(f'MISSING_MEMBER_CRC_CLAIM:{locale}:{category}')
    if complete and f'{zlib.crc32(raw) & 0xffffffff:08x}' != spec['crc32']:
        raise ValueError(f'COMPLETE_MEMBER_CRC_MISMATCH:{locale}:{category}')
    table, parsed_bytes = entries_in_locbin_prefix(raw)
    if not table:
        raise ValueError(f'EMPTY_MEMBER_PREFIX:{locale}:{category}')
    if complete and parsed_bytes != len(raw):
        raise ValueError(f'TRUNCATED_CLAIMED_COMPLETE_MEMBER:{locale}:{category}')
    meta = {
        'member': f'{category}.locbin', 'fullMemberBytesClaim': spec['bytes'],
        'memberCrc32Claim': spec['crc32'], 'memberCrcVerified': complete,
        'observedMemberPrefixBytes': len(raw),
        'memberPrefixSha256': hashlib.sha256(raw).hexdigest(),
        'fullMemberVerified': complete,
        'completeEntries': len(table), 'parsedCompleteEntryBytes': parsed_bytes,
        'discardedTrailingBytes': len(raw)-parsed_bytes,
        'verification': 'complete_member_crc_verified' if complete else 'prefix_observation_only',
    }
    return table, meta


def build(probe_path, native_folder, output):
    probe_path = Path(probe_path).resolve(strict=True)
    native_folder = Path(native_folder).resolve(strict=True)
    output = Path(output).resolve()
    if output == native_folder or output in native_folder.parents or native_folder in output.parents or \
            output == probe_path.parent or output == probe_path or output in probe_path.parents or \
            probe_path in output.parents:
        raise ValueError('OUTPUT_OVERLAPS_INPUT')
    probe = json.loads(probe_path.read_text(encoding='utf-8-sig'))
    sample_bytes = probe.get('sampleBytesPerEntry')
    if probe.get('schema') != SOURCE_SCHEMA or probe.get('gameVersion') != '1.26.2' or \
            probe.get('platform') != 'Steam' or type(sample_bytes) is not int or \
            not 256 <= sample_bytes <= 65536:
        raise ValueError('INVALID_FORMAT_PROBE')
    source_rows, native_meta = _db01.load_native(native_folder)
    if native_meta['nativeManifest']['gameVersion'] != probe['gameVersion']:
        raise ValueError('NATIVE_PROBE_VERSION_MISMATCH')
    lookup = defaultdict(dict)
    by_id = {}
    for row in source_rows:
        key = row['rawNameField'] + '_DisplayName'
        cat = row['nativeCategory']
        if key in lookup[cat]:
            raise ValueError(f'COLLIDING_NATIVE_LOCALIZATION_KEY:{cat}:{key}')
        lookup[cat][key] = row
        by_id[row['itemId']] = row
    observations = {}
    evidence = {}
    locale_counts = {locale: 0 for locale in localize1262.LOCALES}
    marker_counts = {locale: 0 for locale in localize1262.LOCALES}
    for locale, suffix in localize1262.LOCALES.items():
        archive = probe.get('localization', {}).get(locale, {})
        source = f'ddv_Data/StreamingAssets/Localization/LocDB_{suffix}.zip'
        archive_sha = archive.get('sha256')
        if archive.get('source') != source or not _db01.valid_hash(archive_sha):
            continue
        evidence[locale] = {'archive': f'LocDB_{suffix}.zip',
                            'archiveSha256ClaimUnverified': archive_sha, 'members': {}}
        for category, entries in lookup.items():
            member = archive.get('members', {}).get(category)
            if not isinstance(member, dict):
                continue
            table, meta = member_prefix_spec(member, sample_bytes, locale, category)
            evidence[locale]['members'][category] = meta
            for key, native in entries.items():
                display = localize1262.clean_display_name(table[key]) if key in table else ''
                if not display:
                    continue
                item_id = native['itemId']
                candidate = observations.get(item_id)
                if candidate is None:
                    native_file = native['source']['file']
                    candidate = {'itemId': item_id, 'nativeCategory': category,
                       'rawNameField': native['rawNameField'], 'localizationKey': key,
                       'names': {code: None for code in localize1262.LOCALES},
                       'locdbNonDisplayValues': {}, 'sampleOnlyLocalization': True,
                       'fullLocalizationProvenanceVerified': False,
                       'source': {'platform': 'Steam', 'gameVersion': '1.26.2',
                                  'nativeFile': native_file,
                                  'nativeFileSha256': native_meta['sourceHashes'][native_file],
                                  'nativeItemsSha256': native_meta['nativeHash'],
                                  'nativeIdVerification': 'canonical_full_native_extraction'},
                       'localizationVerification': 'locbin_prefix_exact_key_only'}
                    observations[item_id] = candidate
                if probe_prefix.NONDISPLAY_MARKER.match(display):
                    candidate['locdbNonDisplayValues'][locale] = display
                    marker_counts[locale] += 1
                else:
                    candidate['names'][locale] = display
                    locale_counts[locale] += 1
    rows = [row for row in observations.values() if any(row['names'].values()) or
            row['locdbNonDisplayValues']]
    rows.sort(key=lambda row: row['itemId'])
    output.mkdir(parents=True, exist_ok=True)
    items_path = output / 'observed-locale-prefix-names.jsonl'
    localize1262.write_jsonl(items_path, rows)
    full_names = sum(all(row['names'][code] for code in localize1262.LOCALES) for row in rows)
    manifest = {'schema': SCHEMA, 'platform': 'Steam', 'gameVersion': '1.26.2',
                'status': 'LOCALIZATION_PREFIX_OBSERVATION_NOT_OFFICIAL_VERIFIED',
                'recordCount': len(rows), 'namesInAllEight': full_names,
                'namesByLocale': locale_counts, 'nonDisplayMarkersByLocale': marker_counts,
                'probeSha256': localize1262.sha_file(probe_path),
                'nativeItemsSha256': native_meta['nativeHash'],
                'nativeManifestSha256': native_meta['nativeManifestHash'],
                'filename': items_path.name,
                'dataSha256': localize1262.sha_file(items_path),
                'localizationEvidence': evidence,
                'mergeIntoCanonicalPermitted': False,
                'publicationStatus': 'PRIVATE_DIAGNOSTIC_ONLY',
                'unresolved': ['complete source LocDB ZIPs and member CRC/SHA validation',
                               'official production display-name provenance',
                               'full eight-locale coverage']}
    localize1262.write_json(output / 'manifest.json', manifest)
    localize1262.write_json(output / 'report.json', {
        'schema': 'wand.src01.locale-prefix-report@1',
        'observedNativeItems': len(rows), 'nameMatchesByLocale': locale_counts,
        'nonDisplayMarkersByLocale': marker_counts, 'allEightPrefixNames': full_names,
        'caution': 'These exact text observations are not verified against complete LocDB files.'})
    return {'observedNativeItems': len(rows), 'allEightPrefixNames': full_names,
            'nameMatchesByLocale': locale_counts, 'nonDisplayMarkersByLocale': marker_counts}


def main():
    parser = argparse.ArgumentParser(description='Extract diagnostic name observations from partial LocDB members')
    parser.add_argument('--probe', required=True, type=Path)
    parser.add_argument('--native', required=True, type=Path, help='Directory with 13,202 verified native items')
    parser.add_argument('--out', required=True, type=Path)
    options = parser.parse_args()
    try:
        print(json.dumps(build(options.probe, options.native, options.out), ensure_ascii=False))
    except (OSError, ValueError, TypeError, KeyError, UnicodeError) as exc:
        parser.exit(1, f'SRC-01 locale-prefix failed: {exc}\n')


if __name__ == '__main__':
    main()