import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

FILE = Path(__file__).with_name('acquisition.py')
spec = importlib.util.spec_from_file_location('src02', FILE)
src02 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(src02)


def vint(n):
    from sys import path
    raw = bytearray()
    while n > 127:
        raw.append((n & 127) | 128)
        n >>= 7
    raw.append(n)
    return bytes(raw)


def f(n, v):
    if isinstance(v, bytes):
        return vint((n << 3) | 2) + vint(len(v)) + v
    return vint(n << 3) + vint(v)


def entry(idx, base, *fields):
    blob = f(1, base + idx) + b''.join(fields)
    return vint(idx) + vint(len(blob)) + blob


class AcquisitionTest(unittest.TestCase):
    def test_crafting_and_cooking(self):
        meal = entry(4, 2050000000, f(2, b'Meal!Test'), f(7, 30300005),
                     f(11, f(1, 31100053)), f(11, f(2, 2001400000)))
        craft = entry(300004, 2050000000, f(2, b'Refinement!IronIngot'),
                      f(6, f(1, 31700009) + f(2, 1)),
                      f(7, f(1, 31700010) + f(2, 5)),
                      f(8, 2001100001), f(9, f(1, 1)))
        recipes, paths, unknown = src02.parse_activity(meal + craft)
        self.assertEqual((len(recipes), len(paths), len(unknown)), (2, 0, 0))
        self.assertEqual(recipes[0]['resultItemId'], 30300005)
        self.assertEqual(recipes[0]['ingredients'][1]['kind'], 'anyTag')
        self.assertEqual(recipes[1]['ingredients'][0]['quantity'], 5)
        self.assertEqual(recipes[1]['resultQuantity'], 1)

    def test_fishing_mining_timebending(self):
        fish = entry(100001, 2050000000, f(2, b'Beach!Fish'), f(6, f(1, 30100001)), f(7, 1), f(9, 3))
        mine = entry(200002, 2050000000, f(2, b'Forest!Gem'), f(6, f(1, 31700012)), f(7, f(1, 5)))
        time = entry(400003, 2050000000, f(2, b'TimeBending!Gift'), f(6, f(1, 30000031)), f(10, b'Gifts'), f(12, 3))
        recipes, paths, unresolved = src02.parse_activity(fish + mine + time)
        self.assertEqual(len(paths), 3)
        self.assertEqual([r['type'] for r in paths], ['fishing','mining','timebending'])
        self.assertEqual(paths[1]['areaId'], 5)
        self.assertEqual(paths[2]['minHourglassLevel'], 3)

    def test_loot_candidates_not_guaranteed(self):
        sub = f(1, 1) + f(2, 3) + f(3, 90) + f(10, f(1, 30200045))
        blob = entry(0, 2090000000, f(2, b'Chest!Test'), f(6, f(1, sub)))
        tables, paths = src02.parse_loot(blob)
        self.assertEqual(tables[0]['groups'][0]['weight'], 90)
        self.assertFalse(paths[0]['contextVerified'])
        self.assertEqual(paths[0]['pathId'], 'loot:2090000000:0:0')
        self.assertEqual(paths[0]['itemId'], 30200045)

    def test_gardening_uses_src01_item_mapping(self):
        seed = entry(400010, 30000000, f(2, b'Crop!Carrot_Seed'),
                     f(4, b'guid:' + b'a' * 32),
                     f(9, f(1, 900)), f(10, 1), f(12, 1),
                     f(13, 30200000), f(14, 1), f(21, 1), f(22, 3))
        paths = src02.parse_gardening(seed)
        self.assertEqual(len(paths), 1)
        self.assertEqual(paths[0]['pathId'], 'growing:30400010')
        self.assertEqual(paths[0]['itemId'], 30200000)
        self.assertEqual(paths[0]['growthSeconds'], 900)
        self.assertEqual(paths[0]['minimumStallLevel'], 3)
        self.assertEqual(src02.duration_seconds(f(2, 500_000_000)), 0.5)

    def test_stall_source_and_upgrade_cost(self):
        cost = f(1, 80000000) + f(2, 500)
        upgrade = f(1, 2) + f(3, cost) + f(11, f(1, 3))
        stall = entry(100000, 20000000, f(2, b'Gardening_Stall2_Meadow'),
                      f(9, b'GardeningStall'), f(10, 2090000056),
                      f(10, 2090000052), f(13, f(1, 80000000)),
                      f(16, upgrade))
        records = src02.parse_stall_sources(stall, {2090000056, 2090000052})
        self.assertEqual(len(records), 1)
        row = records[0]
        self.assertEqual(row['stallId'], 20100000)
        self.assertEqual(row['slotLootTableIds'], [2090000056, 2090000052])
        self.assertEqual(row['unlockCosts'], [{'itemId': 80000000, 'amount': None}])
        self.assertEqual(row['upgrades'][0]['cost']['amount'], 500)
        self.assertEqual(row['upgrades'][0]['benefitType'], 'gardening')
        self.assertEqual(row['inventoryStatus'], 'static_loot_candidates_only')

    def test_stall_loot_missing_ref_fail_closed(self):
        stall = entry(100000, 20000000, f(2, b'Example_Stall'),
                      f(9, b'ExampleData'), f(10, 2090000010))
        with self.assertRaisesRegex(ValueError, 'UNRESOLVED_STALL_LOOT_TABLE'):
            src02.parse_stall_sources(stall, set())
        # Same ID range includes unrelated building classes; do not classify by ID alone.
        unrelated = entry(100001, 20000000, f(2, b'Garden'), f(11, 10000001))
        self.assertEqual(src02.parse_stall_sources(unrelated, set()), [])

    def test_condition_gate_and_common_condition_references(self):
        # ConditionItemData(6) -> ConditionsList(2) -> ConditionOneOf(5)
        # -> ConditionCommon(1), with two source users of the same predicate.
        common = f(5, f(1, 2130000012) + f(2, 1))
        reused_gate = f(1, 1) + f(2, common)
        definition = entry(12, 2130000000, f(2, b'FTUE!Gate'),
                           f(6, f(2, f(30, f(1, 4)))))
        craft_appear = f(5, reused_gate)
        craft1 = entry(300001, 2050000000, f(2, b'Craft!A'), f(9, craft_appear))
        craft2 = entry(300002, 2050000000, f(2, b'Craft!B'), f(9, craft_appear))
        gates, definitions, total, usages = src02.extract_condition_evidence(
            craft1 + craft2, b'', definition)
        self.assertEqual((len(gates), len(definitions), total, usages), (1, 1, 1, 2))
        self.assertEqual(gates[0]['tree']['operator'], 'or')
        self.assertEqual(gates[0]['tree']['predicates'][0]['conditionId'], 2130000012)
        self.assertTrue(gates[0]['tree']['predicates'][0]['inversed'])
        self.assertEqual(definitions[0]['tree']['predicates'][0]['kind'], 'areaUnlocked')
        self.assertFalse(definitions[0]['availabilityEvaluated'])

    def test_condition_reference_missing_or_cyclic_rejected(self):
        ref = f(2, f(5, f(1, 2130000001)))
        craft = entry(300001, 2050000000, f(2, b'Craft!A'), f(9, f(5, ref)))
        with self.assertRaisesRegex(ValueError, 'UNRESOLVED_COMMON_CONDITION'):
            src02.extract_condition_evidence(craft, b'', b'')
        definition = entry(1, 2130000000, f(2, b'Loop'), f(6, ref))
        with self.assertRaisesRegex(ValueError, 'CYCLIC_COMMON_CONDITION'):
            src02.extract_condition_evidence(craft, b'', definition)
        with self.assertRaisesRegex(ValueError, 'INVALID_CONDITION_ONEOF'):
            src02.parse_condition_list(f(2, f(5, b'') + f(10, b'')))
        with self.assertRaisesRegex(ValueError, 'INVALID_BOOL_OPERATOR'):
            src02.parse_condition_list(f(1, 9))

    def test_diff_stalls_and_duplicate_key_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            a, b = path/'a', path/'b'; a.mkdir(); b.mkdir()
            for name in ['recipes.jsonl','acquisitions.jsonl','loot-tables.jsonl','shop-offers.jsonl']:
                (a/name).write_text('', encoding='utf8')
                (b/name).write_text('', encoding='utf8')
            # Legacy snapshot has no stall-sources.jsonl; treat this specific family as new.
            (b/'stall-sources.jsonl').write_text(json.dumps({'stallId':20100000})+'\n',encoding='utf8')
            src02.diff_sets(a,b,path/'diff.json')
            diff = json.loads((path/'diff.json').read_text())
            self.assertEqual(diff['sets']['stall-sources.jsonl']['added'], ['20100000'])
            (a/'recipes.jsonl').write_text('\n'.join([
                json.dumps({'recipeId':1}), json.dumps({'recipeId':1})])+'\n')
            with self.assertRaisesRegex(ValueError, 'DUPLICATE'):
                src02.diff_sets(a,b,path/'diff.json')

    def test_rejects_corruption(self):
        with self.assertRaises(ValueError):
            src02.wire(b'\x0a\x03X')
        with self.assertRaises(ValueError):
            list(src02.frames(entry(1, 0, f(2, b'a')) * 2, 0))
        with self.assertRaises(ValueError):
            src02.ingredient(f(1, 4) + f(2, 5), False)

    def test_empty_jsonl_is_uploadable_but_not_an_offer(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'shop-offers.jsonl'
            src02.dump_rows(path, [])
            self.assertEqual(path.read_bytes(), b'\n')
            self.assertEqual(src02.load_rows(path, 'offerId'), {})

    def test_diff_detects_changed_and_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            a, b = path / 'old', path / 'new'
            a.mkdir(); b.mkdir()
            for filename in ['recipes.jsonl','acquisitions.jsonl','loot-tables.jsonl','shop-offers.jsonl','stall-sources.jsonl']:
                (a / filename).write_text('',encoding='utf8')
                (b / filename).write_text('',encoding='utf8')
            (a/'recipes.jsonl').write_text(json.dumps({'recipeId':1,'resultQuantity':1})+'\n')
            (b/'recipes.jsonl').write_text(json.dumps({'recipeId':1,'resultQuantity':2})+'\n')
            (a/'shop-offers.jsonl').write_text(json.dumps({'offerId':'x','price':40})+'\n')
            src02.diff_sets(a,b,path/'diff.json')
            data=json.loads((path/'diff.json').read_text())
            self.assertEqual(data['sets']['recipes.jsonl']['changed'], ['1'])
            self.assertEqual(data['sets']['shop-offers.jsonl']['removed'], ['x'])


if __name__ == '__main__':
    unittest.main()