"""Synthetic source-provenance tests for the final private DB-01/DB-03 join."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import corroborate_guide_references as join


def sha(data): return hashlib.sha256(data).hexdigest()
def dump(path, data):
    path.write_bytes(join.packed(data))
    return sha(path.read_bytes())


class GuideCrossVersionTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        self.root=Path(t.name)
        self.db=self.root/'catalog.sqlite'
        self.mission=self.root/'Mission.json'
        self.mission.write_bytes(b'synthetic verified Mission wire')
        self.mission_sha=join.digest(self.mission)
        with sqlite3.connect(self.db) as con:
            con.execute('PRAGMA user_version=2')
            con.execute('CREATE TABLE catalog (id INTEGER PRIMARY KEY, store_schema TEXT, platform TEXT, game_version TEXT, items_sha256 TEXT, definition_count INTEGER, publication_authorized INTEGER)')
            con.execute('CREATE TABLE definition (item_id INTEGER PRIMARY KEY,native_category TEXT,source_sha256 TEXT)')
            con.execute('INSERT INTO catalog VALUES (1,?,?,?,?,?,0)',('wand.db01.sqlite@2','Steam','1.26.2','a'*64,2))
            con.executemany('INSERT INTO definition VALUES (?,?,?)',[(5,'ActivityItem','b'*64),(100,'Mission',self.mission_sha)])
        self.manifest=self.root/'guide-manifest.json'
        self.objective=self.root/'item-objective-links.json'
        self.flow=self.root/'quest-item-flows.json'
        self.source={'schema':'wand.db03.item-objective-links@1','indexCoverage':'optional_partial_SRC01_membership_only_not_version_verification',
            'target':{'platform':'Steam','gameVersion':'1.26.1'},
            'meaning':'Selector candidates, NOT all simultaneously required items',
            'links':[{'itemId':'5','questId':'100','candidateRole':'alternative','selectorMode':'itemList',
                      'sourceObjectiveSha256':'d'*64,'sourceField':'protobuf.40[0].20[0].50[0]'}]}
        self.flows={'schema':'wand.db03.item-flows@1','indexCoverage':'optional_partial_SRC01_membership_only',
             'target':self.source['target'],
             'meaning':'STATIC candidates and item references; not guaranteed player state',
             'links':[{'itemId':'5','questId':'100','flowKind':'additional_reward_loot_candidate',
                       'selection':'not_guaranteed','sourceField':'protobuf.61.1[0].10[0]',
                       'nativeWireSha256':'e'*64}]}
        self.source['links'][0]['indexMembership']='not_in_supplied_index'
        self.flows['links'][0]['indexMembership']='present'
        self.guide={'target':self.source['target'],'status':'PARTIAL',
            'sources':{'quests':{'file':'itemlist/Mission.json','records':1,'sha256':self.mission_sha}},
            'itemObjectiveSelectorLinks':1,'questItemFlowLinks':1}
        self.flush()

    def flush(self):
        dump(self.manifest,self.guide)
        dump(self.objective,self.source)
        dump(self.flow,self.flows)

    def run_join(self):
        self.flush()
        return join.build(self.db,self.manifest,self.objective,self.flow,self.mission,
            self.root/'overlay',sqlite_sha=join.digest(self.db),manifest_sha=join.digest(self.manifest),
            objective_sha=join.digest(self.objective),flow_sha=join.digest(self.flow))

    def test_full_private_source_join_and_uncertain_roles(self):
        m=self.run_join()
        self.assertEqual(m['linkCounts'],{'objectiveCandidates':1,'itemFlows':1,'total':2,'oldPartialIndexMissesNowResolved':1})
        self.assertEqual(m['distinctItemIds'],1)
        self.assertFalse(m['guaranteedRewardVerified'])
        self.assertFalse(m['publicationAuthorized'])
        bucket=json.loads((self.root/'overlay/id/05.json').read_bytes())
        self.assertEqual(len(bucket),2)
        self.assertEqual(bucket[0]['detail']['candidateRole'],'alternative')
        self.assertEqual(bucket[1]['detail']['selection'],'not_guaranteed')
        self.assertEqual(len(m['files']),256)

    def test_does_not_accept_same_version_string_without_source_sha(self):
        self.guide['sources']['quests']['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'GUIDE_MISSION_SOURCE_MISMATCH'):
            self.run_join()

    def test_absent_item_and_quest_id_never_fabricated(self):
        self.source['links'][0]['itemId']='6'
        with self.assertRaisesRegex(ValueError,'LINK_NOT_PRESENT_IN_SQLITE'):
            self.run_join()
        self.source['links'][0]['itemId']='5'
        self.source['links'][0]['questId']='101'
        with self.assertRaisesRegex(ValueError,'LINK_NOT_PRESENT_IN_SQLITE'):
            self.run_join()

    def test_alternatives_never_silently_become_direct(self):
        self.source['links'][0]['candidateRole']='direct'
        with self.assertRaisesRegex(ValueError,'OBJECTIVE_SOURCE_OR_ALTERNATIVE'):
            self.run_join()

    def test_reward_candidate_must_remain_not_guaranteed(self):
        self.flows['links'][0]['selection']='guaranteed'
        with self.assertRaisesRegex(ValueError,'FLOW_UNVERIFIED_REWARD'):
            self.run_join()

    def test_stale_and_unpinned_inputs_rejected(self):
        self.flush()
        with self.assertRaisesRegex(ValueError,'TRUSTED_INPUT_SHA_MISMATCH'):
            join.build(self.db,self.manifest,self.objective,self.flow,self.mission,
                       self.root/'overlay',sqlite_sha='0'*64,
                       manifest_sha=join.digest(self.manifest),objective_sha=join.digest(self.objective),
                       flow_sha=join.digest(self.flow))

    def test_duplicate_link_rejected_with_updated_counts(self):
        self.source['links'].append(dict(self.source['links'][0]))
        self.guide['itemObjectiveSelectorLinks']=2
        with self.assertRaisesRegex(ValueError,'DUPLICATE_LINK'):
            self.run_join()

    def test_partial_source_scope_not_claimed_as_complete(self):
        self.guide['status']='COMPLETE'
        with self.assertRaisesRegex(ValueError,'GUIDE_MISSION_SOURCE_MISMATCH'):
            self.run_join()

    def test_output_is_immutable_new_directory_only(self):
        self.run_join()
        with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE'):
            self.run_join()


if __name__=='__main__': unittest.main()