"""Synthetic-only proof of private quest detail shards, no game content."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from native_guide import save
from quest_detail_shards import (bucket_for, project_quest_shards,
                                 verify_quest_shards)

TARGET = {'platform': 'Steam', 'gameVersion': '1.26.1'}
SOURCE = {'file': 'ddv_Data/StreamingAssets/itemlist/Mission.json',
          'sha256': 'a' * 64}


def sample(identifier, kind='mission'):
    return {'id': identifier, 'recordKind': kind,
            'nativeWireSha256': 'b' * 64,
            'source': {**SOURCE, 'frameIndex': int(identifier)},
            'names': {'ja': '合成クエスト', 'en': 'Synthetic quest'},
            'structured': {'stepsDetailed': [{'objectives': ['synthetic']}]},
            'completedNow': None}


class ShardTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.records = [sample(str(2000 + i),
                     ('mission', 'questGroup', 'unclassified')[i % 3])
                     for i in range(39)]
        self.original = self.root / 'original-quests.json'
        save(self.original, {'family': 'quests', 'target': TARGET,
                             'records': self.records})
        self.output = self.root / 'out'

    def build(self):
        return project_quest_shards(copy.deepcopy(self.records), TARGET, self.output, save)

    def load_index(self):
        return json.loads((self.output / 'database/quest-detail-shard-index.json').read_text())

    def test_native_full_coverage_with_preserved_all_record_classes(self):
        summary = self.build()
        self.assertEqual(summary['records'], 39)
        result = verify_quest_shards(self.output, self.original)
        self.assertTrue(result['comparedToOriginal'])
        self.assertEqual(result['recordKinds'], {
            'mission': 13, 'questGroup': 13, 'unclassified': 13})
        index = self.load_index()
        self.assertEqual(len(index['byId']), 39)
        self.assertEqual(index['byId']['2000']['bucket'], bucket_for('2000'))
        self.assertNotIn('availableNow', str(index))

    def test_rebuilding_from_reordered_source_is_byte_deterministic(self):
        self.build()
        hashes = [(r['file'], r['sha256']) for r in self.load_index()['shards']]
        self.records.reverse()
        self.build()
        self.assertEqual(hashes, [(r['file'], r['sha256']) for r in self.load_index()['shards']])

    def test_modified_json_bytes_fail_checksum_even_when_json_valid(self):
        self.build()
        path = self.output / 'guide' / self.load_index()['shards'][0]['file']
        original = path.read_bytes()
        path.write_bytes(original + b'\n')
        with self.assertRaisesRegex(ValueError, 'CHECKSUM_MISMATCH'):
            verify_quest_shards(self.output)

    def test_missing_shard_is_not_interpreted_as_removed_quests(self):
        self.build()
        path = self.output / 'guide' / self.load_index()['shards'][0]['file']
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'QUEST_SHARD_MISSING_OR_OVERSIZED'):
            verify_quest_shards(self.output)

    def test_tampered_locator_cannot_escape_private_output(self):
        self.build()
        index_path = self.output / 'database/quest-detail-shard-index.json'
        doc = self.load_index()
        doc['shards'][0]['file'] = '../../escape.json'
        save(index_path, doc)
        with self.assertRaisesRegex(ValueError, 'INVALID_PATH'):
            verify_quest_shards(self.output)

    def test_duplicate_ids_and_mixed_source_versions_fail(self):
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_NATIVE_ID'):
            project_quest_shards(self.records + [self.records[0]], TARGET, self.output, save)
        altered = copy.deepcopy(self.records)
        altered[0]['source']['sha256'] = 'c' * 64
        with self.assertRaisesRegex(ValueError, 'MIXED_SOURCE_VERSIONS'):
            project_quest_shards(altered, TARGET, self.output, save)

    def test_invalid_source_or_record_kind_fails_closed(self):
        altered = copy.deepcopy(self.records)
        altered[0]['id'] = 'test-id'
        with self.assertRaisesRegex(ValueError, 'INVALID_NATIVE_ID'):
            project_quest_shards(altered, TARGET, self.output, save)
        altered = copy.deepcopy(self.records)
        altered[0]['recordKind'] = 'claimedAsCompleted'
        with self.assertRaisesRegex(ValueError, 'UNVERIFIED_NATIVE_RECORD'):
            project_quest_shards(altered, TARGET, self.output, save)

    def test_comparison_against_original_detects_source_content_changes(self):
        self.build()
        corrupted = copy.deepcopy(self.records)
        corrupted[0]['names']['ja'] = '不一致'
        save(self.original, {'family': 'quests', 'target': TARGET, 'records': corrupted})
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_CONTENT_MISMATCH'):
            verify_quest_shards(self.output, self.original)

    def test_empty_native_rows_do_not_publish_false_empty_shard_index(self):
        self.assertEqual(project_quest_shards([], TARGET, self.output, save)['status'],
                         'native_source_unavailable')
        self.assertFalse((self.output / 'database/quest-detail-shard-index.json').exists())

    def test_index_and_shard_metadata_corruption_rejected(self):
        self.build()
        idx = self.output / 'database/quest-detail-shard-index.json'
        doc = self.load_index()
        doc['byId'].pop('2000')
        save(idx, doc)
        with self.assertRaisesRegex(ValueError, 'BAD_OR_DUPLICATE_RECORD'):
            verify_quest_shards(self.output)


if __name__ == '__main__':
    unittest.main()
