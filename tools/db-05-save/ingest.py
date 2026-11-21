"""DB-05: ingest SRC-06 redacted witnesses, optionally validate SRC-01 catalog.

No save decoder or Writer. Run only on PRIVATE SRC-06 reports. Generated reports
remain private until they are explicitly reviewed for structural sensitivity.
"""
import argparse
import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path

SCHEMA = 'wand.db05.ingest@1'
PUBLIC_PATHS = frozenset(('/GameInfo', '/GameInfo/Version', '/Player', '/World'))
SAFE_KINDS = frozenset(('object', 'array', 'string', 'number', 'integer', 'boolean', 'null'))
MAP_KEY = re.compile(r'/([0-9]+|\{(?:id|routeId|containerId|itemId|slot|gridId|objectId)\})(?=/|$)')


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def normalized_public_path(path):
    # Numeric map keys (including genuine IDs) never leave this scope.
    return MAP_KEY.sub('/{id}', path)


@lru_cache(maxsize=1)
def legacy_public_paths():
    path = Path(__file__).resolve().parents[2] / 'data' / 'ddv' / 'save' / 'legacy626-fields.v1.json'
    source = load_json(path)
    if source.get('schema') != 'wand.db05.legacy626-fields@1':
        raise ValueError('DB05_LEGACY_FIELD_REGISTRY_REQUIRED')
    known = {normalized_public_path(path): path for path in PUBLIC_PATHS}
    for row in source.get('fields', []):
        if not isinstance(row, dict) or row.get('writable') is not False or not isinstance(row.get('path'), str):
            raise ValueError('INVALID_DB05_PUBLIC_FIELD')
        key = normalized_public_path(row['path'])
        if key in known and known[key] != row['path']:
            raise ValueError('DB05_PUBLIC_FIELD_ALIAS_COLLISION')
        known[key] = row['path']
    common_path = Path(__file__).resolve().parents[2] / 'data' / 'ddv' / 'save' / 'common626643-fields.v1.json'
    common = load_json(common_path)
    if common.get('schema') != 'wand.db05.common626643-field-witnesses@1':
        raise ValueError('DB05_COMMON_FIELD_REGISTRY_REQUIRED')
    for row in common.get('fields', []):
        if not isinstance(row, dict) or row.get('writable') is not False or not isinstance(row.get('path'), str):
            raise ValueError('INVALID_DB05_COMMON_PUBLIC_FIELD')
        key = normalized_public_path(row['path'])
        if key in known:
            raise ValueError('DB05_COMMON_PUBLIC_FIELD_COLLISION')
        known[key] = row['path']
    native_path = Path(__file__).resolve().parents[2] / 'data' / 'ddv' / 'save' / 'native1261-observed-fields.v1.json'
    native = load_json(native_path)
    if native.get('schema') != 'wand.db05.native1261-observed-field-witnesses@1':
        raise ValueError('DB05_NATIVE_FIELD_REGISTRY_REQUIRED')
    for row in native.get('fields', []):
        if not isinstance(row, dict) or row.get('writerAuthorized') is not False or not isinstance(row.get('path'), str):
            raise ValueError('INVALID_DB05_NATIVE_PUBLIC_FIELD')
        key = normalized_public_path(row['path'])
        if key in known:
            raise ValueError('DB05_NATIVE_PUBLIC_FIELD_COLLISION')
        known[key] = row['path']
    nested_path = Path(__file__).resolve().parents[2] / 'data' / 'ddv' / 'save' / 'native1261-nested-fields.v1.json'
    nested = load_json(nested_path)
    if nested.get('schema') != 'wand.db05.native1261-nested-field-witnesses@1':
        raise ValueError('DB05_NESTED_FIELD_REGISTRY_REQUIRED')
    for row in nested.get('fields', []):
        if not isinstance(row, dict) or row.get('writable') is not False or not isinstance(row.get('path'), str):
            raise ValueError('INVALID_DB05_NESTED_PUBLIC_FIELD')
        key = normalized_public_path(row['path'])
        if key in known:
            raise ValueError('DB05_NESTED_PUBLIC_FIELD_COLLISION')
        known[key] = row['path']
    deep_path = Path(__file__).resolve().parents[2] / 'data' / 'ddv' / 'save' / 'native1261-deep-fields.v1.json'
    deep = load_json(deep_path)
    if deep.get('schema') != 'wand.db05.native1261-deep-field-witnesses@1':
        raise ValueError('DB05_DEEP_FIELD_REGISTRY_REQUIRED')
    for row in deep.get('fields', []):
        if not isinstance(row, dict) or row.get('writable') is not False or not isinstance(row.get('path'), str):
            raise ValueError('INVALID_DB05_DEEP_PUBLIC_FIELD')
        key = normalized_public_path(row['path'])
        if key in known:
            raise ValueError('DB05_DEEP_PUBLIC_FIELD_COLLISION')
        known[key] = row['path']
    return known


def inspect_report(report):
    if not isinstance(report, dict) or not isinstance(report.get('fieldWitnesses'), list):
        raise ValueError('SRC06_REPORT_SHAPE_INVALID')
    if report.get('status') == 'unknown_or_encoded_container':
        raise ValueError('ENCODED_SAVE_HAS_NO_FIELD_WITNESS')
    witnesses = {}
    allowlisted = legacy_public_paths()
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
        canonical = allowlisted.get(normalized_public_path(path))
        if canonical is not None:
            if canonical in witnesses and witnesses[canonical] != kind:
                raise ValueError('CONFLICTING_PUBLIC_WITNESS')
            witnesses[canonical] = kind
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
            'historicalKnownFieldScope': 'legacy626_common626643_native1261_nested_and_deep_readonly_candidates_not_codec_proof',
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
            'undisclosedWitnessCountDelta': b['otherWitnessCount'] - a['otherWitnessCount'],
            'note': 'Only publicly sourced legacy field names are retained. Scanner omissions and profile contents can change counts; not a native save-schema change claim.'}


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
