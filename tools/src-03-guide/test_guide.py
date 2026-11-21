import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
SCRIPT = ROOT / 'guide.py'


class GuideTests(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        self.root = pathlib.Path(self.work.name)
        self.game = self.root / 'game'
        self.game.mkdir()
        self.out = self.root / 'output-v1'
        self.locales = self.root / 'locales'
        self.locales.mkdir()
        self.write('quests.json', {'Quests': [
            {'QuestID': 10, 'NameKey': 'quest.10', 'QuestType': 'Friendship', 'Steps': [{'Objectives': [{'ItemID': 40}]}], 'RequiredQuestIds': [20]},
            {'QuestID': 20, 'NameKey': 'quest.20', 'QuestType': 'Story'}
        ]})
        self.write('starpath.json', [{'StarPathID': '100', 'TitleKey': 'path.100', 'Duties': [{'QuestId': 20}], 'Rewards': [{'ItemId': 40}], 'EndDate': '2026-01-01'}])
        self.write('event.json', {'Events': [{'EventID': '500', 'NameKey': 'event.500', 'EventRewards': [{'ItemID': 999}], 'StartDate': '2026-02-01'}]})
        (self.locales / 'en.json').write_text(json.dumps({'quest.10': 'Hello', 'quest.20': 'World', 'path.100': 'Star', 'event.500': 'Festival'}), encoding='utf-8')
        (self.locales / 'ja.json').write_text(json.dumps({'quest.10': 'こんにちは'}), encoding='utf-8')

    def write(self, name, content):
        (self.game / name).write_text(json.dumps(content), encoding='utf-8')

    def run_cli(self, *args, expected=0):
        result = subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return result

    def extraction_args(self, out=None):
        return ['extract', '--input', self.game, '--output', out or self.out, '--version', '1.26.1', '--platform', 'Steam', '--locales-dir', self.locales]

    def load(self, out, path):
        return json.loads((out / path).read_text(encoding='utf-8'))

    def test_inspect_and_extract(self):
        self.run_cli('inspect', '--input', self.game, '--output', self.root / 'inspect')
        inspection = self.load(self.root / 'inspect', 'inspection.json')
        self.assertEqual(inspection['inspectedJsonFiles'], 3)
        self.run_cli(*self.extraction_args())
        manifest = self.load(self.out, 'manifest.json')
        self.assertEqual(manifest['counts'], {'quests': 2, 'starPaths': 1, 'events': 1})
        quest = self.load(self.out, 'guide/quests.json')['records'][0]
        self.assertEqual(quest['id'], '10')
        self.assertEqual(quest['nativeIdType'], 'integer')
        self.assertEqual(quest['names'], {'en': 'Hello', 'ja': 'こんにちは'})
        self.assertEqual(quest['fields']['steps'][0]['Objectives'][0]['ItemID'], 40)
        refs = self.load(self.out, 'database/relations.json')['relations']
        self.assertTrue(any(r['toId'] == '20' and r['status'] == 'resolved' for r in refs))
        self.assertTrue(any(r['toId'] == '999' and r['status'] == 'unchecked' for r in refs))
        self.assertEqual(len(self.load(self.out, 'unresolved.json')['references']), 0)
        self.assertEqual(self.load(self.out, 'guide/events.json')['availability'], 'not_evaluated')

    def test_resume_and_diff(self):
        self.run_cli(*self.extraction_args(), '--small')
        self.run_cli(*self.extraction_args(), '--resume')
        self.run_cli(*self.extraction_args(), '--resume')
        self.assertEqual(self.load(self.out, 'report.json')['cacheHits'], 3)
        self.write('quests.json', {'Quests': [{'QuestID': 10, 'NameKey': 'quest.10', 'QuestType': 'Changed', 'RequiredQuestIds': [77]}]})
        other = self.root / 'output-v2'
        self.run_cli(*self.extraction_args(other), '--previous', self.out)
        diffs = self.load(other, 'diff.json')
        self.assertEqual(diffs['removed'], [{'family': 'quests', 'id': '20'}])
        self.assertEqual(diffs['changed'], [{'family': 'quests', 'id': '10'}])
        missing = self.load(other, 'unresolved.json')['references']
        self.assertTrue(any(r['toId'] == '77' for r in missing))

    def test_missing_data_and_readonly(self):
        other = self.root / 'empty-game'
        other.mkdir()
        output = self.root / 'empty-out'
        self.run_cli('extract', '--input', other, '--output', output, '--version', 'test', expected=2)
        self.assertEqual(self.load(output, 'manifest.json')['status'], 'NEEDS_SOURCE_MAPPING')
        self.run_cli('extract', '--input', self.game, '--output', self.game / 'invalid', '--version', 'test', expected=1)

    def test_duplicates_and_collisions(self):
        self.write('second-quest.json', [{'QuestID': 10, 'Name': 'Another title'}])
        self.write('quest-event.json', [{'QuestID': 5, 'EventID': 6}])
        self.run_cli(*self.extraction_args())
        duplicates = self.load(self.out, 'duplicates.json')
        self.assertEqual(len(duplicates), 1)
        self.assertTrue(duplicates[0]['conflict'])
        issues = self.load(self.out, 'report.json')['issues']
        self.assertTrue(any(i['kind'] == 'ambiguous_family' for i in issues))


if __name__ == '__main__':
    unittest.main()