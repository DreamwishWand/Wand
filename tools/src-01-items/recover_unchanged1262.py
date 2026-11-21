"""Reconstruct exact Steam 1.26.2 native definitions from SHA-identical 1.26.1 archive files.

The 1.26.2 format-probe has independently observed the FULL SHA-256 for each
original file. A 1.26.1 source is accepted only if its entire bytes match that
1.26.2 digest; filename or version proximity alone NEVER permits reuse.

Does not use 1.26.1 LocDB names, or make assertions about changed Condition.json.
Outputs private native extended definitions and preserves only current verified
names recovered from the complete 1.26.2 probe ZIP members.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import extend1262
import localize1262

SCHEMA = 'wand.src01.extended@1'
EXPECTED_CURRENT_VERSION = '1.26.2'
BASELINE_VERSION = '1.26.1'
BASELINE_FULLVERSION_SHA256 = 'a59c942d093c60740a447efb3bede638d3a3ee60c00ca01f898500413d670401'
TARGET_PROBE_SHA256 = '07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a'
CHANGED_SOURCE = 'Condition.json'
NATIVE = ('ActivityItem', 'Furniture', 'Clothing', 'Trimming')
EXPECTED_EXTENDED_COUNT = 35
GUID = re.compile(r'guid:[0-9a-f]{32}\Z')
NONDISPLAY = re.compile(r'^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}', re.I)


def require(value, label):
    if not value:
        raise ValueError('DB01_RECOVER_' + label)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def verified_same_file(path, expected_sha, *, allow_changed=False):
    """Only exact digest equality proves a prior version's bytes are current."""
    require(path.is_file() and not path.is_symlink(), 'SOURCE_FILE_NOT_REGULAR')
    require(isinstance(expected_sha, str) and re.fullmatch(r'[a-f0-9]{64}', expected_sha),
            'BAD_EXPECTED_SOURCE_DIGEST')
    actual = sha(path)
    if actual != expected_sha:
        if allow_changed:
            return False
        raise ValueError('DB01_RECOVER_BASELINE_SOURCE_NOT_CURRENT:' + path.name)
    return True


def load_current_complete_probe(complete, target_probe, rows_by_id, expected_categories):
    """Reuse only fully captured current-game ZIP members with exact provenance."""
    manifest = localize1262.read_json(complete / 'manifest.json')
    path = complete / 'definitions.jsonl'
    require(manifest.get('schema') == SCHEMA and manifest.get('gameVersion') == EXPECTED_CURRENT_VERSION and
            manifest.get('platform') == 'Steam' and
            manifest.get('probeSha256') == sha(target_probe) and
            manifest.get('itemsSha256') == sha(path) and
            manifest.get('definitionCount') == 132, 'INVALID_CURRENT_PROBE_MANIFEST')
    categories = manifest.get('categories', {})
    require(isinstance(categories, dict) and set(categories) == expected_categories and
            all(meta.get('status') in ('verified_empty', 'native_wire_verified')
                for meta in categories.values()), 'INVALID_CURRENT_PROBE_CATEGORY_SET')
    seen = set()
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            raise ValueError('DB01_RECOVER_BLANK_CURRENT_ROW')
        earlier = json.loads(line)
        item_id = earlier['itemId']
        require(item_id not in seen and item_id in rows_by_id, 'CURRENT_PROBE_ID_NOT_VERIFIED')
        seen.add(item_id)
        current = rows_by_id[item_id]
        for field in ('itemId', 'nativeCategory', 'rawNameField', 'localizationKey',
                      'imageGuidField4Candidate'):
            require(current.get(field) == earlier.get(field), 'CURRENT_PROBE_ROW_CONFLICT:' + str(item_id))
        require(current['source']['sha256'] == earlier['source']['sha256'],
                'CURRENT_PROBE_SOURCE_HASH_CONFLICT')
        names = earlier.get('names', {})
        require(set(names) == set(localize1262.LOCALES), 'CURRENT_PROBE_INVALID_LOCALES')
        for locale, name in names.items():
            require(name is None or (isinstance(name, str) and name.strip() and not NONDISPLAY.match(name)),
                    'CURRENT_PROBE_NONDISPLAY_NAME')
        current['names'] = names
    require(len(seen) == 132, 'CURRENT_PROBE_ROW_COUNT_MISMATCH')
    localization = manifest.get('localizationEvidence')
    require(isinstance(localization, dict) and set(localization) == set(localize1262.LOCALES),
            'MISSING_CURRENT_LOCALE_SOURCE_EVIDENCE')
    for locale, suffix in localize1262.LOCALES.items():
        archived = localization[locale]
        require(archived.get('archive') == f'LocDB_{suffix}.zip' and
                archived.get('sha256') == localize1262.read_json(target_probe)
                    .get('localization', {}).get(locale, {}).get('sha256'),
                'CURRENT_ZIP_PROBE_HASH_CONFLICT')
        for category in ('BoardGame', 'PhotoMode'):
            evidence = archived.get('members', {}).get(category, {})
            require(evidence.get('entry') == f'{category}.locbin' and
                    isinstance(evidence.get('entrySha256'), str) and
                    len(evidence['entrySha256']) == 64,
                    'CURRENT_ZIP_MEMBER_HASH_MISSING')
    return localization


def recover(baseline, target_probe, current_native, current_probe, output):
    baseline, target_probe, current_native, current_probe, output = [
        Path(x).resolve() for x in (baseline, target_probe, current_native, current_probe, output)]
    for source in (baseline, current_native, current_probe):
        require(output != source and output not in source.parents and source not in output.parents,
                'OUTPUT_OVERLAPS_SOURCE')
    require(output != target_probe and output != target_probe.parent and
            output not in target_probe.parents and target_probe not in output.parents,
            'OUTPUT_OVERLAPS_PROBE')
    version = baseline / 'FullVersion.txt'
    require(verified_same_file(version, BASELINE_FULLVERSION_SHA256) and
            '-v1.26.1-' in version.read_text(encoding='utf-8'),
            'NOT_PINNED_STEAM_1261_BASELINE')
    require(sha(target_probe) == TARGET_PROBE_SHA256, 'TARGET_1262_PROBE_SHA_MISMATCH')
    probe = localize1262.read_json(target_probe)
    require(probe.get('schema') == extend1262.PROBE_SCHEMA and
            probe.get('gameVersion') == EXPECTED_CURRENT_VERSION and
            probe.get('platform') == 'Steam', 'INVALID_TARGET_PROBE')
    candidates = probe.get('itemlistCandidates')
    require(isinstance(candidates, dict) and len(candidates) == EXPECTED_EXTENDED_COUNT and
            CHANGED_SOURCE in candidates, 'UNEXPECTED_TARGET_ITEMLIST_SET')
    native_manifest = localize1262.read_json(current_native / 'manifest.json')
    native_items = current_native / 'items.jsonl'
    require(native_manifest.get('schema') == 'wand.src01.steam-native@1' and
            native_manifest.get('gameVersion') == EXPECTED_CURRENT_VERSION and
            native_manifest.get('platform') == 'Steam' and
            native_manifest.get('status') == 'partial_native_extraction' and
            native_manifest.get('itemsSha256') == sha(native_items) and
            native_manifest.get('itemCount') == 13202, 'UNVERIFIED_CURRENT_NATIVE_INPUT')
    native_hashes = {Path(entry['path']).name: entry['sha256']
                     for entry in native_manifest['sourceFiles']}
    require(set(native_hashes) == {f'{cat}.json' for cat in NATIVE},
            'NATIVE_CATEGORY_SHA_SET_MISMATCH')
    original_items = baseline / 'ddv_Data' / 'StreamingAssets' / 'itemlist'
    exact = []
    for category in NATIVE:
        path = original_items / f'{category}.json'
        require(verified_same_file(path, native_hashes[path.name]), 'NATIVE_SOURCE_CHANGED')
        exact.append(path.name)
    # Current 1.26.2 source bytes for the four native categories already reside
    # in current_native. The archived bytes must match those hashes independently.
    definitions = []
    category_metadata = {}
    changed = []
    for filename, spec in sorted(candidates.items()):
        require(spec.get('source') == f'ddv_Data/StreamingAssets/itemlist/{filename}' and
                isinstance(spec.get('sha256'), str), 'BAD_TARGET_CATEGORY_PROVENANCE')
        path = original_items / filename
        if not verified_same_file(path, spec['sha256'], allow_changed=filename == CHANGED_SOURCE):
            changed.append(filename)
            continue
        exact.append(filename)
        if spec.get('size') == 0:
            require(filename == 'ItemCondition.json' and
                    spec['sha256'] == hashlib.sha256(b'').hexdigest(), 'UNEXPECTED_EMPTY_SOURCE')
            category_metadata[filename] = {'status': 'verified_empty', 'count': 0}
            continue
        rows = extend1262.pinned_category(baseline, filename, spec)
        category_metadata[filename] = {'status': 'native_wire_verified', 'count': len(rows),
                                      'sha256': spec['sha256'], 'source': spec['source']}
        definitions.extend(rows)
    require(changed == [CHANGED_SOURCE] and len(exact) == 38 and
            len(category_metadata) == EXPECTED_EXTENDED_COUNT-1, 'UNEXPECTED_REUSED_SOURCE_COVERAGE')
    rows_by_id = {row['itemId']: row for row in definitions}
    require(len(rows_by_id) == len(definitions) and len(definitions) > 10000,
            'INVALID_OR_DUPLICATE_RECOVERED_IDS')
    # Check against the 13,202 current native Item IDs independently.
    native_ids = set()
    for line in native_items.read_text(encoding='utf-8').splitlines():
        row = json.loads(line)
        require(type(row.get('itemId')) is int and row['itemId'] not in native_ids,
                'DUPLICATE_CURRENT_NATIVE_ID')
        native_ids.add(row['itemId'])
    require(not native_ids.intersection(rows_by_id), 'CROSS_CURRENT_SOURCE_ID_COLLISION')
    complete_categories = {filename for filename in category_metadata
                           if category_metadata[filename]['status'] in ('verified_empty', 'native_wire_verified')
                           and filename in ('BoardGame.json', 'Currency.json', 'Display.json',
                                            'Environment.json', 'ItemCondition.json',
                                            'PhotoMode.json', 'Profession.json')}
    require(len(complete_categories) == 7, 'CURRENT_PROBE_SOURCE_COVERAGE_CONFLICT')
    localization = load_current_complete_probe(current_probe, target_probe, rows_by_id,
                                               complete_categories)
    definitions.sort(key=lambda row: row['itemId'])
    output.mkdir(parents=True, exist_ok=True)
    data_path = output / 'definitions.jsonl'
    localize1262.write_jsonl(data_path, definitions)
    probe_sha = sha(target_probe)
    manifest = {
        'schema': SCHEMA, 'platform': 'Steam', 'gameVersion': EXPECTED_CURRENT_VERSION,
        'definitionCount': len(definitions), 'itemsFile': data_path.name,
        'itemsSha256': sha(data_path), 'probeSha256': probe_sha,
        'categories': category_metadata, 'localizationEvidence': localization,
        'unresolvedCategories': [CHANGED_SOURCE.removesuffix('.json')],
        'sourceReuseEvidence': {
            'schema': 'wand.src01.identical-binary-reuse@1',
            'olderBaselineVersion': BASELINE_VERSION,
            'olderFullVersionSha256': BASELINE_FULLVERSION_SHA256,
            'currentTargetVersion': EXPECTED_CURRENT_VERSION,
            'sameFullBytesSha256Files': sorted(exact),
            'categoryFilesNotReusable': [CHANGED_SOURCE],
            'proof': 'full prior file SHA256 equals independent current-version game source probe SHA256',
            'localizationReuse': 'NONE; only 1.26.2 complete current ZIP-member probes reused',
        },
        'verificationScope': 'whole native 1.26.2 file SHA-256 for 38/39 itemlists; 8-locale complete current member evidence for six source categories',
        'notClaims': ['all 39 itemlist source files recovered',
                      'Condition definitions from the newer game are verified',
                      'old-version ZIP archive equality', 'all definitions are collectible',
                      'all locale display names known', 'current DLC or world membership'],
        'publicationStatus': 'PRIVATE_NOT_APPROVED',
    }
    localize1262.write_json(output / 'manifest.json', manifest)
    localize1262.write_json(output / 'report.json', {
        'schema': 'wand.src01.identical-source-reuse-report@1',
        'fullyVerifiedNativeSourceFiles': len(exact),
        'ofNativeSourceFiles': len(candidates)+len(NATIVE),
        'extendedDefinitionCount': len(definitions),
        'currentFourNativeDefinitionCount': len(native_ids),
        'currentObservedTotalDefinitionCount': len(definitions)+len(native_ids),
        'missingFullSourceCategories': [CHANGED_SOURCE.removesuffix('.json')],
        'byCategory': dict(sorted(Counter(row['nativeCategory'] for row in definitions).items())),
        'verifiedLocaleNamesByLocale': {locale: sum(bool(r['names'][locale]) for r in definitions)
                                       for locale in localize1262.LOCALES},
    })
    return {'extendedDefinitions': len(definitions), 'currentObservedTotal': len(definitions)+len(native_ids),
            'matchedFullSourceFiles': len(exact), 'unresolved': changed}


def main():
    p = argparse.ArgumentParser(description='Recover only SHA-identical current itemlist files from archived 1.26.1 game')
    p.add_argument('--baseline', required=True, type=Path, help='Owner-private Steam 1.26.1 game root')
    p.add_argument('--probe', required=True, type=Path, help='SHA-pinned private Steam 1.26.2 format-probe.json')
    p.add_argument('--native', required=True, type=Path, help='Verified current Steam 1.26.2 four-category native output')
    p.add_argument('--complete-probe', required=True, type=Path, help='Verified current Steam 1.26.2 complete-source probe output')
    p.add_argument('--out', required=True, type=Path)
    args = p.parse_args()
    try:
        print(json.dumps(recover(args.baseline, args.probe, args.native, args.complete_probe, args.out), sort_keys=True))
    except (OSError, ValueError, TypeError, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        p.exit(1, f'DB-01 source reuse failed: {exc}\n')


if __name__ == '__main__':
    main()