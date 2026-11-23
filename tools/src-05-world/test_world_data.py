import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from world_data import main


class WorldDataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / 'game'
        self.output = self.base / 'results'
        (self.source / 'GridData' / 'FloatingIslands').mkdir(parents=True)
        (self.source / 'Items' / 'Furniture').mkdir(parents=True)

    def invoke(self, *args):
        with contextlib.redirect_stdout(io.StringIO()):
            return main([*args, '--input', str(self.source), '--output', str(self.output)])

    def load(self, name):
        return json.loads((self.output / name).read_text(encoding='utf-8'))

    def fixture(self):
        a = self.source / 'GridData' / 'FloatingIslands' / 'FloatingIsland_Meadow-GridData.json'
        a.write_text(json.dumps({'sizeX': 130, 'sizeY': 130, 'GridDataPath': 'GridData/FloatingIslands/FloatingIsland_Meadow-GridData.json', 'DisableGridEditMode': True}), encoding='utf-8')
        b = self.source / 'Items' / 'Furniture' / 'chair.json'
        b.write_text(json.dumps({'MonoBehaviour': {'ItemID': 40000123, 'SizeX': 2, 'SizeY': 3, 'AreaTessellationFactor': 1, 'PrefabGUID': 'abc', 'IsMissionItem': True}}), encoding='utf-8')
        return a, b

    def test_inspect_and_build(self):
        self.fixture()
        self.assertEqual(self.invoke('inspect'), 0)
        self.assertEqual(self.load('source-inventory.json')['jsonCandidateFiles'], 2)
        self.assertEqual(self.invoke('build', '--limit', '1'), 0)
        self.assertIn('PARTIAL', self.load('manifest.json')['status'])
        self.assertEqual(self.invoke('build', '--start', '1'), 0)
        self.assertIn('COMPLETE', self.load('manifest.json')['status'])
        worlds = self.load('worlds.json')['records']
        items = self.load('placements.json')['records']
        self.assertEqual(worlds[0]['sizeX'], 130)
        self.assertEqual(items[0]['itemId'], 40000123)
        self.assertEqual(items[0]['geometry']['sizeY'], 3)
        self.assertEqual(items[0]['editAuthorization'], 'UNVERIFIED')
        self.assertEqual(self.load('id-map.json')['records'][0]['identifier'], 'abc')
        self.assertEqual(self.invoke('build'), 0)
        self.assertEqual(self.load('manifest.json')['counts']['cacheHitsThisRun'], 2)
        self.assertEqual(self.load('manifest.json')['counts']['newOrChangedThisRun'], 0)

    def test_change_and_conflict(self):
        a, b = self.fixture()
        self.invoke('build')
        baseline = self.base / 'baseline'
        baseline.mkdir()
        for name in ('worlds.json', 'placements.json'):
            (baseline / name).write_bytes((self.output / name).read_bytes())
        c = self.source / 'Items' / 'Furniture' / 'chair2.json'
        c.write_text(json.dumps({'ItemID': 40000123, 'SizeX': 4, 'SizeY': 3}), encoding='utf-8')
        self.invoke('build', '--previous', str(baseline))
        codes = {x['code'] for x in self.load('unresolved.json')['records']}
        self.assertIn('CONFLICTING_ITEM_GEOMETRY', codes)
        self.assertTrue(self.load('diff.json')['placements']['added'])

    def test_invalid_and_no_source_mutation(self):
        a, b = self.fixture()
        before = (a.read_bytes(), b.read_bytes())
        b.write_text('{broken', encoding='utf-8')
        self.invoke('build')
        self.assertIn('JSON_PARSE_FAILED', [x['code'] for x in self.load('unresolved.json')['records']])
        self.assertEqual((a.read_bytes(), b.read_bytes()), (before[0], b'{broken'))

    def test_out_inside_source_rejected(self):
        self.fixture()
        with self.assertRaises(SystemExit):
            with contextlib.redirect_stderr(io.StringIO()):
                main(['build', '--input', str(self.source), '--output', str(self.source / 'results')])


if __name__ == '__main__':
    unittest.main()
