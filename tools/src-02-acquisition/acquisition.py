from __future__ import annotations

import argparse
import csv
import fnmatch
import hashlib
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = 'wand.src02.acquisition@1'
CATEGORIES = ('PremiumShop', 'Bundle', 'Offer', 'ScroogeStore', 'OrderCatalog', 'StarPath', 'FriendshipQuest', 'StoryQuest', 'Event', 'Crafting', 'Exchange', 'TwitchDrops', 'CampaignCode', 'Other')
ENTITIES = {'Item', 'Quest', 'Event', 'StarPath', 'Bundle', 'Offer', 'Reward', 'Store', 'Recipe', 'Exchange', 'Campaign', 'Currency'}
STRUCTURED = {'.json', '.jsonl', '.ndjson', '.csv', '.tsv'}
KEYWORDS = re.compile(r'item|quest|offer|shop|store|star.?path|bundle|reward|event|craft|exchange|twitch|drop|code|price|currency|loot|recipe|sale', re.I)
MAX_FILE_BYTES = 64 * 1024 * 1024


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w', encoding='utf-8', newline='\n') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False)
        stream.write('\n')
    os.replace(temporary, path)


def parse_json(text: str) -> object:
    def unique_pairs(pairs: list) -> dict:
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('DUPLICATE_JSON_KEY:' + key)
            value[key] = item
        return value

    def reject_constant(value: str) -> None:
        raise ValueError('NONFINITE_JSON:' + value)

    return json.loads(text, object_pairs_hook=unique_pairs, parse_constant=reject_constant)


def json_read(path: Path, max_bytes: int = MAX_FILE_BYTES) -> object:
    if path.stat().st_size > max_bytes:
        raise ValueError('FILE_TOO_LARGE')
    with path.open('r', encoding='utf-8-sig') as stream:
        return parse_json(stream.read())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def iter_files(root: Path, out: Path) -> list[tuple[str, Path]]:
    root = root.resolve(strict=True)
    out = out.resolve()
    if root.is_file():
        if root.is_symlink():
            raise ValueError('Symlink source is not allowed')
        return [(root.name, root)]
    result = []
    for directory, dirs, names in os.walk(root, followlinks=False):
        base = Path(directory)
        dirs[:] = sorted(name for name in dirs if name != '.git' and not (base / name).is_symlink() and (base / name).resolve() != out and out not in (base / name).resolve().parents)
        for name in sorted(names):
            path = base / name
            if path.is_symlink() or not path.is_file() or path.resolve() == out or out in path.resolve().parents:
                continue
            result.append((path.relative_to(root).as_posix(), path))
    return sorted(result, key=lambda item: item[0])


def token_path(path: str) -> list[str]:
    if not isinstance(path, str) or not path.strip():
        raise ValueError('EMPTY_SELECTOR')
    path = path.strip()
    if path == '$':
        return []
    if path.startswith('$.'):
        path = path[2:]
    elif path.startswith('$['):
        path = path[1:]
    result = []
    for segment in path.split('.'):
        if not segment:
            raise ValueError('INVALID_SELECTOR:' + path)
        match = re.fullmatch(r'([^\[\]]+)?((?:\[(?:\*|\d+)\])*)', segment)
        if not match or not match.group(0):
            raise ValueError('INVALID_SELECTOR:' + path)
        if match.group(1):
            result.append(match.group(1))
        result.extend(re.findall(r'\[(?:\*|\d+)\]', match.group(2)))
    return result


def select(value: object, path: str, base: str = '$') -> list[tuple[str, object]]:
    current = [(base, value)]
    for step in token_path(path):
        next_rows = []
        for location, item in current:
            if step == '[*]' and isinstance(item, list):
                next_rows.extend((f'{location}[{i}]', child) for i, child in enumerate(item))
            elif step.startswith('[') and isinstance(item, list):
                idx = int(step[1:-1])
                if idx < len(item):
                    next_rows.append((f'{location}[{idx}]', item[idx]))
            elif isinstance(item, dict) and step in item:
                next_rows.append((location + '.' + step, item[step]))
        current = next_rows
        if not current:
            break
    return current


def field(value: object, selector: str) -> object | None:
    matches = [v for _, v in select(value, selector)]
    if not matches:
        return None
    return matches[0] if len(matches) == 1 else matches


def native_id(value: object) -> str | None:
    if type(value) is int and value >= 0:
        return str(value)
    if isinstance(value, str) and value.strip() and len(value.strip()) <= 200:
        return value.strip()
    return None


def validate_rules(data: object) -> list[dict]:
    if not isinstance(data, dict) or not isinstance(data.get('rules'), list):
        raise ValueError('Rules must be an object with a rules array')
    rules = data['rules']
    ids = set()
    for rule in rules:
        if not isinstance(rule, dict):
            raise ValueError('Rule must be an object')
        rid = rule.get('id')
        if not isinstance(rid, str) or not rid or rid in ids:
            raise ValueError('Rule IDs must be unique nonempty strings')
        ids.add(rid)
        if not isinstance(rule.get('glob'), str) or not rule['glob']:
            raise ValueError(f'{rid}: glob required')
        if rule.get('entity_type') not in ENTITIES:
            raise ValueError(f'{rid}: unknown entity_type')
        if rule.get('method', 'Other') not in CATEGORIES:
            raise ValueError(f'{rid}: unknown method')
        for name in ('records', 'id'):
            token_path(rule.get(name, '$') if name == 'records' else rule.get(name, ''))
        for key, selector in rule.get('fields', {}).items():
            if not isinstance(key, str):
                raise ValueError(f'{rid}: invalid field name')
            token_path(selector)
        if not isinstance(rule.get('links', []), list):
            raise ValueError(f'{rid}: links must be an array')
        for link in rule.get('links', []):
            if not isinstance(link, dict) or link.get('target_type') not in ENTITIES:
                raise ValueError(f'{rid}: unknown link target_type')
            if not isinstance(link.get('relation'), str) or not link['relation']:
                raise ValueError(f'{rid}: link relation missing')
            token_path(link.get('records', '$'))
            token_path(link.get('id', ''))
            for selector in link.get('fields', {}).values():
                token_path(selector)
    return rules


def glob_match(name: str, glob: str) -> bool:
    return fnmatch.fnmatchcase(name, glob) or (glob.startswith('**/') and fnmatch.fnmatchcase(name, glob[3:]))


def iter_records(path: Path, max_bytes: int) -> object:
    ext = path.suffix.lower()
    if ext == '.json':
        yield '$', json_read(path, max_bytes)
    elif ext in {'.jsonl', '.ndjson'}:
        with path.open('r', encoding='utf-8-sig') as stream:
            for i, line in enumerate(stream):
                if not line.strip():
                    continue
                if len(line.encode('utf-8')) > max_bytes:
                    raise ValueError(f'LINE_TOO_LARGE:{i+1}')
                yield f'$[{i}]', parse_json(line)
    elif ext in {'.csv', '.tsv'}:
        with path.open('r', encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream, delimiter='\t' if ext == '.tsv' else ',')
            if not reader.fieldnames:
                raise ValueError('CSV_HEADER_MISSING')
            for i, row in enumerate(reader):
                yield f'$[{i}]', dict(row)
    else:
        raise ValueError('UNSUPPORTED_FORMAT')


def source_proof(relative: str, sha: str, pointer: str, rid: str) -> dict:
    return {'file': relative, 'sha256': sha, 'pointer': pointer, 'rule': rid}


def extract_file(path: Path, relative: str, digest: str, matching: list[dict], max_bytes: int, max_records: int) -> dict:
    entities = []
    relations = []
    warnings = []
    processed = 0
    for root_pointer, document in iter_records(path, max_bytes):
        for rule in matching:
            for pointer, record in select(document, rule.get('records', '$'), root_pointer):
                if processed >= max_records:
                    raise ValueError('MAX_RECORDS_EXCEEDED')
                processed += 1
                entity_id = native_id(field(record, rule['id']))
                if entity_id is None:
                    warnings.append({'code': 'ENTITY_ID_MISSING', 'rule': rule['id'], 'pointer': pointer})
                    continue
                e = {'type': rule['entity_type'], 'id': entity_id,
                     'method': rule.get('method', 'Other'),
                     'fields': {name: value for name, selector in rule.get('fields', {}).items()
                                if (value := field(record, selector)) is not None},
                     'proof': source_proof(relative, digest, pointer, rule['id'])}
                entities.append(e)
                for link in rule.get('links', []):
                    for link_pointer, subrecord in select(record, link.get('records', '$'), pointer):
                        targets = select(subrecord, link['id'], link_pointer)
                        if not targets:
                            warnings.append({'code': 'TARGET_ID_MISSING', 'rule': rule['id'], 'pointer': link_pointer})
                        for target_pointer, target in targets:
                            target_id = native_id(target)
                            if target_id is None:
                                warnings.append({'code': 'TARGET_ID_INVALID', 'rule': rule['id'], 'pointer': target_pointer})
                                continue
                            relations.append({'source': {'type': e['type'], 'id': entity_id},
                                              'target': {'type': link['target_type'], 'id': target_id},
                                              'relation': link['relation'],
                                              'fields': {name: value for name, selector in link.get('fields', {}).items()
                                                         if (value := field(subrecord, selector)) is not None},
                                              'proof': source_proof(relative, digest, target_pointer, rule['id'])})
    return {'entities': entities, 'relations': relations, 'warnings': warnings, 'records_processed': processed}


def load_catalog(path: Path | None) -> tuple[set[str] | None, dict]:
    if path is None:
        return None, {'status': 'NOT_PROVIDED'}
    files = sorted(path.glob('records-*.json')) if path.is_dir() else [path]
    known = set()
    target = {}
    total = 0
    for f in files:
        data = json_read(f)
        if not isinstance(data, dict):
            raise ValueError('CATALOG_NOT_OBJECT:' + f.name)
        if 'shards' in data and 'r' not in data:
            target = data.get('t', {})
            continue
        rows = data.get('r', data.get('items'))
        if not isinstance(rows, list):
            raise ValueError('CATALOG_ROWS_MISSING:' + f.name)
        for row in rows:
            item = row[0] if isinstance(row, list) and row else row.get('itemId') if isinstance(row, dict) else None
            ident = native_id(item)
            if ident is None:
                raise ValueError('CATALOG_ITEM_ID_INVALID:' + f.name)
            if ident in known:
                raise ValueError('CATALOG_DUPLICATE_ID:' + ident)
            known.add(ident)
            total += 1
    if path.is_dir():
        index = path / 'index.json'
        if index.exists():
            data = json_read(index)
            target = data.get('t', {}) if isinstance(data, dict) else {}
            if isinstance(data, dict) and data.get('n') != total:
                raise ValueError('CATALOG_COUNT_MISMATCH')
    return known, {'status': 'REFERENCE_ONLY', 'count': total, 'target': target}


def consolidate(results: list[dict], catalog: set[str] | None, catalog_status: dict, partial: bool) -> dict:
    nodes = {}
    edges = {}
    warnings = []
    for result in results:
        warnings.extend(result.get('warnings', []))
        for node in result.get('entities', []):
            key = (node['type'], node['id'])
            if key in nodes:
                warnings.append({'code': 'DUPLICATE_NATIVE_ENTITY', 'entity': {'type': key[0], 'id': key[1]}, 'proof': node['proof']})
                nodes[key]['proofs'].append(node['proof'])
                if nodes[key]['fields'] != node['fields']:
                    warnings.append({'code': 'CONFLICTING_ENTITY_FIELDS', 'entity': {'type': key[0], 'id': key[1]}})
            else:
                nodes[key] = {**node, 'proofs': [node['proof']]}
                nodes[key].pop('proof')
        for edge in result.get('relations', []):
            signature = json.dumps([edge['source'], edge['target'], edge['relation'], edge['fields']], sort_keys=True, ensure_ascii=False)
            if signature in edges:
                warnings.append({'code': 'DUPLICATE_RELATION', 'proof': edge['proof']})
                edges[signature]['proofs'].append(edge['proof'])
            else:
                edges[signature] = {**edge, 'proofs': [edge['proof']]}
                edges[signature].pop('proof')
    ordered_nodes = sorted(nodes.values(), key=lambda r: (r['type'], r['id']))
    ordered_edges = sorted(edges.values(), key=lambda r: (r['source']['type'], r['source']['id'], r['target']['type'], r['target']['id'], r['relation']))
    reverse = defaultdict(list)
    for edge in ordered_edges:
        reverse[(edge['target']['type'], edge['target']['id'])].append(edge)
    routes = {}
    for edge in ordered_edges:
        if edge['target']['type'] != 'Item':
            continue
        item_id = edge['target']['id']
        queue = [(edge, [edge], {('Item', item_id), (edge['source']['type'], edge['source']['id'])})]
        while queue:
            _, chain, seen = queue.pop()
            upstream = chain[0]['source']
            key = (upstream['type'], upstream['id'])
            node = nodes.get(key)
            method = node['method'] if node else 'Other'
            route = {'item_id': item_id, 'source': upstream,
                     'method': method,
                     'path': [{'source': e['source'], 'relation': e['relation'], 'target': e['target'], 'fields': e['fields'], 'proofs': e['proofs']} for e in chain],
                     'source_fields': node['fields'] if node else {},
                     'current_sale': 'UNKNOWN', 'historical_sale': 'UNKNOWN',
                     'verification': 'SOURCE_LINK_VERIFIED' if node else 'SOURCE_LINK_WITH_UNRESOLVED_NODE'}
            signature = json.dumps([route['source'], route['path']], sort_keys=True, ensure_ascii=False)
            routes.setdefault(item_id, {})[signature] = route
            if len(chain) >= 6:
                warnings.append({'code': 'MAX_RELATION_DEPTH', 'source': upstream})
                continue
            for parent_edge in reverse.get(key, []):
                parent_key = (parent_edge['source']['type'], parent_edge['source']['id'])
                if parent_key not in seen and parent_key[0] != 'Item':
                    queue.append((parent_edge, [parent_edge, *chain], seen | {parent_key}))
    route_items = [{'item_id': item_id, 'routes': [value for _, value in sorted(by_signature.items())]}
                   for item_id, by_signature in sorted(routes.items(), key=lambda item: item[0])]
    unknown_ids = sorted((item_id for item_id in routes if catalog is not None and item_id not in catalog))
    unresolved = []
    for edge in ordered_edges:
        tgt = edge['target']
        if tgt['type'] != 'Item' and (tgt['type'], tgt['id']) not in nodes:
            unresolved.append({'target': tgt, 'source': edge['source'], 'relation': edge['relation']})
    covered = {n['method'] for n in ordered_nodes if n['method'] != 'Other'}
    coverage = {category: {'status': 'EXTRACTED' if category in covered else 'UNKNOWN',
                           'confirmed_current_sale': False,
                           'notes': 'Static source data is not live shop availability.' if category in {'PremiumShop','Bundle','Offer','ScroogeStore','OrderCatalog'} else 'No verified definition rule was matched.' if category not in covered else 'Native source definitions extracted.'}
                for category in CATEGORIES}
    return {'entities': ordered_nodes, 'relations': ordered_edges, 'acquisitions': route_items,
            'validation': {'schema': SCHEMA, 'partial_input': partial, 'reference_catalog': catalog_status,
                           'entity_count': len(ordered_nodes), 'relation_count': len(ordered_edges),
                           'items_with_routes': len(route_items), 'route_count': sum(len(x['routes']) for x in route_items),
                           'unknown_item_ids_in_reference': unknown_ids,
                           'unresolved_non_item_targets': unresolved,
                           'warnings': warnings, 'coverage': coverage}}


def inspect(args: argparse.Namespace) -> None:
    src = Path(args.input)
    out = Path(args.out).resolve()
    files = iter_files(src, out)
    selected = files[:args.limit] if args.limit else files
    reports = []
    for relative, path in selected:
        size = path.stat().st_size
        kind = 'structured' if path.suffix.lower() in STRUCTURED else 'unknown_binary_or_other'
        row = {'file': relative, 'bytes': size, 'format': kind, 'sha256': sha256_file(path)}
        sample = path.open('rb')
        with sample:
            data = sample.read(min(size, 256 * 1024))
        row['keyword_hints'] = sorted(set(match.group().lower() for match in KEYWORDS.finditer(data.decode('latin1', 'ignore'))))[:40]
        if path.suffix.lower() == '.json' and size <= args.max_bytes:
            try:
                document = json_read(path, args.max_bytes)
                row['top_level_keys'] = list(document)[:100] if isinstance(document, dict) else []
                row['top_level_type'] = type(document).__name__
            except (ValueError, UnicodeError, json.JSONDecodeError) as exc:
                row['parse_warning'] = str(exc)
        reports.append(row)
    write_json(out / 'inspection.json', {'schema': SCHEMA, 'source': src.name, 'partial': len(selected) < len(files),
                                         'total_files': len(files), 'inspected_files': len(selected), 'files': reports})
    print(f'inspect: {len(selected)}/{len(files)} files -> {out / "inspection.json"}')


def extract(args: argparse.Namespace) -> None:
    src = Path(args.input)
    out = Path(args.out).resolve()
    rules_data = json_read(Path(args.rules))
    rules = validate_rules(rules_data)
    rule_hash = hashlib.sha256(json.dumps(rules_data, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
    files = [(rel, path, [r for r in rules if glob_match(rel, r['glob'])]) for rel, path in iter_files(src, out)]
    matched = [(rel, path, matches) for rel, path, matches in files if matches]
    selected = matched[:args.limit] if args.limit else matched
    records = []
    results = []
    warnings = []
    for relative, path, matching in selected:
        digest = sha256_file(path)
        cache_key = hashlib.sha256(relative.encode('utf-8')).hexdigest()
        cache_path = out / '.src02-cache' / (cache_key + '.json')
        payload = None
        if not args.fresh and cache_path.is_file():
            try:
                cache = json_read(cache_path)
                if cache.get('source_sha256') == digest and cache.get('rules_sha256') == rule_hash:
                    payload = cache['result']
            except (ValueError, OSError, KeyError, json.JSONDecodeError):
                pass
        if payload is None:
            try:
                payload = extract_file(path, relative, digest, matching, args.max_bytes, args.max_records)
                write_json(cache_path, {'source_sha256': digest, 'rules_sha256': rule_hash, 'result': payload})
                reused = False
            except (ValueError, OSError, UnicodeError, csv.Error, json.JSONDecodeError) as exc:
                warnings.append({'code': 'SOURCE_UNREADABLE_OR_UNSUPPORTED', 'file': relative, 'reason': str(exc)})
                records.append({'file': relative, 'sha256': digest, 'status': 'ERROR'})
                continue
        else:
            reused = True
        results.append(payload)
        records.append({'file': relative, 'sha256': digest, 'rules': [r['id'] for r in matching],
                        'records_processed': payload['records_processed'], 'status': 'CACHED' if reused else 'PROCESSED'})
    catalog_path = Path(args.catalog) if args.catalog else None
    if not catalog_path:
        candidate = Path(__file__).resolve().parents[2] / 'static' / 'ddv' / 'collection' / 'v1.25'
        if candidate.is_dir():
            catalog_path = candidate
    catalog, catalog_status = load_catalog(catalog_path)
    summary = consolidate(results, catalog, catalog_status, len(selected) < len(matched) or bool(warnings))
    summary['validation']['warnings'].extend(warnings)
    manifest = {'schema': SCHEMA, 'source': src.name, 'source_label': args.source_label or 'UNKNOWN',
                'rules_sha256': rule_hash, 'run_utc': datetime.now(timezone.utc).isoformat(),
                'selected_files': len(selected), 'matched_files': len(matched), 'files': records}
    for name in ('entities', 'relations', 'acquisitions', 'validation'):
        write_json(out / (name + '.json'), summary[name])
    write_json(out / 'manifest.json', manifest)
    print(f'extract: {len(results)}/{len(selected)} successful files, {len(summary["relations"])} relations, '
          f'{len(summary["acquisitions"])} items, {len(summary["validation"]["warnings"])} warnings -> {out}')
    if warnings:
        sys.exit(2)


def main() -> None:
    parser = argparse.ArgumentParser(description='Wand source-only acquisition research and extraction')
    subs = parser.add_subparsers(dest='command', required=True)
    for mode in ('inspect', 'extract'):
        sub = subs.add_parser(mode)
        sub.add_argument('--input', required=True, help='Read-only source root or a single file')
        sub.add_argument('--out', required=True, help='Local output directory (never the source root)')
        sub.add_argument('--limit', type=int, default=0, help='Maximum files for a small test (0 = all)')
        sub.add_argument('--max-bytes', type=int, default=MAX_FILE_BYTES)
        if mode == 'extract':
            sub.add_argument('--rules', required=True)
            sub.add_argument('--catalog', help='Optional Collection records directory or JSON catalog')
            sub.add_argument('--max-records', type=int, default=100000)
            sub.add_argument('--source-label', help='Descriptive, unverified source build label')
            sub.add_argument('--fresh', action='store_true', help='Recompute rather than reuse per-file cache')
    args = parser.parse_args()
    if args.limit < 0 or args.max_bytes < 1024 or (args.command == 'extract' and args.max_records < 1):
        parser.error('Invalid numeric limits')
    input_path = Path(args.input).resolve()
    output_path = Path(args.out).resolve()
    if input_path == output_path or (input_path.is_dir() and input_path in output_path.parents):
        parser.error('Output must be outside the read-only source directory')
    try:
        inspect(args) if args.command == 'inspect' else extract(args)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    main()