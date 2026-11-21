#!/usr/bin/env python3
"""Game-native, SHA-pinned SRC-02 extraction; no item definition parser duplication."""
import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

# Reuse SRC-01's canonical protobuf varint decoder, not a second item decoder.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-01-items'))
from steam1262 import varint  # noqa: E402

SCHEMA = 'wand.src02@1'
PINNED = {
    'activity': '2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296',
    'loot': '580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c',
}
MAX_FILE = 16 * 1024 * 1024
MAX_MESSAGE = 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def wire(data):
    """Read validated protobuf wire fields; field semantics come from IL2CPP types."""
    pos = 0
    out = []
    if len(data) > MAX_MESSAGE:
        raise ValueError('OVERSIZE_MESSAGE')
    while pos < len(data):
        tag, pos = varint(data, pos)
        number, kind = tag >> 3, tag & 7
        if not number or kind not in (0, 1, 2, 5):
            raise ValueError('UNSUPPORTED_WIRE_FIELD')
        if kind == 0:
            value, pos = varint(data, pos)
        elif kind == 2:
            size, pos = varint(data, pos)
            if size > len(data) - pos:
                raise ValueError('TRUNCATED_MESSAGE')
            value = data[pos:pos+size]
            pos += size
        else:
            size = 8 if kind == 1 else 4
            if size > len(data) - pos:
                raise ValueError('TRUNCATED_FIXED')
            value = data[pos:pos+size]
            pos += size
        out.append((number, kind, value))
    return out


def values(fields, number, kind):
    return [value for no, wire_type, value in fields if no == number and wire_type == kind]


def single(fields, number, kind, required=False):
    match = values(fields, number, kind)
    if len(match) > 1 or (required and not match):
        raise ValueError(f'INVALID_FIELD_{number}')
    return match[0] if match else None


def text_value(fields, number):
    value = single(fields, number, 2)
    return value.decode('utf-8') if value is not None else None


def ids(fields, number):
    found = values(fields, number, 0)
    for part in values(fields, number, 2):
        pos = 0
        while pos < len(part):
            v, pos = varint(part, pos)
            found.append(v)
    return found


def frames(data, base):
    pos, seen = 0, set()
    while pos < len(data):
        key, pos = varint(data, pos)
        size, pos = varint(data, pos)
        if key in seen or size < 1 or size > MAX_MESSAGE or size > len(data) - pos:
            raise ValueError('INVALID_FRAME')
        seen.add(key)
        record = wire(data[pos:pos+size])
        pos += size
        item_id = single(record, 1, 0, True)
        if item_id != base + key:
            raise ValueError('FRAME_KEY_ID_MISMATCH')
        yield item_id, record


def ingredient(block, crafting):
    data = wire(block)
    if crafting:
        item_id, quantity = single(data, 1, 0, True), single(data, 2, 0)
        if not item_id or quantity is None or quantity <= 0:
            raise ValueError('INVALID_CRAFT_INGREDIENT')
        return {'kind': 'item', 'itemId': item_id, 'quantity': quantity}
    variants = [(field, number) for field, number in [('item', 1), ('anyTag', 2),
                 ('itemAlternatives', 3), ('tagAlternatives', 4)]
                if single(data, number, 0) is not None or single(data, number, 2) is not None]
    if len(variants) != 1:
        raise ValueError('INVALID_MEAL_INGREDIENT_ONEOF')
    kind, field = variants[0]
    if kind in ('item', 'anyTag'):
        item_id = single(data, field, 0, True)
        return {'kind': kind, 'itemId' if kind == 'item' else 'tagId': item_id, 'quantity': 1}
    sub = wire(single(data, field, 2, True))
    candidates = sorted(set(ids(sub, 1)))
    if not candidates:
        raise ValueError('EMPTY_INGREDIENT_ALTERNATIVES')
    return {'kind': kind, 'itemIds' if kind == 'itemAlternatives' else 'tagIds': candidates,
            'quantity': 1}


def conditions(block):
    """Opaque digest: never interpret server/event-dependent conditions from static bytes."""
    return sha(block) if block else None


def result(block, crafting=False):
    f = wire(block)
    item = single(f, 1, 0, True)
    if item <= 0:
        raise ValueError('INVALID_RESULT_ITEM')
    quantity = single(f, 2, 0) if crafting else None
    if quantity is not None and quantity <= 0:
        raise ValueError('INVALID_RESULT_QUANTITY')
    return item, quantity


def parse_activity(data):
    recipes, paths, unparsed = [], [], []
    for recipe_id, f in frames(data, 2050000000):
        name = text_value(f, 2)
        if not name:
            raise ValueError('MISSING_ACTIVITY_NAME')
        index = recipe_id - 2050000000
        source = {'kind': 'game_native', 'file': 'itemlist/ActivityData.json', 'definitionId': recipe_id}
        if index < 100000 and name.startswith('Meal!'):
            output = single(f, 7, 0, True)
            ing = [ingredient(v, False) for v in values(f, 11, 2)]
            recipes.append({'recipeId': recipe_id, 'type': 'cooking', 'nameKey': name,
                            'resultItemId': output, 'resultQuantity': None, 'ingredients': ing,
                            'maxIngredients': single(f, 10, 0), 'appearWhen': None,
                            'conditionDigest': None, 'source': source})
        elif 300000 <= index < 400000 and single(f, 6, 2) is not None:
            output, quantity = result(single(f, 6, 2, True), True)
            ing = [ingredient(v, True) for v in values(f, 7, 2)]
            appear = single(f, 9, 2)
            af = wire(appear) if appear else []
            flags = {'hasMaterial': single(af, 1, 0), 'acquired': single(af, 2, 0),
                     'requiredByMission': single(af, 3, 0), 'conditionsMeet': single(af, 4, 0),
                     'mode': single(af, 10, 0)}
            recipes.append({'recipeId': recipe_id, 'type': 'crafting', 'nameKey': name,
                            'resultItemId': output, 'resultQuantity': quantity,
                            'ingredients': ing, 'recipeTypeId': single(f, 8, 0),
                            'appearWhen': flags, 'conditionDigest': conditions(single(af, 5, 2)),
                            'source': source})
        elif 100000 <= index < 200000 and single(f, 6, 2) is not None:
            item, _ = result(single(f, 6, 2, True))
            paths.append({'pathId': f'fishing:{recipe_id}', 'type': 'fishing',
                          'itemId': item, 'definitionId': recipe_id, 'nameKey': name,
                          'areaIds': ids(f, 9), 'rarity': single(f, 7, 0),
                          'timeOfDays': [v.decode('utf-8') for v in values(f, 16, 2)],
                          'weathers': [v.decode('utf-8') for v in values(f, 18, 2)],
                          'conditionDigest': conditions(single(f, 19, 2)),
                          'source': source})
        elif 200000 <= index < 300000 and single(f, 6, 2) is not None:
            item, _ = result(single(f, 6, 2, True))
            location = single(f, 7, 2)
            filter_data = wire(location) if location else []
            paths.append({'pathId': f'mining:{recipe_id}', 'type': 'mining',
                          'itemId': item, 'definitionId': recipe_id, 'nameKey': name,
                          'areaId': single(filter_data, 1, 0),
                          'sceneId': single(filter_data, 2, 0),
                          'rarity': single(f, 9, 0), 'conditionDigest': None, 'source': source})
        elif 400000 <= index < 500000 and single(f, 6, 2) is not None:
            item, _ = result(single(f, 6, 2, True))
            area = []
            for loc in values(f, 14, 2):
                lf = wire(loc)
                area.append({'areaId': single(lf, 1, 0), 'sceneId': single(lf, 2, 0)})
            mm = single(f, 8, 2)
            mmf = wire(mm) if mm else []
            paths.append({'pathId': f'timebending:{recipe_id}', 'type': 'timebending',
                          'itemId': item, 'definitionId': recipe_id, 'nameKey': name,
                          'category': text_value(f, 10), 'amount': single(f, 7, 0),
                          'minMax': {'min': single(mmf, 1, 0), 'max': single(mmf, 2, 0)} if mm else None,
                          'minHourglassLevel': single(f, 12, 0), 'locations': area,
                          'conditionDigest': conditions(single(f, 13, 2)), 'source': source})
        else:
            unparsed.append({'definitionId': recipe_id, 'nameKey': name, 'reason': 'unsupported_activity_class_or_incomplete_fields'})
    return recipes, paths, unparsed


def parse_loot(data):
    tables, acquisitions = [], []
    for table_id, f in frames(data, 2090000000):
        name = text_value(f, 2)
        table = single(f, 6, 2, True)
        groups = []
        for index, sub in enumerate(values(wire(table), 1, 2)):
            sf = wire(sub)
            candidates = []
            for entry in values(sf, 10, 2):
                item_id, _ = result(entry)
                candidates.append({'itemId': item_id, 'conditionDigest': None})
            for conditional in values(sf, 11, 2):
                cf = wire(conditional)
                condition_hash = conditions(single(cf, 1, 2))
                for entry in values(cf, 2, 2):
                    item_id, _ = result(entry)
                    candidates.append({'itemId': item_id, 'conditionDigest': condition_hash})
            groups.append({'index': index, 'min': single(sf, 1, 0), 'max': single(sf, 2, 0),
                           'weight': single(sf, 3, 0), 'empty': single(sf, 4, 0),
                           'candidates': candidates,
                           'eligibilityDigest': conditions(single(sf, 101, 2)),
                           'hasDynamicTypeFilters': bool(values(sf, 12, 2) or values(sf, 100, 2))})
            for ordinal, c in enumerate(candidates):
                acquisitions.append({'pathId': f'loot:{table_id}:{index}:{ordinal}',
                    'type': 'loot_table_candidate', 'itemId': c['itemId'],
                    'definitionId': table_id, 'nameKey': name, 'groupIndex': index,
                    'conditionDigest': c['conditionDigest'], 'contextVerified': False,
                    'source': {'kind': 'game_native', 'file': 'itemlist/LootTable.json', 'definitionId': table_id}})
        tables.append({'lootTableId': table_id, 'nameKey': name, 'groups': groups,
                       'source': {'kind': 'game_native', 'file': 'itemlist/LootTable.json', 'definitionId': table_id}})
    return tables, acquisitions


def read_items(path):
    result = {}
    with path.open('r', encoding='utf-8') as stream:
        for no, line in enumerate(stream, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            item_id = row.get('itemId')
            if type(item_id) is not int or item_id <= 0 or item_id in result:
                raise ValueError(f'INVALID_SRC01_ITEM_{no}')
            result[item_id] = row
    return result


def dump_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n', encoding='utf-8')


def dump_rows(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(''.join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n' for row in rows), encoding='utf-8')


def load_rows(path, key):
    return {str(r[key]): r for line in path.read_text(encoding='utf-8').splitlines()
            if line.strip() for r in [json.loads(line)]}


def diff_sets(old, new, out):
    files = {'recipes.jsonl':'recipeId', 'acquisitions.jsonl':'pathId',
             'loot-tables.jsonl':'lootTableId', 'shop-offers.jsonl':'offerId'}
    comparisons = {}
    for filename, key in files.items():
        before = load_rows(old / filename, key)
        after = load_rows(new / filename, key)
        changes = sorted(k for k in before.keys() & after.keys() if before[k] != after[k])
        comparisons[filename] = {'added': sorted(after.keys() - before.keys()),
                                  'removed': sorted(before.keys() - after.keys()), 'changed': changes}
    dump_json(out, {'schema': 'wand.src02.diff@1', 'sets': comparisons,
                    'note': 'Dataset-level differences do not prove live shop rotations or event availability.'})


def run(args):
    if args.version != '1.26.2' or args.platform != 'Steam':
        raise ValueError('ONLY_SHA_PINNED_STEAM_1262_SUPPORTED')
    src01 = json.loads(args.src01_manifest.read_text(encoding='utf-8'))
    data = args.items.read_bytes()
    if src01.get('schema') != 'wand.src01.steam-native@1' or src01.get('gameVersion') != args.version or \
       src01.get('platform') != args.platform or src01.get('itemsSha256') != sha(data):
        raise ValueError('SRC01_MANIFEST_MISMATCH')
    item_map = read_items(args.items)
    if src01.get('itemCount') != len(item_map):
        raise ValueError('SRC01_ITEM_COUNT_MISMATCH')
    content = {}
    for role, path in [('activity', args.activity), ('loot', args.loot)]:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_FILE:
            raise ValueError(f'INVALID_SOURCE_{role}')
        content[role] = path.read_bytes()
        if sha(content[role]) != PINNED[role]:
            raise ValueError(f'UNVERIFIED_SOURCE_SHA256_{role}')
    if args.out.resolve() in [p.resolve() for p in (args.items, args.activity, args.loot, args.src01_manifest)]:
        raise ValueError('OUTPUT_OVERLAPS_INPUT')
    recipes, paths, unparsed = parse_activity(content['activity'])
    tables, loot_paths = parse_loot(content['loot'])
    paths.extend(loot_paths)
    recipes.sort(key=lambda x: x['recipeId'])
    paths.sort(key=lambda x: x['pathId'])
    tables.sort(key=lambda x: x['lootTableId'])
    related = defaultdict(lambda: {'recipesProducedBy': [], 'recipesUsedBy': [], 'acquisitionPaths': []})
    linked = set()
    for rec in recipes:
        related[rec['resultItemId']]['recipesProducedBy'].append(rec['recipeId'])
        linked.add(rec['resultItemId'])
        for ingredient_row in rec['ingredients']:
            for item_id in ([ingredient_row['itemId']] if ingredient_row['kind'] == 'item' else ingredient_row.get('itemIds', [])):
                related[item_id]['recipesUsedBy'].append(rec['recipeId'])
                linked.add(item_id)
    for path in paths:
        related[path['itemId']]['acquisitionPaths'].append(path['pathId'])
        linked.add(path['itemId'])
    indexes = [{'itemId': iid, 'inSrc01': iid in item_map,
                **{k: sorted(set(v)) for k,v in related[iid].items()}} for iid in sorted(related)]
    unresolved = {'schema': 'wand.src02.unresolved@1',
                  'missingInPartialSrc01': sorted(linked - item_map.keys()),
                  'unsupportedActivityDefinitions': unparsed,
                  'unverified': ['live shop inventory/rotation', 'shop prices and limits',
                      'quest/event availability and rewards not linked from source',
                      'dynamic loot filters and drop probabilities',
                      'cooking recipe result quantity (not encoded)',
                      'generic cooking ingredient tags and alternatives require tag resolver',
                      'uninterpreted encoded conditions and visibility gates',
                      'location enum labels and world unlock state'],
                  'notAStatementOfAbsence': True}
    out = args.out
    dump_rows(out / 'recipes.jsonl', recipes)
    dump_rows(out / 'acquisitions.jsonl', paths)
    dump_rows(out / 'loot-tables.jsonl', tables)
    dump_rows(out / 'shop-offers.jsonl', [])
    dump_rows(out / 'related-items.jsonl', indexes)
    dump_json(out / 'unresolved.json', unresolved)
    counts = {'recipes': len(recipes), 'cooking': sum(r['type']=='cooking' for r in recipes),
              'crafting': sum(r['type']=='crafting' for r in recipes),
              'acquisitions': len(paths), 'lootTables': len(tables),
              'shopOffersVerified': 0, 'sourceItems': len(item_map),
              'linkedItemIds': len(related), 'unresolvedLinkedItemIds': len(linked-item_map.keys()),
              'unsupportedActivityDefinitions': len(unparsed)}
    dump_json(out / 'report.json', {'schema': 'wand.src02.report@1', 'status': 'partial_native_extraction', 'counts': counts})
    files = ['recipes.jsonl','acquisitions.jsonl','loot-tables.jsonl','shop-offers.jsonl',
             'related-items.jsonl','report.json','unresolved.json']
    manifest = {'schema': SCHEMA, 'status': 'partial_native_extraction',
                'platform': args.platform, 'gameVersion': args.version,
                'source': {'src01ManifestSha256': sha(args.src01_manifest.read_bytes()),
                           'src01ItemsSha256': sha(data),
                           'activityDataSha256': sha(content['activity']),
                           'lootTableSha256': sha(content['loot']),
                           'nativeTypeEvidence': 'Steam v1.26.1 dump.cs: RecipeItemData, CraftingRecipeItemData, FishingDataItemData, MiningDataItemData, TimeBendingDataItemData, LootTableItemData'},
                'counts': counts, 'files': {file: sha((out/file).read_bytes()) for file in files}}
    dump_json(out / 'manifest.json', manifest)
    if args.previous:
        diff_sets(args.previous, out, out / 'version-diff.json')
    print(json.dumps({'status': manifest['status'], **counts}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description='SHA-pinned Dreamwish Wand SRC-02 acquisition extractor')
    p = parser.add_subparsers(dest='command', required=True)
    ex = p.add_parser('extract')
    ex.add_argument('--activity', type=Path, required=True)
    ex.add_argument('--loot', type=Path, required=True)
    ex.add_argument('--items', type=Path, required=True)
    ex.add_argument('--src01-manifest', type=Path, required=True)
    ex.add_argument('--out', type=Path, required=True)
    ex.add_argument('--version', default='1.26.2')
    ex.add_argument('--platform', default='Steam')
    ex.add_argument('--previous', type=Path)
    diff = p.add_parser('diff')
    diff.add_argument('--old', type=Path, required=True)
    diff.add_argument('--new', type=Path, required=True)
    diff.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    try:
        run(args) if args.command == 'extract' else diff_sets(args.old, args.new, args.out)
    except (OSError, ValueError, KeyError, TypeError, UnicodeError) as exc:
        parser.exit(1, f'SRC-02 failed: {exc}\n')

if __name__ == '__main__':
    main()