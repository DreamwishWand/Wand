import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from ingest import inspect_report, inspect_items, diff, run


class IngestTests(unittest.TestCase):
    def report(self, version, extra):
        return {'status': 'structural_witness', 'schemaObserved': version,
                'rootRequiredFieldsPresent': True, 'rootRequiredObjectsObserved': True,
                'fieldWitnesses': [{'path': '/GameInfo', 'type': 'object'},
                                   {'path': '/Player', 'type': 'object'},
                                   {'path': '/World', 'type': 'object'},
                                   {'path': '/Player/PrivateAccount/secret', 'type': extra}]}

    def test_only_allowlisted_paths_survive(self):
        report = inspect_report(self.report(626, 'string'))
        serialized = json.dumps(report)
        self.assertNotIn('PrivateAccount', serialized)
        self.assertNotIn('secret', serialized)
        self.assertFalse(report['writerAuthorized'])
        self.assertEqual(report['otherWitnessCount'], 1)

    def test_diff_public_witnesses_only(self):
        old = inspect_report(self.report(626, 'string'))
        new = inspect_report(self.report(643, 'number'))
        self.assertFalse(diff(old, new)['authoritative'])
        self.assertEqual(diff(old, new)['typeChanged'], [])

    def test_hash_pinned_source_item_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            items = d / 'items.jsonl'
            items.write_text('{"itemId":40000000}\n{"itemId":40000001}\n')
            manifest = d / 'manifest.json'
            manifest.write_text(json.dumps({'schema':'wand.src01.steam-native@1',
                'gameVersion':'1.26.2','itemCount':2,
                'itemsSha256': hashlib.sha256(items.read_bytes()).hexdigest()}))
            self.assertEqual(inspect_items(items, manifest)['catalogSize'],2)
            items.write_text('{"itemId":40000000}\n{"itemId":40000000}\n')
            with self.assertRaisesRegex(ValueError, 'MISMATCH'):
                inspect_items(items,manifest)

    def test_generated_private_summary_and_readonly_original(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            original = d / 'input.json'
            original.write_text(json.dumps(self.report(626,'unknown')))
            before = original.read_bytes()
            out = run(original, d / 'out')
            body = (out / 'db05-private-summary.json').read_text()
            self.assertNotIn('PrivateAccount', body)
            self.assertFalse(json.loads(body)['writerAuthorized'])
            self.assertEqual(original.read_bytes(),before)
            with self.assertRaisesRegex(ValueError,'DISJOINT'):
                run(original,d / 'out')


    def test_historical_known_deep_paths_are_canonicalized_without_ids(self):
        sample = self.report(626, 'string')
        sample['fieldWitnesses'].extend([
            {'path': '/Player/ContainerInventories/1535/Inventory[]/Amount', 'type': 'integer'},
            {'path': '/Player/ListInventories/{id}/Inventory/{id}/Amount', 'types': ['integer']},
            {'path': '/Player/PersonalSecret/888/Token', 'type': 'string'},
        ])
        result = inspect_report(sample)
        paths = {row['path'] for row in result['publicWitnesses']}
        self.assertIn('/Player/ContainerInventories/{containerId}/Inventory[]/Amount', paths)
        self.assertIn('/Player/ListInventories/{routeId}/Inventory/{itemId}/Amount', paths)
        self.assertEqual(result['otherWitnessCount'], 2)
        emitted = json.dumps(result)
        for secret in ['1535', '888', 'PersonalSecret', 'Token']:
            self.assertNotIn(secret, emitted)

    def test_historical_deep_witness_type_delta_is_observational_only(self):
        old = self.report(626, 'string')
        new = self.report(643, 'number')
        path = '/Player/ContainerInventories/{id}/Inventory[]/Amount'
        old['fieldWitnesses'].append({'path': path, 'type': 'integer'})
        new['fieldWitnesses'].append({'path': path, 'type': 'number'})
        comparison = diff(inspect_report(old), inspect_report(new))
        self.assertEqual(comparison['typeChanged'], [
            '/Player/ContainerInventories/{containerId}/Inventory[]/Amount'])
        self.assertFalse(comparison['authoritative'])
        self.assertEqual(comparison['undisclosedWitnessCountDelta'], 0)


if __name__ == '__main__': unittest.main()
