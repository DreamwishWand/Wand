import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

SCHEMA = 'dreamwish-wand.src-05-world@1'
CANDIDATE = re.compile(r'world|grid|biome|island|interior|area|scene|placement|furnitur|building|landscap|decor|road|fence|itemdata|\bitems\b|geometry', re.I)
GRID_PATH = re.compile(r'GridData[/\\](?:Villages|FloatingIslands|Furniture|Buildings|Interiors|Interior|Rooms)[/\\]', re.I)
CATEGORIES = ('furniture', 'building', 'landscap', 'decor', 'road', 'fence', 'scener', 'object')
GEOMETRY = ('SizeX', 'SizeY', 'sizeX', 'sizeY', 'Footprint', 'footprint', 'AcceptedFloorTypesFlag', 'acceptedFloorTypesFlag', 'AreaTessellationFactor', 'areaTessellationFactor', 'GridArea', 'gridArea')
PROTECTION = ('IsMissionItem', 'isMissionItem', 'IsQuestItem', 'isQuestItem', 'DisableGridEditMode', 'disableGridEditMode', 'IsSystemObject', 'isSystemObject', 'LockedConditionItemID', 'lockedConditionItemID', 'ExplicitGridEditRestriction', 'explicitGridEditRestriction', 'HasBuildingStateSynchronizer', 'hasBuildingStateSynchronizer')
CONNECTIONS = ('Connections', 'connections', 'ConnectionTypes', 'RoadConnections', 'FenceConnections', 'ConnectedRoadIDs', 'ConnectedFenceIDs')
IDENTIFIERS = ('PlacementID', 'PlacementId', 'GridObjectID', 'ObjectID', 'DefinitionID', 'PrefabGUID', 'AssetGUID', 'm_GUID')
JSON_EXT = ('.json', '.jsonl')
CACHE_VERSION = 1


def first(data, *keys):
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return None


def number(value, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        parsed = int(value)
    except (ValueError, TypeError, OverflowError):
        return None
    if str(value).strip() != str(parsed) and not isinstance(value, (int, float)):
        return None
    if parsed < 0 or (positive and parsed == 0) or parsed > 2147483647:
        return None
    return parsed


def scalar(value):
    return value is None or isinstance(value, (str, int, float, bool))


def safe_field(value):
    if scalar(value):
        return value
    if isinstance(value, (list, dict)):
        encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        return value if len(encoded) <= 4096 else {'unexpandedSha256': hashlib.sha256(encoded.encode()).hexdigest(), 'bytes': len(encoded)}
    return None


def digest(data):
    return hashlib.sha256(data).hexdigest()


def stable(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    with temp.open('w', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, ensure_ascii=False, sort_keys=True, indent=2)
        stream.write('\n')
    os.replace(temp, path)


def list_files(root):
    for directory, subdirs, filenames in os.walk(root, followlinks=False):
        subdirs[:] = sorted(name for name in subdirs if not (Path(directory) / name).is_symlink() and name not in ('.git', 'node_modules', '__pycache__'))
        for name in sorted(filenames):
            path = Path(directory) / name
            if path.is_file() and not path.is_symlink():
                yield path.relative_to(root).as_posix(), path


def inventory(root):
    counts = Counter()
    markers = []
    candidates = []
    binary = Counter()
    for rel, path in list_files(root):
        suffix = path.suffix.lower() or '[none]'
        counts[suffix] += 1
        if path.name.lower() in ('gameassembly.dll', 'global-metadata.dat', 'globalgamemanagers', 'resources.assets', 'sharedassets0.assets'):
            markers.append(rel)
        if CANDIDATE.search(rel) and suffix not in JSON_EXT:
            binary[suffix] += 1
        if suffix in JSON_EXT and CANDIDATE.search(rel):
            candidates.append((rel, path))
    return counts, markers, candidates, binary


def walk(document, node_budget=50000, max_depth=12):
    stack = [('$', document, 0)]
    seen = 0
    while stack:
        pointer, node, depth = stack.pop()
        if seen >= node_budget:
            yield '$', {'_src05_truncated': True}
            break
        seen += 1
        if isinstance(node, dict):
            yield pointer, node
            if depth < max_depth:
                for key in sorted(node, reverse=True):
                    child = node[key]
                    if isinstance(child, (list, dict)):
                        stack.append((pointer + '/' + str(key).replace('~', '~0').replace('/', '~1'), child, depth + 1))
        elif isinstance(node, list) and depth < max_depth:
            for index in range(len(node) - 1, -1, -1):
                if isinstance(node[index], (dict, list)):
                    stack.append((pointer + '/' + str(index), node[index], depth + 1))


def extract(document, rel, sha):
    worlds, placements, links, problems = [], [], [], []
    source = {'path': rel, 'sha256': sha}
    for pointer, node in walk(document):
        if node.get('_src05_truncated'):
            problems.append({'code': 'NODE_BUDGET_EXCEEDED', 'source': source})
            break
        evidence = {**source, 'pointer': pointer}
        explicit_grid_path = first(node, 'GridDataPath', 'gridDataPath', 'grid_data_path')
        possible_grid = explicit_grid_path if isinstance(explicit_grid_path, str) and GRID_PATH.search(explicit_grid_path) else None
        if possible_grid or (GRID_PATH.search(rel) and first(node, 'SizeX', 'sizeX') is not None and first(node, 'SizeY', 'sizeY') is not None):
            grid_path = possible_grid or rel
            world = {'gridDataPath': grid_path.replace('\\', '/'), 'source': evidence, 'kind': 'UNVERIFIED', 'sizeX': number(first(node, 'SizeX', 'sizeX'), True), 'sizeY': number(first(node, 'SizeY', 'sizeY'), True)}
            for key in ('SceneGridName', 'sceneGridName', 'VillageAreaType', 'villageAreaType', 'BiomeID', 'biomeId', 'WorldID', 'worldId', 'IslandID', 'islandId', 'AreaID', 'areaId', 'GridID', 'gridId', 'TessellationFactor', 'tessellationFactor', 'DisableGridEditMode', 'disableGridEditMode', 'LockedConditionItemID', 'lockedConditionItemID'):
                if key in node and scalar(node[key]):
                    world[key] = node[key]
            worlds.append(world)
            if world['sizeX'] is None or world['sizeY'] is None:
                problems.append({'code': 'GRID_DIMENSIONS_UNVERIFIED', 'gridDataPath': grid_path, 'source': evidence})
        item_id = number(first(node, 'ItemID', 'ItemId', 'itemId'))
        if item_id is None and re.search(r'[/\\]Items?[/\\]|ItemData', rel, re.I) and any(k in node for k in GEOMETRY):
            item_id = number(first(node, 'ID', 'Id', 'id'))
        tagged = any(term in rel.lower() for term in CATEGORIES)
        has_definition = any(k in node for k in GEOMETRY + PROTECTION + CONNECTIONS + IDENTIFIERS)
        if item_id is None or not (tagged or has_definition):
            continue
        geom = {}
        for output, keys in {
            'sizeX': ('SizeX', 'sizeX'),
            'sizeY': ('SizeY', 'sizeY'),
            'areaTessellationFactor': ('AreaTessellationFactor', 'areaTessellationFactor'),
            'gridTessellationFactor': ('GridTessellationFactor', 'gridTessellationFactor'),
            'strideOverride': ('StrideOverride', 'strideOverride'),
            'acceptedFloorTypesFlag': ('AcceptedFloorTypesFlag', 'acceptedFloorTypesFlag'),
        }.items():
            raw = first(node, *keys)
            if raw is not None:
                parsed = number(raw, positive=output in ('sizeX', 'sizeY', 'areaTessellationFactor', 'gridTessellationFactor'))
                if parsed is not None:
                    geom[output] = parsed
                else:
                    problems.append({'code': 'INVALID_GEOMETRY_FIELD', 'itemId': item_id, 'field': output, 'source': evidence})
        footprint = first(node, 'Footprint', 'footprint')
        if isinstance(footprint, list):
            geom['footprint'] = safe_field(footprint)
        flags = {key: safe_field(node[key]) for key in PROTECTION if key in node and (scalar(node[key]) or isinstance(node[key], (list, dict)))}
        placement = {'itemId': item_id, 'source': evidence, 'geometry': geom, 'protectionSignals': flags, 'editAuthorization': 'UNVERIFIED'}
        for key in ('ConcreteType', 'concreteType', 'm_Name', 'Name', 'BuildingItemType', 'buildingItemType', 'SubGridDataPath', 'subGridDataPath', 'ClearArea', 'clearArea', 'AutomaticSpawning', 'automaticSpawning', 'AllowedOrientations', 'allowedOrientations', 'RotationStep', 'rotationStep', 'FloorType', 'floorType', 'GridArea', 'gridArea'):
            if key in node:
                placement[key] = safe_field(node[key])
        for key in CONNECTIONS:
            if key in node:
                placement[key] = safe_field(node[key])
        native_ids = {key: safe_field(node[key]) for key in IDENTIFIERS if key in node and scalar(node[key]) and node[key] not in (None, '')}
        if native_ids:
            placement['nativePlacementIdentifiers'] = native_ids
            for key, value in native_ids.items():
                links.append({'itemId': item_id, 'identifierType': key, 'identifier': value, 'source': evidence, 'verification': 'SAME_RECORD'})
        if 'sizeX' in geom and 'sizeY' not in geom or 'sizeY' in geom and 'sizeX' not in geom:
            problems.append({'code': 'INCOMPLETE_FOOTPRINT', 'itemId': item_id, 'source': evidence})
        if not geom:
            problems.append({'code': 'PLACEMENT_GEOMETRY_UNVERIFIED', 'itemId': item_id, 'source': evidence})
        if flags:
            problems.append({'code': 'PROTECTION_REQUIRES_RUNTIME_REVIEW', 'itemId': item_id, 'source': evidence})
        placements.append(placement)
    return {'worlds': worlds, 'placements': placements, 'links': links, 'unresolved': problems}


def parse_source(path, rel, max_bytes):
    content = path.read_bytes()
    sha = digest(content)
    if len(content) > max_bytes:
        return {'worlds': [], 'placements': [], 'links': [], 'unresolved': [{'code': 'FILE_SIZE_LIMIT', 'source': {'path': rel, 'sha256': sha}, 'size': len(content)}]}, sha
    try:
        if path.suffix.lower() == '.jsonl':
            merged = {'worlds': [], 'placements': [], 'links': [], 'unresolved': []}
            for row, line in enumerate(content.decode('utf-8-sig').splitlines(), 1):
                if line.strip():
                    parsed = extract(json.loads(line), rel + '#L' + str(row), sha)
                    for key in merged:
                        merged[key].extend(parsed[key])
            return merged, sha
        return extract(json.loads(content.decode('utf-8-sig')), rel, sha), sha
    except (UnicodeError, ValueError, RecursionError) as error:
        return {'worlds': [], 'placements': [], 'links': [], 'unresolved': [{'code': 'JSON_PARSE_FAILED', 'source': {'path': rel, 'sha256': sha}, 'error': str(error)[:300]}]}, sha


def validate_duplicates(worlds, placements):
    problems = []
    paths = defaultdict(set)
    for world in worlds:
        if world['sizeX'] is not None and world['sizeY'] is not None:
            paths[world['gridDataPath']].add((world['sizeX'], world['sizeY']))
    for grid_path, values in paths.items():
        if len(values) > 1:
            problems.append({'code': 'CONFLICTING_GRID_DIMENSIONS', 'gridDataPath': grid_path, 'observed': sorted(values)})
    by_item = defaultdict(set)
    for item in placements:
        geometry = item['geometry']
        if 'sizeX' in geometry and 'sizeY' in geometry:
            by_item[item['itemId']].add((geometry['sizeX'], geometry['sizeY'], geometry.get('areaTessellationFactor')))
    for item_id, values in by_item.items():
        if len(values) > 1:
            problems.append({'code': 'CONFLICTING_ITEM_GEOMETRY', 'itemId': item_id, 'observed': sorted((list(x) for x in values), key=stable)})
    return problems


def change_set(previous, current, key):
    a = {stable(key(x)): digest(stable(x).encode()) for x in previous}
    b = {stable(key(x)): digest(stable(x).encode()) for x in current}
    return {'added': sorted(set(b) - set(a)), 'removed': sorted(set(a) - set(b)), 'changed': sorted(k for k in a.keys() & b.keys() if a[k] != b[k])}


def previous_data(path):
    with path.open('r', encoding='utf-8') as stream:
        return json.load(stream)


def build(args, root, out, candidates, binary):
    cache = out / '.cache'
    cache.mkdir(parents=True, exist_ok=True)
    selected = candidates[args.start:args.start + args.limit if args.limit is not None else None]
    selected = [(rel, path) for index, (rel, path) in enumerate(selected, args.start) if index % args.shards == args.shard]
    hit = updated = 0
    for rel, path in selected:
        st = path.stat()
        key = hashlib.sha256(rel.encode()).hexdigest()
        target = cache / (key + '.json')
        old = None
        if target.exists():
            try:
                old = previous_data(target)
            except (OSError, ValueError):
                pass
        if old and old.get('cacheVersion') == CACHE_VERSION and old.get('relative') == rel and old.get('size') == st.st_size and old.get('mtimeNs') == st.st_mtime_ns and not args.rehash:
            hit += 1
            continue
        data, sha = parse_source(path, rel, args.max_bytes)
        write_json(target, {'cacheVersion': CACHE_VERSION, 'relative': rel, 'size': st.st_size, 'mtimeNs': st.st_mtime_ns, 'sha256': sha, 'data': data})
        updated += 1
    merged = {'worlds': [], 'placements': [], 'links': [], 'unresolved': []}
    file_hashes = {}
    ready = 0
    for rel, path in candidates:
        target = cache / (hashlib.sha256(rel.encode()).hexdigest() + '.json')
        if not target.exists():
            continue
        try:
            entry = previous_data(target)
            st = path.stat()
            if entry.get('relative') != rel or entry.get('cacheVersion') != CACHE_VERSION or entry.get('size') != st.st_size or entry.get('mtimeNs') != st.st_mtime_ns:
                continue
            ready += 1
            file_hashes[rel] = entry['sha256']
            for k in merged:
                merged[k].extend(entry['data'][k])
        except (OSError, ValueError, KeyError):
            continue
    for k in ('worlds', 'placements', 'links'):
        merged[k].sort(key=stable)
    merged['unresolved'].extend(validate_duplicates(merged['worlds'], merged['placements']))
    for k in merged:
        merged[k].sort(key=stable)
    status = 'COMPLETE_JSON_SCAN' if ready == len(candidates) else 'PARTIAL_JSON_SCAN'
    if binary:
        status += '_BINARY_UNEXTRACTED'
    manifest = {'schema': SCHEMA, 'status': status, 'inputRoot': str(root), 'sourcePlatform': args.platform, 'gameVersion': args.game_version, 'buildId': args.build_id, 'sources': file_hashes, 'counts': {'candidateFiles': len(candidates), 'processedFiles': ready, 'newOrChangedThisRun': updated, 'cacheHitsThisRun': hit, 'worldRecords': len(merged['worlds']), 'placementRecords': len(merged['placements']), 'idLinks': len(merged['links']), 'unresolved': len(merged['unresolved'])}, 'binaryCandidateExtensions': dict(sorted(binary.items())), 'note': 'Static extraction only; no operation is authorized by this manifest.'}
    write_json(out / 'worlds.json', {'schema': SCHEMA, 'records': merged['worlds']})
    write_json(out / 'placements.json', {'schema': SCHEMA, 'records': merged['placements']})
    write_json(out / 'id-map.json', {'schema': SCHEMA, 'records': merged['links']})
    write_json(out / 'unresolved.json', {'schema': SCHEMA, 'records': merged['unresolved']})
    write_json(out / 'manifest.json', manifest)
    if args.previous:
        old_worlds = previous_data(Path(args.previous) / 'worlds.json')['records']
        old_placements = previous_data(Path(args.previous) / 'placements.json')['records']
        diff = {'schema': SCHEMA, 'worlds': change_set(old_worlds, merged['worlds'], lambda x: [x.get('gridDataPath'), x.get('source', {}).get('pointer')]), 'placements': change_set(old_placements, merged['placements'], lambda x: [x.get('itemId'), x.get('source', {}).get('pointer')])}
    else:
        diff = {'schema': SCHEMA, 'status': 'NO_PREVIOUS_BASELINE'}
    write_json(out / 'diff.json', diff)
    report = '\n'.join(['# SRC-05 WORLD DATA', '', f'Status: {status}', f'Input: {root}', f'Platform: {args.platform or "UNVERIFIED"}', f'Version: {args.game_version or "UNVERIFIED"}', f'Build: {args.build_id or "UNVERIFIED"}', f'JSON candidates: {len(candidates)}', f'Processed: {ready}', f'World records: {len(merged["worlds"])}', f'Placement records: {len(merged["placements"])}', f'Native ID links: {len(merged["links"])}', f'Unresolved: {len(merged["unresolved"])}', '', 'All editability, actual coordinates, grid ownership, runtime collision, and quest safety remain UNVERIFIED unless independently proven.', 'Unity bundles, assets and raw IL2CPP binaries are inventoried but not decoded.', '', 'Unresolved codes:', *(f'- {k}: {v}' for k, v in sorted(Counter(r['code'] for r in merged['unresolved']).items())), ''])
    (out / 'report.md').write_text(report, encoding='utf-8')
    print(report)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Read-only DDV world/placement source inventory and JSON extraction')
    parser.add_argument('command', choices=('inspect', 'build'))
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--platform')
    parser.add_argument('--game-version')
    parser.add_argument('--build-id')
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--limit', type=int)
    parser.add_argument('--shards', type=int, default=1)
    parser.add_argument('--shard', type=int, default=0)
    parser.add_argument('--max-bytes', type=int, default=33554432)
    parser.add_argument('--rehash', action='store_true')
    parser.add_argument('--previous')
    args = parser.parse_args(argv)
    root = args.input.resolve(strict=True)
    out = args.output.resolve()
    if not root.is_dir() or out == root or root in out.parents:
        parser.error('Input must be a directory and output must be outside input')
    if args.start < 0 or args.limit is not None and args.limit < 0 or args.shards < 1 or not 0 <= args.shard < args.shards or args.max_bytes < 1:
        parser.error('Invalid batch or size arguments')
    counts, markers, candidates, binary = inventory(root)
    out.mkdir(parents=True, exist_ok=True)
    if args.command == 'inspect':
        result = {'schema': SCHEMA, 'inputRoot': str(root), 'fileCountsByExtension': dict(sorted(counts.items())), 'unityMarkers': markers, 'jsonCandidateFiles': len(candidates), 'jsonSamples': [x[0] for x in candidates[:200]], 'binaryCandidateExtensions': dict(sorted(binary.items())), 'limitations': ['Unpacked Unity binary assets require a separate supported extractor.', 'Filename candidates are not proof of world/placement semantics.']}
        write_json(out / 'source-inventory.json', result)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    build(args, root, out, candidates, binary)
    return 0


if __name__ == '__main__':
    sys.exit(main())
