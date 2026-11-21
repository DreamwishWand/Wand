"""Private DB-01 version comparison with per-native-category coverage evidence.

This does not infer game-wide deletion, item ownership, DLC entitlement or
semantic identity. Comparisons are only meaningful for fully-validated native
source categories present in both version manifests.
"""
import argparse
import hashlib
import json
import os
import re
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = 'wand.db01.version-diff@1'
MANIFEST_SCHEMA = 'wand.db01.version-diff-manifest@1'
CANONICAL = 'wand.db01.items@1'
PARTIAL = 'wand.db01.partial-manifest@2'
RECOVERED = 'wand.db01.partial-manifest@3'
RECOVERED_TARGET_PROBE_SHA = '07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a'
RECOVERED_OLDER_VERSION_SHA = 'a59c942d093c60740a447efb3bede638d3a3ee60c00ca01f898500413d670401'
CATEGORIES = frozenset(('ActivityItem', 'Furniture', 'Clothing', 'Trimming'))
LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')
SHA = re.compile(r'[a-f0-9]{64}\Z')
CATEGORY = re.compile(r'[A-Za-z][A-Za-z0-9]*\Z')
GUID = re.compile(r'guid:[0-9a-f]{32}\Z')
VERSION = re.compile(r'\d+\.\d+\.\d+\Z')
NONDISPLAY = re.compile(r'^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}', re.I)
MAX_BYTES = 256 * 1024 * 1024
MAX_RECORDS = 200000
MAX_ID = 2**53 - 1


def check(value, label):
    if not value:
        raise ValueError('DB01_COMPARE_' + label)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()


def read_json(path):
    with Path(path).open('r', encoding='utf-8-sig') as stream:
        return json.load(stream)


def write_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.db01-compare-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            json.dump(payload, stream, sort_keys=True, indent=2, ensure_ascii=False)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def verified_categories(manifest):
    schema = manifest.get('schema')
    check(schema in (CANONICAL, PARTIAL, RECOVERED), 'UNSUPPORTED_INPUT_SCHEMA')
    check(manifest.get('platform') == 'Steam' and
          isinstance(manifest.get('gameVersion'), str) and
          VERSION.fullmatch(manifest['gameVersion']), 'TARGET_NOT_STEAM_SEMVER')
    check(manifest.get('publicationStatus') == (
        'private_not_approved_for_public_catalog' if schema == CANONICAL
        else 'PRIVATE_ONLY_NO_PUBLIC_ITEMS'), 'PRIVATE_ONLY_REQUIRED')
    counts = manifest.get('byNativeCategory')
    check(isinstance(counts, dict) and counts and all(
        isinstance(name, str) and CATEGORY.fullmatch(name) and
        type(count) is int and count >= 0 for name, count in counts.items()),
        'INVALID_CATEGORY_COVERAGE')
    total = manifest.get('counts', {}).get('currentDefinitions') if schema == CANONICAL else manifest.get('count')
    check(type(total) is int and 0 < total <= MAX_RECORDS and sum(counts.values()) == total,
          'INVALID_TOTAL_COUNT')
    check(SHA.fullmatch(manifest.get('outputSha256', {}).get('items.jsonl', '')),
          'MISSING_DATA_DIGEST')
    if schema == CANONICAL:
        check(SHA.fullmatch(manifest.get('inputs', {}).get('nativeManifest') or '') and
              SHA.fullmatch(manifest.get('inputs', {}).get('referenceIndex') or ''),
              'CANONICAL_PROVENANCE_REQUIRED')
        check(type(manifest.get('counts', {}).get('verifiedFourNativeItems')) is int and
              type(manifest.get('counts', {}).get('additionalDefinitionRecords')) is int,
              'CANONICAL_DOMAIN_COUNTS_REQUIRED')
    else:
        sources = manifest.get('sources')
        check(manifest.get('fullCorpusParsed') is False and isinstance(sources, list) and
              len(sources) == 2 and sources[0].get('schema') == 'wand.src01.steam-native@1' and
              sources[1].get('schema') == 'wand.src01.extended@1' and
              SHA.fullmatch(sources[0].get('manifestSha256', '')) and
              SHA.fullmatch(sources[1].get('manifestSha256', '')),
              'PARTIAL_PROVENANCE_REQUIRED')
        native = sources[0].get('verifiedCategories')
        extra = sources[1].get('fullSourceBytesShaVerifiedCategories')
        check(isinstance(native, list) and set(native) == CATEGORIES and
              isinstance(extra, list) and len(set(extra)) == len(extra) and
              all(isinstance(filename, str) and filename.endswith('.json') and
                  CATEGORY.fullmatch(filename[:-5]) for filename in extra),
              'PARTIAL_SOURCE_CATEGORY_MISMATCH')
        if schema == PARTIAL:
            check(manifest.get('status') == 'partial_verified_native_plus_six_full_probe_classes' and
                  set(counts) == set(native) | {name[:-5] for name in extra},
                  'PARTIAL_SOURCE_CATEGORY_MISMATCH')
        else:
            proof = sources[1].get('reuseEvidence', {})
            matched = proof.get('sameFullBytesSha256Files', [])
            check(manifest['gameVersion'] == '1.26.2' and
                  manifest.get('status') == 'private_38_of_39_full_native_source_evidence' and
                  manifest.get('historicalReferenceJoined') is False and
                  manifest.get('sourceFilesFullyShaVerified') == 38 and
                  manifest.get('sourceFilesTotal') == 39 and
                  manifest.get('unresolvedCategories') == ['Condition'] and
                  proof.get('schema') == 'wand.src01.identical-binary-reuse@1' and
                  proof.get('olderBaselineVersion') == '1.26.1' and
                  proof.get('currentTargetVersion') == manifest['gameVersion'] and
                  proof.get('olderFullVersionSha256') == RECOVERED_OLDER_VERSION_SHA and
                  sources[1].get('probeSha256') == RECOVERED_TARGET_PROBE_SHA and
                  proof.get('categoryFilesNotReusable') == ['Condition.json'] and
                  isinstance(matched, list) and len(matched) == 38 and
                  len(set(matched)) == 38 and
                  len(extra) == 34 and 'ItemCondition.json' in extra and
                  set(matched) == {name+'.json' for name in native} | set(extra) and
                  set(counts).issubset(set(native) | {name[:-5] for name in extra}) and
                  set(counts).issuperset(native) and
                  all(isinstance(value, int) and value > 0 for value in counts.values()) and
                  manifest.get('verifiedCurrentLocalization', {}).get('fullCurrentLocaleMemberCount') == 53 and
                  manifest.get('verifiedCurrentLocalization', {}).get('currentEightLocaleNamedDefinitions') == 241 and
                  manifest.get('verifiedCurrentLocalization', {}).get('currentAnyLocaleNamedDefinitions') == 506,
                  'RECOVERED_VERSION_PROVENANCE_REQUIRED')
    # Coverage is *category-scoped*. Do not convert it to game-wide completeness.
    return counts, total


def load_private_version(folder):
    folder = Path(folder).resolve(strict=True)
    manifest_path = folder / 'manifest.json'
    rows_path = folder / 'items.jsonl'
    manifest = read_json(manifest_path)
    category_counts, total = verified_categories(manifest)
    check(rows_path.is_file() and 0 < rows_path.stat().st_size <= MAX_BYTES,
          'ITEMS_FILE_SIZE_INVALID')
    digest = sha(rows_path)
    check(digest == manifest['outputSha256']['items.jsonl'], 'ITEMS_DIGEST_MISMATCH')
    rows = {}
    counts = Counter()
    source_digests = {}
    with rows_path.open('r', encoding='utf-8') as stream:
        for line_no, line in enumerate(stream, 1):
            check(bool(line.strip()) and len(line) <= 131072, 'INVALID_JSONL_FRAME')
            row = json.loads(line)
            item_id = row.get('itemId')
            category = row.get('nativeCategory')
            src = row.get('source', {})
            verification = row.get('verification', {})
            names = row.get('names', {})
            name_evidence = verification.get('names', {})
            check(type(item_id) is int and 0 < item_id <= MAX_ID and item_id not in rows,
                  'INVALID_OR_DUPLICATE_ITEM_ID')
            check(category in category_counts and
                  src.get('file') == f'ddv_Data/StreamingAssets/itemlist/{category}.json' and
                  src.get('platform') == manifest['platform'] and
                  src.get('gameVersion') == manifest['gameVersion'] and
                  SHA.fullmatch(src.get('sha256') or '') and
                  verification.get('itemId') == 'native_frame_verified' and
                  verification.get('nativeCategory') == 'native_file_verified' and
                  verification.get('currentVersionObserved') is True,
                  'UNVERIFIED_CURRENT_SOURCE')
            check(row.get('catalogDomain') == (
                  'item' if category in CATEGORIES else 'definition_unclassified'),
                  'INVALID_CATALOG_DOMAIN')
            check(isinstance(names, dict) and isinstance(name_evidence, dict) and
                  set(names) == set(LOCALES) and set(name_evidence) == set(LOCALES),
                  'INVALID_LOCALE_CONTRACT')
            for locale in LOCALES:
                value, evidence = names[locale], name_evidence[locale]
                check((value is None and evidence == 'unresolved') or
                      (isinstance(value, str) and bool(value.strip()) and
                       not NONDISPLAY.match(value) and evidence == 'exact_locdb_join'),
                      'UNVERIFIED_LOCALE_NAME')
            image = row.get('image', {})
            if category in CATEGORIES:
                check(verification.get('iconGuid') == 'native_wire_verified' and
                      GUID.fullmatch(image.get('iconGuid') or ''), 'UNVERIFIED_NATIVE_ICON')
            else:
                check(verification.get('iconGuid') == 'unresolved' and
                      image.get('iconGuid') is None, 'UNVERIFIED_EXTENDED_ICON')
            check(all(row.get(key) is None for key in
                      ('category', 'subcategory', 'worlds', 'universes', 'expansions', 'attributes')),
                  'UNVERIFIED_CURRENT_SEMANTICS')
            previous_hash = source_digests.setdefault(category, src['sha256'])
            check(previous_hash == src['sha256'], 'CONFLICTING_CATEGORY_SOURCE_DIGEST')
            counts[category] += 1
            rows[item_id] = row
            check(len(rows) <= MAX_RECORDS, 'EXCESSIVE_ITEM_COUNT')
    check(len(rows) == total and all(counts.get(cat, 0) == count
          for cat, count in category_counts.items()), 'CATEGORY_COUNT_MISMATCH')
    count_item = sum(counts.get(cat, 0) for cat in CATEGORIES)
    count_extra = total - count_item
    if manifest['schema'] == CANONICAL:
        check(manifest['counts']['verifiedFourNativeItems'] == count_item and
              manifest['counts']['additionalDefinitionRecords'] == count_extra,
              'CANONICAL_DOMAIN_COUNT_MISMATCH')
    else:
        check(manifest.get('catalogDomains', {}).get('collectionItem') == count_item and
              manifest.get('catalogDomains', {}).get('unclassifiedDefinition') == count_extra,
              'PARTIAL_DOMAIN_COUNT_MISMATCH')
        if manifest['schema'] == RECOVERED:
            names = manifest['verifiedCurrentLocalization']['currentExactNamesByLocale']
            check(isinstance(names, dict) and set(names) == set(LOCALES) and
                  all(type(names[locale]) is int and names[locale] == sum(
                      bool(row['names'][locale]) for row in rows.values())
                      for locale in LOCALES), 'RECOVERED_LOCALE_COUNT_MISMATCH')
    return {
        'manifest': manifest, 'manifestSha256': sha(manifest_path),
        'dataSha256': digest, 'categories': category_counts,
        'sourceDigests': source_digests, 'items': rows,
    }


def compare(old, new, *, sqlite_input=False,
            old_sqlite_sha256=None, new_sqlite_sha256=None):
    """One semantic comparator for both canonical private JSONL and final SQLite.

    A trusted SHA from an independent source ledger is needed to authenticate a
    purported private SQLite snapshot beyond its internal consistency. No
    SQLite input is ever allowed to authorize game-wide removal or publishing.
    """
    if sqlite_input:
        check(bool(old_sqlite_sha256) == bool(new_sqlite_sha256),
              'SQLITE_PINS_BOTH_OR_NONE')
        from sqlite_version_reader import load_sqlite_version
        a = load_sqlite_version(old, old_sqlite_sha256)
        b = load_sqlite_version(new, new_sqlite_sha256)
    else:
        check(old_sqlite_sha256 is None and new_sqlite_sha256 is None,
              'SQLITE_PINS_REQUIRE_SQLITE_INPUT')
        a = load_private_version(old)
        b = load_private_version(new)
    check(a['manifest']['platform'] == b['manifest']['platform'],
          'CROSS_PLATFORM_NOT_COMPARABLE')
    old_cats, new_cats = set(a['categories']), set(b['categories'])
    shared = old_cats & new_cats
    old_ids, new_ids = set(a['items']), set(b['items'])
    only_old, only_new = old_ids - new_ids, new_ids - old_ids
    common = old_ids & new_ids
    newly_observed = sorted(x for x in only_new if b['items'][x]['nativeCategory'] in shared)
    missing_in_category = sorted(x for x in only_old if a['items'][x]['nativeCategory'] in shared)
    added_coverage = sorted(x for x in only_new if b['items'][x]['nativeCategory'] not in shared)
    lost_coverage = sorted(x for x in only_old if a['items'][x]['nativeCategory'] not in shared)
    name_changes = []
    verified_icon_changes = []
    native_key_changes = []
    category_moves = []
    gained_locale_coverage = {locale: 0 for locale in LOCALES}
    lost_locale_coverage = {locale: 0 for locale in LOCALES}
    for item_id in sorted(common):
        older, newer = a['items'][item_id], b['items'][item_id]
        if older['nativeCategory'] != newer['nativeCategory']:
            category_moves.append({'itemId': item_id, 'oldCategory': older['nativeCategory'],
                                   'newCategory': newer['nativeCategory']})
        if older.get('nativeNameField') != newer.get('nativeNameField'):
            native_key_changes.append(item_id)
        for locale in LOCALES:
            before, after = older['names'][locale], newer['names'][locale]
            if before and after and before != after:
                name_changes.append({'itemId': item_id, 'locale': locale,
                                     'previous': before, 'current': after})
            elif not before and after:
                gained_locale_coverage[locale] += 1
            elif before and not after:
                lost_locale_coverage[locale] += 1
        old_icon = older.get('image', {}).get('iconGuid')
        new_icon = newer.get('image', {}).get('iconGuid')
        if old_icon and new_icon and old_icon != new_icon:
            verified_icon_changes.append({'itemId': item_id, 'previous': old_icon, 'current': new_icon})
    changed_sources = sorted(cat for cat in shared
                             if a['sourceDigests'].get(cat) != b['sourceDigests'].get(cat) and
                             a['sourceDigests'].get(cat) is not None and
                             b['sourceDigests'].get(cat) is not None)
    return {
        'schema': SCHEMA,
        'from': {'gameVersion': a['manifest']['gameVersion'], 'platform': a['manifest']['platform'],
                 'manifestSha256': a['manifestSha256'], 'dataSha256': a['dataSha256'],
                 **({'sqliteSha256': a['sqliteSha256']} if sqlite_input else {})},
        'to': {'gameVersion': b['manifest']['gameVersion'], 'platform': b['manifest']['platform'],
               'manifestSha256': b['manifestSha256'], 'dataSha256': b['dataSha256'],
               **({'sqliteSha256': b['sqliteSha256']} if sqlite_input else {})},
        'coverage': {'scope': 'native_definition_category_full_source_only',
                     'sourceKind': 'final_private_sqlite_v2' if sqlite_input else 'verified_jsonl_source',
                     'sqliteInputsIndependentlyPinned': bool(old_sqlite_sha256 and new_sqlite_sha256) if sqlite_input else None,
                     'gameWideComplete': False, 'verifiedSameCategoryComparison': bool(shared),
                     'comparableCategories': sorted(shared),
                     'previousOnlyCategories': sorted(old_cats - new_cats),
                     'currentOnlyCategories': sorted(new_cats - old_cats)},
        'counts': {'previousDefinitions': len(old_ids), 'currentDefinitions': len(new_ids),
                   'sharedItemIds': len(common), 'observedNewInComparableCategories': len(newly_observed),
                   'absentInCurrentComparableCategory': len(missing_in_category),
                   'newlyCoveredCategoryIds': len(added_coverage),
                   'lostCategoryCoverageIds': len(lost_coverage),
                   'verifiedNameChanges': len(name_changes),
                   'verifiedIconChanges': len(verified_icon_changes),
                   'nativeCategoryMoves': len(category_moves)},
        'observedNewInComparableCategories': newly_observed,
        'absentInCurrentComparableCategory': missing_in_category,
        'newlyCoveredCategoryIds': added_coverage,
        'lostCategoryCoverageIds': lost_coverage,
        'categoryMoves': category_moves,
        'sourceChangedCategories': changed_sources,
        'nativeNameFieldChangedIds': native_key_changes,
        'verifiedNameChanges': name_changes,
        'verifiedIconGuidChanges': verified_icon_changes,
        'newlyVerifiedNamesByLocale': gained_locale_coverage,
        'previouslyVerifiedNamesNowUnresolvedByLocale': lost_locale_coverage,
        'gameWideRemovedIds': None, 'gameWideAddedIds': None,
        'itemSemanticChanges': None, 'dlcMembershipChanges': None,
        'note': 'Category-scoped observations are not game-wide additions or removals; '
                'matching Item IDs do not establish semantic or ownership equivalence.',
    }


def build(old, new, output, *, sqlite_input=False,
          old_sqlite_sha256=None, new_sqlite_sha256=None):
    old, new, output = (Path(v) for v in (old, new, output))
    if sqlite_input:
        check(not old.is_symlink() and not new.is_symlink(), 'SYMLINK_SQLITE_INPUT')
    old, new, output = (v.resolve() for v in (old, new, output))
    check(old != new, 'OLD_AND_NEW_DIRECTORY_IDENTICAL')
    for source in (old, new):
        check(output != source and output not in source.parents and source not in output.parents,
              'OUTPUT_OVERLAPS_SOURCE')
    result = compare(old, new, sqlite_input=sqlite_input,
                     old_sqlite_sha256=old_sqlite_sha256,
                     new_sqlite_sha256=new_sqlite_sha256)
    output.mkdir(parents=True, exist_ok=True)
    report_path = output / 'version-diff.json'
    write_json(report_path, result)
    write_json(output / 'manifest.json', {
        'schema': MANIFEST_SCHEMA, 'createdUtc': datetime.now(timezone.utc).isoformat(),
        'inputManifestsSha256': {'old': result['from']['manifestSha256'],
                                 'new': result['to']['manifestSha256']},
        'inputDataSha256': {'old': result['from']['dataSha256'],
                            'new': result['to']['dataSha256']},
        'inputKind': result['coverage']['sourceKind'],
        'inputSqliteSha256': ({'old': result['from']['sqliteSha256'],
                              'new': result['to']['sqliteSha256']}
                             if sqlite_input else None),
        'sqliteInputsIndependentlyPinned': result['coverage']['sqliteInputsIndependentlyPinned'],
        'reportFile': report_path.name, 'reportSha256': sha(report_path),
        'publicationStatus': 'private_not_approved_for_public_catalog',
        'gameWideRemovalInferred': False,
    })
    return result['counts']


def main():
    ap = argparse.ArgumentParser(description='Compare two private fully source-verified DB-01 version snapshots')
    ap.add_argument('--old', required=True, type=Path)
    ap.add_argument('--new', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--sqlite-input', action='store_true',
                    help='Read v2 SQLite snapshots instead of source JSONL folders')
    ap.add_argument('--old-sqlite-sha256', default=None,
                    help='Independently trusted SHA-256 of old SQLite snapshot')
    ap.add_argument('--new-sqlite-sha256', default=None,
                    help='Independently trusted SHA-256 of new SQLite snapshot')
    opts = ap.parse_args()
    try:
        print(json.dumps(build(opts.old, opts.new, opts.out,
                               sqlite_input=opts.sqlite_input,
                               old_sqlite_sha256=opts.old_sqlite_sha256,
                               new_sqlite_sha256=opts.new_sqlite_sha256), sort_keys=True))
    except (OSError, ValueError, TypeError, UnicodeError, KeyError, json.JSONDecodeError) as err:
        ap.exit(1, f'DB-01 version comparison failed: {err}\n')


if __name__ == '__main__':
    main()
