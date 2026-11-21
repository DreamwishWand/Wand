import json
from pathlib import Path
import tempfile
import unittest
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scan import Witness, StructureError, execute


class ScannerTests(unittest.TestCase):
    def test_synthetic_save_private_redaction_and_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'input').mkdir()
            save = root / 'input' / 'fixture.json'
            save.write_text(json.dumps({
                'GameInfo': {'Version': 626, 'AccountId': 'secret123'},
                'Player': {'Inventory': {'123456': {'Amount': 5}},
                           'PlayerName': 'My real name', 'Email': 'private@example.com'},
                'World': {'GridCollection': {'DiffGrids': {'17': {'Objects': []}}}}
            }), encoding='utf-8')
            result = execute(['--save', str(save), '--out', str(root / 'report'),
                              '--platform', 'steam-windows',
                              '--build-id', 'releases_1.25-v1.25.3-44-g0b41250d9ac0-incremental-22'])
            structure = json.loads((result / 'save-structure.json').read_text())
            manifest = json.loads((result / 'manifest.json').read_text())
            all_text = ''.join(p.read_text() for p in result.glob('*.json'))
            self.assertEqual(626, structure['schemaObserved'])
            self.assertTrue(structure['rootRequiredFieldsPresent'])
            self.assertIn('/Player/Inventory/{id}/Amount', [x['path'] for x in structure['fieldWitnesses']])
            self.assertNotIn('secret123', all_text)
            self.assertNotIn('private@example.com', all_text)
            self.assertNotIn('PlayerName', all_text)
            self.assertFalse(manifest['writerAuthorized'])
            self.assertEqual(1, sum(x['match'] == 'candidate_only' for x in manifest['compatibility']))

    def test_static_evidence_is_candidate_not_proven(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            game = root / 'game'
            game.mkdir()
            (game / 'global-metadata.dat').write_bytes(b'not a decoded metadata file')
            (game / 'dump.cs').write_text('public class PlayerSaveData\n{\n public int Inventory;\n public string AccountToken;\n}\n', encoding='utf-8')
            out = execute(['--game-root', str(game), '--out', str(root / 'results')])
            types = json.loads((out / 'static-types.json').read_text())
            self.assertEqual('static_evidence_inventory', types['status'])
            self.assertIn('Inventory', [f['name'] for f in types['candidateTypes'][0]['fields']])
            self.assertIn('{sensitive-field}', [f['name'] for f in types['candidateTypes'][0]['fields']])
            self.assertFalse(types['candidateTypes'][0]['saveFieldBindingVerified'])

    def test_binary_opaque_and_prevent_writes_to_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            save = root / 'opaque.sav'
            payload = b'\x00\x0f\x01\x02SECRET'
            save.write_bytes(payload)
            with self.assertRaises(StructureError):
                execute(['--save', str(save), '--out', str(root / 'inside_save_parent')])
            outside = root.parent / (root.name + '-out')
            try:
                result = execute(['--save', str(save), '--out', str(outside)])
                self.assertEqual('unknown_or_encoded_container', json.loads((result / 'save-structure.json').read_text())['status'])
                self.assertEqual(payload, save.read_bytes())
            finally:
                import shutil
                shutil.rmtree(outside, ignore_errors=True)

    def test_invalid_json_is_not_validated(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / 'bad.json'
            file.write_text('{"Player": [1,]}', encoding='utf-8')
            with self.assertRaises(StructureError):
                Witness().inspect(file)


if __name__ == '__main__':
    unittest.main()