"""Read the final PRIVATE SQLite v2 catalog into DB-01's existing version diff engine.

Offline source adapter only. It never migrates databases, edits either snapshot,
or infers game-wide removals, DLC ownership, current player state or publishing rights.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

STORE_SCHEMA = 'wand.db01.sqlite@2'
SOURCE_SCHEMAS = frozenset({'wand.db01.items@1', 'wand.db01.partial-manifest@3'})
LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')
NATIVE = frozenset({'ActivityItem', 'Furniture', 'Clothing', 'Trimming'})
SHA = re.compile(r'^[0-9a-f]{64}$')
VERSION = re.compile(r'^\d+\.\d+\.\d+$')
CATEGORY = re.compile(r'^[A-Za-z][A-Za-z0-9]*$')
NONDISPLAY = re.compile(r'^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}', re.I)


def require(ok: object, code: str) -> None:
    if not ok:
        raise ValueError('DB01_DIFF_SQLITE_' + code)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def load_sqlite_version(path: Path, expected_sqlite_sha256: str | None = None) -> dict:
    """Return the same provenanced comparison projection as load_private_version.

    A trusted SQLite hash is strongly recommended; an unpinned snapshot only
    proves internal consistency. Inputs are read-only and must be final, not WAL.
    """
    source = Path(path)
    require(not source.is_symlink() and source.is_file() and
            source.suffix in ('.sqlite', '.db') and
            0 < source.stat().st_size <= 512 * 1024 * 1024,
            'INPUT_REGULAR_PRIVATE_SQLITE_REQUIRED')
    source = source.resolve(strict=True)
    require(not Path(str(source) + '-wal').exists() and
            not Path(str(source) + '-journal').exists(), 'ACTIVE_SQLITE_NOT_SNAPSHOT')
    first_digest = digest(source)
    if expected_sqlite_sha256 is not None:
        require(isinstance(expected_sqlite_sha256, str) and
                SHA.fullmatch(expected_sqlite_sha256) and
                first_digest == expected_sqlite_sha256, 'INDEPENDENT_SOURCE_HASH_MISMATCH')
    con = sqlite3.connect(f'file:{source.as_posix()}?mode=ro&immutable=1', uri=True)
    try:
        require(con.execute('PRAGMA query_only').fetchone()[0] in (0, 1), 'PRAGMA')
        con.execute('PRAGMA query_only=ON')
        require(con.execute('PRAGMA user_version').fetchone()[0] == 2, 'STORE_USER_VERSION')
        require(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'INTEGRITY')
        require(con.execute('PRAGMA foreign_key_check').fetchall() == [], 'REFERENCES')
        info = con.execute('''SELECT store_schema, source_schema, platform, game_version,
            manifest_sha256, native_source_manifest_sha256, items_sha256,
            definition_count, source_files_verified, source_files_total,
            full_corpus_parsed, publication_authorized FROM catalog WHERE id=1''').fetchone()
        require(info is not None and info[0] == STORE_SCHEMA and info[1] in SOURCE_SCHEMAS
                and info[2] == 'Steam' and isinstance(info[3], str) and VERSION.fullmatch(info[3])
                and all(isinstance(x, str) and SHA.fullmatch(x) for x in info[4:7])
                and type(info[7]) is int and 0 < info[7] <= 200000
                and type(info[8]) is int and type(info[9]) is int
                and 0 < info[8] <= info[9]
                and info[10] == 0 and info[11] == 0, 'PRIVATE_SOURCE_LEDGER')
        if info[1] == 'wand.db01.partial-manifest@3':
            require(info[3] == '1.26.2' and info[8] == 38 and info[9] == 39,
                    'RECOVERED_SOURCE_SCOPE')
        expected_names: dict[tuple[int, str], str] = {}
        items: dict[int, dict] = {}
        categories: Counter[str] = Counter()
        category_sources: dict[str, str] = {}
        native_pairs: set[tuple[str, str]] = set()
        for ident, category, domain, loc_key, native_key, file_path, source_sha, record_json in con.execute('''
            SELECT item_id,native_category,catalog_domain,localization_key,native_key,
                source_file,source_sha256,record_json FROM definition ORDER BY item_id'''):
            require(type(ident) is int and 0 < ident <= 9007199254740991 and ident not in items
                    and isinstance(category, str) and CATEGORY.fullmatch(category)
                    and isinstance(native_key, str) and 0 < len(native_key) <= 256
                    and native_key.strip() == native_key
                    and all(ord(c) >= 32 for c in native_key)
                    and (category, native_key) not in native_pairs
                    and isinstance(source_sha, str) and SHA.fullmatch(source_sha),
                    'NATIVE_IDENTITY')
            native_pairs.add((category, native_key))
            require(file_path == f'ddv_Data/StreamingAssets/itemlist/{category}.json',
                    'FILE_CATEGORY')
            previous_sha = category_sources.setdefault(category, source_sha)
            require(previous_sha == source_sha, 'CATEGORY_SOURCE_MIXED')
            raw = json.loads(record_json)
            provenance = raw.get('source', {})
            verification = raw.get('verification', {})
            expected_domain = 'item' if category in NATIVE else 'definition_unclassified'
            require(raw.get('itemId') == ident and raw.get('nativeCategory') == category
                    and raw.get('nativeNameField') == native_key
                    and raw.get('catalogDomain') == domain == expected_domain
                    and raw.get('localizationKey') == loc_key
                    and provenance.get('file') == file_path
                    and provenance.get('sha256') == source_sha
                    and provenance.get('platform') == info[2]
                    and provenance.get('gameVersion') == info[3]
                    and verification.get('currentVersionObserved') is True
                    and verification.get('itemId') == 'native_frame_verified'
                    and verification.get('nativeCategory') == 'native_file_verified'
                    and verification.get('classification') == 'unresolved',
                    'DEFINITION_SOURCE_MISMATCH')
            image = raw.get('image', {})
            require(isinstance(image, dict) and image.get('mediaExtracted') is False and
                    ((isinstance(image.get('iconGuid'), str) and
                      re.fullmatch(r'guid:[0-9a-f]{32}', image['iconGuid'])) if domain == 'item'
                     else image.get('iconGuid') is None),
                    'UNVERIFIED_ICON')
            names = raw.get('names', {})
            statuses = verification.get('names', {})
            require(isinstance(names, dict) and isinstance(statuses, dict) and
                    set(names) == set(LOCALES) and set(statuses) == set(LOCALES),
                    'LOCALE_SHAPE')
            for locale in LOCALES:
                value = names[locale]
                if value is None:
                    require(statuses[locale] == 'unresolved', 'CURRENT_NAME_STATUS')
                else:
                    require(isinstance(value, str) and value.strip() and
                            not NONDISPLAY.match(value) and
                            statuses[locale] == 'exact_locdb_join', 'CURRENT_NAME_EVIDENCE')
                    expected_names[(ident, locale)] = value
            items[ident] = raw
            categories[category] += 1
        require(len(items) == info[7], 'DEFINITION_COUNT')
        observed_names = {}
        for ident, locale, value, evidence in con.execute('''
            SELECT item_id,locale,value,evidence FROM exact_name ORDER BY item_id,locale'''):
            require(ident in items and locale in LOCALES and
                    evidence == 'exact_locdb_join' and (ident, locale) not in observed_names,
                    'EXACT_NAME_IDENTITY')
            observed_names[(ident, locale)] = value
        require(expected_names == observed_names, 'CURRENT_NAME_SQLITE_MISMATCH')
        # Historical candidate names are intentionally NOT included in this
        # comparison projection and cannot produce verified name changes.
    finally:
        con.close()
    require(digest(source) == first_digest, 'SQLITE_MUTATED_DURING_READ')
    return {
        'manifest': {'platform': info[2], 'gameVersion': info[3],
                     'sourceSchema': info[1], 'fullCorpusParsed': False},
        'manifestSha256': info[4], 'dataSha256': info[6],
        'categories': dict(categories), 'sourceDigests': category_sources,
        'items': items, 'sqliteSha256': first_digest,
        'independentlyPinnedSqlite': expected_sqlite_sha256 is not None,
    }