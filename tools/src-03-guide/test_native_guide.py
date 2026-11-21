import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).parent))
import native_guide as db


def vf(n, v):
    return db.encode_varint((n << 3) | 0) + db.encode_varint(v)


def sf(n, s):
    value = s if isinstance(s, bytes) else s.encode('utf-8')
    return db.encode_varint((n << 3) | 2) + db.encode_varint(len(value)) + value


def frame(key, data):
    return db.encode_varint(key) + db.encode_varint(len(data)) + data


def loc_entry(k, v):
    return sf(1, sf(1, k) + sf(2, v))


class NativeGuideTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.game = self.root / 'game'
        self.src = self.game / 'ddv_Data' / 'StreamingAssets'
        (self.src / 'itemlist').mkdir(parents=True)
        (self.src / 'Localization').mkdir()
        self.out = self.root / 'out'
        self.char = 10000001
        self.quest_group = 2070200001
        self.quest = 2070000001
        self.scene = 1540000001
        sample = {
            'quests': [
                (1, vf(1, self.quest) + sf(2, 'Story!MyQuest') + sf(3, 'Story/MyQuest.Story!MyQuest_DisplayName') +
                 vf(7, self.char) + vf(13, self.quest_group) +
                 sf(40, sf(11, 'Story/MyQuest.Story!Step01_StepDescription'))),
                (200001, vf(1, self.quest_group) + sf(2, 'Story!Group'))],
            'characters': [(1, vf(1, self.char) + sf(2, 'Game!Guide') + sf(3, 'Character.Game!Guide_DisplayName') + vf(14, self.scene))],
            'worlds': [(1, vf(1, self.scene) + sf(2, 'Town!Main') + sf(3, 'Scene.Town!Main_DisplayName'))],
            'stories': [(1, vf(1, 200000001) + sf(2, 'Story!Main'))],
            'duties': [(1, vf(1, 2110000001) + sf(2, 'CraftThings') + sf(7, 'DutyAch.CraftThings_Description'))],
            'events': [(1, vf(1, 2010000001) + sf(2, 'DailyEvent'))],
            'conditions': [(1, vf(1, 2130000001) + sf(2, 'QuestComplete'))],
            'conditionalEvents': [(1, vf(1, 1520000001) + sf(2, 'Trigger'))],
            'tutorials': [(1, vf(1, 2080000001) + sf(2, 'FishingTutorial'))],
        }
        for family, seq in sample.items():
            stem = db.SOURCES[family]
            (self.src / 'itemlist' / (stem+'.json')).write_bytes(b''.join(frame(*x) for x in seq))
        for locale, text in [('en-US', 'The Guide'), ('ja', '案内人')]:
            with zipfile.ZipFile(self.src / 'Localization' / ('LocDB_'+locale+'.zip'), 'w') as z:
                z.writestr('Character.locbin', loc_entry('Game!Guide_DisplayName', text))
                z.writestr('Story/MyQuest.locbin', loc_entry('Story!MyQuest_DisplayName',
                                  'Guide Quest' if locale == 'en-US' else '案内クエスト') +
                           loc_entry('Story!Step01_StepDescription', 'Visit a friend' if locale == 'en-US' else '友達に会う'))
                z.writestr('DutyAch.locbin', loc_entry('CraftThings_Description', 'Craft something'))
        self.items = self.root / 'items.jsonl'
        self.items.write_text('{"itemId":30000031}\n', encoding='utf-8')

    def test_extract_and_locales_and_relations(self):
        db.extract(self.game, self.out, '1.26.1', 'Steam', self.items)
        q = json.loads((self.out / 'guide/quests.json').read_text())['records'][0]
        self.assertEqual(q['id'], str(self.quest))
        self.assertEqual(q['names'], {'en': 'Guide Quest', 'ja': '案内クエスト'})
        self.assertEqual(q['characterId'], str(self.char))
        self.assertEqual(q['nativeStepCount'], 1)
        self.assertEqual(q['steps'][0]['localizedText']['Story/MyQuest.Story!Step01_StepDescription']['ja'], '友達に会う')
        rows = json.loads((self.out / 'database/relations.json').read_text())['relations']
        self.assertEqual(sum(r['status'] == 'resolved' for r in rows), 3)
        self.assertEqual(sum(r['status'] == 'unresolved' for r in rows), 0)
        manifest = json.loads((self.out / 'manifest.json').read_text())
        self.assertEqual(manifest['counts']['quests'], 2)
        self.assertEqual(manifest['status'], 'PARTIAL')
        self.assertIn('ja', manifest['localizationSources'])

    def test_diff_and_no_source_mutation(self):
        db.extract(self.game, self.out, '1.26.1', 'Steam')
        prior = (self.src / 'itemlist' / 'DutyAch.json').read_bytes()
        self.assertGreater(len(prior), 0)
        path = self.src / 'itemlist' / 'DutyAch.json'
        path.write_bytes(frame(1, vf(1, 2110000001) + sf(2, 'DifferentDuty')))
        out2 = self.root / 'out2'
        db.extract(self.game, out2, '1.26.2', 'Steam', previous=self.out)
        diff = json.loads((out2 / 'diff.json').read_text())
        self.assertIn({'family': 'duties', 'id': '2110000001'}, diff['changed'])
        self.assertNotEqual(path.read_bytes(), prior)

    def test_reject_bad_frames_and_inputs(self):
        with self.assertRaises(ValueError):
            db.varint(b'\x80\x00', 0)
        with self.assertRaises(ValueError):
            list(db.native_frames(frame(1, vf(1, 2000002)) + frame(2, vf(1, 2000004))))
        with self.assertRaises(ValueError):
            db.extract(self.game, self.game / 'output', '1.26.1', 'Steam')
        with self.assertRaises(ValueError):
            db.locbin_decode(loc_entry('A', '1') + loc_entry('A', '2'))


if __name__ == '__main__':
    unittest.main()
