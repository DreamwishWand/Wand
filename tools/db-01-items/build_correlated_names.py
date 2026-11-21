"""Private historical name correlations; never certify current LocDB member SHA-256.

Requires independently hash-verified current DB-01 records + current-format probe
and pinned Steam 1.26.1 full ZIP original files. The 1.26.2 probe captured ZIP
member size, CRC32 and up to 8192 bytes, but not all current member bytes.
Their agreement with the 1.26.1 full member is corroboration, not equality proof.
"""
import argparse
import base64
import binascii
import hashlib
import json
import re
import sys
import zipfile
import zlib
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-01-items'))
import localize1262
import compare_versions

SCHEMA = 'wand.db01.historical-locale-correlations@1'
SOURCE_SCHEMA = 'wand.src01.format-probe@1'
BASELINE_FULLVERSION_SHA = 'a59c942d093c60740a447efb3bede638d3a3ee60c00ca01f898500413d670401'
TARGET_PROBE_SHA = '07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a'
BASELINE_ARCHIVES_SHA = {
    'en-US':'eb859c285f4da61bc62f44ebcda223b3e5e8013618d6d4c28cebef81555c13f3',
    'fr':'e574622e5fe494cab620a2450d8d31332ceedd4ee9e11a918357bec0e528de46',
    'it':'f112f499e4684d6c0805cea8f07e3ca04e06d9330f316e873326c9811ef4abe8',
    'de':'546da55e0acbf532793aa0655986120756605e164de00bc38beb1a92a7baee11',
    'es':'d4d4d0a84411af6270d785ede3380796fe2e5d0f2e6fc8f65e98b604a579b738',
    'ja':'8e6e88a7c1a284bc0141254569ecf84a9becc7480f5d68825c22b66874cd0dda',
    'zh-CN':'55ecff4730cb2eff2619872d5e7abd8478cefa83696422b862072360f63ce600',
    'pt-BR':'e450091d75bc8a2356fb933cef705c2c379587ab609c653bb056d6cc3c0fddb8',
}
NATIVE = frozenset(('ActivityItem', 'Furniture', 'Clothing', 'Trimming'))
NONDISPLAY = re.compile(r'^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}', re.I)
SHA = re.compile(r'^[a-f0-9]{64}$')
LOCALES = tuple(localize1262.LOCALES)
MAX_ZIP_SIZE = 32 * 1024 * 1024
MEMBERS_PER_LOCALE = 15
EXPECTED_MATCHED_MEMBERS = len(LOCALES) * MEMBERS_PER_LOCALE


def fail_unless(ok, message):
    if not ok:
        raise ValueError('DB01_CORRELATION_' + message)


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def digest_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as src:
        for chunk in iter(lambda: src.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def stable_json(path, data):
    compare_versions.write_json(path, data)


def clean_name(value):
    if not isinstance(value, str):
        return None
    result = localize1262.clean_display_name(value)
    if not result or NONDISPLAY.match(result):
        return None
    return result


def source_key(row):
    category = row['nativeCategory']
    if category in NATIVE:
        raw = row.get('nativeNameField')
        fail_unless(isinstance(raw, str) and raw and len(raw) <= 1024,
                    'MISSING_NATIVE_NAME_KEY')
        return raw + '_DisplayName'
    raw = row.get('localizationKey')
    if raw is None:
        return None
    prefix = category + '.'
    fail_unless(isinstance(raw, str) and raw.startswith(prefix) and
                raw.endswith('_DisplayName') and len(raw) <= 4096,
                'INVALID_EXTENDED_NAME_KEY')
    return raw[len(prefix):]


def observe_member(archive, locale, category, spec, sample_bytes):
    """Check old complete ZIP member vs current limited probe, not full SHA equality."""
    file = f'{category}.locbin'
    try:
        info = archive.getinfo(file)
    except KeyError as exc:
        raise ValueError('DB01_CORRELATION_MISSING_BASELINE_MEMBER:' + file) from exc
    fail_unless(0 < info.file_size <= localize1262.MAX_LOC_FILE_BYTES,
                'BASELINE_MEMBER_SIZE')
    fail_unless(isinstance(spec, dict) and type(spec.get('bytes')) is int and
                0 < spec['bytes'] <= localize1262.MAX_LOC_FILE_BYTES and
                isinstance(spec.get('crc32'), str) and
                re.fullmatch('[a-fA-F0-9]{8}', spec['crc32']) is not None,
                'INVALID_CURRENT_MEMBER_METADATA')
    try:
        head = base64.b64decode(spec.get('headBase64', ''), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError('DB01_CORRELATION_BAD_MEMBER_PREFIX') from exc
    fail_unless(len(head) == min(sample_bytes, spec['bytes']),
                'BAD_CURRENT_MEMBER_PREFIX_SIZE')
    old_data = archive.read(info)  # Python zipfile internally validates the old ZIP CRC.
    fail_unless(len(old_data) == spec['bytes'] and
                f'{zlib.crc32(old_data)&0xffffffff:08x}' == spec['crc32'].lower() and
                old_data[:len(head)] == head and
                len(old_data) == info.file_size and
                (zlib.crc32(old_data)&0xffffffff) == info.CRC,
                f'MEMBER_NOT_CORRELATED:{locale}:{category}')
    mapping = localize1262.decode_locbin(old_data)
    return mapping, {
        'baselineFullMemberSha256': sha_bytes(old_data),
        'currentMemberBytesFromProbe': spec['bytes'],
        'currentMemberCrc32FromProbe': spec['crc32'].lower(),
        'currentMemberPrefixSha256': sha_bytes(head),
        'currentMemberPrefixBytes': len(head),
        'currentFullMemberSha256Verified': len(head) == len(old_data),
        'comparison': ('full_current_member_bytes_observed' if len(head)==len(old_data)
                       else 'full_baseline_member_vs_current_size_crc32_prefix'),
        'keyCountFromBaseline': len(mapping),
    }


def correlate(catalog, baseline, probe_path, output):
    catalog, baseline, probe_path, output = map(lambda p: Path(p).resolve(),
                                               (catalog, baseline, probe_path, output))
    for source in (catalog, baseline, probe_path):
        fail_unless(output != source and source not in output.parents and
                    output not in source.parents, 'OUTPUT_INPUT_OVERLAP')
    fail_unless(not output.exists() or output.is_dir(), 'INVALID_OUTPUT')
    current = compare_versions.load_private_version(catalog)
    manifest = current['manifest']
    fail_unless(manifest['schema'] == compare_versions.RECOVERED and
                manifest['gameVersion'] == '1.26.2' and manifest['count'] == 33627 and
                manifest['unresolvedCategories'] == ['Condition'],
                'WRONG_CURRENT_CATALOG')
    version_path = baseline / 'FullVersion.txt'
    fail_unless(version_path.is_file() and digest_file(version_path) == BASELINE_FULLVERSION_SHA and
                '-v1.26.1-' in version_path.read_text(encoding='utf-8'),
                'WRONG_BASELINE_VERSION')
    fail_unless(probe_path.is_file() and digest_file(probe_path) == TARGET_PROBE_SHA,
                'WRONG_TARGET_PROBE')
    probe = json.loads(probe_path.read_text(encoding='utf-8-sig'))
    fail_unless(probe.get('schema') == SOURCE_SCHEMA and probe.get('platform') == 'Steam' and
                probe.get('gameVersion') == '1.26.2' and probe.get('sampleBytesPerEntry') == 8192,
                'INVALID_TARGET_PROBE_CONTRACT')
    definitions = current['items']
    seen_categories = set()
    tables = {}
    evidence = {}
    for locale, suffix in localize1262.LOCALES.items():
        zpath = baseline / 'ddv_Data' / 'StreamingAssets' / 'Localization' / f'LocDB_{suffix}.zip'
        fail_unless(zpath.is_file() and not zpath.is_symlink() and
                    zpath.stat().st_size <= MAX_ZIP_SIZE and
                    digest_file(zpath) == BASELINE_ARCHIVES_SHA[suffix],
                    'BASELINE_ZIP_HASH_MISMATCH:' + locale)
        entry = probe.get('localization', {}).get(locale, {})
        current_sha = entry.get('sha256')
        fail_unless(entry.get('source') == f'ddv_Data/StreamingAssets/Localization/LocDB_{suffix}.zip' and
                    isinstance(current_sha, str) and SHA.fullmatch(current_sha) and
                    current_sha != BASELINE_ARCHIVES_SHA[suffix],
                    'CURRENT_ZIP_TARGET_PROVENANCE_MISMATCH:' + locale)
        members = entry.get('members')
        fail_unless(isinstance(members, dict) and len(members) == MEMBERS_PER_LOCALE,
                    'CURRENT_MEMBER_SET_MISMATCH:' + locale)
        with zipfile.ZipFile(zpath) as archive:
            entries = {}
            by_category = {}
            for category, metadata in sorted(members.items()):
                fail_unless(category in manifest['byNativeCategory'] and
                            re.fullmatch('[A-Za-z][A-Za-z0-9]*', category) is not None,
                            'UNEXPECTED_LOCALIZATION_CATEGORY:' + category)
                table, proof = observe_member(archive, locale, category, metadata, 8192)
                by_category[category] = table
                entries[category] = proof
                seen_categories.add(category)
            tables[locale] = by_category
            evidence[locale] = {'baselineZipSha256': BASELINE_ARCHIVES_SHA[suffix],
                                'targetZipSha256FromProbe': current_sha,
                                'members': entries}
    fail_unless(all(len(e['members']) == MEMBERS_PER_LOCALE for e in evidence.values()) and
                len(seen_categories) == MEMBERS_PER_LOCALE,
                'INCOMPLETE_MEMBER_COVERAGE')
    candidates = []
    matched_current = 0
    named_by_category = Counter()
    names_by_locale = Counter()
    count_confirmed = 0
    for item_id,row in sorted(definitions.items()):
        category = row['nativeCategory']
        if category not in seen_categories:
            continue
        key = source_key(row)
        if key is None:
            continue
        names = {locale: clean_name(tables[locale][category].get(key)) for locale in LOCALES}
        if not any(names.values()):
            continue
        confirmed=[]
        for locale, value in names.items():
            curr = row['names'][locale]
            if curr is not None:
                fail_unless(value == curr, 'CURRENT_OFFICIAL_NAME_CONFLICT:'+str(item_id)+':'+locale)
                matched_current += 1
                confirmed.append(locale)
            if value is not None:
                names_by_locale[locale] += 1
        if confirmed:
            count_confirmed += 1
        named_by_category[category] += 1
        candidates.append({
            'itemId':item_id, 'nativeCategory':category,
            'localizationKey':key, 'baselineGameVersion':'1.26.1',
            'targetGameVersion':'1.26.2',
            'namesHistorical':names,
            'currentExactSourceVerifiedLocales':confirmed,
            'otherLocaleEvidence':'previous_version_full_source_correlated_with_current_size_crc32_prefix_only',
            'mergeIntoCanonicalPermitted':False,
        })
    output.mkdir(parents=True,exist_ok=True)
    path=output/'historical-locale-candidates.jsonl'
    # Deterministic output; manifest written last once the data and report are complete.
    with path.open('w',encoding='utf-8',newline='\n') as f:
        for item in candidates:
            f.write(json.dumps(item,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n')
    report={
        'schema':'wand.db01.historical-locale-correlation-report@1',
        'candidateDefinitions':len(candidates),
        'allEightHistoricalNames':sum(all(row['namesHistorical'].values()) for row in candidates),
        'fullMemberTargetShaVerified':sum(
            m['currentFullMemberSha256Verified'] for e in evidence.values()
            for m in e['members'].values()),
        'membersCorrelatedBySizeCrcAndPrefix':EXPECTED_MATCHED_MEMBERS,
        'officialCurrentValueComparisons':matched_current,
        'officialCurrentValueConflicts':0,
        'definitionsWithOfficialCurrentComparison':count_confirmed,
        'candidateNamesByLocale':dict(sorted(names_by_locale.items())),
        'candidateDefinitionsByCategory':dict(sorted(named_by_category.items())),
        'notClaims':['target 1.26.2 entire member SHA-256 was verified',
                     'current-version official names where target full member unavailable',
                     'all definitions are collectibles','public publishing approved'],
    }
    stable_json(output/'report.json', report)
    generated={name:digest_file(output/name)
               for name in ('historical-locale-candidates.jsonl','report.json')}
    proof={
        'schema':SCHEMA,'status':'PRIVATE_HISTORICAL_CANDIDATE_NOT_CURRENT_OFFICIAL',
        'publicationStatus':'PRIVATE_ONLY','mergeIntoCanonicalPermitted':False,
        'sourceCatalog':{'schema':manifest['schema'],'platform':'Steam',
                         'gameVersion':manifest['gameVersion'],
                         'manifestSha256':current['manifestSha256'],
                         'itemsSha256':current['dataSha256'],
                         'items':manifest['count']},
        'historicalGameVersion':'1.26.1',
        'historicalFullVersionSha256':BASELINE_FULLVERSION_SHA,
        'targetGameVersion':'1.26.2',
        'targetProbeSha256':TARGET_PROBE_SHA,
        'locales':list(LOCALES),'memberComparisons':evidence,
        'counts':{k:report[k] for k in ('candidateDefinitions','allEightHistoricalNames',
                                        'membersCorrelatedBySizeCrcAndPrefix',
                                        'officialCurrentValueComparisons',
                                        'definitionsWithOfficialCurrentComparison')},
        'outputSha256':generated,
        'notClaims':report['notClaims'],
    }
    stable_json(output/'manifest.json',proof)
    return {'candidateDefinitions':len(candidates),
            'allEightHistoricalNames':report['allEightHistoricalNames'],
            'currentOfficialValuesAgree':matched_current,
            'membersCorrelated':EXPECTED_MATCHED_MEMBERS}


def main():
    arg=argparse.ArgumentParser(description='Private old-version locale correlations, not current official names')
    arg.add_argument('--catalog',required=True,type=Path)
    arg.add_argument('--historical-game',required=True,type=Path)
    arg.add_argument('--target-probe',required=True,type=Path)
    arg.add_argument('--out',required=True,type=Path)
    opts=arg.parse_args()
    try:
        print(json.dumps(correlate(opts.catalog, opts.historical_game,
                                   opts.target_probe, opts.out),sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError, UnicodeError, zipfile.BadZipFile) as error:
        arg.exit(1,'DB-01 historical name correlation failed: '+str(error)+'\n')

if __name__=='__main__':
    main()