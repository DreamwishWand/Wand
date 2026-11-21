"""SRC-04: inspect exact Unity container pointers for unresolved icon GUIDs.

Offline metadata-only. Does not decode images, alter game data, publish assets,
or infer an image from an AssetBundle's co-location or file-name similarity.
The caller must supply an immutable SHA-pinned source plan. A plan can be embedded
by the single-file Windows launcher without installing or checking out git.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import sys
import traceback
from pathlib import Path

SCHEMA = 'wand.src04.missing-object-probe@1'
PLAN_SCHEMA = 'wand.src04.missing-object-plan@1'
GUID = re.compile(r'^[0-9a-f]{32}$')
GUID_TOKEN = re.compile(r'(?<![A-Za-z0-9])(?:guid:)?([0-9a-f]{32})(?![A-Za-z0-9])', re.I)
SHA = re.compile(r'^[0-9a-f]{64}$')
CATALOG_HASHES = {
    'catalog.InternalIds.bin': '09d7a580c211d1a3606488403ea6431fdae3c63aa281152ccf3bccab7402b4c6',
    'catalog.bucketData.bin': 'bcfdf91e4206bc09ea7a013a298f4f2432b9f84905deebc753776e800b07bc9e',
    'catalog.entryData.bin': 'fc4a579b494b4e80c0ebfba5ca0d8d2d4abca10c34f3555b9ad84146b6aba866',
    'catalog.keyData.bin': '20be86edc02effe8f236e722ac0125459790de5415e9ba2f1456e3c85b5f6176',
}
EMBEDDED_PLAN = None


def require(condition, reason):
    if not condition:
        raise ValueError('SRC04_MISSING_OBJECT_' + reason)


def sha_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    tmp.replace(path)


def safe_relpath(value):
    require(isinstance(value, str) and value.startswith('ddv_Data/StreamingAssets/aa/win/'), 'SOURCE_PATH_PREFIX')
    require('\\' not in value and ':' not in value and '\x00' not in value, 'SOURCE_PATH_UNSAFE')
    parts = value.split('/')
    require(all(part and part not in ('.', '..') for part in parts), 'SOURCE_PATH_TRAVERSAL')
    require(value.endswith('.bundle'), 'NOT_BUNDLE')
    return Path(*parts)


def validate_plan(plan, missing):
    require(isinstance(plan, dict) and plan.get('schema') == PLAN_SCHEMA, 'PLAN_SCHEMA')
    require(plan.get('publicationApproved') is False, 'NOT_PRIVATE')
    require(plan.get('sourceItemsSha256') == missing['sourceItemsSha256'], 'SOURCE_PIN')
    require(isinstance(plan.get('missingReportSha256'), str) and SHA.fullmatch(plan['missingReportSha256']), 'REPORT_PIN')
    require(missing.get('schema') == 'wand.src04.missing-locations@1' and
            missing.get('publicationApproved') is False and missing.get('complete') is True and
            missing.get('unresolvedGuidCount') == 360 and missing.get('unresolvedItemCount') == 2416 and
            missing.get('catalogLocatedGuidCount') == 360 and
            missing.get('verifiedGuidCount') == 9182, 'EXPECTED_MISSING_REPORT')
    missing_by_guid = {v['iconGuid'][5:]: v for v in missing['guids']}
    require(len(missing_by_guid) == 360 and all(GUID.fullmatch(guid) for guid in missing_by_guid), 'INVALID_MISSING_GUIDS')
    rows = plan.get('bundles')
    require(isinstance(rows, list) and 0 < len(rows) <= 250, 'PLAN_BUNDLE_COUNT')
    bundle_guids = set()
    paths = set()
    for row in rows:
        require(isinstance(row, dict), 'BAD_PLAN_BUNDLE')
        rel = safe_relpath(row.get('path'))
        require(str(rel) not in paths, 'DUPLICATE_PLAN_PATH')
        paths.add(str(rel))
        require(isinstance(row.get('sha256'), str) and SHA.fullmatch(row['sha256']) and
                isinstance(row.get('size'), int) and row['size'] > 0, 'BAD_PLAN_SOURCE_PIN')
        allowed = row.get('guids')
        require(isinstance(allowed, list) and 1 <= len(allowed) <= 360 and
                allowed == sorted(set(allowed)) and
                all(isinstance(g, str) and GUID.fullmatch(g) and g in missing_by_guid for g in allowed), 'PLAN_GUIDS')
        for guid in allowed:
            require(rel.name.lower() in missing_by_guid[guid]['bundleFilenames'], 'UNRELATED_BUNDLE_IN_PLAN')
        bundle_guids.update(allowed)
    omitted = plan.get('skippedBroadGuids')
    require(isinstance(omitted, list) and omitted == sorted(set(omitted)) and
            all(isinstance(g, str) and GUID.fullmatch(g) and g in missing_by_guid for g in omitted), 'SKIPPED_GUIDS')
    require(bundle_guids.isdisjoint(omitted) and bundle_guids | set(omitted) == set(missing_by_guid), 'UNCOVERED_GUIDS')
    return missing_by_guid


def normalize_container(value, source):
    if value is None:
        return
    iterator = value.items() if isinstance(value, dict) else iter(value)
    for entry in iterator:
        if isinstance(entry, (tuple, list)) and len(entry) == 2:
            key, pointer = entry
        else:
            key, pointer = getattr(entry, 'first', None), getattr(entry, 'second', None)
        if key is None:
            continue
        if isinstance(pointer, dict):
            pointer = pointer.get('asset', pointer)
        elif hasattr(pointer, 'asset'):
            pointer = pointer.asset
        yield str(key), pointer, source


def pointer_field(ptr, keys):
    if ptr is None:
        return None
    for field in keys:
        value = ptr.get(field) if isinstance(ptr, dict) else getattr(ptr, field, None)
        if value is not None:
            try:
                return int(value)
            except (ValueError, TypeError):
                return None
    return None


def exact_guid_tokens(key, allowed):
    return {m.lower() for m in GUID_TOKEN.findall(key) if m.lower() in allowed}


def ptr_metadata(ptr, object_by_id):
    pid = pointer_field(ptr, ('path_id', 'm_PathID', 'pathId'))
    fid = pointer_field(ptr, ('file_id', 'm_FileID', 'fileId'))
    if pid is None or pid == 0:
        return {'pathId': None, 'fileId': fid, 'objectTypes': [], 'resolution': 'null_pointer'}
    if fid not in (None, 0):
        return {'pathId': str(pid), 'fileId': fid, 'objectTypes': [], 'resolution': 'external_file_pointer'}
    objects = object_by_id.get(pid, [])
    types = sorted(set(obj.type.name for obj in objects))
    status = ('local_unique_object' if len(objects) == 1 else
              'local_missing_object' if not objects else 'ambiguous_local_path_id')
    return {'pathId': str(pid), 'fileId': fid, 'objectTypes': types, 'resolution': status}


def inspect_bundle(path, wanted):
    import UnityPy
    env = UnityPy.load(str(path))
    objects = list(env.objects.values() if isinstance(env.objects, dict) else env.objects)
    counts = collections.Counter(obj.type.name for obj in objects)
    by_id = collections.defaultdict(list)
    for obj in objects:
        by_id[int(obj.path_id)].append(obj)
    pairs = []
    warnings = []
    try:
        pairs += list(normalize_container(getattr(env, 'container', None), 'environment'))
    except Exception as exc:
        warnings.append('environment_container: ' + type(exc).__name__ + ': ' + str(exc)[:180])
    ab_keys = 0
    for obj in objects:
        if obj.type.name != 'AssetBundle':
            continue
        try:
            ab = obj.read()
            pairs2 = list(normalize_container(getattr(ab, 'm_Container', None), 'assetbundle'))
            ab_keys += len(pairs2)
            pairs += pairs2
        except Exception as exc:
            warnings.append('assetbundle_container: ' + type(exc).__name__ + ': ' + str(exc)[:180])
    by_guid = collections.defaultdict(dict)
    for key, ptr, source in pairs:
        matches = exact_guid_tokens(key, wanted)
        if not matches:
            continue
        meta = ptr_metadata(ptr, by_id)
        record = {'key': key[:240], 'source': source, **meta}
        identity = (record['source'], record['key'], record['pathId'], record['fileId'])
        for guid in matches:
            by_guid[guid][identity] = record
    hits = {guid: list(records.values()) for guid, records in sorted(by_guid.items())}
    return {'sourceObjectCounts': dict(sorted(counts.items())),
            'serializedObjectCount': len(objects),
            'containerEntryCount': len(pairs), 'assetBundleContainerEntryCount': ab_keys,
            'matchedGuidCount': len(hits),
            'exactGuidReferences': hits, 'warnings': warnings}


def classify(guid_rows, status):
    if status == 'skipped':
        return 'broad_dependency_scope_unscanned'
    rows = [r for r in guid_rows if r['resolution'] == 'local_unique_object']
    types = {t for row in rows for t in row['objectTypes']}
    if 'Sprite' in types or 'Texture2D' in types:
        return 'direct_image_object_candidate_no_pixels'
    if types.intersection({'Material', 'GameObject', 'Mesh', 'MonoBehaviour', 'Shader'}):
        return 'material_or_scene_object_candidate'
    if rows:
        return 'other_serialized_object_candidate'
    if guid_rows:
        return 'exact_key_unresolved_pointer'
    return 'no_exact_container_pointer'


def log(out, message):
    line = str(message)
    print(line, flush=True)
    file = out / 'catalog-missing-object-console.log'
    with file.open('a', encoding='utf-8') as stream:
        stream.write(line + '\n')


def probe(game, out, plan):
    game, out = Path(game).resolve(), Path(out).resolve()
    report_file = out / 'catalog-missing-report.json'
    missing_raw = report_file.read_bytes()
    missing = json.loads(missing_raw)
    missing_index = validate_plan(plan, missing)
    require(hashlib.sha256(missing_raw).hexdigest() == plan['missingReportSha256'], 'REPORT_HASH_CHANGED')
    sha = sha_file(out / 'source-items' / 'items.jsonl')
    require(sha == missing['sourceItemsSha256'], 'SRC01_HASH_CHANGED')
    catalog_dir = game / 'ddv_Data' / 'StreamingAssets' / 'aa'
    for filename, expected in CATALOG_HASHES.items():
        require(sha_file(catalog_dir / filename) == expected, 'CATALOG_HASH_' + filename)
    target_dir = out / 'missing-object-bundles'
    target_dir.mkdir(exist_ok=True)
    run = {'schema': SCHEMA, 'publicationApproved': False,
           'sourceItemsSha256': sha, 'sourceMissingReportSha256': plan['missingReportSha256'],
           'bundleTargetCount': len(plan['bundles']), 'inputGuidCount': 360,
           'skippedBroadGuids': ['guid:' + guid for guid in plan['skippedBroadGuids']],
           'imageDecodingPerformed': False, 'sourceFilesModified': False,
           'bundles': {}, 'guids': [], 'complete': False}
    log(out, 'SRC-04: inspecting exactly pinned Unity object metadata (no image decoding).')
    for index, row in enumerate(plan['bundles'], 1):
        rel = safe_relpath(row['path'])
        name = rel.name
        checkpoint = target_dir / (name + '.json')
        try:
            if checkpoint.exists():
                old = read_json(checkpoint)
                if (old.get('sourceSha256') == row['sha256'] and
                        old.get('sourcePath') == row['path'] and
                        old.get('expectedGuids') == row['guids'] and
                        old.get('success') is True):
                    run['bundles'][name] = old
                    log(out, '[%d/%d] %s: reused checkpoint, %d exact GUIDs' % (
                        index, len(plan['bundles']), name, old['matchedGuidCount']))
                    continue
            source = game / rel
            require(source.is_file() and not source.is_symlink(), 'SOURCE_BUNDLE_MISSING_' + name)
            require(source.stat().st_size == row['size'], 'SOURCE_BUNDLE_SIZE_' + name)
            require(sha_file(source) == row['sha256'], 'SOURCE_BUNDLE_HASH_' + name)
            inspected = inspect_bundle(source, set(row['guids']))
            checkpoint_row = {'sourcePath': row['path'], 'sourceSha256': row['sha256'],
                              'expectedGuids': row['guids'], 'success': True, **inspected}
            save_json(checkpoint, checkpoint_row)
            run['bundles'][name] = checkpoint_row
            log(out, '[%d/%d] %s: %d exact GUIDs, types %s' % (
                index, len(plan['bundles']), name, inspected['matchedGuidCount'],
                ','.join(sorted(inspected['sourceObjectCounts']))[:85]))
        except Exception as exc:
            error_row = {'sourcePath': row['path'], 'sourceSha256': row['sha256'],
                         'expectedGuids': row['guids'], 'success': False,
                         'error': type(exc).__name__ + ': ' + str(exc)[:240],
                         'matchedGuidCount': 0, 'exactGuidReferences': {}}
            run['bundles'][name] = error_row
            log(out, '[%d/%d] %s: ERROR %s' % (index, len(plan['bundles']), name, error_row['error']))
        # Checkpoint is durable before the aggregate report on each iteration.
        run['processedBundleCount'] = len(run['bundles'])
        run['failedBundleCount'] = sum(not x['success'] for x in run['bundles'].values())
        save_json(out / 'catalog-missing-object-report.json', run)
    ref_by_guid = collections.defaultdict(list)
    for name, bundle in run['bundles'].items():
        for guid, refs in bundle['exactGuidReferences'].items():
            for ref in refs:
                ref_by_guid[guid].append({'bundle': name, **ref})
    for guid, row in sorted(missing_index.items()):
        status = 'skipped' if guid in plan['skippedBroadGuids'] else 'inspected'
        if any(not bundle['success'] and guid in bundle['expectedGuids']
               for bundle in run['bundles'].values()):
            status = 'failed'
        references = ref_by_guid[guid]
        classification = 'inspection_failed' if status == 'failed' else classify(references, status)
        run['guids'].append({'iconGuid': 'guid:' + guid, 'itemCount': row['itemCount'],
                             'categories': row['categories'],
                             'class': classification,
                             'exactContainerReferences': references[:24],
                             'referenceCount': len(references),
                             'skippedBroadDependencies': status == 'skipped'})
    counts = collections.Counter(row['class'] for row in run['guids'])
    run['classCounts'] = dict(sorted(counts.items()))
    run['processedBundleCount'] = len(run['bundles'])
    run['failedBundleCount'] = sum(not x['success'] for x in run['bundles'].values())
    run['exactContainerMatchedGuids'] = sum(row['referenceCount'] > 0 for row in run['guids'])
    run['complete'] = run['processedBundleCount'] == run['bundleTargetCount'] and run['failedBundleCount'] == 0
    save_json(out / 'catalog-missing-object-report.json', run)
    log(out, 'SRC-04: metadata scan complete. %d/%d bundles, %d exact GUID keys, %d errors.' % (
        run['processedBundleCount'], run['bundleTargetCount'],
        run['exactContainerMatchedGuids'], run['failedBundleCount']))
    log(out, 'Upload catalog-missing-object-report.json; no images or bundles are needed.')
    return run


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--game', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--plan', type=Path, help='private pinned plan JSON; omitted in standalone launcher')
    options = p.parse_args()
    plan = read_json(options.plan) if options.plan else EMBEDDED_PLAN
    require(plan is not None, 'PLAN_REQUIRED')
    try:
        result = probe(options.game, options.out, plan)
        return 0 if result['complete'] else 1
    except Exception:
        msg = traceback.format_exc()
        print(msg, file=sys.stderr, flush=True)
        if options.out.is_dir():
            with (options.out / 'catalog-missing-object-console.log').open('a', encoding='utf-8') as stream:
                stream.write(msg + '\n')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())