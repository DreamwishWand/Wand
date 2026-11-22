import hashlib
import json
import pathlib
import unittest

from starpath_task_goals import SCHEMA, SOURCE_SHA, encode, project

ROOT=pathlib.Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'static/guide/public/starpath-goals-2026-11-22.json'
PUBLIC_SHA='3d6a81699f2d3e45e2604e8248ac4a202e49a630ac0269da90fef510cccdd0a3'


def fixture(kind='CatchFish',amount=10):
    if kind=='CatchFish':
        goal={'ConditionType':{'Amount':{'AmountToCatch':{'Value':{'Value':amount}}}}}
    elif kind=='Friend':
        goal={'MinimumFriendshipLevel':5,'Any':{'AmountOfCharacter':amount}}
    elif kind=='VisitArea':
        goal={'InScene':{'Scene':{'SecretId':12345}}}
    else:
        goal={'TargetAmount':{'Value':{'Value':amount}}}
    task={'InternalName':'Task01','Description':'Private source text',
          'Objective':{kind:goal},'CurrencyReward':100,'UserUUID':'secret'}
    seasons={}
    for sid in ('HauntingElegance2026','Seafaring2026'):
        seasons[sid]=json.dumps({
            'OnlineId':sid,'Language':'en-US',
            'TaskConfig':{'Tasks':[task]},
            'WeeklyTasksConfig':{'WeeklyTasks':[]},
            'privateUserData':'secret'
        },separators=(',',':'))
    raw=json.dumps({'Data':seasons},separators=(',',':')).encode()
    return raw


class StarpathGoalsTest(unittest.TestCase):
    def test_release_file_uses_exact_original_sha_without_original_data(self):
        data=PUBLIC.read_bytes()
        self.assertEqual(len(data),12398)
        self.assertEqual(hashlib.sha256(data).hexdigest(),PUBLIC_SHA)
        doc=json.loads(data)
        self.assertEqual(doc['schema'],SCHEMA)
        self.assertEqual(doc['source']['sourceSha256'],SOURCE_SHA)
        self.assertEqual(sum(len(s['goals']) for s in doc['seasons']),185)
        self.assertEqual(sum('value' in r for s in doc['seasons'] for r in s['goals']),178)
        for forbidden in ('UserUUID','privateUserData','FilterGenerator','ItemList',
                          'CharacterID','Description','CurrencyReward','OnlineId'):
            self.assertNotIn(forbidden,data.decode())

    def test_synthetic_projection_exports_only_scalar_goals(self):
        raw=fixture()
        doc=project(raw,hashlib.sha256(raw).hexdigest(),len(raw))
        self.assertEqual(doc['seasons'][0]['goals'],
                         [{'id':'Task01','kind':'CatchFish','value':10,'unit':'fish'}])
        self.assertEqual(doc['seasons'][1]['goals'],
                         [{'id':'Task01','kind':'CatchFish','value':10,'unit':'fish'}])
        projection=encode(doc).decode()
        self.assertNotIn('SecretId',projection)
        self.assertNotIn('UserUUID',projection)
        self.assertNotIn('privateUserData',projection)
        self.assertNotIn('Private source text',projection)

    def test_special_friend_threshold_and_visit_no_guessed_count(self):
        raw=fixture('Friend',5)
        doc=project(raw,hashlib.sha256(raw).hexdigest(),len(raw))
        self.assertEqual(doc['seasons'][0]['goals'][0],
                         {'id':'Task01','kind':'Friend','friendshipLevel':5,
                          'value':5,'unit':'characters'})
        raw=fixture('VisitArea')
        doc=project(raw,hashlib.sha256(raw).hexdigest(),len(raw))
        self.assertEqual(doc['seasons'][0]['goals'][0],
                         {'id':'Task01','kind':'VisitArea'})

    def test_source_digest_and_scalar_shape_fail_closed(self):
        raw=fixture()
        with self.assertRaisesRegex(ValueError,'SOURCE_FINGERPRINT'):
            project(raw)
        with self.assertRaisesRegex(ValueError,'SOURCE_FINGERPRINT'):
            project(raw+b'0',hashlib.sha256(raw).hexdigest(),len(raw))
        raw=fixture(amount=0)
        with self.assertRaisesRegex(ValueError,'GOAL_NUMBER_INVALID'):
            project(raw,hashlib.sha256(raw).hexdigest(),len(raw))
        raw=fixture('UnsupportedAction')
        with self.assertRaisesRegex(ValueError,'UNKNOWN_OBJECTIVE_KIND'):
            project(raw,hashlib.sha256(raw).hexdigest(),len(raw))


if __name__=='__main__':
    unittest.main()
