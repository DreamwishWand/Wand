"""DB-05: ingest SRC-06 redacted witnesses, optionally validate SRC-01 catalog.

No save decoder or Writer. Run only on PRIVATE SRC-06 reports. Generated reports
remain private until they are explicitly reviewed for structural sensitivity.
"""
import argparse
import hashlib
import json
from pathlib import Path

SCHEMA = 'wand.db05.ingest@1'
PUBLIC_PATHS = frozenset(('/GameInfo', '/GameInfo/Version', '/Player', '/World'))
SAFE_KINDS = frozenset(('object', 'array', 'string', 'number', 'integer', 'boolean', 'null'))


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def inspect_report(report):
    if not isinstance(report, dict) or not isinstance(report.get('fieldWitnesses'), list):
        raise ValueError('SRC06_REPORT_SHAPE_INVALID')
    if report.get('status') == 'unknown_or_encoded_container':
        raise ValueError('ENCODED_SAVE_HAS_NO_FIELD_WITNESS')
    witnesses = {}
    undisclosed = 0
    for row in report['fieldWitnesses']:
        if not isinstance(row, dict) or not isinstance(row.get('path'), str):
            raise ValueError('INVALID_SRC06_FIELD_WITNESS')
        path = row['path']
        kind = row.get('type', row.get('types', row.get('kinds')))
        if isinstance(kind, list):
            kind = ','.join(sorted(set(x for x in kind if isinstance(x, str) and x in SAFE_KINDS)))
        if not isinstance(kind, str) or not kind or any(x not in SAFE_KINDS for x in kind.split(',')):
            kind = 'unverified'
        if path in PUBLIC_PATHS:
            if path in witnesses and witnesses[path] != kind:
                raise ValueError('CONFLICTING_PUBLIC_WITNESS')
            witnesses[path] = kind
        else:
            undisclosed += 1
    version = report.get('schemaObserved')
    if isinstance(version, bool) or not isinstance(version, int) or version < 0:
        version = None
    return {'schemaObserved': version,
            'rootRequiredFieldsPresent': report.get('rootRequiredFieldsPresent') is True,
            'rootRequiredObjectsObserved': report.get('rootRequiredObjectsObserved') is True,
            'publicWitnesses': [{'path': p, 'type': k} for p, k in sorted(witnesses.items())],
            'otherWitnessCount': undisclosed,
            'decoderAndBuildVerified': False,
            'writerAuthorized': False}


def diff(a, b):
    left = {row['path']: row['type'] for row in a['publicWitnesses']}
    right = {row['path']: row['type'] for row in b['publicWitnesses']}
    return {'schema': 'wand.db05.observed-diff@1',
            'added': sorted(set(right) - set(left)),
            'removed': sorted(set(left) - set(right)),
            'typeChanged': sorted(p for p in set(left) & set(right) if left[p] != right[p]),
            'authoritative': False,
            'note': 'Only four allowlisted legacy root-level paths. Other fields intentionally redacted.'}


def inspect_items(items_path, manifest_path):
    manifest = load_json(manifest_path)
    if manifest.get('schema') != 'wand.src01.steam-native@1' or manifest.get('gameVersion') != '1.26.2':
        raise ValueError('UNSUPPORTED_SRC01_MANIFEST')
    digest = hashlib.sha256(items_path.read_bytes()).hexdigest()
    if digest != manifest.get('itemsSha256'):
        raise ValueError('SRC01_ITEMS_HASH_MISMATCH')
    seen = set()
    with items_path.open('r', encoding='utf-8') as stream:
        for line in stream:
            if not line.strip():
                raise ValueError('EMPTY_SRC01_CATALOG_ROW')
            row = json.loads(line)
            item_id = row.get('itemId')
            if type(item_id) is not int or not 0 < item_id < 2**53 or item_id in seen:
                raise ValueError('INVALID_OR_DUPLICATE_SRC01_ITEM_ID')
            seen.add(item_id)
    if len(seen) != manifest.get('itemCount'):
        raise ValueError('SRC01_ITEM_COUNT_MISMATCH')
    return {'sourceSchema': 'wand.src01.steam-native@1',
            'gameVersion': '1.26.2', 'catalogSize': len(seen),
            'catalogSha256': digest, 'saveReferencesJoined': 0,
            'saveReferencePathsVerified': False}


def run(structure, out, previous=None, items=None, manifest=None):
    structure = Path(structure).resolve(strict=True)
    out = Path(out).resolve()
    inputs = [structure]
    if previous: inputs.append(Path(previous).resolve(strict=True))
    if items: inputs.append(Path(items).resolve(strict=True))
    if manifest: inputs.append(Path(manifest).resolve(strict=True))
    if any((parent / '.git').exists() for parent in (out, *out.parents)):
        raise ValueError('OUTPUT_INSIDE_GIT_REPOSITORY')
    if out.exists() or any(out == p or p in out.parents or out in p.parents for p in inputs):
        raise ValueError('OUTPUT_MUST_BE_NEW_AND_DISJOINT')
    if (items is None) != (manifest is None):
        raise ValueError('SRC01_ITEMS_AND_MANIFEST_REQUIRED_TOGETHER')
    current = inspect_report(load_json(structure))
    previous_report = inspect_report(load_json(Path(previous))) if previous else None
    catalog = inspect_items(Path(items), Path(manifest)) if items else None
    payload = {'schema': SCHEMA, 'current': current, 'previousComparison':
               diff(previous_report, current) if previous_report else None,
               'itemCatalog': catalog,
               'unresolved': ['decoded_save_codec_contract', 'build_identity_provenance',
                              'deep_domain_fields', 'save_to_game_id_reference_paths',
                              'quest_and_world_id_catalog_join', 'unknown_field_roundtrip'],
               'safeForPublicRepository': False, 'writerAuthorized': False}
    out.mkdir(parents=True, exist_ok=False)
    (out / 'db05-private-summary.json').write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--structure', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--previous', type=Path)
    parser.add_argument('--items', type=Path)
    parser.add_argument('--items-manifest', type=Path)
    args = parser.parse_args(argv)
    run(args.structure, args.out, args.previous, args.items, args.items_manifest)


if __name__ == '__main__':
    main()
