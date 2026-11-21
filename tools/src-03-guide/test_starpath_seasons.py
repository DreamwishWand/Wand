"""No proprietary or account-specific data: synthetic Star Path protobuf samples."""
import json
import tempfile
import unittest
from pathlib import Path

import starpath_seasons as s
from native_guide import encode_varint


def v(n, val):
    return encode_varint((n<<3)|0) + encode_varint(val)


def b(n, val):
    if isinstance(val,str):val=val.encode('utf-8')
    return encode_varint((n<<3)|2)+encode_varint(len(val))+val


def make_task(i):
    objective=b(58,b(1,v(1,30000031)))  # ObjectiveData.CraftItem
    return (b(8,f'task-{i}')+b(3,f'Synthetic description {i}')+
            b(4,objective)+v(5,10)+v(6,3))


def make_season(lang='ja', key='season-a'):
    reward=v(2,31300001)+v(5,1)+v(6,12)+v(7,1)+b(1,'Synthetic reward')
    page=b(1,'Page 1')+v(3,2)+b(10,reward)+b(5,v(1,2))
    bonus=b(1,'synthetic-color')+b(2,b(10,v(2,31200001)+v(5,2)))
    vault=b(1,'vault-ref')+b(2,b(1,v(2,31400001)+v(5,3)+v(6,1)))
    task_group=b(1,make_task(1))
    weekly_group=b(1,b(1,'week-a')+b(2,make_task(2)))
    cond=v(1,5)+b(2,v(1,1761091200))
    return (v(1,23)+b(2,'1.26.1')+v(3,1)+b(4,cond)+b(5,cond)+b(6,cond)+
            b(7,'Synthetic title')+b(8,'Synthetic description')+b(9,'Synthetic short')+
            b(10,encode_varint(1)+encode_varint(3))+b(12,'Synthetic currency')+
            b(13,v(1,80000000)+v(2,3500))+v(18,3)+v(19,6)+
            b(21,page)+b(22,bonus)+b(23,vault)+b(24,task_group)+
            b(25,weekly_group)+b(30,key)+b(33,lang)+b(51,b(1,'Resource/icon')))


def response_entry(key, data):
    return b(4,b(1,key)+b(2,data))


class StarPathSeasonSnapshotTests(unittest.TestCase):
    def test_source_verified_reward_page_price_dates_and_objective(self):
        doc=s.project_snapshot(make_season(),'season','season-a')
        self.assertEqual(doc['counts'],{'seasonEntries':1,'rewardPages':1,
                         'rewardDefinitions':3,'tasks':1,'weeklyTasks':1})
        r=doc['seasons'][0]
        self.assertEqual(r['sourceVersion'],23)
        self.assertEqual(r['minimumGameVersion'],'1.26.1')
        self.assertEqual(r['premiumPassPrice']['amount'],3500)
        self.assertEqual(r['premiumPassPrice']['currencyId'],'80000000')
        self.assertEqual(r['configuredTags'],['1','3'])
        self.assertEqual(r['rewardPages'][0]['layoutCode'],2)
        self.assertEqual(r['rewardPages'][0]['unlockRequirement']['type'],'task')
        self.assertEqual(r['rewardPages'][0]['unlockRequirement']['minimumCollectedTasks'],2)
        self.assertEqual(r['rewardPages'][0]['rewards'][0]['itemId'],'31300001')
        self.assertEqual(r['rewardPages'][0]['rewards'][0]['currencyPrice'],12)
        self.assertEqual(r['rewardPages'][0]['rewards'][0]['premiumOnly'],True)
        self.assertEqual(r['bonusRewards']['pages'][0]['rewards'][0]['itemId'],'31200001')
        self.assertEqual(r['vaultRewards']['rewards'][0]['itemId'],'31400001')
        self.assertEqual(r['tasks'][0]['objective']['kind'],'CraftItem')
        self.assertEqual(r['weeklyTasks'][0]['tasks'][0]['taskId'],'task-2')
        self.assertEqual(r['startCondition']['operator'],'GreaterThanOrEqual')
        self.assertEqual(r['startCondition']['archivedDate']['sourceUtcDateTime'],
                         '2025-10-22T00:00:00Z')
        self.assertEqual(r['sourceActiveFlag'],True)
        self.assertNotIn('activeNow',r)
        self.assertNotIn('userHasPremium',r)
        self.assertEqual(doc['coverage'],'partial_response_updates_only_not_complete_season_catalog')

    def test_response_map_and_not_found_are_not_season_removals(self):
        raw=(v(3,0)+response_entry('z',make_season('ja','z'))+
             response_entry('a',make_season('en','a'))+
             b(6,'obsolete-id')+b(7,b(1,'old-id')+b(2,'new-id')))
        d=s.project_snapshot(raw,'response')
        self.assertEqual([s['id'] for s in d['seasons']],['a','z'])
        self.assertEqual(d['idsNotFoundInResponse'],['obsolete-id'])
        self.assertEqual(d['idRemappingsFromResponse'],[{'originalId':'old-id','newId':'new-id'}])
        self.assertNotIn('removed',d)
        self.assertEqual(d['responseStateCodes'],{'playFabResultCode':0})
        self.assertEqual(d['source']['nativeClass'],'GetBattlePasses.Types.Response')

    def test_duplicate_map_key_and_locale_rejected(self):
        raw=response_entry('a',make_season())*2
        with self.assertRaisesRegex(ValueError,'DUPLICATE_BATTLEPASS'):
            s.project_snapshot(raw,'response')

    def test_same_season_different_languages_preserved_with_distinct_map_keys(self):
        raw=response_entry('a-en',make_season('en','a'))+response_entry('a-ja',make_season('ja','a'))
        d=s.project_snapshot(raw,'response')
        self.assertEqual([r['language'] for r in d['seasons']],['en','ja'])
        self.assertTrue(all(r['onlineIdDiffersFromResponseMapKey'] for r in d['seasons']))

    def test_empty_update_is_not_entire_catalog(self):
        d=s.project_snapshot(v(3,0),'response')
        self.assertEqual(d['counts']['seasonEntries'],0)
        self.assertEqual(d['coverage'],'partial_response_updates_only_not_complete_season_catalog')

    def test_duplicate_oneof_unlock_and_malformed_objective_fail_closed(self):
        with self.assertRaisesRegex(ValueError,'MULTIPLE_BATTLEPASS_ONEOF'):
            s.page(b(5,b'')+b(8,b''))
        with self.assertRaisesRegex(ValueError,'MULTIPLE_BATTLEPASS_TASK_OBJECTIVE'):
            s.objective(b(21,b'')+b(58,b''))

    def test_direct_season_requires_grounded_id(self):
        with self.assertRaisesRegex(ValueError,'DIRECT_SEASON_REQUIRES_ID'):
            s.project_snapshot(make_season(),'season')
        with self.assertRaisesRegex(ValueError,'INVALID_BATTLEPASS_INPUT_FORMAT'):
            s.project_snapshot(make_season(),'unexpected','s')

    def test_bad_protobuf_map_and_noncanonical_key_fails(self):
        with self.assertRaisesRegex(ValueError,'INVALID_BATTLEPASS_MAP_ENTRY'):
            s.project_snapshot(b(4,b(1,'missing value')),'response')
        with self.assertRaisesRegex(ValueError,'NONCANONICAL_VARINT'):
            s.project_snapshot(b'\x80\x00','response')

    def test_bad_repeated_tags_rejected(self):
        with self.assertRaises(ValueError):
            s.project_snapshot(b(10,b'\x80'),'season','test')

    def test_direct_id_mismatch_retained_not_rewritten(self):
        d=s.project_snapshot(make_season('en','source-key'),'season','provided-key')
        r=d['seasons'][0]
        self.assertEqual(r['id'],'provided-key')
        self.assertEqual(r['onlineId'],'source-key')
        self.assertTrue(r['onlineIdDiffersFromResponseMapKey'])

    def test_document_serializes_utf8_and_stable_source_hashes(self):
        d=s.project_snapshot(make_season('ja'),'season','season-a')
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)/'catalog.json'
            s.save(path,d)
            loaded=json.loads(path.read_text(encoding='utf8'))
            self.assertEqual(loaded,d)
            self.assertEqual(len(loaded['source']['sha256']),64)
            self.assertEqual(loaded['seasons'][0]['language'],'ja')


if __name__=='__main__':unittest.main()
