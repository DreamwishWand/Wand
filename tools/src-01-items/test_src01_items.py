import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PROGRAM = Path(__file__).with_name('src01_items.py')


class Src01Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def run_command(self, *args, expected=0):
        process = subprocess.run([sys.executable, str(PROGRAM), *map(str, args)],
                                 capture_output=True, text=True, check=False)
        self.assertEqual(process.returncode, expected, process.stdout + process.stderr)
        return process

    def fixture(self):
        source = self.root / 'catalog'
        source.mkdir()
        rows = [[1, 0, 0, 0, [0], [0], [0],
                 ['<nobr>One</nobr>', 'Un', 'Uno', 'Eins', 'Uno', '一', '一号', 'Um']],
                [2, 0, 0, 0, [0], [0], [0],
                 ['One', 'Deux', 'Due', 'Zwei', 'Dos', '二', '二号', 'Dois']]]
        data = {'s': 'wand.collection.records@1', 'offset': 0, 'count': 2, 'r': rows}
        raw = json.dumps(data, ensure_ascii=False).encode()
        (source / 'records-00.json').write_bytes(raw)
        index = {'s': 'wand.collection.runtime@1',
                 'l': ['EN', 'FR', 'IT', 'DE', 'ES-ES', 'JA', 'ZH-CN', 'PT-BR'],
                 't': {'platform': 'Nintendo Switch', 'gameVersion': '1.25.0', 'buildID': 'test'},
                 'f': ['Furniture'], 'c': ['TRACKED'], 'm': ['UNLOCKED_LOCKED'],
                 'w': ['IsDreamlightValley'], 'u': ['Mickey'], 'e': ['BaseGame'],
                 'n': 2, 'shards': [{'file': 'records-00.json', 'offset': 0, 'count': 2,
                 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}]}
        (source / 'index.json').write_text(json.dumps(index), encoding='utf-8')
        return source

    def test_survey_resume_and_file_types(self):
        source = self.root / 'game'
        source.mkdir()
        (source / 'items.json').write_text('[{"ItemID":1,"Name":"A"}]', encoding='utf-8')
        (source / 'global-metadata.dat').write_bytes(b'abc')
        out = self.root / 'survey'
        self.run_command('survey', '--input', source, '--out', out)
        result = json.loads((out / 'report.json').read_text(encoding='utf-8'))
        self.assertEqual(result['filesInspected'], 2)
        self.assertEqual(result['kinds']['il2cpp'], 1)
        self.assertEqual(result['kinds']['structured_candidate'], 1)
        self.run_command('survey', '--input', source, '--out', out)
        self.assertEqual(json.loads((out / 'report.json').read_text())['cacheEntriesReused'], 2)
        self.assertFalse((out / 'items.jsonl').exists())

    def test_catalog_import_and_diff(self):
        source = self.fixture()
        out = self.root / 'out'
        self.run_command('from-collection', '--catalog', source, '--out', out)
        records = [json.loads(line) for line in (out / 'items.jsonl').read_text(encoding='utf-8').splitlines()]
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['names']['en'], 'One')
        self.assertIsNone(records[0]['subcategory'])
        self.assertEqual(records[0]['expansions'], ['BaseGame'])
        report = json.loads((out / 'report.json').read_text())
        self.assertEqual(report['sameEnglishNameDifferentIdsCount'], 1)
        self.run_command('diff', '--old', out / 'items.jsonl', '--new', out / 'items.jsonl',
                         '--out', self.root / 'diff.json')
        self.assertEqual(json.loads((self.root / 'diff.json').read_text())['changedCount'], 0)

    def test_catalog_integrity_failure(self):
        source = self.fixture()
        with (source / 'records-00.json').open('ab') as handle:
            handle.write(b' ')
        out = self.root / 'bad'
        self.run_command('from-collection', '--catalog', source, '--out', out, expected=1)
        self.assertFalse((out / 'items.jsonl').exists())


if __name__ == '__main__':
    unittest.main()
