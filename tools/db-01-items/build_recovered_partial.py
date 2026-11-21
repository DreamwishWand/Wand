"""Private DB-01 normalization of exact SHA-reused Steam 1.26.2 source definitions.

The archived 1.26.1 game bytes are never inferred from dates/names: the
upstream SRC-01 manifest proves 38 original files' full SHA-256 equality to
independently captured current 1.26.2 source hashes. This compiler consumes
only validated SRC-01 rows and DOES NOT join stale Switch categories or publish.
"""
import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import build as db01

SCHEMA = 'wand.db01.partial-manifest@3'
STATUS = 'private_38_of_39_full_native_source_evidence'
SOURCE_MANIFEST_SCHEMA = 'wand.src01.identical-binary-reuse@1'
TARGET_PROBE_SHA = '07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a'
OLDER_FULLVERSION_SHA = 'a59c942d093c60740a447efb3bede638d3a3ee60c00ca01f898500413d670401'
SOURCE_VERSION = '1.26.2'
BASELINE_VERSION = '1.26.1'
UNRESOLVED_CATEGORY = 'Condition'
EXPECTED_FOUR = 13202
EXPECTED_EXTRA = 20425
EXPECTED_COMBINED = 33627
EXPECTED_MATCHED_SOURCE_COUNT = 38
EXPECTED_FULL_LOCALE_MEMBERS = 53
EXPECTED_EIGHT_LOCALE_NAMED = 241
EXPECTED_ANY_LOCALE_NAMED = 506


def require(ok, label):
    if not ok:
        raise ValueError('DB01_RECOVERED_PARTIAL_' + label)


def inspect_reuse_meta(extended, native_meta, extra):
    m = extended['manifest']
    reuse = m.get('sourceReuseEvidence', {})
    names = m.get('verifiedCurrentLocalization', {})
    require(m.get('schema') == 'wand.src01.extended@1' and
            m.get('platform') == 'Steam' and m.get('gameVersion') == SOURCE_VERSION and
            m.get('publicationStatus') == 'PRIVATE_NOT_APPROVED' and
            m.get('unresolvedCategories') == [UNRESOLVED_CATEGORY],
            'INVALID_REUSE_SOURCE_MANIFEST')
    matched_files = reuse.get('sameFullBytesSha256Files', [])
    require(reuse.get('schema') == SOURCE_MANIFEST_SCHEMA and
            reuse.get('olderBaselineVersion') == BASELINE_VERSION and
            reuse.get('currentTargetVersion') == SOURCE_VERSION and
            len(matched_files) == EXPECTED_MATCHED_SOURCE_COUNT and
            len(set(matched_files)) == len(matched_files) and
            reuse.get('categoryFilesNotReusable') == [UNRESOLVED_CATEGORY + '.json'],
            'INVALID_BINARY_REUSE_PROOF')
    verified_categories = set(m['categories']) | {c + '.json' for c in db01.NATIVE_CATEGORIES}
    require(set(matched_files) == verified_categories and
            not any(name.startswith('Condition.') for name in matched_files),
            'INVALID_REUSE_CATEGORY_COVERAGE')
    require(m['probeSha256'] == reuse.get('probeSha256', m['probeSha256']) and
            m['probeSha256'] == TARGET_PROBE_SHA and
            reuse.get('olderFullVersionSha256') == OLDER_FULLVERSION_SHA,
            'INVALID_REUSE_VERSION_EVIDENCE')
    require(names.get('fullCurrentLocaleMemberCount') == EXPECTED_FULL_LOCALE_MEMBERS and
            names.get('currentEightLocaleNamedDefinitions') == EXPECTED_EIGHT_LOCALE_NAMED and
            names.get('currentAnyLocaleNamedDefinitions') == EXPECTED_ANY_LOCALE_NAMED and
            isinstance(names.get('currentExactNamesByLocale'), dict) and
            set(names['currentExactNamesByLocale']) == set(db01.LOCALES),
            'INVALID_CURRENT_LOCALIZATION_EVIDENCE')
    require(len(extra) == EXPECTED_EXTRA and
            native_meta['nativeManifest']['gameVersion'] == m['gameVersion'],
            'INVALID_CURRENT_EXTENDED_TOTAL')
    return reuse, names


def validate_rows(native, extra, hashes):
    unique = {}
    for row in native + extra:
        item_id = row['itemId']
        require(type(item_id) is int and 0 < item_id < 2**53 and item_id not in unique,
                'DUPLICATE_OR_INVALID_NATIVE_ID')
        unique[item_id] = row
    require(len(native) == EXPECTED_FOUR and len(unique) == EXPECTED_COMBINED,
            'INCORRECT_SOURCE_RECORD_COUNT')
    result = []
    for item_id,row in sorted(unique.items()):
        source = row['source']
        checksum = source.get('sha256') or hashes.get(source['file'])
        require(db01.valid_hash(checksum), 'SOURCE_HASH_UNRESOLVED')
        domain = 'item' if row['nativeCategory'] in db01.NATIVE_CATEGORIES else 'definition_unclassified'
        result.append(db01.normalized(row, None, checksum, domain=domain))
    require(sum(r['catalogDomain'] == 'item' for r in result) == EXPECTED_FOUR and
            all(r['historicalReference'] is None for r in result),
            'UNVERIFIED_HISTORICAL_OR_DOMAIN_PROMOTION')
    return result


def make(source, extended, output, force=False):
    source, extended, output = [Path(value).resolve() for value in (source, extended, output)]
    for root in (source, extended):
        require(output != root and output not in root.parents and root not in output.parents,
                'OUTPUT_OVERLAPS_INPUT')
    native, native_meta = db01.load_native(source)
    extra, extended_meta = db01.load_extended(extended, SOURCE_VERSION)
    reuse, provenance = inspect_reuse_meta(extended_meta, native_meta, extra)
    # SHA-256 of both input manifests and JSONL files is required to detect
    # unannounced source changes. Never silently skip an integrity failure.
    sources = [
        {'schema': native_meta['nativeManifest']['schema'],
         'manifestSha256': native_meta['nativeManifestHash'],
         'itemsSha256': native_meta['nativeHash'],
         'verifiedCategories': sorted(db01.NATIVE_CATEGORIES)},
        {'schema': extended_meta['manifest']['schema'],
         'manifestSha256': extended_meta['manifestHash'],
         'itemsSha256': extended_meta['hash'],
         'probeSha256': extended_meta['manifest']['probeSha256'],
         'fullSourceBytesShaVerifiedCategories': sorted(extended_meta['manifest']['categories']),
         'unresolvedCategories': [UNRESOLVED_CATEGORY],
         'reuseEvidence': reuse},
    ]
    if not force and (output / 'manifest.json').is_file():
        try:
            old = db01.read_json(output / 'manifest.json')
            if old.get('schema') == SCHEMA and old.get('status') == STATUS and old.get('sources') == sources and \
                    len(old.get('outputSha256', {})) == 2 and all(
                        db01.digest(output / name) == value for name,value in old['outputSha256'].items()
                    ):
                return {'status':'unchanged','definitions':old['count'],
                        'fullyLocalizedEight':old['verifiedCurrentLocalization']['currentEightLocaleNamedDefinitions']}
        except (OSError, ValueError, KeyError, TypeError):
            pass
    records = validate_rows(native, extra, native_meta['sourceHashes'])
    actual_names = {locale:sum(bool(row['names'][locale]) for row in records)
                    for locale in db01.LOCALES}
    require(actual_names == provenance['currentExactNamesByLocale'],
            'CURRENT_NAME_COUNT_CONFLICT')
    count = Counter(row['nativeCategory'] for row in records)
    require(len(count) == 37 and UNRESOLVED_CATEGORY not in count,
            'UNEXPECTED_NATIVE_CATEGORY_COVERAGE')
    output.mkdir(parents=True, exist_ok=True)
    data_path = output / 'items.jsonl'
    db01.save_jsonl(data_path, records)
    unresolved = {
        'schema':'wand.db01.recovered-unresolved@1',
        'gameVersion':SOURCE_VERSION,
        'verifiedSourceFiles':EXPECTED_MATCHED_SOURCE_COUNT,
        'knownSourceFiles':39,
        'notVerifiedSourceCategories':[UNRESOLVED_CATEGORY],
        'fullCurrentLocdbZipArchivesVerified':False,
        'verifiedFullCurrentLocaleMembers':EXPECTED_FULL_LOCALE_MEMBERS,
        'unknownNamesByLocale':{locale:len(records)-actual_names[locale]
                                for locale in db01.LOCALES},
        'historicalCollectionReferenceJoined':False,
        'unresolvedFields':['current classification', 'current DLC/world membership',
                            'stock', 'ownership', 'unclassified definition icon roles',
                            'full eight ZIP archives and names', 'current Condition definitions'],
        'notClaims':['all definitions are collectible', 'same IDs imply equal semantics',
                     'missing Condition definition means removed game feature'],
    }
    db01.save_json(output / 'unresolved.json', unresolved)
    manifest = {
        'schema':SCHEMA, 'status':STATUS,
        'createdUtc':datetime.now(timezone.utc).isoformat(),
        'platform':'Steam','gameVersion':SOURCE_VERSION,
        'count':len(records),
        'catalogDomains':{'collectionItem':EXPECTED_FOUR,'unclassifiedDefinition':EXPECTED_EXTRA},
        'byNativeCategory':dict(sorted(count.items())),
        'sources':sources,
        'sourceFilesFullyShaVerified':EXPECTED_MATCHED_SOURCE_COUNT,
        'sourceFilesTotal':39,
        'unresolvedCategories':[UNRESOLVED_CATEGORY],
        'fullCorpusParsed':False,
        'historicalReferenceJoined':False,
        'verifiedCurrentLocalization':provenance,
        'publicationStatus':'PRIVATE_ONLY_NO_PUBLIC_ITEMS',
        'outputSha256':{'items.jsonl':db01.digest(data_path),
                        'unresolved.json':db01.digest(output / 'unresolved.json')},
    }
    db01.save_json(output / 'manifest.json', manifest)
    return {'status':'built','definitions':len(records), 'currentItemDomain':EXPECTED_FOUR,
            'unclassified':EXPECTED_EXTRA,'fullyLocalizedEight':provenance['currentEightLocaleNamedDefinitions'],
            'namedAtLeastOneLocale':provenance['currentAnyLocaleNamedDefinitions']}


def main():
    parser=argparse.ArgumentParser(description='Build private SHA-evidence-backed v1.26.2 recovered DB-01 partial catalog')
    parser.add_argument('--native',required=True,type=Path)
    parser.add_argument('--extended',required=True,type=Path)
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--force',action='store_true')
    args=parser.parse_args()
    try:
        print(json.dumps(make(args.native,args.extended,args.out,args.force),sort_keys=True))
    except (OSError,ValueError,TypeError,KeyError,json.JSONDecodeError) as e:
        parser.exit(1, f'DB-01 private partial recovery failed: {e}\n')


if __name__=='__main__':main()
