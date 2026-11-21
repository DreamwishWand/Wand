"""DB-03 exact-byte Steam ProtoDB bridge, strictly archived static definitions.

Public code only. Original game bytes and report remain owner-private.
Different content is an extraction requirement, never a zero-delta claim.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re

from starpath_source_audit import audit

SCHEMA = 'wand.db03.protodb-source-bridge@1'
MANIFEST = 'wand.db03.protodb-static@1'
SOURCE = 'ddv_Data/StreamingAssets/protoDb.bin'
HASH = re.compile(r'^[a-f0-9]{64}$')
VERSION = re.compile(r'^\d+\.\d+\.\d+$')
MAX_BYTES = 128 * 1024 * 1024
STATIC_FAMILIES = ('designChallenges', 'dreamSnaps', 'starPathFtue',
                   'miniEvents', 'floatingFestivals', 'expansions')


def require(ok: bool, problem: str) -> None:
    if not ok:
        raise ValueError('DB03_PROTO_SOURCE_' + problem)


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def original_bytes(path: Path) -> bytes:
    require(path.is_file() and not path.is_symlink(), 'SOURCE_MISSING_OR_LINKED')
    size = path.stat().st_size
    require(0 < size <= MAX_BYTES, 'INVALID_SIZE')
    raw = path.read_bytes()
    require(len(raw) == size, 'SOURCE_CHANGED_DURING_READ')
    return raw


def report(old: bytes, new: bytes, manifest: dict, *, target_version: str,
           target_sha256: str, expected_entries: int | None = None) -> dict:
    require(isinstance(manifest, dict) and manifest.get('schema') == MANIFEST
            and manifest.get('status') == 'STATIC_SOURCE_ONLY', 'BASELINE_MANIFEST')
    base = manifest.get('target') or {}
    require(base.get('platform') == 'Steam'
            and isinstance(base.get('gameVersion'), str)
            and VERSION.fullmatch(base['gameVersion'])
            and isinstance(target_version, str) and VERSION.fullmatch(target_version)
            and base['gameVersion'] != target_version, 'VERSION')
    src = manifest.get('source') or {}
    require(src.get('file') == SOURCE and isinstance(src.get('sha256'), str)
            and HASH.fullmatch(src['sha256'])
            and type(src.get('bytes')) is int and src['bytes'] > 0,
            'BASELINE_SOURCE')
    require(isinstance(target_sha256, str) and HASH.fullmatch(target_sha256),
            'TARGET_PIN_MISSING')
    require(len(old) == src['bytes'] and digest(old) == src['sha256'],
            'BASELINE_SOURCE_SHA_MISMATCH')
    require(bool(new) and len(new) <= MAX_BYTES and digest(new) == target_sha256,
            'TARGET_SOURCE_SHA_MISMATCH')
    counts = manifest.get('counts')
    require(isinstance(counts, dict) and all(type(counts.get(x)) is int
            and counts[x] >= 0 for x in STATIC_FAMILIES),
            'BASELINE_STATIC_CENSUS')
    # Both files must be real native ProtoDB containers, not arbitrary bytes.
    baseline_audit = audit(old, base['gameVersion'])
    target_audit = audit(new, target_version)
    baseline_n = baseline_audit['counts']['protoDbEntries']
    target_n = target_audit['counts']['protoDbEntries']
    require(baseline_n > 0 and (expected_entries is None or
            (type(expected_entries) is int and baseline_n == expected_entries)),
            'BASELINE_NATIVE_ENTRY_CENSUS')
    equal = old == new
    if equal:
        require(baseline_audit['counts']['protoDbEntries'] == target_n and
                baseline_audit['counts']['seasonDefinitionsInProtoDb'] ==
                target_audit['counts']['seasonDefinitionsInProtoDb'],
                'SOURCE_IDENTITY_AUDIT_CONFLICT')
    return {
        'schema': SCHEMA,
        'status': 'IDENTICAL_ARCHIVED_STATIC_SOURCE' if equal else 'TARGET_CHANGED_REEXTRACT_REQUIRED',
        'baseline': {'platform': 'Steam', 'gameVersion': base['gameVersion'],
                     'sha256': src['sha256'], 'bytes': len(old),
                     'protoDbEntries': baseline_n},
        'target': {'platform': 'Steam', 'gameVersion': target_version,
                   'sha256': target_sha256, 'bytes': len(new),
                   'protoDbEntries': target_n},
        'proof': {'fullOriginalBytesIdentical': equal,
                  'byteComparison': 'complete_exact_binary',
                  'baselineManifestSchema': MANIFEST},
        'staticFamiliesReusable': list(STATIC_FAMILIES) if equal else [],
        'staticCensusReused': {key:counts[key] for key in STATIC_FAMILIES} if equal else None,
        'starPath': {'archivedIntroductionDefinitions':
                      baseline_audit['counts']['introductionOnlyDefinitions'] if equal else None,
                     'archivedSeasonDefinitions':
                      baseline_audit['counts']['seasonDefinitionsInProtoDb'] if equal else None,
                     'liveSeasonState': 'NOT_VERIFIED'},
        'limits': {
            'Condition.json': 'SEPARATE_CHANGED_SOURCE_NOT_COVERED',
            'Mission.json': 'SEPARATE_VERIFIED_SOURCE_REQUIRED',
            'localePayloads': 'SEPARATE_VERIFIED_SOURCE_REQUIRED',
            'liveEvents': 'NOT_VERIFIED',
            'playerProgressAndOwnership': 'NOT_VERIFIED',
            'publicationAuthorization': 'NOT_GRANTED'
        }
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-protodb', type=Path, required=True)
    parser.add_argument('--target-protodb', type=Path, required=True)
    parser.add_argument('--baseline-manifest', type=Path, required=True)
    parser.add_argument('--target-version', required=True)
    parser.add_argument('--target-sha256', required=True,
                        help='Independently captured exact original target SHA-256')
    parser.add_argument('--expected-entries', type=int)
    parser.add_argument('--out', type=Path, required=True)
    args=parser.parse_args(argv)
    output=args.out.resolve()
    inputs={args.baseline_protodb.resolve(), args.target_protodb.resolve(),
            args.baseline_manifest.resolve()}
    require(output not in inputs, 'SOURCE_OUTPUT_COLLISION')
    checkout=Path(__file__).resolve().parents[2]
    if (checkout / 'package.json').is_file():
        require(not output.is_relative_to(checkout), 'REPORT_INSIDE_PUBLIC_CHECKOUT')
    manifest=json.loads(original_bytes(args.baseline_manifest).decode('utf-8-sig'))
    result=report(original_bytes(args.baseline_protodb),
                  original_bytes(args.target_protodb),manifest,
                  target_version=args.target_version,
                  target_sha256=args.target_sha256,
                  expected_entries=args.expected_entries)
    output.parent.mkdir(parents=True,exist_ok=True)
    temp=output.with_name(output.name+'.tmp')
    with temp.open('wb') as file:
        file.write((json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf-8'))
    os.replace(temp,output)
    try:
        os.chmod(output,0o600)
    except OSError:
        pass
    print(json.dumps({'status': result['status'],
                      'sourceSha256': result['target']['sha256'],
                      'protoDbEntries': result['target']['protoDbEntries']},sort_keys=True))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
