"""Independent, fail-closed pre-release audit for PRIVATE DB-01 SQLite read shards.

Checks the entire exported read model against a local SQLite source, not just
against self-asserted manifest SHA strings. Does not publish or mutate inputs.
Python standard library only, supported by future DB-01 release versions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections import defaultdict
from pathlib import Path

SCHEMA = 'wand.db01.private-shards@1'
STORE_SCHEMA = 'wand.db01.sqlite@1'
LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')
NATIVE = {'ActivityItem', 'Furniture', 'Clothing', 'Trimming'}
HISTORICAL = 'historical_prefix_crc_correlated_unverified_current'
NONDISPLAY = re.compile(r'^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}', re.I)
HEX_SHA = re.compile(r'[0-9a-f]{64}\Z')
CATEGORY = re.compile(r'[A-Za-z][A-Za-z0-9]*\Z')
BUCKETS = 256


def require(value: object, reason: str) -> None:
    if not value:
        raise ValueError('DB01_AUDIT_' + reason)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def canonical_bytes(rows: list) -> bytes:
    return (json.dumps(rows, sort_keys=True, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def no_duplicate_json(source: bytes) -> dict:
    def checked(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'DUPLICATE_MANIFEST_KEY')
            result[key] = value
        return result
    try:
        value = json.loads(source, object_pairs_hook=checked)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError('DB01_AUDIT_INVALID_MANIFEST_JSON') from exc
    require(type(value) is dict, 'MANIFEST_TYPE')
    return value


def check_report_path(path: Path, sqlite_path: Path, shards_path: Path) -> None:
    require(path != sqlite_path and path != shards_path and
            shards_path not in path.parents and sqlite_path not in path.parents,
            'REPORT_OVERLAP_OR_OVERWRITE')
    for parent in (path.parent, *path.parent.parents):
        require(not (parent / '.git').exists(), 'REPORT_INSIDE_GIT')
        require(not ((parent / 'package.json').is_file() and (parent / 'src').is_dir()), 'REPORT_INSIDE_APP')


def audit(sqlite_path: Path, shards_path: Path, *,
          expected_source_items_sha256: str | None = None,
          expected_sqlite_sha256: str | None = None,
          expected_manifest_sha256: str | None = None) -> dict:
    """Validate all files and full relational semantics; returns private audit report.

    Pass the trusted source-catalog SHA from the original private compiler to
    prevent auditing an otherwise internally consistent but wrong snapshot.
    """
    sqlite_path, shards_path = sqlite_path.resolve(), shards_path.resolve()
    require(sqlite_path.is_file() and sqlite_path.suffix in {'.sqlite', '.db'} and
            shards_path.is_dir(), 'INPUT_PATH')
    manifest_path = shards_path / 'manifest.json'
    require(manifest_path.is_file() and not manifest_path.is_symlink(), 'MANIFEST_MISSING')
    sqlite_sha = digest(sqlite_path)
    manifest_sha = digest(manifest_path)
    for label, expected, actual in (
        ('SQLITE_SHA_MISMATCH', expected_sqlite_sha256, sqlite_sha),
        ('MANIFEST_SHA_MISMATCH', expected_manifest_sha256, manifest_sha),
    ):
        if expected is not None:
            require(isinstance(expected, str) and HEX_SHA.fullmatch(expected) and expected == actual, label)
    manifest = no_duplicate_json(manifest_path.read_bytes())
    require(manifest.get('schema') == SCHEMA and manifest.get('privateOnly') is True and
            manifest.get('publicationAuthorized') is False and
            manifest.get('bucketCount') == BUCKETS, 'PRIVATE_SCHEMA')
    require(manifest.get('platform') == 'Steam' and
            isinstance(manifest.get('gameVersion'), str) and
            re.fullmatch(r'\d+\.\d+\.\d+', manifest['gameVersion']), 'TARGET_VERSION')
    require(manifest.get('locales') == list(LOCALES), 'LOCALE_SET')
    require(type(manifest.get('historicalCandidatesIncluded')) is bool, 'HISTORY_MODE')
    require(type(manifest.get('fullCorpusParsed')) is bool, 'CORPUS_STATUS')
    files = manifest.get('files')
    require(type(files) is dict, 'FILE_LEDGER')

    # Open the source read-only; journal/lock tricks cannot change live inputs.
    uri = f'file:{sqlite_path.as_posix()}?mode=ro&immutable=1'
    con = sqlite3.connect(uri, uri=True)
    try:
        require(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'SOURCE_CORRUPT')
        require(con.execute('PRAGMA foreign_key_check').fetchall() == [], 'SOURCE_FOREIGN_KEYS')
        row = con.execute('''SELECT store_schema,source_schema,platform,game_version,
            manifest_sha256,native_source_manifest_sha256,items_sha256,
            definition_count,source_files_verified,source_files_total,
            full_corpus_parsed,publication_authorized,historical_manifest_sha256,
            historical_items_sha256 FROM catalog WHERE id = 1''').fetchone()
        require(row is not None and row[0] == STORE_SCHEMA and row[11] == 0, 'PRIVATE_SQLITE')
        required_fields = {
            'platform': row[2], 'gameVersion': row[3],
            'sourceManifestSha256': row[4], 'nativeSourceManifestSha256': row[5],
            'sourceItemsSha256': row[6], 'definitions': row[7],
            'sourceFilesVerified': row[8], 'sourceFilesTotal': row[9],
            'fullCorpusParsed': bool(row[10]),
            'historicalManifestSha256': row[12] if manifest['historicalCandidatesIncluded'] else None,
        }
        for name, expected in required_fields.items():
            require(manifest.get(name) == expected, 'SOURCE_LEDGER_' + name.upper())
        if expected_source_items_sha256 is not None:
            require(isinstance(expected_source_items_sha256, str) and
                    HEX_SHA.fullmatch(expected_source_items_sha256) and
                    row[6] == expected_source_items_sha256, 'SOURCE_ITEMS_SHA_MISMATCH')
        require(isinstance(row[7], int) and row[7] > 0 and
                isinstance(row[8], int) and isinstance(row[9], int) and
                0 <= row[8] <= row[9], 'COVERAGE')
        require(con.execute('SELECT count(*) FROM definition').fetchone()[0] == row[7],
                'DEFINITION_COUNT')
        cats: dict[str, list[dict]] = defaultdict(list)
        buckets: list[list[dict]] = [[] for _ in range(BUCKETS)]
        by_id: dict[int, dict] = {}
        original_names: dict[int, dict] = {}
        category_sources: dict[str, str] = {}
        for item_id, category, domain, key, sha, record_json in con.execute('''
            SELECT item_id,native_category,catalog_domain,localization_key,
                   source_sha256,record_json FROM definition ORDER BY item_id'''):
            require(type(item_id) is int and item_id > 0 and item_id not in by_id and
                    isinstance(category, str) and CATEGORY.fullmatch(category) and
                    isinstance(sha, str) and HEX_SHA.fullmatch(sha), 'DEFINITION_ID_CATEGORY_SOURCE')
            require(domain == ('item' if category in NATIVE else 'definition_unclassified'),
                    'UNVERIFIED_DOMAIN')
            raw = json.loads(record_json)
            icon = raw['image']['iconGuid']
            source_ref = raw.get('source', {})
            require(raw.get('itemId') == item_id and raw.get('nativeCategory') == category and
                    raw.get('catalogDomain') == domain and source_ref.get('sha256') == sha and
                    source_ref.get('platform') == row[2] and source_ref.get('gameVersion') == row[3] and
                    source_ref.get('file') == f'ddv_Data/StreamingAssets/itemlist/{category}.json' and
                    raw.get('localizationKey') == key and
                    raw.get('verification', {}).get('currentVersionObserved') is True and
                    raw.get('verification', {}).get('classification') == 'unresolved',
                    'SQLITE_RECORD_MISMATCH')
            names = raw.get('names')
            require(isinstance(names, dict) and set(names) == set(LOCALES) and
                    isinstance(raw.get('verification', {}).get('names'), dict), 'CURRENT_NAMES_SHAPE')
            original_names[item_id] = names
            previous_sha = category_sources.setdefault(category, sha)
            require(previous_sha == sha, 'CATEGORY_SOURCE_SHA_MISMATCH')
            require((isinstance(icon, str) and re.fullmatch(r'guid:[0-9a-f]{32}', icon))
                    if domain == 'item' else icon is None, 'ICON_EVIDENCE')
            record = {'itemId':item_id, 'nativeCategory':category,
                      'catalogDomain':domain, 'verifiedIconGuid':icon,
                      'localizationKey':key, 'sourceSha256':sha,
                      'names':{loc:None for loc in LOCALES}}
            by_id[item_id] = record
            cats[category].append(record)
            buckets[item_id % BUCKETS].append(record)
        require(manifest.get('categories') == sorted(cats), 'CATEGORY_COVERAGE')
        require(manifest.get('currentNativeItemDefinitions') ==
                sum(r['catalogDomain'] == 'item' for r in by_id.values()), 'NATIVE_COUNT')
        locale_rows = {loc: [] for loc in LOCALES}
        for item_id, locale, value, evidence in con.execute('''
            SELECT item_id,locale,value,evidence FROM exact_name ORDER BY item_id,locale'''):
            require(item_id in by_id and locale in locale_rows and
                    isinstance(value, str) and value.strip() and not NONDISPLAY.match(value) and
                    evidence == 'exact_locdb_join' and original_names[item_id][locale] == value,
                    'EXACT_NAME_SOURCE')
            by_id[item_id]['names'][locale] = value
            locale_rows[locale].append([item_id, value])
        # No official name may exist only in the raw record or only in the
        # SQLite exact-name index; the source evidence must agree both ways.
        for item_id, names in original_names.items():
            for locale in LOCALES:
                require(names[locale] == by_id[item_id]['names'][locale], 'CURRENT_NAMES_INDEX_MISMATCH')
        history = [[] for _ in range(BUCKETS)]
        history_count = con.execute('SELECT count(*) FROM historical_name_candidate').fetchone()[0]
        if manifest['historicalCandidatesIncluded']:
            require(isinstance(row[12], str) and HEX_SHA.fullmatch(row[12]) and
                    isinstance(row[13], str) and HEX_SHA.fullmatch(row[13]), 'HISTORY_SOURCE')
            for item_id, locale, value, baseline, evidence in con.execute('''
                SELECT item_id,locale,value,baseline_game_version,evidence
                FROM historical_name_candidate ORDER BY item_id,locale'''):
                require(item_id in by_id and locale in locale_rows and
                        isinstance(value, str) and value.strip() and not NONDISPLAY.match(value) and
                        isinstance(baseline, str) and baseline != row[3] and
                        evidence == HISTORICAL, 'HISTORICAL_EVIDENCE')
                exact = by_id[item_id]['names'][locale]
                require(exact is None or exact == value, 'HISTORICAL_EXACT_CONFLICT')
                history[item_id % BUCKETS].append([item_id,locale,value,baseline])
        else:
            # Excluding history is an explicit generation option; DB may retain it.
            require(manifest.get('historicalManifestSha256') is None, 'UNAUTHORIZED_HISTORY')

        expected: dict[str, list] = {}
        expected.update({f'id/{i:02x}.json':records for i, records in enumerate(buckets)})
        expected.update({f'category/{cat}.json':records for cat, records in cats.items()})
        expected.update({f'locale/{loc}.json':records for loc, records in locale_rows.items()})
        if manifest['historicalCandidatesIncluded']:
            expected.update({f'historical/{i:02x}.json':records for i, records in enumerate(history)})
        require(set(files) == set(expected), 'FILE_COVERAGE')
        # Reject untracked files, including a stale old-version shard in the dir.
        physical = {p.relative_to(shards_path).as_posix() for p in shards_path.rglob('*') if p.is_file()}
        require(physical == set(expected) | {'manifest.json'}, 'UNEXPECTED_OR_MISSING_FILES')
        for path, records in expected.items():
            file_path = shards_path / path
            require(file_path.is_file() and not file_path.is_symlink() and
                    shards_path in file_path.resolve().parents, 'FILE_MISSING_OR_SYMLINK')
            metadata = files[path]
            data = canonical_bytes(records)
            require(type(metadata) is dict and metadata.get('count') == len(records) and
                    metadata.get('bytes') == len(data) and
                    metadata.get('sha256') == hashlib.sha256(data).hexdigest(),
                    'FILE_LEDGER_MISMATCH')
            require(file_path.read_bytes() == data, 'FILE_CONTENT_MISMATCH')
        require(sqlite_sha == digest(sqlite_path) and manifest_sha == digest(manifest_path),
                'INPUT_CHANGED_DURING_AUDIT')
        return {'schema':'wand.db01.private-shards-audit@1','status':'PASS',
                'publicationAuthorized':False,'platform':row[2], 'gameVersion':row[3],
                'sourceManifestSha256':row[4], 'sourceItemsSha256':row[6],
                'sqliteSha256':sqlite_sha,'shardsManifestSha256':manifest_sha,
                'definitions':len(by_id),'currentNativeItemDefinitions':manifest['currentNativeItemDefinitions'],
                'exactNames':sum(map(len,locale_rows.values())),
                'historicalEntries':sum(map(len,history)),
                'allShardFilesVerified':len(expected), 'historicalIncluded':manifest['historicalCandidatesIncluded'],
                'sourceCoverageComplete':bool(row[10])}
    finally:
        con.close()


def save_report(report: dict, output: Path, *, sqlite_path: Path, shards_path: Path) -> None:
    output = output.resolve()
    check_report_path(output, sqlite_path.resolve(), shards_path.resolve())
    output.parent.mkdir(parents=True, exist_ok=True)
    expected_bytes = canonical_bytes(report)
    if output.exists():
        require(output.is_file() and not output.is_symlink() and
                output.read_bytes() == expected_bytes, 'REPORT_STALE_OR_CONFLICT')
        return
    fd, tmp = tempfile.mkstemp(dir=output.parent, prefix='.db01-audit-', suffix='.json')
    try:
        with os.fdopen(fd,'wb') as file:
            file.write(expected_bytes)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(tmp,0o600)
        require(not output.exists(), 'REPORT_OVERLAP_OR_OVERWRITE')
        os.link(tmp,output)
    finally:
        try: os.unlink(tmp)
        except FileNotFoundError: pass


def main() -> None:
    parser = argparse.ArgumentParser(description='Audit ALL owner-private DB-01 read assets against original SQLite')
    parser.add_argument('--sqlite', type=Path, required=True)
    parser.add_argument('--shards', type=Path, required=True)
    parser.add_argument('--expected-source-items-sha256')
    parser.add_argument('--expected-sqlite-sha256')
    parser.add_argument('--expected-manifest-sha256')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = audit(args.sqlite,args.shards,
                   expected_source_items_sha256=args.expected_source_items_sha256,
                   expected_sqlite_sha256=args.expected_sqlite_sha256,
                   expected_manifest_sha256=args.expected_manifest_sha256)
    if args.report:
        save_report(result,args.report,sqlite_path=args.sqlite,shards_path=args.shards)
    print(json.dumps(result, sort_keys=True, ensure_ascii=False))


if __name__ == '__main__':
    main()