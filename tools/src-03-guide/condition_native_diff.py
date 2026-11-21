"""DB-03: record-exact offline Condition.json source delta, without semantic inference.

Only native binary frame identity and original protobuf-wire SHA-256 are compared.
Current player prerequisites, quest progress, locale text, live event state and
DLC entitlements cannot be obtained from this source-only comparison.
All reports remain owner-private and outside the public repository.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re

from mission_source_bridge import candidate, read_json, sha_file
from native_guide import MAX_SOURCE, canonical_wire, native_frames

SCHEMA = 'wand.db03.condition-native-diff@1'
SOURCE = 'ddv_Data/StreamingAssets/itemlist/Condition.json'
SHA = re.compile(r'^[a-f0-9]{64}$')


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError('DB03_CONDITION_DIFF_' + message)


def read_source(path: Path) -> bytes:
    require(path.is_file() and not path.is_symlink(), 'MISSING_OR_SYMLINK_SOURCE')
    size = path.stat().st_size
    require(0 < size <= MAX_SOURCE, 'INVALID_SOURCE_SIZE')
    value = path.read_bytes()
    require(len(value) == size, 'SOURCE_CHANGED_DURING_READ')
    return value


def record_digests(raw: bytes) -> dict[str, str]:
    """Validate complete native frame structure; hash each wire definition as-is."""
    records: dict[str, str] = {}
    for _, _, native_id, fields in native_frames(raw):
        key = str(native_id)
        require(key not in records, 'DUPLICATE_NATIVE_ID')
        records[key] = hashlib.sha256(canonical_wire(fields)).hexdigest()
    require(bool(records), 'ZERO_NATIVE_RECORDS')
    return records


def build_report(
    baseline_raw: bytes,
    probe: dict,
    *,
    baseline_version: str,
    baseline_sha256: str,
    probe_sha256: str,
    target_raw: bytes | None = None,
    expected_baseline_count: int | None = None
) -> dict:
    require(isinstance(probe, dict) and probe.get('schema') == 'wand.src01.format-probe@1'
            and probe.get('platform') == 'Steam'
            and isinstance(probe.get('gameVersion'), str)
            and bool(probe['gameVersion'])
            and isinstance(baseline_version, str) and bool(baseline_version)
            and baseline_version != probe['gameVersion'],
            'VERSION_OR_PLATFORM')
    require(isinstance(baseline_sha256, str) and SHA.fullmatch(baseline_sha256)
            and isinstance(probe_sha256, str) and SHA.fullmatch(probe_sha256),
            'UNTRUSTED_DIGEST_INPUT')
    target_entry = candidate(probe, 'Condition.json')
    require(hashlib.sha256(baseline_raw).hexdigest() == baseline_sha256,
            'BASELINE_SHA_MISMATCH')
    baseline_records = record_digests(baseline_raw)
    if expected_baseline_count is not None:
        require(type(expected_baseline_count) is int and expected_baseline_count > 0
                and len(baseline_records) == expected_baseline_count,
                'BASELINE_CENSUS_MISMATCH')

    result = {
        'schema': SCHEMA,
        'status': 'TARGET_BYTES_NOT_AVAILABLE',
        'source': SOURCE,
        'comparisonBasis': 'original_native_id_and_complete_canonical_protobuf_wire_sha256',
        'baseline': {
            'platform': 'Steam', 'gameVersion': baseline_version,
            'sha256': baseline_sha256, 'size': len(baseline_raw),
            'nativeRecords': len(baseline_records)
        },
        'target': {
            'platform': 'Steam', 'gameVersion': probe['gameVersion'],
            'sha256': target_entry['sha256'], 'size': target_entry['size'],
            'sourceProbeSha256': probe_sha256,
            'nativeRecords': None
        },
        'comparison': None,
        'limits': {
            'conditionSemanticChanges': 'NOT_EVALUATED',
            'questPrerequisitesAndPlayerProgress': 'NOT_EVALUATED',
            'currentLocalizationAndStarPath': 'NOT_EVALUATED',
            'publicSourceDistribution': 'NOT_AUTHORIZED'
        }
    }
    if target_raw is None:
        return result
    require(len(target_raw) == target_entry['size'] and
            hashlib.sha256(target_raw).hexdigest() == target_entry['sha256'],
            'TARGET_BYTES_NOT_MATCHING_INDEPENDENT_PROBE')
    target_records = record_digests(target_raw)
    a, b = set(baseline_records), set(target_records)
    order = lambda values: sorted(values, key=int)
    changed = [
        {'id': key, 'baselineWireSha256': baseline_records[key],
         'targetWireSha256': target_records[key]}
        for key in order(a & b) if baseline_records[key] != target_records[key]
    ]
    result['target']['nativeRecords'] = len(target_records)
    result['status'] = 'COMPARED_NATIVE_DEFINITIONS_ONLY'
    result['comparison'] = {
        'addedIds': order(b - a),
        'removedIds': order(a - b),
        'changed': changed,
        'unchangedCount': sum(baseline_records[key] == target_records[key]
                              for key in a & b),
        'addedCount': len(b - a),
        'removedCount': len(a - b),
        'changedCount': len(changed),
        'verifiedTargetFullFileSha256': target_entry['sha256']
    }
    require(len(a & b) == result['comparison']['unchangedCount'] + len(changed),
            'COUNT_INVARIANT')
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--baseline-condition', type=Path, required=True)
    ap.add_argument('--baseline-version', required=True)
    ap.add_argument('--baseline-sha256', required=True,
                    help='Independently verified original full-file digest')
    ap.add_argument('--expected-baseline-count', type=int)
    ap.add_argument('--target-probe', type=Path, required=True)
    ap.add_argument('--target-condition', type=Path,
                    help='Optional original target bytes; omitting emits explicitly unverified readiness')
    ap.add_argument('--out', type=Path, required=True,
                    help='Owner-private report path outside the checkout')
    args = ap.parse_args(argv)

    checkout = Path(__file__).resolve().parents[2]
    output = args.out.resolve()
    inputs = [args.baseline_condition.resolve(), args.target_probe.resolve()]
    if args.target_condition is not None:
        inputs.append(args.target_condition.resolve())
    require(output not in inputs, 'SOURCE_OUTPUT_COLLISION')
    if (checkout / 'package.json').is_file():
        require(not output.is_relative_to(checkout), 'REPORT_INSIDE_PUBLIC_CHECKOUT')

    original = read_source(args.baseline_condition)
    probe = read_json(args.target_probe)
    current = read_source(args.target_condition) if args.target_condition is not None else None
    report = build_report(original, probe,
                          baseline_version=args.baseline_version,
                          baseline_sha256=args.baseline_sha256,
                          probe_sha256=sha_file(args.target_probe),
                          target_raw=current,
                          expected_baseline_count=args.expected_baseline_count)
    encoded = (json.dumps(report, sort_keys=True, indent=2, ensure_ascii=False) + '\n').encode('utf-8')
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_name(output.name + '.tmp')
    with temp.open('wb') as stream:
        stream.write(encoded)
    os.replace(temp, output)
    try:
        os.chmod(output, 0o600)
    except OSError:
        pass
    print(json.dumps({
        'status': report['status'],
        'source': report['source'],
        'baselineRecords': report['baseline']['nativeRecords'],
        'targetRecords': report['target']['nativeRecords'],
        'changedRecords': report['comparison']['changedCount'] if report['comparison'] else None
    }, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
