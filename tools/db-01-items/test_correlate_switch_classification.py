"""Synthetic historical Switch reference comparison, never promoting 1.25 data."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import correlate_switch_classification as correlate
from test_extract_classification import NativeTagClassificationTest


class SwitchClassificationCorrelationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = NativeTagClassificationTest(
            methodName='test_exact_tag_keys_preserve_many_universes_and_world_context')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.build()
        self.root=self.fixture.root
        self.switch=self.root/'switch'
        self.switch.mkdir()
        self.out=self.root/'switch-compare'
        self.rows=[
            [1,0,0,0,[0],[],[0],['Synthetic Apple','','','','','','','']],
            [2,1,0,0,[0],[0,1],[0],['Legacy Name','','','','','','','']],
        ]
        shard={'s':'wand.collection.records@1','offset':0,'count':2,'r':self.rows}
        shard_bytes=json.dumps(shard,ensure_ascii=False).encode()
        (self.switch/'records-00.json').write_bytes(shard_bytes)
        index={'s':'wand.collection.runtime@1',
               'l':['EN','FR','IT','DE','ES-ES','JA','ZH-CN','PT-BR'],
               't':{'platform':'Nintendo Switch','gameVersion':'1.25.0','buildID':'test'},
               'f':['Ingredients','Characters'],'c':['TRACKED'],
               'm':['QUANTITY_STOCK'],
               'w':['IsDreamlightValley','IsEternityIsle'],
               'u':['Mickey','BeautyBeast'],
               'e':['BaseGame','Expansion01'],
               'n':2,
               'shards':[{'file':'records-00.json','offset':0,'count':2,
                   'bytes':len(shard_bytes),
                   'sha256':hashlib.sha256(shard_bytes).hexdigest()}]}
        (self.switch/'index.json').write_text(json.dumps(index),encoding='utf-8')

    def run_compare(self):
        return correlate.compare(
            self.fixture.sqlite_path,self.fixture.out,self.switch,self.out,
            expected_sqlite_sha256=self.fixture.sqlite_sha,
            expected_switch_index_sha256=hashlib.sha256(
                (self.switch/'index.json').read_bytes()).hexdigest())

    def test_old_classification_candidates_only_and_source_exact_matches(self):
        result=self.run_compare()
        self.assertEqual(result['sameItemIds'],2)
        self.assertEqual(result['historicalRows'],2)
        self.assertEqual(result['withExactNameAgreement'],1)
        self.assertEqual(result['withCurrentOriginalUniverseTagAgreement'],1)
        self.assertEqual(result['withCurrentOriginalWorldContextTagAgreement'],2)
        self.assertEqual(result['classificationPromotions'],0)
        candidates=[
            json.loads(line) for line in
            (self.out/'historical-classification-candidates.jsonl').read_text().splitlines()
        ]
        self.assertEqual(candidates[0]['historicalCategoryCandidate'],'Ingredients')
        self.assertEqual(candidates[0]['sameExactCurrentNameLocales'],['en'])
        self.assertEqual(candidates[1]['currentOriginalUniverseTagMatches'],
                         ['BeautyBeast','Mickey'])
        self.assertEqual(candidates[1]['sameExactCurrentNameLocales'],[])
        self.assertTrue(all(row['candidateOnly'] and
                       not row['canPromoteLegacyCategory'] and
                       not row['canPromoteLegacyDlc'] and
                       not row['canPromoteWorldAvailability'] for row in candidates))

    def test_false_switch_index_pin_fails(self):
        with self.assertRaisesRegex(ValueError,'SWITCH_INDEX_PIN'):
            correlate.compare(self.fixture.sqlite_path,self.fixture.out,
                self.switch,self.out,expected_sqlite_sha256=self.fixture.sqlite_sha,
                expected_switch_index_sha256='a'*64)

    def test_tampering_the_original_tag_overlay_fails(self):
        file=self.fixture.out/'id'/'01.json'
        file.write_bytes(b'[]\n')
        with self.assertRaisesRegex(ValueError,'OVERLAY_SHARD_SHA'):
            self.run_compare()

    def test_old_switch_data_does_not_authorize_publication(self):
        result=self.run_compare()
        self.assertFalse(result['publicationAuthorized'])
        self.assertEqual(result['currentGameVersion'],'1.26.2')
        self.assertEqual(result['historicalGameVersion'],'1.25.0')
        self.assertEqual(result['oldNotObservedNotConfirmedRemoved'],0)


if __name__=='__main__':
    unittest.main()
