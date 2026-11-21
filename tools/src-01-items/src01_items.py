import argparse
import csv
import hashlib
import json
import os
import re
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

LOCALES = ('en', 'fr', 'it', 'de', 'es-ES', 'ja', 'zh-CN', 'pt-BR')
CATALOG_LOCALES = ('EN', 'FR', 'IT', 'DE', 'ES-ES', 'JA', 'ZH-CN', 'PT-BR')
RECORD_FILE = re.compile(r'records-\d{2}\.json\Z')
NOBR = re.compile(r'</?nobr>', re.IGNORECASE)
ZERO_WIDTH = re.compile('[\u200b\u200c\u200d\ufeff]')
HINT_KEYS = {'itemid', 'item_id', 'itemname', 'localizationkey', 'lockey', 'category', 'subcategory', 'expansion'}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def digest_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path, emit):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.src01-', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as handle:
            emit(handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def write_json(path, value):
    atomic_write(path, lambda handle: json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True))


def write_jsonl(path, rows):
    def emit(handle):
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n')
    atomic_write(path, emit)


def read_json(path):
    with path.open('r', encoding='utf-8-sig') as handle:
        return json.load(handle)


def label(value):
    return ZERO_WIDTH.sub('', NOBR.sub('', value)).strip()


def kind(path):
    name = path.name.lower()
    suffix = path.suffix.lower()
    if name in {'global-metadata.dat', 'gameassembly.dll', 'unityplayer.dll', 'il2cpp_data'}:
        return 'il2cpp'
    if suffix in {'.assets', '.bundle', '.unity3d', '.resource', '.ress', '.resS'.lower()} or name.startswith('sharedassets'):
        return 'unity_asset'
    if suffix in {'.json', '.jsonl', '.ndjson', '.csv', '.tsv'}:
        return 'structured_candidate'
    if suffix in {'.zip', '.nsp', '.xci', '.nca', '.pak'}:
        return 'archive_or_container'
    return 'other'


def structure_probe(path, limit):
    result = {'status': 'not_probed'}
    suffix = path.suffix.lower()
    if suffix not in {'.json', '.jsonl', '.ndjson', '.csv', '.tsv', '.zip'}:
        return result
    if suffix == '.zip':
        try:
            with zipfile.ZipFile(path) as archive:
                entries = archive.infolist()
                return {'status': 'archive_directory_only', 'entries': len(entries),
                        'sampleNames': [x.filename[:180] for x in entries[:15]]}
        except (OSError, zipfile.BadZipFile, ValueError) as error:
            return {'status': 'error', 'reason': type(error).__name__}
    if path.stat().st_size > limit:
        return {'status': 'too_large_for_safe_probe', 'maxBytes': limit}
    try:
        if suffix == '.json':
            data = read_json(path)
        elif suffix in {'.jsonl', '.ndjson'}:
            with path.open('r', encoding='utf-8-sig') as handle:
                line = next((x for x in handle if x.strip()), None)
            if not line:
                return {'status': 'empty'}
            data = json.loads(line)
        else:
            with path.open('r', encoding='utf-8-sig', newline='') as handle:
                columns = next(csv.reader(handle, delimiter='\t' if suffix == '.tsv' else ','), [])
            columns = [str(x)[:100] for x in columns[:100]]
            return {'status': 'header_only', 'columns': columns,
                    'itemKeyHints': [x for x in columns if x.casefold().replace(' ', '') in HINT_KEYS]}
        if isinstance(data, dict):
            keys = [str(x)[:100] for x in list(data)[:100]]
            return {'status': 'parsed_structure_only', 'topLevel': 'object', 'keys': keys,
                    'itemKeyHints': [x for x in keys if x.casefold().replace(' ', '') in HINT_KEYS]}
        if isinstance(data, list):
            first = data[0] if data else None
            keys = [str(x)[:100] for x in list(first)[:100]] if isinstance(first, dict) else []
            return {'status': 'parsed_structure_only', 'topLevel': 'array', 'length': len(data),
                    'firstRecordType': type(first).__name__ if first is not None else None,
                    'firstRecordKeys': keys,
                    'itemKeyHints': [x for x in keys if x.casefold().replace(' ', '') in HINT_KEYS]}
        return {'status': 'parsed_structure_only', 'topLevel': type(data).__name__}
    except (OSError, UnicodeError, ValueError, StopIteration) as error:
        return {'status': 'error', 'reason': type(error).__name__}


def walk_inputs(root, excluded):
    if root.is_file():
        if not root.is_symlink():
            yield root
        return
    for directory, dirs, files in os.walk(root, followlinks=False):
        here = Path(directory)
        dirs[:] = sorted(d for d in dirs if not (here / d).is_symlink() and
                         not (here / d).resolve().is_relative_to(excluded))
        for filename in sorted(files):
            path = here / filename
            if not path.is_symlink() and path.is_file() and not path.resolve().is_relative_to(excluded):
                yield path


def survey(args):
    root = args.input.resolve(strict=True)
    output = args.out.resolve()
    if not root.is_file() and not root.is_dir():
        raise ValueError('Input must be a regular file or directory')
    if output == root or (root.is_file() and output == root.parent):
        raise ValueError('Output directory must not overwrite the input')
    prior = {}
    cache_path = output / 'inventory.jsonl'
    cache_manifest = output / 'manifest.json'
    cache_ok = False
    if cache_manifest.exists():
        try:
            cache_ok = read_json(cache_manifest).get('inputRoot') == str(root)
        except (OSError, ValueError):
            cache_ok = False
    if args.resume and cache_ok and cache_path.exists():
        for line in cache_path.read_text(encoding='utf-8').splitlines():
            record = json.loads(line)
            prior[record['path']] = record
    records = []
    counts = Counter()
    candidates = []
    reused = 0
    for path in walk_inputs(root, output):
        if args.max_files and len(records) >= args.max_files:
            break
        stat = path.stat()
        rel = path.relative_to(root if root.is_dir() else root.parent).as_posix()
        previous = prior.get(rel)
        if previous and previous.get('size') == stat.st_size and previous.get('mtimeNs') == stat.st_mtime_ns:
            record = previous
            reused += 1
        else:
            classification = kind(path)
            probe = structure_probe(path, args.probe_max_mb * 1024 * 1024)
            record = {'path': rel, 'size': stat.st_size, 'mtimeNs': stat.st_mtime_ns,
                      'kind': classification, 'suffix': path.suffix.lower(), 'probe': probe,
                      'sha256': digest_file(path) if stat.st_size <= args.hash_max_mb * 1024 * 1024 else None}
        records.append(record)
        counts[record['kind']] += 1
        if record['kind'] != 'other' and len(candidates) < 200:
            candidates.append({'path': rel, 'kind': record['kind'], 'probe': record['probe']})
    write_jsonl(cache_path, records)
    manifest = {'schema': 'wand.src01.survey@1', 'createdUtc': now(), 'status': 'structure_survey_only',
                'inputRoot': str(root), 'declaredSource': {'platform': args.platform,
                'gameVersion': args.game_version, 'buildID': args.build_id},
                'totalFilesInspected': len(records), 'maxFiles': args.max_files or None,
                'completeTraversal': args.max_files == 0 or len(records) < args.max_files,
                'inventoryFile': 'inventory.jsonl', 'itemsGenerated': False}
    report = {'schema': 'wand.src01.report@1', 'status': 'survey_only',
              'filesInspected': len(records), 'cacheEntriesReused': reused,
              'kinds': dict(sorted(counts.items())), 'candidates': candidates,
              'note': 'Structure hints are not validated item mappings or game-derived classifications.'}
    unresolved = {'schema': 'wand.src01.unresolved@1', 'status': 'parser_selection_required',
                  'questions': ['Identify authoritative item-definition and localization files from this inventory.',
                                'Verify field mappings on representative records before enabling game extraction.',
                                'Confirm platform, game version and build ID from source evidence.']}
    write_json(output / 'manifest.json', manifest)
    write_json(output / 'report.json', report)
    write_json(output / 'unresolved.json', unresolved)
    print(f'Surveyed {len(records)} files ({reused} cached). See {output / "report.json"}')


def index_value(table, position, field):
    if type(position) is not int or position < 0 or position >= len(table):
        raise ValueError(f'Invalid {field} dictionary index: {position}')
    return table[position]


def indexed_list(table, positions, field):
    if not isinstance(positions, list):
        raise ValueError(f'Invalid {field} index list')
    return [index_value(table, x, field) for x in positions]


def catalog(args):
    source = args.catalog.resolve(strict=True)
    output = args.out.resolve()
    if output == source or output.is_relative_to(source):
        raise ValueError('Output must be outside the catalog source directory')
    index_path = source / 'index.json'
    index = read_json(index_path)
    if index.get('s') != 'wand.collection.runtime@1' or tuple(index.get('l', [])) != CATALOG_LOCALES:
        raise ValueError('Unsupported catalog schema or locale order')
    target = index.get('t', {})
    if not all(isinstance(target.get(k), str) and target[k] for k in ('platform', 'gameVersion', 'buildID')):
        raise ValueError('Missing source version provenance')
    dictionaries = ('f', 'c', 'm', 'w', 'u', 'e')
    if any(not isinstance(index.get(key), list) for key in dictionaries):
        raise ValueError('Incomplete catalog dictionaries')
    shards = index.get('shards')
    if not isinstance(shards, list) or not shards:
        raise ValueError('Catalog shard list is missing')
    items = []
    seen = set()
    missing = Counter()
    by_name = defaultdict(list)
    offset = 0
    hashes = []
    for shard in shards:
        filename = shard.get('file')
        if not isinstance(filename, str) or not RECORD_FILE.fullmatch(filename):
            raise ValueError('Unsafe shard filename')
        path = source / filename
        content = path.read_bytes()
        actual_hash = hashlib.sha256(content).hexdigest()
        if len(content) != shard.get('bytes') or actual_hash != shard.get('sha256'):
            raise ValueError(f'Shard integrity mismatch: {filename}')
        payload = json.loads(content)
        rows = payload.get('r')
        if payload.get('s') != 'wand.collection.records@1' or payload.get('offset') != offset or \
                shard.get('offset') != offset or not isinstance(rows, list) or \
                payload.get('count') != len(rows) or shard.get('count') != len(rows):
            raise ValueError(f'Shard record contract mismatch: {filename}')
        for row in rows:
            if not isinstance(row, list) or len(row) != 8:
                raise ValueError(f'Invalid record shape in {filename}')
            item_id, family, state_class, state_semantic, worlds, universes, expansions, names = row
            if type(item_id) is not int or item_id in seen:
                raise ValueError(f'Invalid or duplicate Item ID: {item_id}')
            seen.add(item_id)
            if not isinstance(names, list) or len(names) != 8 or not all(isinstance(x, str) for x in names):
                raise ValueError(f'Invalid localized labels for {item_id}')
            localized = {locale: label(value) or None for locale, value in zip(LOCALES, names)}
            for locale, value in localized.items():
                if value is None:
                    missing[locale] += 1
            if localized['en']:
                by_name[localized['en'].casefold()].append(item_id)
            items.append({'itemId': item_id, 'internalIdentifier': None, 'names': localized,
                          'category': index_value(index['f'], family, 'category'), 'subcategory': None,
                          'stateClass': index_value(index['c'], state_class, 'stateClass'),
                          'stateSemantic': index_value(index['m'], state_semantic, 'stateSemantic'),
                          'worlds': indexed_list(index['w'], worlds, 'world'),
                          'universes': indexed_list(index['u'], universes, 'universe'),
                          'expansions': indexed_list(index['e'], expansions, 'expansion'),
                          'attributes': {}, 'source': {'type': 'existing_collection_reference',
                          'shard': filename, **target}})
        offset += len(rows)
        hashes.append({'file': filename, 'sha256': actual_hash, 'count': len(rows)})
    if offset != index.get('n'):
        raise ValueError(f'Catalog count mismatch: {offset} vs {index.get("n")}')
    items.sort(key=lambda value: value['itemId'])
    aliases = [{'nameEn': name, 'itemIds': ids} for name, ids in sorted(by_name.items()) if len(ids) > 1]
    report = {'schema': 'wand.src01.report@1', 'status': 'reference_import_only',
              'items': len(items), 'missingNamesByLocale': dict(sorted(missing.items())),
              'sameEnglishNameDifferentIdsCount': len(aliases), 'sameEnglishNameDifferentIdsSample': aliases[:100],
              'subcategoryUnverified': len(items), 'internalIdentifierUnverified': len(items),
              'categoryCount': len(set(x['category'] for x in items)),
              'warning': 'Matching display names do not establish duplicate game items. Reference records are not a new game-file extraction.'}
    unresolved = {'schema': 'wand.src01.unresolved@1', 'status': 'requires_game_source',
                  'globalUnverifiedFields': ['internalIdentifier', 'subcategory', 'attributes'],
                  'missingNamesByLocale': dict(sorted(missing.items())),
                  'nameCollisionCount': len(aliases),
                  'next': 'Run survey against licensed game files, verify real source schema, then implement a source-specific extractor.'}
    manifest = {'schema': 'wand.src01.manifest@1', 'createdUtc': now(), 'status': 'reference_import_only',
                'itemSchema': 'wand.item@1', 'itemsFile': 'items.jsonl', 'itemCount': len(items),
                'sourceType': 'existing_collection_reference', 'catalogSource': str(source),
                'catalogManifestSha256': digest_file(index_path), 'gameSourceClaim': target,
                'locales': list(LOCALES), 'verifiedShards': hashes,
                'notVerifiedByThisTool': ['fresh game-file origin', 'subcategory', 'internalIdentifier', 'attributes']}
    write_jsonl(output / 'items.jsonl', items)
    manifest['itemsSha256'] = digest_file(output / 'items.jsonl')
    write_json(output / 'manifest.json', manifest)
    write_json(output / 'report.json', report)
    write_json(output / 'unresolved.json', unresolved)
    if args.compare_to:
        diff_sets(args.compare_to.resolve(strict=True), output / 'items.jsonl', output / 'comparison.json')
    print(f'Imported {len(items)} verified reference records. See {output / "report.json"}')


def load_items(path):
    records = {}
    with path.open('r', encoding='utf-8') as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            item_id = value.get('itemId')
            if type(item_id) is not int or item_id in records:
                raise ValueError(f'Invalid or repeated Item ID at {path}:{line_number}')
            records[item_id] = value
    return records


def diff_sets(old, new, target):
    earlier = load_items(old)
    later = load_items(new)
    removed = sorted(earlier.keys() - later.keys())
    added = sorted(later.keys() - earlier.keys())
    comparable = ('internalIdentifier', 'names', 'category', 'subcategory',
                  'stateClass', 'stateSemantic', 'worlds', 'universes', 'expansions', 'attributes')
    changed = {}
    for item_id in sorted(earlier.keys() & later.keys()):
        fields = [key for key in comparable if earlier[item_id].get(key) != later[item_id].get(key)]
        if fields:
            changed[str(item_id)] = fields
    report = {'schema': 'wand.src01.diff@1', 'oldCount': len(earlier), 'newCount': len(later),
              'addedCount': len(added), 'removedCount': len(removed), 'changedCount': len(changed),
              'addedIds': added, 'removedIds': removed, 'changedFieldsById': changed,
              'note': 'This is an ID-based dataset comparison; differences do not establish a game version or cause.'}
    write_json(target, report)
    print(f'Diff: +{len(added)} -{len(removed)} changed={len(changed)}; {target}')


def main():
    parser = argparse.ArgumentParser(description='Wand SRC-01: read-only structure survey and verified Collection reference import')
    commands = parser.add_subparsers(dest='command', required=True)
    scan = commands.add_parser('survey', help='Inspect source file structure without guessing item mappings')
    scan.add_argument('--input', type=Path, required=True)
    scan.add_argument('--out', type=Path, required=True)
    scan.add_argument('--platform', default='unverified')
    scan.add_argument('--game-version', default='unverified')
    scan.add_argument('--build-id', default='unverified')
    scan.add_argument('--probe-max-mb', type=int, default=8)
    scan.add_argument('--hash-max-mb', type=int, default=8)
    scan.add_argument('--max-files', type=int, default=0)
    scan.add_argument('--no-resume', dest='resume', action='store_false')
    scan.set_defaults(func=survey)
    existing = commands.add_parser('from-collection', help='Import the validated Wand 1.25 catalog')
    existing.add_argument('--catalog', type=Path, required=True)
    existing.add_argument('--out', type=Path, required=True)
    existing.add_argument('--compare-to', type=Path)
    existing.set_defaults(func=catalog)
    diff = commands.add_parser('diff', help='Compare two SRC-01 items.jsonl files by Item ID')
    diff.add_argument('--old', type=Path, required=True)
    diff.add_argument('--new', type=Path, required=True)
    diff.add_argument('--out', type=Path, required=True)
    diff.set_defaults(func=lambda args: diff_sets(args.old, args.new, args.out))
    args = parser.parse_args()
    if args.command == 'survey' and (args.probe_max_mb < 0 or args.hash_max_mb < 0 or args.max_files < 0):
        parser.error('Limits must be non-negative')
    try:
        args.func(args)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        print(f'SRC-01 failed: {error}', file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == '__main__':
    main()
