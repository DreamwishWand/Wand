"""SRC-04: decode ONLY the 358 already-resolved Unity image objects.

Read-only with respect to game files and prior 40 icon-bundle checkpoints.
Exact GUID, SHA-pinned bundle and local Unity path_id are required. Keeps all
outputs local/private; does not upload, publish, or guess missing GUIDs.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import io
import json
import re
import sys
import traceback
from pathlib import Path

SCHEMA = 'wand.src04.missing-pixels@1'
MAP_SCHEMA = 'wand.src04.missing-pixel-links@1'
IDENTITY_EVIDENCE = 'exact_catalog_key_and_serialized_bundle_path_id'
REPORT_SHA256 = 'b97deb80a60315e2734fa7193f92922626a16195453b8c180fa0743684ae7807'
SOURCE_ITEMS_SHA256 = '3ff0043692c88699d1cb44f4a953095c5f5fcd1afd700761396f13cca96851bf'
OLD_IDENTITY_SHA256 = '401d3b0fd1c24ddad255b0948889ffceeb344e14fb16ca13c3952ee6a69a1172'
SHA = re.compile(r'^[0-9a-f]{64}$')
GUID = re.compile(r'^[0-9a-f]{32}$')
GAME_DEFAULT = Path(r'C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley')
OUT_DEFAULT = Path.home() / 'Documents' / 'DreamwishWand' / 'SRC-04 MEDIA' / 'Steam-v1.26.2'


def need(ok, what):
    if not ok:
        raise ValueError('SRC04_MISSING_PIXELS_' + what)


def sha_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''):
            h.update(b)
    return h.hexdigest()


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def safe_source(game, source):
    need(isinstance(source, str) and source.startswith('ddv_Data/StreamingAssets/aa/win/') and source.endswith('.bundle'), 'SOURCE_RELATIVE_PATH')
    need(not any(c in source for c in ('\\', ':', '\0')) and all(p not in ('', '.', '..') for p in source.split('/')), 'SOURCE_UNSAFE')
    path = game.joinpath(*source.split('/'))
    need(path.is_file() and not path.is_symlink(), 'SOURCE_MISSING_' + path.name)
    need(path.resolve().is_relative_to(game.resolve()), 'SOURCE_OUTSIDE_GAME')
    return path


def source_items(out):
    f = out / 'source-items' / 'items.jsonl'
    need(f.is_file() and sha_file(f) == SOURCE_ITEMS_SHA256, 'SRC01_SHA_CHANGED')
    rows = [json.loads(line) for line in f.read_bytes().splitlines() if line]
    need(len(rows) == 13202 and len({v['itemId'] for v in rows}) == len(rows), 'SRC01_ITEMS_CHANGED')
    guids = collections.defaultdict(list)
    for row in rows:
        g = row['iconGuid']
        need(isinstance(g, str) and g.startswith('guid:') and GUID.fullmatch(g[5:]), 'SRC01_BAD_GUID')
        guids[g[5:]].append(int(row['itemId']))
    need(len(guids) == 9542, 'SRC01_GUIDS_CHANGED')
    return guids, rows


def plan_from_report(raw, item_guids):
    need(hashlib.sha256(raw).hexdigest() == REPORT_SHA256, 'METADATA_REPORT_SHA_CHANGED')
    doc = json.loads(raw)
    need(doc.get('schema') == 'wand.src04.missing-object-probe@1' and
         doc.get('publicationApproved') is False and doc.get('sourceFilesModified') is False and
         doc.get('imageDecodingPerformed') is False and doc.get('complete') is True and
         doc.get('sourceItemsSha256') == SOURCE_ITEMS_SHA256 and
         doc.get('bundleTargetCount') == doc.get('processedBundleCount') == 220 and
         doc.get('failedBundleCount') == 0 and doc.get('inputGuidCount') == 360 and
         doc.get('exactContainerMatchedGuids') == 358 and
         doc.get('classCounts') == {'direct_image_object_candidate_no_pixels': 358,
                                    'broad_dependency_scope_unscanned': 2}, 'METADATA_INCOMPLETE')
    bundles = doc.get('bundles')
    need(isinstance(bundles, dict) and len(bundles) == 220, 'BUNDLE_REPORT_COUNT')
    for name, bundle in bundles.items():
        need(bundle.get('success') is True and not bundle.get('warnings') and
             bundle.get('sourcePath', '').endswith('/' + name) and
             SHA.fullmatch(bundle.get('sourceSha256', '')), 'BAD_BUNDLE_' + name)
    selected = collections.defaultdict(dict)
    skipped = []
    all_guid = set()
    for row in doc.get('guids', []):
        g = row.get('iconGuid', '')
        need(isinstance(g, str) and g.startswith('guid:') and GUID.fullmatch(g[5:]) and
             g[5:] in item_guids and g not in all_guid, 'INVALID_GUID_ROW')
        all_guid.add(g)
        need(len(item_guids[g[5:]]) == row.get('itemCount'), 'SRC01_ITEM_FANOUT_MISMATCH')
        refs = row.get('exactContainerReferences')
        if row.get('class') == 'broad_dependency_scope_unscanned':
            need(refs == [] and row.get('referenceCount') == 0, 'BROAD_WITH_REFS')
            skipped.append(g)
            continue
        need(row.get('class') == 'direct_image_object_candidate_no_pixels' and
             isinstance(refs, list) and 1 <= len(refs) <= 2 and len(refs) == row.get('referenceCount'), 'BAD_IMAGE_REFS')
        classes = set()
        bundle_names = set()
        for ref in refs:
            name = ref.get('bundle')
            klass = ref.get('objectTypes')
            need(name in bundles and ref.get('key') == g[5:] and
                 ref.get('resolution') == 'local_unique_object' and
                 ref.get('fileId') in (None, 0) and
                 isinstance(klass, list) and len(klass) == 1 and
                 klass[0] in ('Sprite', 'Texture2D') and klass[0] not in classes, 'BAD_EXACT_REF')
            pid = ref.get('pathId')
            need(isinstance(pid, str) and re.fullmatch(r'-?[0-9]{1,20}', pid) and int(pid) != 0, 'BAD_EXACT_PATHID')
            classes.add(klass[0]); bundle_names.add(name)
        need(len(bundle_names) == 1, 'CROSS_BUNDLE_SAME_GUID')
        chosen = next((v for v in refs if v['objectTypes'] == ['Sprite']), None) or refs[0]
        selected[next(iter(bundle_names))][g[5:]] = {
            'selected': {'pathId': chosen['pathId'], 'type': chosen['objectTypes'][0]},
            'counterpart': next(({'pathId': v['pathId'], 'type': v['objectTypes'][0]}
                                  for v in refs if v is not chosen), None)}
    need(len(all_guid) == 360 and len(skipped) == 2 and
         sum(len(x) for x in selected.values()) == 358 and
         sorted(skipped) == sorted(doc['skippedBroadGuids']), 'GUID_COMPLETENESS')
    return doc, dict(selected), sorted(skipped)


def variant(image, kind, limit, out, key):
    from PIL import Image
    dest = out / 'images' / kind / key[:2] / (key + '.webp')
    if not dest.exists():
        im = image.copy()
        im.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = dest.with_name(dest.name + '.tmp')
        try:
            im.save(temp, format='WEBP', quality=90, method=6)
            temp.replace(dest)
        finally:
            if temp.exists(): temp.unlink()
    # Verify existing or just-written WebP decodes, without altering existing data.
    with Image.open(dest) as check:
        check.load()
        need(check.format == 'WEBP' and 0 < check.width <= limit and 0 < check.height <= limit,
             'EXISTING_VARIANT_INVALID')
        width, height = check.size
    return {'path': dest.relative_to(out).as_posix(), 'sha256': sha_file(dest),
            'bytes': dest.stat().st_size, 'width': width, 'height': height}


def image_record(obj, sha, out, source, cp_object):
    data = obj.read()
    image = data.image
    need(image is not None, 'IMAGE_PIXELS_UNAVAILABLE')
    image.load()
    # Preserve native decoded pixels (PNG) as stable content identity.
    png = io.BytesIO()
    image.save(png, format='PNG')
    pixel_sha = hashlib.sha256(png.getvalue()).hexdigest()
    cls = obj.type.name
    asset_file = str(getattr(getattr(obj, 'assets_file', None), 'name', ''))
    need(bool(asset_file), 'UNITY_ASSETS_FILE_MISSING')
    pid = str(int(obj.path_id))
    asset_id = f'unity:{sha}:{asset_file}:{pid}:{cls}'
    counterpart_id = None
    if cp_object is not None:
        other_file = str(getattr(getattr(cp_object, 'assets_file', None), 'name', ''))
        need(bool(other_file), 'COUNTERPART_ASSETS_FILE_MISSING')
        counterpart_id = (f'unity:{sha}:{other_file}:{int(cp_object.path_id)}:'
                          f'{cp_object.type.name}')
    return {'assetId': asset_id, 'assetClass': cls, 'assetName': str(getattr(data, 'm_Name', ''))[:150],
            'counterpartAssetId': counterpart_id,
            'pointerObjectCount': 2 if cp_object else 1,
            'decodedSha256': pixel_sha, 'sourceWidth': image.width, 'sourceHeight': image.height,
            'identityEvidence': IDENTITY_EVIDENCE, 'sourceBundle': source,
            'sourceSha256': sha, 'unityPathId': pid, 'unityAssetsFile': asset_file,
            'variants': {'thumbnail': variant(image, 'thumbnail', 128, out, pixel_sha),
                         'detail': variant(image, 'detail', 512, out, pixel_sha)},
            'publicationApproved': False}


def checkpoint_valid(doc, expected, out, source_sha):
    if (not isinstance(doc, dict) or doc.get('schema') != MAP_SCHEMA or
            doc.get('sourceSha256') != source_sha or
            set(doc.get('guids', {})) != set(expected) or not doc.get('complete')):
        return False
    for guid, image in doc['guids'].items():
        if image.get('identityEvidence') != IDENTITY_EVIDENCE:
            return False
        chosen = expected[guid]['selected']
        if image.get('assetClass') != chosen['type'] or image.get('unityPathId') != chosen['pathId']:
            return False
        for kind in ('thumbnail', 'detail'):
            var = image.get('variants', {}).get(kind, {})
            p = var.get('path', '')
            if (not re.fullmatch(r'images/' + kind + r'/[0-9a-f]{2}/[0-9a-f]{64}\.webp', p) or
                    not (out / p).is_file() or sha_file(out / p) != var.get('sha256')):
                return False
    return True


def extract_bundle(source, source_sha, expected, out, source_rel=None):
    import UnityPy
    need(sha_file(source) == source_sha, 'SOURCE_SHA_MISMATCH_' + source.name)
    env = UnityPy.load(str(source))
    objects = list(env.objects.values() if isinstance(env.objects, dict) else env.objects)
    by_pid = collections.defaultdict(list)
    for obj in objects:
        by_pid[str(int(obj.path_id))].append(obj)
    images = {}
    for g, spec in sorted(expected.items()):
        pid, cls = spec['selected']['pathId'], spec['selected']['type']
        matched = [obj for obj in by_pid.get(pid, []) if obj.type.name == cls]
        need(len(matched) == 1 and len(by_pid.get(pid, [])) == 1, 'PATHID_NOT_UNIQUE_' + g)
        cp = spec['counterpart']
        cp_obj = None
        if cp:
            verified_other = [obj for obj in by_pid.get(cp['pathId'], []) if obj.type.name == cp['type']]
            need(len(verified_other) == 1 and len(by_pid.get(cp['pathId'], [])) == 1, 'COUNTERPART_MISSING_' + g)
            cp_obj = verified_other[0]
        images[g] = image_record(matched[0], source_sha, out, source_rel or source.name, cp_obj)
    return images


def extended_item_map(out, rows, added, item_guids):
    """Merge verified private GUID identities into a new 13,202-item JSONL.

    Does not modify the old catalog-identity-links-private.json or old overlay.
    """
    old_file = out / 'catalog-identity-links-private.json'
    need(old_file.is_file() and sha_file(old_file) == OLD_IDENTITY_SHA256, 'OLD_IDENTITY_MAP_SHA_CHANGED')
    old = json.loads(old_file.read_bytes())
    mapping = old.get('guidToImage')
    need(old.get('schema') == 'wand.src04.identity-links@2' and
         old.get('publicationApproved') is False and isinstance(mapping, dict) and
         len(mapping) == old.get('verifiedGuidCount') == 9182, 'OLD_IDENTITY_INVALID')
    need(not (set(mapping) & set(added)), 'OVERLAPPING_OLD_NEW_GUIDS')
    all_images = dict(mapping)
    all_images.update(added)
    for guid, image in all_images.items():
        need(GUID.fullmatch(guid) and image['identityEvidence'] == IDENTITY_EVIDENCE and
             image['assetClass'] in ('Sprite', 'Texture2D') and
             SHA.fullmatch(image['decodedSha256']), 'UNVERIFIED_GUID_MAP')
    output = out / 'item-icon-map-extended-private.jsonl'
    tmp = output.with_name(output.name + '.tmp')
    verified, unresolved = 0, 0
    with tmp.open('w', encoding='utf-8', newline='\n') as stream:
        for item in sorted(rows, key=lambda row: row['itemId']):
            image = all_images.get(item['iconGuid'][5:])
            if image is None: unresolved += 1
            else: verified += 1
            record = {'itemId': item['itemId'], 'iconGuid': item['iconGuid'],
                      'nativeCategory': item['nativeCategory'],
                      'rawNameField': item.get('rawNameField'),
                      'status': 'verified' if image else 'unresolved',
                      'image': image}
            stream.write(json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(',', ':')) + '\n')
    tmp.replace(output)
    need(verified + unresolved == 13202 and verified == 10786 +
         sum(len(item_guids[g]) for g in added), 'ITEM_COUNT_INCONSISTENT')
    return {'filename': output.name, 'sha256': sha_file(output),
            'verifiedItems': verified, 'unresolvedItems': unresolved}


def summarize(report, selected, skipped, completed, failures, item_guids, item_rows, out, final=False):
    merged = {}
    for bundle, obj in completed.items():
        for guid, image in obj['guids'].items():
            need(guid not in merged, 'DUPLICATE_GLOBAL_GUID')
            merged[guid] = image
    newly_mapped_items = sum(len(item_guids[g]) for g in merged)
    total_items = sum(map(len, item_guids.values()))
    summary = {'schema': SCHEMA, 'publicationApproved': False, 'imageDecodingPerformed': True,
               'sourceFilesModified': False, 'inputReportSha256': REPORT_SHA256,
               'sourceItemsSha256': SOURCE_ITEMS_SHA256,
               'targetBundleCount': len(selected), 'completedBundleCount': len(completed),
               'failedBundleCount': len(failures), 'failures': failures,
               'sourceUniqueGuidCount': len(item_guids), 'sourceItemCount': total_items,
               'priorVerifiedGuidCount': 9182, 'priorVerifiedItemCount': 10786,
               'newVerifiedGuidCount': len(merged), 'newVerifiedItemCount': newly_mapped_items,
               'remainingGuidCount': 360 - len(merged),
               'remainingItemCount': 2416 - newly_mapped_items,
               'totalVerifiedGuidCount': 9182 + len(merged),
               'totalVerifiedItemCount': 10786 + newly_mapped_items,
               'unscannedBroadGuids': skipped, 'complete': len(merged) == 358 and not failures,
               'status': 'verified_pixels' if len(merged) == 358 and not failures else 'partial_or_failed',
               'note': 'Exact Unity GUID/path_id plus verified decoded pixels. Local-only, nonpublishable.'}
    full_map = {'schema': MAP_SCHEMA, 'publicationApproved': False,
                'sourceReportSha256': REPORT_SHA256, 'verifiedGuidCount': len(merged),
                'unscannedBroadGuids': skipped, 'guidToImage': merged}
    write_json(out / 'catalog-missing-pixels-links-private.json', full_map)
    if final:
        try:
            summary['itemMapExtended'] = extended_item_map(out, item_rows, merged, item_guids)
        except Exception as exc:
            # Preserve a standalone pixel-link report even when a separately saved
            # old private identity map is absent or cannot be authenticated.
            summary['itemMapExtended'] = None
            summary['itemMapError'] = type(exc).__name__ + ': ' + str(exc)[:240]
    write_json(out / 'catalog-missing-pixels-report.json', summary)
    return summary


def log(out, message):
    print(message, flush=True)
    with (out / 'catalog-missing-pixels-console.log').open('a', encoding='utf-8') as f:
        f.write(message + '\n')


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--game', type=Path, default=GAME_DEFAULT)
    p.add_argument('--out', type=Path, default=OUT_DEFAULT)
    args = p.parse_args(argv)
    game, out = args.game.resolve(), args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    item_guids, item_rows = source_items(out)
    report, selections, skipped = plan_from_report((out / 'catalog-missing-object-report.json').read_bytes(), item_guids)
    # Disallow source/report divergence before processing the first bundle.
    for name, entry in report['bundles'].items():
        need(name == Path(entry['sourcePath']).name, 'BUNDLE_PATH_BASENAME')
    completed, failures = {}, {}
    count = len(selections)
    for n, (bundle, expected) in enumerate(sorted(selections.items()), 1):
        meta = report['bundles'][bundle]
        sha = meta['sourceSha256']
        checkpoint = out / 'catalog-missing-pixels' / 'checkpoints' / (sha + '.json')
        try:
            cached = json.loads(checkpoint.read_text(encoding='utf-8')) if checkpoint.is_file() else {}
            if checkpoint_valid(cached, expected, out, sha):
                completed[bundle] = cached
                log(out, f'[{n}/{count}] {bundle}: cached {len(expected)}')
            else:
                source = safe_source(game, meta['sourcePath'])
                images = extract_bundle(source, sha, expected, out, meta['sourcePath'])
                obj = {'schema': MAP_SCHEMA, 'complete': True,
                       'sourceSha256': sha, 'sourcePath': meta['sourcePath'],
                       'publicationApproved': False, 'guids': images}
                write_json(checkpoint, obj)
                completed[bundle] = obj
                log(out, f'[{n}/{count}] {bundle}: decoded {len(images)}')
        except Exception as exc:
            failures[bundle] = type(exc).__name__ + ': ' + str(exc)[:250]
            log(out, f'[{n}/{count}] {bundle}: FAILED - {failures[bundle]}')
        # Always flush per-bundle results, for resumable interruptions.
        summarize(report, selections, skipped, completed, failures, item_guids, item_rows, out)
    final = summarize(report, selections, skipped, completed, failures, item_guids, item_rows, out, final=True)
    log(out, json.dumps({k: final[k] for k in ('targetBundleCount', 'completedBundleCount',
      'newVerifiedGuidCount', 'newVerifiedItemCount', 'remainingGuidCount', 'remainingItemCount', 'complete')}, sort_keys=True))
    return 0 if final['complete'] else 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        details = traceback.format_exc()
        print(details, flush=True)
        root = OUT_DEFAULT
        if '--out' in sys.argv:
            try: root = Path(sys.argv[sys.argv.index('--out') + 1])
            except (IndexError, ValueError): pass
        if root.is_dir():
            (root / 'catalog-missing-pixels-console.log').open('a', encoding='utf-8').write(details + '\n')
        raise SystemExit(2)