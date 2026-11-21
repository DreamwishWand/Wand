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
from steam1262 import varint, parse_category  # noqa: E402

SCHEMA = 'wand.src02@1'
PINNED = {
    'activity': '2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296',
    'loot': '580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c',
    'activity_item': '4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2',
    'building': 'e8ee2f1637518b9f233c2e0b667493a44eee11ad5f137e182bc555f797c5f6e0',
    'condition': 'f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150',
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



def duration_seconds(raw):
    if raw is None:
        return None
    fields = wire(raw)
    seconds = single(fields, 1, 0) or 0
    nanos = single(fields, 2, 0)
    if seconds < 0 or (nanos is not None and not 0 <= nanos < 1_000_000_000):
        raise ValueError('INVALID_SEED_DURATION')
    return seconds + (nanos or 0) / 1_000_000_000 if nanos else seconds


def parse_gardening(data):
    # SRC-01 is authoritative for the item frame and ID/name mapping.
    native_items = parse_category(data, 'ActivityItem')
    records = list(frames(data, 30000000))
    if len(native_items) != len(records):
        raise ValueError('SRC01_ACTIVITY_ITEM_COUNT_MISMATCH')
    paths = []
    for native, (seed_id, fields) in zip(native_items, records):
        name = text_value(fields, 2)
        if native['itemId'] != seed_id or native['rawNameField'] != name:
            raise ValueError('SRC01_ACTIVITY_ITEM_RECORD_MISMATCH')
        # Exact SeedItemData subtype from source ID/name contract: do not treat
        # unrelated ActivityItemData field 13 as a ProducedItemID.
        if not (name.startswith(('Crop!', 'FruitTree!')) and name.endswith('_Seed')):
            continue
        if single(fields, 12, 0, True) != 1:
            raise ValueError('SEED_DOES_NOT_PRODUCE_ITEM')
        output, amount = single(fields, 13, 0, True), single(fields, 14, 0, True)
        if output <= 0 or amount <= 0:
            raise ValueError('INVALID_SEED_PRODUCTION')
        paths.append({'pathId': f'growing:{seed_id}', 'type': 'growing',
                      'itemId': output, 'seedItemId': seed_id,
                      'nameKey': name, 'producedAmount': amount,
                      'growthSeconds': duration_seconds(single(fields, 9, 2)),
                      'productionSeconds': duration_seconds(single(fields, 15, 2)),
                      'wateringCount': single(fields, 10, 0),
                      'growthPeriods': single(fields, 16, 0),
                      'destructAfterGrowth': single(fields, 17, 0),
                      'villageAreaIds': ids(fields, 21),
                      'minimumStallLevel': single(fields, 22, 0),
                      'source': {'kind':'game_native','file':'itemlist/ActivityItem.json',
                                 'definitionId': seed_id}})
    return paths



def item_amount(block):
    """ItemAmount protobuf: 1=Id, 2=Amount. Missing Amount is not a known free price."""
    fields = wire(block)
    item_id = single(fields, 1, 0, True)
    amount = single(fields, 2, 0)
    if not item_id or amount is not None and amount < 0:
        raise ValueError('INVALID_COST_ITEM_AMOUNT')
    return {'itemId': item_id, 'amount': amount}


BENEFIT_TYPES = {10: 'fishing', 11: 'gardening', 12: 'kitchen',
                 13: 'garden', 14: 'house', 15: 'restaurant',
                 16: 'store', 17: 'mountStable'}


def upgrade_data(block):
    fields = wire(block)
    cost = single(fields, 3, 2)
    benefits = [(number, raw) for number, kind, raw in fields
                if number in BENEFIT_TYPES and kind == 2]
    if len(benefits) > 1:
        raise ValueError('INVALID_UPGRADE_BENEFIT_ONEOF')
    return {'level': single(fields, 1, 0),
            'requiredPlayerLevel': single(fields, 2, 0),
            'cost': item_amount(cost) if cost is not None else None,
            'benefitType': BENEFIT_TYPES[benefits[0][0]] if benefits else None,
            'benefitDigest': sha(benefits[0][1]) if benefits else None}


def parse_stall_sources(data, available_loot_ids):
    """Only native StallBuildingItemData that explicitly references ShopData + slot loot.

    This describes a possible inventory source, NOT current stock, purchase price,
    probability, scheduled sales, or any guarantee that a candidate is purchasable.
    Non-shop building records in the same ID range are intentionally not classified.
    """
    results = []
    for stall_id, fields in frames(data, 20000000):
        if not 20100000 <= stall_id < 20200000:
            continue
        shop_data = text_value(fields, 9)  # StallBuildingItemData.ShopData: string key
        slot_tables = ids(fields, 10)  # SlotLootTableItemID, repeated int
        if shop_data is None and not slot_tables:
            continue
        if not shop_data or not slot_tables:
            raise ValueError(f'INCOMPLETE_STALL_SHOP_SOURCE_{stall_id}')
        if any(table_id not in available_loot_ids for table_id in slot_tables):
            raise ValueError(f'UNRESOLVED_STALL_LOOT_TABLE_{stall_id}')
        costs = [item_amount(raw) for raw in values(fields, 13, 2)]
        upgrades = [upgrade_data(raw) for raw in values(fields, 16, 2)]
        name = text_value(fields, 2)
        if not name:
            raise ValueError('INVALID_STALL_NAME')
        results.append({
            'stallId': stall_id, 'nameKey': name,
            'shopDataKey': shop_data,
            'employeeItemIds': ids(fields, 7),
            'slotLootTableIds': slot_tables,  # order and repetitions are significant
            'unlockWithItemId': single(fields, 11, 0),
            'unlockAtLevel': single(fields, 12, 0),
            'unlockCosts': costs,
            'upgrades': upgrades,
            'inventoryStatus': 'static_loot_candidates_only',
            'source': {'kind': 'game_native', 'file': 'itemlist/Building.json',
                       'definitionId': stall_id}
        })
    return results

# Field tags are ConditionOneOf.*FieldNumber, grounded in Steam 1.26.1
# IL2CPP dump.cs, checked against Steam 1.26.2 wire records.
CONDITION_KIND = {
    5: 'commonConditions', 10: 'subConditions', 20: 'alwaysTrue',
    25: 'alwaysFalse', 30: 'areaUnlocked', 90: 'currentScene',
    125: 'eventTime', 140: 'expansion', 185: 'hourglass',
    195: 'inventory', 220: 'keyholeStatus', 245: 'memoryShard',
    255: 'missionCompleted', 270: 'missionStatus',
    280: 'missionStepCompleted', 285: 'missionStepStatus',
    295: 'missionObjectiveStatus', 450: 'storyCompleted',
    470: 'toolUnlocked',
}
BOOL_OPERATOR = {0: 'and', 1: 'or', 2: 'not'}


def parse_condition_list(block, depth=0):
    """Preserve boolean structure and typed leaves, never evaluate player state.

    Other condition payloads remain SHA-only because their parameter semantics
    may depend on live game profile, expansions, date, and server configuration.
    """
    if depth > 32:
        raise ValueError('CONDITION_NESTING_TOO_DEEP')
    data = wire(block)
    if any(number not in (1, 2) for number, _, _ in data):
        raise ValueError('UNEXPECTED_CONDITIONS_LIST_FIELD')
    number = single(data, 1, 0)
    if number is not None and number not in BOOL_OPERATOR:
        raise ValueError('INVALID_BOOL_OPERATOR')
    predicates = []
    for entry in values(data, 2, 2):
        one = wire(entry)
        if len(one) != 1 or one[0][1] != 2:
            raise ValueError('INVALID_CONDITION_ONEOF')
        tag, _, payload = one[0]
        row = {'kind': CONDITION_KIND.get(tag, 'unmapped'), 'fieldNumber': tag,
               'payloadSha256': sha(payload)}
        if tag == 5:
            common = wire(payload)
            condition_id = single(common, 1, 0, True)
            if condition_id <= 0:
                raise ValueError('INVALID_COMMON_CONDITION_REFERENCE')
            row['conditionId'] = condition_id
            row['inversed'] = bool(single(common, 2, 0) or 0)
        elif tag == 10:
            row['subConditions'] = parse_condition_list(payload, depth + 1)
        predicates.append(row)
    if len(predicates) > 256:
        raise ValueError('TOO_MANY_CONDITION_PREDICATES')
    return {'operator': BOOL_OPERATOR[number if number is not None else 0],
            'operatorExplicit': number is not None, 'predicates': predicates,
            'status': 'static_predicate_structure_only'}


def common_refs(tree):
    for node in tree['predicates']:
        if node['fieldNumber'] == 5:
            yield node['conditionId']
        elif node['fieldNumber'] == 10:
            yield from common_refs(node['subConditions'])


def extract_condition_evidence(activity, loot, condition):
    """Index only the predicates actually used by SRC-02, plus common refs.

    This is not a second global quest-conditions database (DB-03 owns Guide).
    Duplicate predicates are content-addressed; provenance retains each use.
    """
    condition_rows = list(frames(condition, 2130000000))
    all_definitions = {condition_id: (name, single(fields, 6, 2, True))
                       for condition_id, fields in condition_rows
                       for name in [text_value(fields, 2)]}
    if any(not name for name, _ in all_definitions.values()):
        raise ValueError('INVALID_CONDITION_SOURCE_NAME')
    gates = {}
    def attach(payload, origin):
        if not payload:
            return
        digest = sha(payload)
        if digest not in gates:
            gates[digest] = {'conditionDigest': digest,
                'tree': parse_condition_list(payload), 'usedBy': [],
                'availabilityEvaluated': False}
        gates[digest]['usedBy'].append(origin)

    for activity_id, fields in frames(activity, 2050000000):
        code = activity_id - 2050000000
        if 300000 <= code < 400000:
            appear = single(fields, 9, 2)
            gate = single(wire(appear), 5, 2) if appear else None
            attach(gate, {'kind': 'recipe', 'recipeId': activity_id})
        elif 100000 <= code < 200000:
            attach(single(fields, 19, 2), {'kind': 'path', 'pathId': f'fishing:{activity_id}'})
        elif 400000 <= code < 500000:
            attach(single(fields, 13, 2), {'kind': 'path', 'pathId': f'timebending:{activity_id}'})
    for table_id, fields in frames(loot, 2090000000):
        table = single(fields, 6, 2, True)
        for group_index, group in enumerate(values(wire(table), 1, 2)):
            group_fields = wire(group)
            attach(single(group_fields, 101, 2), {'kind': 'loot_group',
                   'lootTableId': table_id, 'groupIndex': group_index})
            for index, cond in enumerate(values(group_fields, 11, 2)):
                attach(single(wire(cond), 1, 2), {'kind': 'loot_conditional_block',
                      'lootTableId': table_id, 'groupIndex': group_index,
                      'conditionalIndex': index})
    resolved = {}
    resolving = set()
    def resolve_ref(condition_id):
        if condition_id in resolving:
            raise ValueError(f'CYCLIC_COMMON_CONDITION_{condition_id}')
        if condition_id in resolved:
            return
        if condition_id not in all_definitions:
            raise ValueError(f'UNRESOLVED_COMMON_CONDITION_{condition_id}')
        resolving.add(condition_id)
        name, raw = all_definitions[condition_id]
        tree = parse_condition_list(raw)
        for target in common_refs(tree):
            resolve_ref(target)
        resolving.remove(condition_id)
        resolved[condition_id] = {'conditionId': condition_id, 'nameKey': name,
                                 'tree': tree, 'conditionDigest': sha(raw),
                                 'availabilityEvaluated': False,
                                 'source': {'kind': 'game_native',
                                            'file': 'itemlist/Condition.json',
                                            'definitionId': condition_id}}
    for gate in gates.values():
        for condition_id in common_refs(gate['tree']):
            resolve_ref(condition_id)
    return (sorted(gates.values(), key=lambda x: x['conditionDigest']),
            [resolved[i] for i in sorted(resolved)], len(all_definitions),
            sum(len(gate['usedBy']) for gate in gates.values()))


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
    # A single newline represents an empty JSONL dataset and stays uploadable
    # through Google Drive without inventing an offer or an empty JSON row.
    payload = ''.join(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n' for row in rows)
    path.write_text(payload or '\n', encoding='utf-8')


def load_rows(path, key):
    rows = {}
    for line_no, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        value = row[key]
        if value is None or isinstance(value, bool) or str(value) in rows:
            raise ValueError(f'INVALID_OR_DUPLICATE_DIFF_KEY_{path.name}_{line_no}')
        rows[str(value)] = row
    return rows


def diff_sets(old, new, out):
    files = {'recipes.jsonl':'recipeId', 'acquisitions.jsonl':'pathId',
             'loot-tables.jsonl':'lootTableId', 'shop-offers.jsonl':'offerId',
             'stall-sources.jsonl':'stallId',
             'condition-gates.jsonl':'conditionDigest',
             'condition-definitions.jsonl':'conditionId'}
    comparisons = {}
    for filename, key in files.items():
        # Pre-stall SRC-02 exports are valid historical snapshots. An absent
        # old stall-sources file means the newly supported family was not yet extracted.
        previous = old / filename
        is_added_family = filename in ('stall-sources.jsonl', 'condition-gates.jsonl',
                                       'condition-definitions.jsonl')
        before = {} if is_added_family and not previous.exists() else load_rows(previous, key)
        current = new / filename
        # Historical test fixtures/snapshots predating this extracted family
        # may omit it on both sides; a real new snapshot must include it.
        after = {} if is_added_family and not current.exists() and not previous.exists() else load_rows(current, key)
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
    for role, path in [('activity', args.activity), ('loot', args.loot),
                       ('activity_item', args.activity_item), ('building', args.building),
                       ('condition', args.condition)]:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_FILE:
            raise ValueError(f'INVALID_SOURCE_{role}')
        content[role] = path.read_bytes()
        if sha(content[role]) != PINNED[role]:
            raise ValueError(f'UNVERIFIED_SOURCE_SHA256_{role}')
    if args.out.resolve() in [p.resolve() for p in (args.items, args.activity, args.loot, args.activity_item, args.building,
                                                               args.condition, args.src01_manifest)]:
        raise ValueError('OUTPUT_OVERLAPS_INPUT')
    recipes, paths, unparsed = parse_activity(content['activity'])
    tables, loot_paths = parse_loot(content['loot'])
    stalls = parse_stall_sources(content['building'], {t['lootTableId'] for t in tables})
    paths.extend(loot_paths)
    paths.extend(parse_gardening(content['activity_item']))
    gates, condition_definitions, condition_source_count, gate_usages = extract_condition_evidence(
        content['activity'], content['loot'], content['condition'])
    recipes.sort(key=lambda x: x['recipeId'])
    paths.sort(key=lambda x: x['pathId'])
    tables.sort(key=lambda x: x['lootTableId'])
    stalls.sort(key=lambda x: x['stallId'])
    related = defaultdict(lambda: {'recipesProducedBy': [], 'recipesUsedBy': [], 'acquisitionPaths': [], 'growPathsForSeed': []})
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
        if path['type'] == 'growing':
            related[path['seedItemId']]['growPathsForSeed'].append(path['pathId'])
            linked.add(path['seedItemId'])
    indexes = [{'itemId': iid, 'inSrc01': iid in item_map,
                **{k: sorted(set(v)) for k,v in related[iid].items()}} for iid in sorted(related)]
    unresolved = {'schema': 'wand.src02.unresolved@1',
                  'missingInPartialSrc01': sorted(linked - item_map.keys()),
                  'unsupportedActivityDefinitions': unparsed,
                  'unverified': ['live shop inventory/rotation', 'shop prices and limits',
                      'stall slot loot selection rules and offer eligibility',
                      'ShopData string lookup and effective stock/cost',
                      'quest/event availability and rewards not linked from source',
                      'dynamic loot filters and drop probabilities',
                      'cooking recipe result quantity (not encoded)',
                      'generic cooking ingredient tags and alternatives require tag resolver',
                      'uninterpreted encoded conditions and visibility gates',
                      'location enum labels and world unlock state',
                      'predicate parameters hashed and never evaluated against player profile'],
                  'notAStatementOfAbsence': True}
    out = args.out
    dump_rows(out / 'recipes.jsonl', recipes)
    dump_rows(out / 'acquisitions.jsonl', paths)
    dump_rows(out / 'loot-tables.jsonl', tables)
    dump_rows(out / 'shop-offers.jsonl', [])
    dump_rows(out / 'stall-sources.jsonl', stalls)
    dump_rows(out / 'related-items.jsonl', indexes)
    dump_rows(out / 'condition-gates.jsonl', gates)
    dump_rows(out / 'condition-definitions.jsonl', condition_definitions)
    dump_json(out / 'unresolved.json', unresolved)
    counts = {'recipes': len(recipes), 'cooking': sum(r['type']=='cooking' for r in recipes),
              'crafting': sum(r['type']=='crafting' for r in recipes),
              'acquisitions': len(paths), 'lootTables': len(tables), 'growing': sum(p['type']=='growing' for p in paths),
              'shopOffersVerified': 0, 'stallsWithStaticLoot': len(stalls),
              'stallLootSlots': sum(len(row['slotLootTableIds']) for row in stalls),
              'distinctStallLootTables': len({x for row in stalls for x in row['slotLootTableIds']}),
              'sourceItems': len(item_map),
              'linkedItemIds': len(related), 'unresolvedLinkedItemIds': len(linked-item_map.keys()),
              'unsupportedActivityDefinitions': len(unparsed),
              'conditionSourceDefinitions': condition_source_count,
              'conditionGates': len(gates),
              'conditionDefinitions': len(condition_definitions),
              'conditionGateUsages': gate_usages}
    dump_json(out / 'report.json', {'schema': 'wand.src02.report@1', 'status': 'partial_native_extraction', 'counts': counts})
    files = ['recipes.jsonl','acquisitions.jsonl','loot-tables.jsonl','shop-offers.jsonl',
             'stall-sources.jsonl',
             'related-items.jsonl','condition-gates.jsonl','condition-definitions.jsonl',
             'report.json','unresolved.json']
    manifest = {'schema': SCHEMA, 'status': 'partial_native_extraction',
                'platform': args.platform, 'gameVersion': args.version,
                'source': {'src01ManifestSha256': sha(args.src01_manifest.read_bytes()),
                           'src01ItemsSha256': sha(data),
                           'activityDataSha256': sha(content['activity']),
                           'lootTableSha256': sha(content['loot']),
                           'activityItemSha256': sha(content['activity_item']),
                           'buildingSha256': sha(content['building']),
                           'conditionSha256': sha(content['condition']),
                           'nativeTypeEvidence': 'Steam v1.26.1 dump.cs: RecipeItemData, CraftingRecipeItemData, FishingDataItemData, MiningDataItemData, TimeBendingDataItemData, LootTableItemData, SeedItemData, StallBuildingItemData, UpgradeData, ItemAmount, ConditionItemData, ConditionsList, ConditionOneOf, ConditionCommon'},
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
    ex.add_argument('--activity-item', type=Path, required=True)
    ex.add_argument('--building', type=Path, required=True)
    ex.add_argument('--condition', type=Path, required=True)
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