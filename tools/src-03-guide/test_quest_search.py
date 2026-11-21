"""Synthetic-only Guide query contract. No proprietary source data."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from native_guide import save
from quest_catalogue import summary
from quest_detail_shards import project_quest_shards
from quest_search import build_search, make_from_paths, query_search
from test_quest_catalogue import base, TARGET


class QuestSearchTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.rows = [base('101'), base('102'), base('103'),
                     base('202', 'questGroup'), base('303', 'unclassified')]
        self.rows[0]['names'] = {'ja': 'パーティーの試練', 'en': 'Party challenge'}
        self.rows[1]['names'] = {'ja': '森の探検', 'en': 'Explore the forest'}
        self.rows[1]['characterId'] = '1002'
        self.rows[1]['sourceScopeTokens'] = ['Expansion02']
        self.rows[1]['structured']['questMeta']['updateVersion'] = 'Update02'
        self.rows[2]['names'] = {}
        self.rows[2]['structured']['stepsDetailed'][0]['subSteps'][0]['objectives'] = [{'type': 'VisitArea'}]

    def build(self):
        cat = summary(copy.deepcopy(self.rows), TARGET)
        project_quest_shards(copy.deepcopy(self.rows), TARGET, self.root, save)
        index = json.loads((self.root/'database/quest-detail-shard-index.json').read_text())
        return cat, index, build_search(cat, index)

    def test_mission_only_full_coverage_and_detail_locators(self):
        cat, shard, doc = self.build()
        self.assertEqual(doc['counts'], {
            'missions': 3, 'sourceNativeRecords': 5, 'excludedQuestGroups': 1,
            'excludedUnclassified': 1, 'missionsWithNoResolvedName': 1,
        })
        self.assertEqual({r['id'] for r in doc['records']}, {'101', '102', '103'})
        for rec in doc['records']:
            self.assertEqual(rec['detail']['file'], shard['byId'][rec['id']]['file'])
            self.assertEqual(rec['detail']['recordSha256'], shard['byId'][rec['id']]['recordSha256'])
        self.assertNotIn('ownedNow', str(doc))
        self.assertNotIn('completedNow', str(doc))

    def test_ja_nfkc_halfwidth_and_casefold_fallback(self):
        _, _, doc = self.build()
        result = query_search(doc, 'ﾊﾟｰﾃｨｰ', locale='ja')
        self.assertEqual([r['id'] for r in result['results']], ['101'])
        self.assertEqual(result['results'][0]['matchedLocale'], 'ja')
        en = query_search(doc, 'PARTY', locale='ja')
        self.assertEqual(en['results'][0]['matchedLocale'], 'en')
        self.assertEqual(en['results'][0]['displayNameSource'], 'ja')
        self.assertEqual(query_search(doc, '2070001000')['total'], 0)
        self.assertEqual(query_search(doc, '103')['results'][0]['matchedLocale'], 'nativeId')

    def test_source_derived_facets_and_no_live_completion_inference(self):
        _, _, doc = self.build()
        self.assertEqual(query_search(doc, '', character='1002')['results'][0]['id'], '102')
        self.assertEqual(query_search(doc, '', group='202')['total'], 3)
        self.assertEqual(query_search(doc, '', objective_kind='VisitArea')['results'][0]['id'], '103')
        self.assertEqual(query_search(doc, '', update_group='Update02')['results'][0]['id'], '102')
        self.assertEqual(query_search(doc, '', scope_token='Expansion02')['results'][0]['id'], '102')
        self.assertEqual(query_search(doc, '', scope_token='Expansion99')['total'], 0)

    def test_stable_pagination_and_source_name_fallback(self):
        _, _, doc = self.build()
        first = query_search(doc, '', limit=1)
        self.assertEqual(first['total'], 3)
        self.assertEqual(first['nextOffset'], 1)
        other = query_search(doc, '', limit=1, offset=1)
        self.assertNotEqual(first['results'][0]['id'], other['results'][0]['id'])
        none = query_search(doc, '', limit=10, offset=100)
        self.assertEqual(none['results'], [])
        self.assertIsNone(none['nextOffset'])
        r = query_search(doc, '103')['results'][0]
        self.assertEqual(r['displayNameSource'], 'internalName')
        self.assertEqual(r['names'], {})

    def test_mismatched_source_version_and_missing_record_rejected(self):
        cat, shard, _ = self.build()
        bad = copy.deepcopy(shard)
        bad['source']['sha256'] = 'e'*64
        with self.assertRaisesRegex(ValueError, 'SOURCE_MISMATCH'):
            build_search(cat, bad)
        bad = copy.deepcopy(shard)
        bad['byId'].pop('103')
        with self.assertRaisesRegex(ValueError, 'COVERAGE_MISMATCH'):
            build_search(cat, bad)
        bad = copy.deepcopy(shard)
        bad['target']['gameVersion'] = '1.26.2'
        with self.assertRaisesRegex(ValueError, 'TARGET_MISMATCH'):
            build_search(cat, bad)

    def test_malformed_ids_wire_hash_and_path_fail_closed(self):
        cat, shard, _ = self.build()
        bad = copy.deepcopy(cat)
        bad['missions'][0]['nativeWireSha256'] = 'a'*64
        with self.assertRaisesRegex(ValueError, 'NATIVE_WIRE_MISMATCH'):
            build_search(bad, shard)
        bad = copy.deepcopy(shard)
        bad['byId']['101']['file'] = '../../private.json'
        with self.assertRaisesRegex(ValueError, 'UNVERIFIED_DETAIL_LOCATOR'):
            build_search(cat, bad)
        bad = copy.deepcopy(cat)
        bad['missions'].append(copy.deepcopy(bad['missions'][0]))
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_SOURCE_ID'):
            build_search(bad, shard)

    def test_invalid_locale_pagination_query_and_filters_rejected(self):
        _, _, doc = self.build()
        for kw in ({'locale':'xx'}, {'limit':0}, {'offset':-1}, {'query':'a'*129},
                   {'character':'unknown'}, {'objective_kind':4}, {'all_locales':'yes'}):
            with self.subTest(kwargs=kw), self.assertRaises(ValueError):
                query_search(doc, **kw)

    def test_all_locale_search_is_explicit(self):
        _, _, doc = self.build()
        doc['records'][0]['names']['fr'] = 'La fête'
        self.assertEqual(query_search(doc, 'fête', locale='ja')['total'], 0)
        self.assertEqual(query_search(doc, 'fête', locale='ja', all_locales=True)['total'], 1)
        self.assertEqual(query_search(doc, 'SyntheticQuest', locale='ja')['total'], 0)
        self.assertEqual(query_search(doc, 'SyntheticQuest', locale='ja', include_internal=True)['total'], 3)

    def test_deterministic_private_output_without_full_quest_reparse(self):
        cat, shard, doc = self.build()
        save(self.root/'guide/quest-catalogue.json', cat)
        rebuilt = make_from_paths(self.root/'guide/quest-catalogue.json',
            self.root/'database/quest-detail-shard-index.json',
            self.root/'guide/quest-search.json')
        self.assertEqual(doc,rebuilt)
        self.assertEqual(json.loads((self.root/'guide/quest-search.json').read_text()),doc)
        self.assertLess((self.root/'guide/quest-search.json').stat().st_size, 10000)


if __name__ == '__main__':
    unittest.main()
