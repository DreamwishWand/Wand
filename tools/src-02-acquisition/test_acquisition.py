import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('acquisition.py')
spec = importlib.util.spec_from_file_location('acquisition', SCRIPT)
acquisition = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acquisition)


class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.input = self.root / 'source'
        self.out = self.root / 'out'
        self.input.mkdir()
        self.rules = self.root / 'rules.json'
        self.catalog = self.root / 'catalog.json'
        self.rules.write_text(json.dumps({'rules': [
            {'id': 'offers', 'glob': '**/offers.json', 'records': 'Offers[*]', 'entity_type': 'Offer',
             'id': 'OfferID', 'method': 'PremiumShop', 'fields': {'price': 'Price.Amount', 'currency': 'Price.CurrencyID'},
             'links': [{'records': 'Rewards[*]', 'id': 'RewardID', 'target_type': 'Reward', 'relation': 'contains_reward'}]},
            {'id': 'rewards', 'glob': '**/rewards.jsonl', 'records': '$', 'entity_type': 'Reward', 'id': 'RewardID',
             'links': [{'records': 'Items[*]', 'id': 'ItemID', 'target_type': 'Item', 'relation': 'grants',
                        'fields': {'quantity': 'Quantity'}}]},
            {'id': 'recipes', 'glob': '**/recipes.json', 'records': 'Recipes[*]', 'entity_type': 'Recipe',
             'id': 'RecipeID', 'method': 'Crafting',
             'links': [{'records': 'Outputs[*]', 'id': 'ItemID', 'target_type': 'Item', 'relation': 'creates'}]}
        ]}), encoding='utf-8')
        (self.input / 'offers.json').write_text(json.dumps({'Offers': [
            {'OfferID': 1200, 'Price': {'Amount': 2500, 'CurrencyID': 8}, 'Rewards': [{'RewardID': 110}]},
            {'OfferID': 1201, 'Rewards': [{'RewardID': 110}]}
        ]}), encoding='utf-8')
        (self.input / 'rewards.jsonl').write_text(json.dumps({'RewardID': 110, 'Items': [
            {'ItemID': 40000123, 'Quantity': 2}
        ]}) + '\n', encoding='utf-8')
        (self.input / 'recipes.json').write_text(json.dumps({'Recipes': [
            {'RecipeID': 90, 'Outputs': [{'ItemID': 40000123}, {'ItemID': 40009999}]}
        ]}), encoding='utf-8')
        self.catalog.write_text(json.dumps({'r': [[40000123, 0], [50000000, 0]]}), encoding='utf-8')

    def cli(self, *args, expected=0):
        result = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stderr + result.stdout)
        return result

    def extract(self, *args, expected=0):
        return self.cli('extract', '--input', str(self.input), '--out', str(self.out),
                        '--rules', str(self.rules), '--catalog', str(self.catalog), *args, expected=expected)

    def load(self, name):
        return json.loads((self.out / name).read_text(encoding='utf-8'))

    def test_multiple_sources_proof_and_reference_warning(self):
        self.extract()
        items = {entry['item_id']: entry['routes'] for entry in self.load('acquisitions.json')}
        self.assertEqual(set(items), {'40000123', '40009999'})
        sources = {(r['source']['type'], r['source']['id']) for r in items['40000123']}
        self.assertEqual(sources, {('Offer', '1200'), ('Offer', '1201'), ('Reward', '110'), ('Recipe', '90')})
        self.assertTrue(all(r['current_sale'] == 'UNKNOWN' and r['historical_sale'] == 'UNKNOWN'
                            for rs in items.values() for r in rs))
        self.assertTrue(all(edge['proofs'][0]['sha256'] for edge in self.load('relations.json')))
        self.assertEqual(self.load('validation.json')['unknown_item_ids_in_reference'], ['40009999'])
        self.assertFalse(self.load('validation.json')['partial_input'])

    def test_resume_and_delta(self):
        self.extract()
        self.extract()
        self.assertTrue(all(f['status'] == 'CACHED' for f in self.load('manifest.json')['files']))
        (self.input / 'rewards.jsonl').write_text(json.dumps({'RewardID': 110, 'Items': [
            {'ItemID': 40000124, 'Quantity': 3}
        ]}) + '\n', encoding='utf-8')
        self.extract()
        statuses = {f['file']: f['status'] for f in self.load('manifest.json')['files']}
        self.assertEqual(statuses['rewards.jsonl'], 'PROCESSED')
        self.assertEqual(statuses['offers.json'], 'CACHED')
        ids = {entry['item_id'] for entry in self.load('acquisitions.json')}
        self.assertEqual(ids, {'40000124', '40000123', '40009999'})

    def test_limit_and_inspect(self):
        self.cli('inspect', '--input', str(self.input), '--out', str(self.out), '--limit', '2')
        self.assertTrue(self.load('inspection.json')['partial'])
        self.extract('--limit', '1')
        self.assertTrue(self.load('validation.json')['partial_input'])
        self.assertEqual(self.load('acquisitions.json'), [])

    def test_duplicate_warning_and_unresolved(self):
        (self.input / 'rewards.jsonl').write_text('\n'.join([
            json.dumps({'RewardID': 110, 'Items': [{'ItemID': 40000123}]}),
            json.dumps({'RewardID': 110, 'Items': [{'ItemID': 40000123}]})
        ]) + '\n', encoding='utf-8')
        self.extract()
        codes = {r['code'] for r in self.load('validation.json')['warnings']}
        self.assertIn('DUPLICATE_NATIVE_ENTITY', codes)
        self.assertIn('DUPLICATE_RELATION', codes)

    def test_no_output_within_source(self):
        result = subprocess.run([sys.executable, str(SCRIPT), 'inspect', '--input', str(self.input),
                                 '--out', str(self.input / 'output')], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)

    def test_missing_key_reported_without_fake_link(self):
        (self.input / 'rewards.jsonl').write_text(json.dumps({'RewardID': 110, 'Items': [{'Quantity': 4}]}) + '\n', encoding='utf-8')
        self.extract()
        self.assertIn('TARGET_ID_MISSING', [w['code'] for w in self.load('validation.json')['warnings']])
        self.assertEqual(len(self.load('relations.json')), 4)


if __name__ == '__main__':
    unittest.main()