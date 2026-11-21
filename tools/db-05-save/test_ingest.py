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


    def test_real_observed_common_public_fields_are_allowlisted_without_values(self):
        report = self.report(643, 'string')
        report['fieldWitnesses'].extend([
            {'path':'/World/Characters', 'type':'array'},
            {'path':'/World/Characters[]/SkinID', 'type':'integer'},
            {'path':'/Player/AchievementsData', 'type':'array'},
            {'path':'/Player/Mounts', 'type':'array'},
            {'path':'/Player/UnknownPrivateFlag', 'type':'boolean'}
        ])
        inspected = inspect_report(report)
        witness_paths = {x['path'] for x in inspected['publicWitnesses']}
        self.assertIn('/World/Characters', witness_paths)
        self.assertIn('/World/Characters[]/SkinID', witness_paths)
        self.assertIn('/Player/AchievementsData', witness_paths)
        self.assertIn('/Player/Mounts', witness_paths)
        self.assertNotIn('/Player/UnknownPrivateFlag', witness_paths)
        self.assertEqual(inspected['otherWitnessCount'], 2)
        self.assertFalse(inspected['writerAuthorized'])


    def test_native_field_names_are_redacted_and_known_only(self):
        report = self.report(643, 'string')
        report['fieldWitnesses'].extend([
            {'path': '/Player/CurrencyAmounts', 'type': 'object'},
            {'path': '/Player/OutfitPresets', 'type': 'array'},
            {'path': '/World/DecorationPresets', 'type': 'array'},
            {'path': '/FreeTimers', 'type': 'array'},
            {'path': '/World/PrivateUserField/99123', 'type': 'string'}
        ])
        result = inspect_report(report)
        emitted = json.dumps(result)
        known = {x['path'] for x in result['publicWitnesses']}
        for path in ['/Player/CurrencyAmounts', '/Player/OutfitPresets',
                     '/World/DecorationPresets', '/FreeTimers']:
            self.assertIn(path, known)
        self.assertNotIn('PrivateUserField', emitted)
        self.assertNotIn('99123', emitted)
        self.assertEqual(result['otherWitnessCount'], 2)
        self.assertFalse(result['decoderAndBuildVerified'])
        self.assertFalse(result['writerAuthorized'])


    def test_nested_fields_are_allowlisted_but_actual_map_keys_never_leave(self):
        raw = self.report(643, 'string')
        raw['fieldWitnesses'].extend([
            {'path':'/Player/Pets[]/LastSelfieDate','type':'null,string'},
            {'path':'/Player/Cookbook/Recipes','type':'array'},
            {'path':'/World/FloatingIslands/99123/Unlocked','type':'boolean'},
            {'path':'/World/DecorationPresets[]/ShareInfo','type':'null'},
            {'path':'/Player/PrivatePetMemo','type':'string'}
        ])
        inspected = inspect_report(raw)
        paths = {field['path'] for field in inspected['publicWitnesses']}
        for path in [
            '/Player/Pets[]/LastSelfieDate',
            '/Player/Cookbook/Recipes',
            '/World/FloatingIslands/{id}/Unlocked',
            '/World/DecorationPresets[]/ShareInfo'
        ]:
            self.assertIn(path,paths)
        output=json.dumps(inspected)
        self.assertNotIn('99123',output)
        self.assertNotIn('PrivatePetMemo',output)
        self.assertNotIn('PrivateAccount',output)
        self.assertEqual(inspected['otherWitnessCount'],2)
        self.assertFalse(inspected['writerAuthorized'])


    def test_deep_grid_chest_and_character_fields_keep_only_public_types(self):
        private = self.report(643, 'string')
        private['fieldWitnesses'].extend([
            {'path':'/World/GridCollection/Grids/12345/Objects/67890/ItemID','type':'integer'},
            {'path':'/World/GridCollection/Grids/12345/Objects/67890/State','type':'null,object'},
            {'path':'/Player/ContainerInventories/5/Inventory[]/State','type':'null,object'},
            {'path':'/World/Characters[]/FriendshipLevel','type':'integer'},
            {'path':'/World/BuildingInfos/31/Room/WallGridIDs','type':'object'},
            {'path':'/Player/PrivateUserAccessCode/4444','type':'string'}
        ])
        output=inspect_report(private)
        paths={row['path'] for row in output['publicWitnesses']}
        self.assertIn('/World/GridCollection/Grids/{id}/Objects/{id}/ItemID',paths)
        self.assertIn('/World/GridCollection/Grids/{id}/Objects/{id}/State',paths)
        self.assertIn('/Player/ContainerInventories/{id}/Inventory[]/State',paths)
        self.assertIn('/World/Characters[]/FriendshipLevel',paths)
        self.assertIn('/World/BuildingInfos/{id}/Room/WallGridIDs',paths)
        text=json.dumps(output)
        for forbidden in ('12345','67890','4444','PrivateUserAccessCode'):
            self.assertNotIn(forbidden,text)
        self.assertFalse(output['writerAuthorized'])
        self.assertGreaterEqual(output['otherWitnessCount'],2)


if __name__ == '__main__': unittest.main()
