"""Build the final private SQLite read model from SHA-verified DB-01 source JSONL.

The original binary/source manifests remain authoritative evidence; SQLite is the
versioned query store. Never publish the generated DB or export without consent.
Python stdlib only. Atomic new-file creation; source originals are never edited.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections import Counter
from pathlib import Path

SCHEMA = 'wand.db01.sqlite@1'
MANIFESTS = {'wand.db01.partial-manifest@3', 'wand.db01.items@1'}
LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')
FOUR_CLASSES = {'ActivityItem', 'Furniture', 'Clothing', 'Trimming'}
HASH = re.compile(r'^[0-9a-f]{64}$')
FILE = re.compile(r'^ddv_Data/StreamingAssets/itemlist/([A-Za-z][A-Za-z0-9]*)\.json$')
NONDISPLAY = re.compile(r'^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}', re.I)
HISTORY_SCHEMA = 'wand.db01.historical-locale-correlations@1'
HISTORY_STATUS = 'historical_prefix_crc_correlated_unverified_current'
SQL = '''
PRAGMA foreign_keys = ON;
CREATE TABLE catalog (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 store_schema TEXT NOT NULL CHECK (store_schema = 'wand.db01.sqlite@1'),
 source_schema TEXT NOT NULL,
 platform TEXT NOT NULL,
 game_version TEXT NOT NULL,
 manifest_sha256 TEXT NOT NULL,
 native_source_manifest_sha256 TEXT NOT NULL,
 items_sha256 TEXT NOT NULL,
 definition_count INTEGER NOT NULL,
 source_files_verified INTEGER NOT NULL,
 source_files_total INTEGER NOT NULL,
 full_corpus_parsed INTEGER NOT NULL CHECK (full_corpus_parsed IN (0,1)),
 publication_authorized INTEGER NOT NULL DEFAULT 0 CHECK (publication_authorized = 0),
 historical_manifest_sha256 TEXT,
 historical_items_sha256 TEXT
);
CREATE TABLE definition (
 item_id INTEGER PRIMARY KEY CHECK (item_id > 0),
 native_category TEXT NOT NULL,
 catalog_domain TEXT NOT NULL CHECK (catalog_domain IN ('item','definition_unclassified')),
 localization_key TEXT,
 source_file TEXT NOT NULL,
 source_sha256 TEXT NOT NULL,
 record_json TEXT NOT NULL
);
CREATE INDEX definition_category ON definition(native_category, item_id);
CREATE INDEX definition_source ON definition(source_sha256);
CREATE TABLE exact_name (
 item_id INTEGER NOT NULL REFERENCES definition(item_id),
 locale TEXT NOT NULL,
 value TEXT NOT NULL,
 evidence TEXT NOT NULL CHECK (evidence = 'exact_locdb_join'),
 PRIMARY KEY(item_id, locale)
) WITHOUT ROWID;
CREATE INDEX exact_locale_value ON exact_name(locale, value COLLATE NOCASE, item_id);
CREATE TABLE historical_name_candidate (
 item_id INTEGER NOT NULL REFERENCES definition(item_id),
 locale TEXT NOT NULL,
 value TEXT NOT NULL,
 baseline_game_version TEXT NOT NULL,
 evidence TEXT NOT NULL CHECK (evidence = 'historical_prefix_crc_correlated_unverified_current'),
 PRIMARY KEY(item_id, locale)
) WITHOUT ROWID;
CREATE INDEX historical_locale_value ON historical_name_candidate(locale, value COLLATE NOCASE, item_id);
'''


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise ValueError('DB01_SQLITE_' + reason)


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path) -> tuple[dict, str]:
    raw = path.read_bytes()
    value = json.loads(raw)
    require(isinstance(value, dict), 'MANIFEST_NOT_OBJECT')
    return value, sha_bytes(raw)


def check_private_path(path: Path) -> None:
    # Reject publishing/working tree roots, including output nested under a repo.
    for ancestor in (path.parent, *path.parent.parents):
        if (ancestor / '.git').exists():
            raise ValueError('DB01_SQLITE_OUTPUT_INSIDE_GIT_CHECKOUT')
        if (ancestor / 'package.json').exists() and (ancestor / 'src').exists():
            raise ValueError('DB01_SQLITE_OUTPUT_INSIDE_APP_CHECKOUT')
    require(not path.exists(), 'REFUSE_OVERWRITE')


def validate_source(manifest: dict) -> dict:
    """Normalize production compiler manifests without asserting completeness.

    Recovered 1.26.2 requires exact 38/39 original-file proof. New releases
    use the canonical compiler and are never presumed complete on count alone.
    """
    require(manifest.get('schema') in MANIFESTS, 'UNKNOWN_SOURCE_SCHEMA')
    require(manifest.get('platform') == 'Steam' and
            isinstance(manifest.get('gameVersion'), str) and
            re.fullmatch(r'\d+\.\d+\.\d+', manifest['gameVersion']), 'BAD_VERSION')
    require(isinstance(manifest.get('byNativeCategory'), dict) and
            len(manifest['byNativeCategory']) > 0, 'CATEGORY_COUNTS')
    digest = manifest.get('outputSha256', {}).get('items.jsonl')
    require(isinstance(digest, str) and HASH.fullmatch(digest), 'ITEMS_SHA')
    m = dict(manifest)
    if m['schema'] == 'wand.db01.partial-manifest@3':
        require(m.get('publicationStatus') == 'PRIVATE_ONLY_NO_PUBLIC_ITEMS' and
                m.get('fullCorpusParsed') is False, 'NOT_PRIVATE')
        require(m.get('sourceFilesFullyShaVerified') == 38 and
                m.get('sourceFilesTotal') == 39 and
                m.get('unresolvedCategories') == ['Condition'], 'SOURCE_COVERAGE_MISMATCH')
        require(isinstance(m.get('count'), int) and m['count'] > 0, 'COUNT')
        sources = m.get('sources')
        require(isinstance(sources, list) and len(sources) == 2 and
                sources[0].get('schema') == 'wand.src01.steam-native@1' and
                sources[1].get('schema') == 'wand.src01.extended@1', 'SOURCE_CHAIN')
        for source in sources:
            require(HASH.fullmatch(source.get('manifestSha256', '')) and
                    HASH.fullmatch(source.get('itemsSha256', '')), 'UNVERIFIED_SOURCE_HASH')
        reuse = sources[1].get('reuseEvidence', {})
        require(reuse.get('schema') == 'wand.src01.identical-binary-reuse@1' and
                reuse.get('categoryFilesNotReusable') == ['Condition.json'] and
                reuse.get('currentTargetVersion') == m['gameVersion'] and
                len(reuse.get('sameFullBytesSha256Files', [])) == 38 and
                len(set(reuse['sameFullBytesSha256Files'])) == 38, 'REUSE_EVIDENCE')
        m['_nativeSourceManifestSha256'] = sources[0]['manifestSha256']
    else:
        # v1 canonical compiler is version-independent, but makes no claim
        # that missing categories, DLC, semantics or current locales are known.
        require(m.get('publicationStatus') == 'private_not_approved_for_public_catalog',
                'NOT_PRIVATE')
        inputs, counts = m.get('inputs'), m.get('counts')
        require(isinstance(inputs, dict) and
                isinstance(counts, dict) and
                HASH.fullmatch(inputs.get('nativeManifest', '')) and
                HASH.fullmatch(inputs.get('native', '')), 'CANONICAL_INPUTS')
        require(type(counts.get('currentDefinitions')) is int and
                counts['currentDefinitions'] > 0, 'COUNT')
        m['count'] = counts['currentDefinitions']
        m['sourceFilesFullyShaVerified'] = len(m['byNativeCategory'])
        # The number of source categories observed is *not* a claim of whole
        # game-file completeness. Caller must inspect own source coverage.
        m['sourceFilesTotal'] = len(m['byNativeCategory'])
        m['fullCorpusParsed'] = False
        m['_nativeSourceManifestSha256'] = inputs['nativeManifest']
    return m


def validate_record(row: dict, manifest: dict) -> tuple[int, list[tuple[str, str]]]:
    require(type(row) is dict, 'ROW_NOT_OBJECT')
    item_id = row.get('itemId')
    require(type(item_id) is int and 0 < item_id <= 9007199254740991, 'INVALID_ITEM_ID')
    cat = row.get('nativeCategory')
    src = row.get('source', {})
    match = FILE.fullmatch(src.get('file', ''))
    require(match is not None and cat == match.group(1), 'SOURCE_CATEGORY_MISMATCH')
    require(src.get('platform') == manifest['platform'] and
            src.get('gameVersion') == manifest['gameVersion'] and
            isinstance(src.get('sha256'), str) and HASH.fullmatch(src['sha256']), 'SOURCE_PROVENANCE')
    domain = 'item' if cat in FOUR_CLASSES else 'definition_unclassified'
    require(row.get('catalogDomain') == domain, 'UNVERIFIED_DOMAIN')
    v = row.get('verification', {})
    require(v.get('currentVersionObserved') is True and
            v.get('itemId') == 'native_frame_verified' and
            v.get('nativeCategory') == 'native_file_verified' and
            v.get('classification') == 'unresolved' and
            v.get('relationships') == 'unresolved', 'SOURCE_EVIDENCE')
    require(row.get('category') is None and row.get('worlds') is None and
            row.get('expansions') is None and row.get('adventurePacks') is None and
            (row.get('historicalReference') is None or
             (isinstance(row['historicalReference'], dict) and
              row['historicalReference'].get('source', {}).get('platform') == 'Nintendo Switch' and
              row['historicalReference'].get('source', {}).get('gameVersion') != manifest['gameVersion'])),
            'UNVERIFIED_TAXONOMY')
    image = row.get('image', {})
    require(type(image) is dict and image.get('mediaExtracted') is False, 'IMAGE_EVIDENCE')
    if domain == 'item':
        require(v.get('iconGuid') == 'native_wire_verified' and
                isinstance(image.get('iconGuid'), str) and
                re.fullmatch(r'guid:[0-9a-f]{32}', image['iconGuid']), 'UNVERIFIED_NATIVE_ICON')
    else:
        require(v.get('iconGuid') == 'unresolved' and image.get('iconGuid') is None,
                'UNVERIFIED_EXTENDED_ICON')
    names = row.get('names', {})
    statuses = v.get('names', {})
    require(isinstance(names, dict) and isinstance(statuses, dict) and
            set(names) == set(LOCALES) and set(statuses) == set(LOCALES), 'LOCALE_KEYS')
    exact = []
    for locale in LOCALES:
        value = names[locale]
        if value is None:
            require(statuses[locale] == 'unresolved', 'UNVERIFIED_NAME_STATUS')
        else:
            require(isinstance(value, str) and bool(value.strip()) and
                    not NONDISPLAY.match(value) and
                    statuses[locale] == 'exact_locdb_join', 'UNVERIFIED_NAME')
            exact.append((locale, value))
    return item_id, exact


def read_history(folder: Path, source_manifest: dict) -> tuple[dict, str, str, list[dict]]:
    history, mh = load_json(folder / 'manifest.json')
    require(history.get('schema') == HISTORY_SCHEMA and
            history.get('historicalGameVersion') != source_manifest['gameVersion'] and
            history.get('sourceCatalog', {}).get('itemsSha256') == source_manifest['outputSha256']['items.jsonl'] and
            history.get('sourceCatalog', {}).get('items') == source_manifest['count'], 'HISTORY_VERSION_OR_SOURCE')
    path = folder / 'historical-locale-candidates.jsonl'
    data = path.read_bytes()
    require(sha_bytes(data) == history.get('outputSha256', {}).get(path.name), 'HISTORY_HASH')
    require(len(data) < 96 * 1024 * 1024, 'HISTORY_TOO_LARGE')
    rows = [json.loads(line) for line in data.splitlines() if line]
    require(len(rows) == history.get('counts', {}).get('candidateDefinitions'), 'HISTORY_COUNT')
    return history, mh, sha_bytes(data), rows


def build(catalog_dir: Path, output: Path, history_dir: Path | None = None) -> dict:
    catalog_dir, output = catalog_dir.resolve(), output.resolve()
    require((catalog_dir / 'manifest.json').is_file() and
            (catalog_dir / 'items.jsonl').is_file(), 'SOURCE_FILES_MISSING')
    require(output != catalog_dir and catalog_dir not in output.parents, 'OUTPUT_SOURCE_OVERLAP')
    check_private_path(output)
    m, manifest_hash = load_json(catalog_dir / 'manifest.json')
    m = validate_source(m)
    items_file = catalog_dir / 'items.jsonl'
    items_bytes = items_file.read_bytes()
    require(sha_bytes(items_bytes) == m['outputSha256']['items.jsonl'], 'ITEMS_HASH_MISMATCH')
    require(len(items_bytes) < 128 * 1024 * 1024, 'SOURCE_TOO_LARGE')
    rows = [json.loads(line) for line in items_bytes.splitlines() if line]
    require(len(rows) == m['count'], 'ITEMS_COUNT')
    if history_dir:
        h, history_manifest_hash, history_hash, history_rows = read_history(history_dir.resolve(), m)
    else:
        h = history_manifest_hash = history_hash = None
        history_rows = []
    counts: Counter[str] = Counter()
    loc_count: Counter[str] = Counter()
    seen: set[int] = set()
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.db01-tmp-', suffix='.sqlite', dir=output.parent)
    os.close(fd)
    try:
        con = sqlite3.connect(tmp)
        try:
            con.executescript(SQL)
            con.execute('PRAGMA user_version = 1')
            con.execute('BEGIN IMMEDIATE')
            con.execute('INSERT INTO catalog (id,store_schema,source_schema,platform,game_version,manifest_sha256,native_source_manifest_sha256,items_sha256,definition_count,source_files_verified,source_files_total,full_corpus_parsed,publication_authorized,historical_manifest_sha256,historical_items_sha256) VALUES (1,?,?,?,?,?,?,?,?,?,?,0,0,?,?)',
                (SCHEMA, m['schema'], m['platform'], m['gameVersion'], manifest_hash,
                m['_nativeSourceManifestSha256'], m['outputSha256']['items.jsonl'], m['count'],
                m['sourceFilesFullyShaVerified'], m['sourceFilesTotal'],
                history_manifest_hash, history_hash))
            for row in rows:
                item_id, exact = validate_record(row, m)
                require(item_id not in seen, 'DUPLICATE_ID')
                seen.add(item_id)
                cat = row['nativeCategory']
                counts[cat] += 1
                source = row['source']
                con.execute('INSERT INTO definition VALUES(?,?,?,?,?,?,?)',
                    (item_id, cat, row['catalogDomain'], row.get('localizationKey'),
                     source['file'], source['sha256'], json.dumps(row, sort_keys=True, separators=(',', ':'), ensure_ascii=False)))
                for locale, value in exact:
                    con.execute('INSERT INTO exact_name VALUES(?,?,?,?)', (item_id, locale, value, 'exact_locdb_join'))
                    loc_count[locale] += 1
            require(dict(sorted(counts.items())) == m['byNativeCategory'], 'CATEGORY_COUNTS_CONFLICT')
            actual_locale = m.get('verifiedCurrentLocalization', {}).get('currentExactNamesByLocale')
            if actual_locale is not None:
                require(dict(loc_count) == {k:v for k,v in actual_locale.items() if v}, 'LOCALE_COUNTS_CONFLICT')
            used_history = set()
            for candidate in history_rows:
                item_id = candidate.get('itemId')
                require(type(item_id) is int and item_id in seen and item_id not in used_history, 'HISTORY_ID')
                used_history.add(item_id)
                require(candidate.get('targetGameVersion') == m['gameVersion'] and
                        candidate.get('baselineGameVersion') == h['historicalGameVersion'] and
                        candidate.get('mergeIntoCanonicalPermitted') is False, 'HISTORY_NOT_CANDIDATE')
                source_row = json.loads(con.execute('SELECT record_json FROM definition WHERE item_id=?', (item_id,)).fetchone()[0])
                require(candidate.get('nativeCategory') == source_row['nativeCategory'], 'HISTORY_CATEGORY')
                names = candidate.get('namesHistorical', {})
                require(isinstance(names, dict) and set(names) == set(LOCALES), 'HISTORY_LOCALES')
                for locale in LOCALES:
                    value = names[locale]
                    require(isinstance(value, str) and value.strip() and not NONDISPLAY.match(value), 'HISTORY_NAME')
                    current = con.execute('SELECT value FROM exact_name WHERE item_id=? AND locale=?', (item_id, locale)).fetchone()
                    require(current is None or current[0] == value, 'HISTORY_CURRENT_NAME_CONFLICT')
                    con.execute('INSERT INTO historical_name_candidate VALUES(?,?,?,?,?)',
                        (item_id, locale, value, h['historicalGameVersion'], HISTORY_STATUS))
            require(con.execute('PRAGMA foreign_key_check').fetchall() == [], 'FOREIGN_KEYS')
            con.commit()
            require(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'SQLITE_INTEGRITY')
        finally:
            con.close()
        os.chmod(tmp, 0o600)
        # Do not clobber a concurrent process's output.
        require(not output.exists(), 'REFUSE_OVERWRITE')
        os.link(tmp, output)
        return {'schema':SCHEMA, 'platform':m['platform'], 'gameVersion':m['gameVersion'],
                'definitions':len(seen), 'exactNames':sum(loc_count.values()),
                'historicalCandidates':len(history_rows), 'sha256':sha_bytes(output.read_bytes()),
                'privateOnly':True, 'file':str(output)}
    finally:
        try: os.unlink(tmp)
        except FileNotFoundError: pass


def main() -> None:
    cli = argparse.ArgumentParser(description='Compile owner-private DB-01 SQLite operational store')
    cli.add_argument('--catalog', required=True, type=Path)
    cli.add_argument('--out', required=True, type=Path)
    cli.add_argument('--history', type=Path)
    args = cli.parse_args()
    print(json.dumps(build(args.catalog, args.out, args.history), ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()