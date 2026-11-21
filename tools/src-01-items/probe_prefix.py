"""Recover exact *prefix observations* from truncated native itemlist probes.

The original SRC-01 format-probe embeds up to 8 KiB from each native itemlist.
When it is not the whole file, a source SHA-256 in the probe is a *claim* about
an inaccessible full file, not verification of the captured prefix.  Observed
complete frames are therefore written to a separate sample-only dataset and
MUST NOT be merged into the canonical complete-source DB-01 catalog.
"""
import argparse
import base64
import binascii
import hashlib
import json
import re
import zlib
from collections import Counter
from pathlib import Path

import extend1262
import localize1262
import steam1262

SCHEMA = "wand.src01.prefix-evidence@1"
PROBE_SCHEMA = "wand.src01.format-probe@1"
NONDISPLAY_MARKER = re.compile(r"^\{(?:LegacyPlaceholder|Placeholder|DoNotTranslate)\}", re.IGNORECASE)


def source_prefix_records(filename, spec, max_sample_bytes):
    """Return (records, coverage), or None when file is fully captured/empty."""
    if Path(filename).name != filename or not filename.endswith('.json') or \
            spec.get('source') != f'ddv_Data/StreamingAssets/itemlist/{filename}':
        raise ValueError(f'INVALID_SOURCE_PATH:{filename}')
    original_size = spec.get('size')
    if type(original_size) is not int or original_size < 0 or original_size > extend1262.MAX_SOURCE_BYTES:
        raise ValueError(f'INVALID_ORIGINAL_SIZE:{filename}')
    if not isinstance(spec.get('sha256'), str) or len(spec['sha256']) != 64 or \
            any(c not in '0123456789abcdef' for c in spec['sha256']):
        raise ValueError(f'INVALID_ORIGINAL_DIGEST_CLAIM:{filename}')
    try:
        head = base64.b64decode(spec.get('headBase64', ''), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f'INVALID_PREFIX_BASE64:{filename}') from exc
    if len(head) > original_size or len(head) > max_sample_bytes:
        raise ValueError(f'INVALID_PREFIX_LENGTH:{filename}')
    if len(head) == original_size:
        # Handled by probe_complete.py with full SHA verification.
        return None
    if len(head) != max_sample_bytes or spec.get('status') != 'binary_structure_probe':
        raise ValueError(f'INVALID_PREFIX_CAPTURE:{filename}')
    examples = spec.get('frameProbe', {}).get('frames', [])
    if spec.get('frameProbe', {}).get('status') != 'candidate_frame_model' or len(examples) != 3:
        raise ValueError(f'INVALID_PREFIX_SAMPLES:{filename}')
    bases = []
    for sample in examples:
        sample_ids = [f.get('integer') for f in sample.get('fieldProfile', {}).get('fields', [])
                      if f.get('field') == 1 and f.get('wire') == 0]
        if len(sample_ids) != 1 or type(sample_ids[0]) is not int or \
                type(sample.get('frameKey')) is not int or type(sample.get('frameBytes')) is not int:
            raise ValueError(f'INVALID_PREFIX_ID_SAMPLE:{filename}')
        bases.append(sample_ids[0] - sample['frameKey'])
    if len(set(bases)) != 1:
        raise ValueError(f'INCONSISTENT_PREFIX_BASE:{filename}')
    rows, keys, position = [], set(), 0
    category = filename.removesuffix('.json')
    sample_lengths = []
    while position < len(head):
        beginning = position
        try:
            frame_key, position = steam1262.varint(head, position)
            frame_length, position = steam1262.varint(head, position)
        except ValueError as error:
            if 'TRUNCATED_VARINT' in str(error):
                position = beginning
                break
            raise
        if not 0 < frame_length <= extend1262.MAX_RECORD_BYTES or frame_key in keys:
            raise ValueError(f'INVALID_OR_DUPLICATE_PREFIX_FRAME:{filename}')
        if position + frame_length > len(head):
            position = beginning
            break  # last, incomplete frame: never decode the truncated body
        frame = head[position:position + frame_length]
        position += frame_length
        row = extend1262.parse_definition(frame_key, frame, bases[0], category,
                                          spec['source'], spec['sha256'])
        row['source']['verification'] = 'complete_frame_in_unverified_full_file_prefix'
        row['source']['probePrefixSha256'] = hashlib.sha256(head).hexdigest()
        row['source']['fullFileSha256ClaimUnverified'] = True
        row['sampleOnly'] = True
        keys.add(frame_key)
        sample_lengths.append((frame_key, frame_length, row['itemId']))
        rows.append(row)
        if len(rows) > extend1262.MAX_FRAMES:
            raise ValueError('EXCESSIVE_PREFIX_RECORD_COUNT')
    if len(rows) < len(examples):
        raise ValueError(f'PREFIX_MISSING_FIRST_THREE_FRAMES:{filename}')
    for (key, size, item_id), example in zip(sample_lengths, examples):
        expected_id = next(x['integer'] for x in example['fieldProfile']['fields']
                           if x.get('field') == 1 and x.get('wire') == 0)
        if key != example['frameKey'] or size != example['frameBytes'] or item_id != expected_id:
            raise ValueError(f'PREFIX_SAMPLE_MISMATCH:{filename}')
    return rows, {
        'source': spec['source'], 'sourceBytes': original_size,
        'sourceSha256ClaimUnverified': spec['sha256'],
        'observedPrefixBytes': len(head),
        'probePrefixSha256': hashlib.sha256(head).hexdigest(),
        'completeFrames': len(rows), 'completeFrameBytes': position,
        'discardedPartialTailBytes': len(head) - position,
        'sourceFullyVerified': False, 'observation': 'first_N_bytes_from_SRC01_format_probe',
    }


def join_complete_localization(probe, by_category):
    """Join only complete, CRC-verified locbin member probes on exact native keys."""
    counts = {locale: 0 for locale in localize1262.LOCALES}
    provenance = {}
    for locale, suffix in localize1262.LOCALES.items():
        archive = probe.get('localization', {}).get(locale, {})
        file_name = f'LocDB_{suffix}.zip'
        source = f'ddv_Data/StreamingAssets/Localization/{file_name}'
        sha = archive.get('sha256')
        if archive.get('source') != source or not isinstance(sha, str) or len(sha) != 64 or \
                any(c not in '0123456789abcdef' for c in sha):
            continue
        evidence = {'archive': file_name, 'archiveSha256Claim': sha, 'members': {}}
        provenance[locale] = evidence
        for category, rows in by_category.items():
            member = archive.get('members', {}).get(category)
            if not isinstance(member, dict):
                continue
            try:
                raw = base64.b64decode(member.get('headBase64', ''), validate=True)
            except (ValueError, binascii.Error) as exc:
                raise ValueError(f'INVALID_LOCALIZATION_BASE64:{locale}:{category}') from exc
            if type(member.get('bytes')) is not int or len(raw) > member['bytes']:
                raise ValueError(f'LOCALIZATION_MEMBER_SIZE_MISMATCH:{locale}:{category}')
            if len(raw) != member['bytes']:
                continue  # incomplete member, no exact name claims
            crc = f'{zlib.crc32(raw) & 0xffffffff:08x}'
            if member.get('crc32') != crc:
                raise ValueError(f'LOCALIZATION_MEMBER_CRC_MISMATCH:{locale}:{category}')
            table = localize1262.decode_locbin(raw)
            evidence['members'][category] = {'member': f'{category}.locbin',
                'memberSha256': hashlib.sha256(raw).hexdigest(), 'crc32': crc,
                'bytes': len(raw), 'keys': len(table),
                'verification': 'complete_member_bytes_and_crc32_from_probe'}
            for row in rows:
                key = extend1262.category_localization_key(row, category)
                display = localize1262.clean_display_name(table[key]) if key in table else ''
                if display and NONDISPLAY_MARKER.match(display):
                    row.setdefault('locdbNonDisplayValues', {})[locale] = display
                elif display:
                    row['names'][locale] = display
                    counts[locale] += 1
    return counts, provenance


def build(probe_path, out):
    probe_path = Path(probe_path).resolve(strict=True)
    out = Path(out).resolve()
    if out == probe_path or out == probe_path.parent or out in probe_path.parents or \
            probe_path in out.parents:
        raise ValueError('OUTPUT_OVERLAPS_PROBE_INPUT')
    probe = json.loads(probe_path.read_text(encoding='utf-8-sig'))
    if probe.get('schema') != PROBE_SCHEMA or probe.get('platform') != 'Steam' or \
            probe.get('gameVersion') != '1.26.2' or not isinstance(probe.get('itemlistCandidates'), dict):
        raise ValueError('INVALID_SOURCE_PROBE_CONTRACT')
    sample_bytes = probe.get('sampleBytesPerEntry')
    if type(sample_bytes) is not int or not 256 <= sample_bytes <= 65536:
        raise ValueError('INVALID_SOURCE_SAMPLE_LIMIT')
    by_category, metadata, all_ids = {}, {}, set()
    complete_sources = []
    for filename, spec in sorted(probe['itemlistCandidates'].items()):
        result = source_prefix_records(filename, spec, sample_bytes)
        if result is None:
            complete_sources.append(filename)
            continue
        rows, coverage = result
        for row in rows:
            if row['itemId'] in all_ids:
                raise ValueError(f'CROSS_PREFIX_ITEM_ID_COLLISION:{row["itemId"]}')
            all_ids.add(row['itemId'])
        by_category[filename.removesuffix('.json')] = rows
        metadata[filename] = coverage
    if not metadata or not complete_sources:
        raise ValueError('EXPECTED_MIXED_FULL_AND_PARTIAL_PROBE')
    counts, localization_evidence = join_complete_localization(probe, by_category)
    rows = sorted((row for records in by_category.values() for row in records),
                  key=lambda row: row['itemId'])
    non_display_counts = {locale: sum(bool(row.get('locdbNonDisplayValues', {}).get(locale))
                                      for row in rows) for locale in localize1262.LOCALES}
    out.mkdir(parents=True, exist_ok=True)
    items_path = out / 'observed-prefix-definitions.jsonl'
    localize1262.write_jsonl(items_path, rows)
    manifest = {
        'schema': SCHEMA, 'gameVersion': '1.26.2', 'platform': 'Steam',
        'status': 'SOURCE_PREFIX_SAMPLES_ONLY_NOT_CANONICAL',
        'sampleOnlyDefinitionCount': len(rows), 'sampleOnlyCategoryCount': len(metadata),
        'fullSourcesExcluded': complete_sources, 'partialSources': metadata,
        'probeSha256': localize1262.sha_file(probe_path),
        'recordsFile': items_path.name, 'recordsSha256': localize1262.sha_file(items_path),
        'localizedByLocale': counts, 'nonDisplayLocdbValuesByLocale': non_display_counts,
        'localizationEvidence': localization_evidence,
        'unresolved': ['full file content and SHA-256', 'full record counts',
                       'collectible status', 'image role', 'world/DLC mappings'],
        'publicationStatus': 'PRIVATE_DIAGNOSTIC_ONLY',
        'mergeIntoCanonicalPermitted': False,
    }
    localize1262.write_json(out / 'manifest.json', manifest)
    localize1262.write_json(out / 'report.json', {
        'schema': 'wand.src01.prefix-evidence-report@1', 'sampleOnlyCount': len(rows),
        'observedCategories': {k: len(v) for k, v in sorted(by_category.items())},
        'fullSourcesExcluded': len(complete_sources), 'localizedByLocale': counts,
        'nonDisplayLocdbValuesByLocale': non_display_counts,
        'namesInAllEight': sum(all(row['names'][locale] for locale in localize1262.LOCALES)
                               for row in rows),
    })
    return {'sampleOnlyCount': len(rows), 'categories': len(by_category),
            'localizedByLocale': counts, 'nonDisplayLocdbValuesByLocale': non_display_counts}


def main():
    p = argparse.ArgumentParser(description='Extract observed native prefix frames, not complete catalogs')
    p.add_argument('--probe', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    a = p.parse_args()
    try:
        print(json.dumps(build(a.probe, a.out), ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        p.exit(1, f'SRC-01 prefix-only evidence failed: {exc}\n')


if __name__ == '__main__':
    main()