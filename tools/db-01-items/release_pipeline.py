"""Version-independent, owner-private DB-01 SQLite -> TypeScript release pipeline.

Input is a *verified* DB-01 normalized catalog (not a raw game directory).
Version-specific Steam/Unity extraction remains in SRC-01, outside this stage.
Identical inputs reuse an immutable, SHA-keyed audited release, while changed
inputs create a new release without overwriting any earlier version.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from pathlib import Path

import audit_shards
import export_shards
import sqlite_store

CONTRACT = 'wand.db01.private-release@1'
HEX = re.compile(r'[0-9a-f]{64}\Z')


def require(condition: object, label: str) -> None:
    if not condition:
        raise ValueError('DB01_RELEASE_' + label)


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda: stream.read(2 * 1024 * 1024), b''):
            h.update(data)
    return h.hexdigest()


def reject_overlap(output: Path, catalog: Path, history: Path | None) -> None:
    for item in (catalog, history):
        if item is not None:
            require(output != item and output not in item.parents and
                    item not in output.parents, 'OUTPUT_OVERLAPS_INPUT')
    sqlite_store.check_private_path(output / 'db01-private-release')


def read_source(catalog: Path, history: Path | None,
                expected_version: str | None, expected_source_sha256: str | None,
                expected_manifest_sha256: str | None) -> dict:
    require(catalog.is_dir() and (catalog / 'manifest.json').is_file() and
            (catalog / 'items.jsonl').is_file(), 'CATALOG_MISSING')
    manifest_path, items_path = catalog / 'manifest.json', catalog / 'items.jsonl'
    manifest, manifest_sha = sqlite_store.load_json(manifest_path)
    source = sqlite_store.validate_source(manifest)
    require(expected_version is None or source['gameVersion'] == expected_version,
            'VERSION_MISMATCH')
    require(expected_manifest_sha256 is None or
            (HEX.fullmatch(expected_manifest_sha256) and
             expected_manifest_sha256 == manifest_sha), 'MANIFEST_SHA_MISMATCH')
    items_sha = sha(items_path)
    require(items_sha == source['outputSha256']['items.jsonl'], 'SOURCE_ITEMS_SHA_MISMATCH')
    require(expected_source_sha256 is None or
            (HEX.fullmatch(expected_source_sha256) and
             expected_source_sha256 == items_sha), 'TRUSTED_SOURCE_SHA_MISMATCH')
    history_sha = history_manifest_sha = None
    if history is not None:
        require(history.is_dir(), 'HISTORY_MISSING')
        _, history_manifest_sha, history_sha, _ = sqlite_store.read_history(history, source)
    return {
        'platform':source['platform'], 'gameVersion':source['gameVersion'],
        'sourceManifestSha256':manifest_sha, 'sourceItemsSha256':items_sha,
        'historyManifestSha256':history_manifest_sha, 'historyItemsSha256':history_sha,
        'historyIncluded':history is not None,
    }


def check_existing_sqlite(path: Path, pins: dict) -> None:
    require(path.is_file() and not path.is_symlink(), 'SQLITE_NOT_REGULAR')
    with sqlite3.connect(f'file:{path.as_posix()}?mode=ro&immutable=1', uri=True) as con:
        require(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok',
                'CACHED_SQLITE_CORRUPT')
        row = con.execute('''SELECT platform, game_version, manifest_sha256,
          items_sha256, historical_manifest_sha256, historical_items_sha256,
          publication_authorized FROM catalog WHERE id=1''').fetchone()
    require(row == (pins['platform'], pins['gameVersion'],
                    pins['sourceManifestSha256'], pins['sourceItemsSha256'],
                    pins['historyManifestSha256'], pins['historyItemsSha256'], 0),
            'CACHED_SQLITE_SOURCE_MISMATCH')


def run(catalog: Path, out: Path, *, history: Path | None = None,
        expected_version: str | None = None,
        expected_source_sha256: str | None = None,
        expected_manifest_sha256: str | None = None) -> dict:
    catalog, out = catalog.expanduser().resolve(), out.expanduser().resolve()
    history = history.expanduser().resolve() if history else None
    reject_overlap(out, catalog, history)
    pins = read_source(catalog, history, expected_version,
                       expected_source_sha256, expected_manifest_sha256)
    key = hashlib.sha256(json.dumps({'contract':CONTRACT, **pins},
                                   sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    # A new version or changed source/historical SHA creates a separate release.
    destination = out / ('steam-' + pins['gameVersion']) / ('db01-' + key[:20])
    require(out == destination.parent.parent, 'BAD_RELEASE_PATH')
    sqlite_path = destination / 'catalog.sqlite'
    shard_path = destination / 'shards'
    audit_path = destination / 'audit.json'
    already_complete = sqlite_path.exists() and shard_path.exists() and audit_path.exists()
    require(not shard_path.exists() or sqlite_path.exists(), 'SHARDS_WITHOUT_SQLITE')
    require(not audit_path.exists() or (sqlite_path.exists() and shard_path.exists()),
            'AUDIT_WITHOUT_ARTIFACTS')
    destination.mkdir(parents=True, exist_ok=True)
    if sqlite_path.exists():
        check_existing_sqlite(sqlite_path, pins)
    else:
        sqlite_store.build(catalog, sqlite_path, history)
        check_existing_sqlite(sqlite_path, pins)
    if not shard_path.exists():
        export_shards.export(sqlite_path, shard_path, include_historical=pins['historyIncluded'])
    # Always audit; fast-path never trusts a previous PASS without verifying
    # the present SQLite and every private read shard.
    report = audit_shards.audit(sqlite_path, shard_path,
                                expected_source_items_sha256=pins['sourceItemsSha256'])
    require(report['gameVersion'] == pins['gameVersion'] and
            report['sourceManifestSha256'] == pins['sourceManifestSha256'],
            'AUDITED_VERSION_MISMATCH')
    audit_shards.save_report(report, audit_path, sqlite_path=sqlite_path,
                             shards_path=shard_path)
    return {
        'schema':CONTRACT, 'status':'reused' if already_complete else 'built',
        'privateOnly':True, 'publicationAuthorized':False,
        'platform':pins['platform'], 'gameVersion':pins['gameVersion'],
        'sourceItemsSha256':pins['sourceItemsSha256'],
        'definitions':report['definitions'], 'exactNames':report['exactNames'],
        'historicalIncluded':report['historicalIncluded'],
        'releaseFingerprint':key,
        'sqlite':str(sqlite_path), 'shards':str(shard_path), 'audit':str(audit_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Version-neutral, verified, private DB-01 release')
    parser.add_argument('--catalog', type=Path, required=True,
                        help='Verified normalized DB-01 catalog containing manifest.json and items.jsonl')
    parser.add_argument('--out', type=Path, required=True,
                        help='Private output root outside any Git or game source tree')
    parser.add_argument('--history', type=Path,
                        help='Optional verified historical candidate directory; never merges into current names')
    parser.add_argument('--expected-version')
    parser.add_argument('--expected-source-items-sha256')
    parser.add_argument('--expected-manifest-sha256')
    args = parser.parse_args()
    try:
        result = run(args.catalog, args.out, history=args.history,
                     expected_version=args.expected_version,
                     expected_source_sha256=args.expected_source_items_sha256,
                     expected_manifest_sha256=args.expected_manifest_sha256)
    except (OSError, ValueError, TypeError, KeyError, sqlite3.Error) as exc:
        parser.exit(1, f'DB-01 release failed: {exc}\n')
    print(json.dumps(result, sort_keys=True, ensure_ascii=False))


if __name__ == '__main__':
    main()
