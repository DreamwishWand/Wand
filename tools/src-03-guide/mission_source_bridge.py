"""DB-03: exact-byte, limited Steam mission-source reuse audit.

This is not a complete Guide update. It never relabels baseline localization,
changed conditions or live data as belonging to the target game release.
Only owner-private output belongs outside the public checkout.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re

SCHEMA = 'wand.db03.mission-source-bridge@1'
SEARCH_SCHEMA = 'wand.db03.quest-search@1'
PROBE_SCHEMA = 'wand.src01.format-probe@1'
SOURCE = 'ddv_Data/StreamingAssets/itemlist/Mission.json'
OTHER = ('Character.json', 'Condition.json', 'Story.json', 'Scene.json',
         'DutyAch.json', 'RecurringEvent.json', 'ConditionalEvent.json', 'Ftue.json')
HASH = re.compile(r'^[a-f0-9]{64}$')
ID = re.compile(r'^[1-9][0-9]{0,15}$')


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError('DB-03 mission bridge: ' + message)


def sha_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path, max_bytes: int = 16 * 1024 * 1024) -> dict:
    _require(path.is_file() and 0 < path.stat().st_size <= max_bytes,
             f'missing or oversized input: {path.name}')
    with path.open('r', encoding='utf-8-sig') as f:
        value = json.load(f)
    _require(isinstance(value, dict), 'source document must be an object')
    return value


def candidate(probe: dict, name: str) -> dict:
    entry = probe.get('itemlistCandidates', {}).get(name)
    _require(isinstance(entry, dict) and entry.get('status') == 'binary_structure_probe'
             and entry.get('isJsonText') is False
             and entry.get('source') == f'ddv_Data/StreamingAssets/itemlist/{name}'
             and isinstance(entry.get('sha256'), str) and HASH.fullmatch(entry['sha256'])
             and isinstance(entry.get('size'), int) and entry['size'] > 0,
             f'no verified full-file probe for {name}')
    return entry


def build_bridge(index: dict, probe: dict, baseline_mission: Path,
                 probe_sha256: str, baseline_index_sha256: str,
                 baseline_condition: Path | None = None,
                 baseline_other_dir: Path | None = None) -> dict:
    _require(index.get('schema') == SEARCH_SCHEMA, 'unexpected old search schema')
    old = index.get('target') or {}
    current_version, current_platform = probe.get('gameVersion'), probe.get('platform')
    _require(probe.get('schema') == PROBE_SCHEMA and current_platform == old.get('platform')
             and current_platform == 'Steam' and isinstance(current_version, str)
             and bool(current_version) and current_version != old.get('gameVersion'),
             'target probe/version/platform mismatch')
    _require(isinstance(probe_sha256, str) and bool(HASH.fullmatch(probe_sha256))
             and isinstance(baseline_index_sha256, str) and bool(HASH.fullmatch(baseline_index_sha256)),
             'input digest missing')
    source = index.get('source') or {}
    _require(source.get('file') == SOURCE and isinstance(source.get('sha256'), str)
             and bool(HASH.fullmatch(source['sha256'])), 'search index Mission provenance invalid')
    counts = index.get('counts') or {}
    mission_count = counts.get('missions')
    groups = counts.get('excludedQuestGroups')
    other_count = counts.get('excludedUnclassified')
    native_total = counts.get('sourceNativeRecords')
    _require(all(isinstance(n, int) and n >= 0 for n in (mission_count, groups, other_count, native_total))
             and mission_count > 0 and mission_count + groups + other_count == native_total
             and isinstance(index.get('records'), list) and len(index['records']) == mission_count,
             'search mission census incomplete')
    ids = [row.get('id') for row in index['records'] if isinstance(row, dict)]
    _require(len(ids) == mission_count and all(isinstance(x, str) and ID.fullmatch(x) for x in ids)
             and len(set(ids)) == mission_count, 'invalid or duplicate source mission ID')
    old_digest = sha_file(baseline_mission)
    new = candidate(probe, 'Mission.json')
    _require(old_digest == source['sha256'] and baseline_mission.stat().st_size == new['size'],
             'old Mission bytes do not match indexed source / target probe size')
    _require(old_digest == new['sha256'],
             'Mission source changed in target version; cannot reuse old definitions')

    comparison = {}
    for name in OTHER:
        d = candidate(probe, name)
        baseline = (baseline_condition if name == 'Condition.json' else
                    baseline_other_dir / name if baseline_other_dir else None)
        baseline_size = baseline.stat().st_size if baseline and baseline.is_file() else None
        old_other_sha = sha_file(baseline) if baseline_size is not None else None
        comparison[name] = {
            'targetSha256': d['sha256'], 'targetBytes': d['size'],
            'baselineSha256': old_other_sha,
            'sameSourceBytes': old_other_sha == d['sha256'] if old_other_sha is not None else None,
            'baselineSize': baseline_size,
        }
    changed_conditions = comparison['Condition.json']['sameSourceBytes'] is False
    return {
        'schema': SCHEMA,
        'status': 'PARTIAL_MISSION_BYTES_ONLY',
        'baseline': {
            'gameVersion': old['gameVersion'], 'platform': old['platform'],
            'searchIndexSha256': baseline_index_sha256,
            'missionSourceSha256': old_digest,
            'nativeMissionRecords': native_total,
            'searchableMissions': mission_count,
            'questGroupsExcluded': groups,
            'unclassifiedExcluded': other_count,
        },
        'target': {
            'gameVersion': current_version, 'platform': current_platform,
            'sourceProbeSchema': PROBE_SCHEMA,
            'sourceProbeSha256': probe_sha256,
            'missionSourceSha256': new['sha256'],
            'missionSourceBytes': new['size'],
        },
        'evidence': {
            'missionFullFileBytesIdentical': True,
            'missionDefinitionsCanBeReused': True,
            'otherSourceFamilies': comparison,
            'conditionSourceChanged': changed_conditions if comparison['Condition.json']['sameSourceBytes'] is not None else None,
        },
        'limits': {
            'currentLocaleTexts': 'NOT_VERIFIED_DO_NOT_RELABEL',
            'conditionDefinitions': 'CHANGED_NOT_REUSED' if changed_conditions else 'NOT_INDEPENDENTLY_CONFIRMED',
            'prerequisitesAndProgress': 'NOT_VERIFIED',
            'serverEventsAndStarPath': 'NOT_VERIFIED',
            'publicSourceDistribution': 'NOT_AUTHORIZED',
        },
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--baseline-mission', type=Path, required=True)
    ap.add_argument('--baseline-search', type=Path, required=True)
    ap.add_argument('--target-probe', type=Path, required=True)
    ap.add_argument('--baseline-condition', type=Path)
    ap.add_argument('--baseline-other-dir', type=Path)
    ap.add_argument('--out', type=Path, required=True,
                    help='Owner-private report outside repository and source directories')
    args = ap.parse_args(argv)
    _require(args.out.resolve() not in {args.baseline_search.resolve(),args.target_probe.resolve(),
                                        args.baseline_mission.resolve()}, 'cannot overwrite source inputs')
    checkout = Path(__file__).resolve().parents[2]
    if (checkout / 'package.json').is_file():
        _require(not args.out.resolve().is_relative_to(checkout),
                 'owner-private report cannot be written into the public checkout')
    index = read_json(args.baseline_search)
    probe = read_json(args.target_probe)
    report = build_bridge(index, probe, args.baseline_mission,
                          sha_file(args.target_probe), sha_file(args.baseline_search),
                          args.baseline_condition, args.baseline_other_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + '\n').encode('utf-8')
    tmp = args.out.with_name(args.out.name + '.tmp')
    with tmp.open('wb') as f:
        f.write(encoded)
    os.replace(tmp, args.out)
    try:
        os.chmod(args.out, 0o600)
    except OSError:
        pass
    print(json.dumps({'status': report['status'], 'baseline': report['baseline']['gameVersion'],
                      'target': report['target']['gameVersion'],
                      'missionSourceIdentical': report['evidence']['missionFullFileBytesIdentical'],
                      'conditionSourceChanged': report['evidence']['conditionSourceChanged']},
                     sort_keys=True))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
