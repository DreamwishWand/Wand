"""Synthetic security and boundary tests: no owner game content embedded."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from mission_source_bridge import SCHEMA, SOURCE, build_bridge, candidate, main, sha_file


def sha(data): return hashlib.sha256(data).hexdigest()

class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        self.mission_data = b'\x00\x01fake protobuf mission record'
        self.condition_data = b'old conditions'
        self.mission = self.path / 'Mission.json'
        self.condition = self.path / 'Condition.json'
        self.mission.write_bytes(self.mission_data)
        self.condition.write_bytes(self.condition_data)
        self.index = {
            'schema': 'wand.db03.quest-search@1',
            'target': {'gameVersion':'1.26.1','platform':'Steam'},
            'source': {'file':SOURCE,'sha256':sha(self.mission_data)},
            'counts': {'missions':1,'excludedQuestGroups':1,'excludedUnclassified':1,'sourceNativeRecords':3},
            'records': [{'id':'2070000620'}],
        }
        self.probe = {'schema':'wand.src01.format-probe@1','gameVersion':'1.26.2',
                      'platform':'Steam','itemlistCandidates':{}}
        for name in ('Mission.json','Character.json','Condition.json','Story.json','Scene.json',
                     'DutyAch.json','RecurringEvent.json','ConditionalEvent.json','Ftue.json'):
            data = self.mission_data if name=='Mission.json' else (b'new conditions' if name=='Condition.json' else b'x')
            self.probe['itemlistCandidates'][name] = {
                'status':'binary_structure_probe', 'isJsonText':False,
                'source':'ddv_Data/StreamingAssets/itemlist/'+name,
                'sha256':sha(data),'size':len(data),
            }

    def build(self, **kw):
        return build_bridge(kw.pop('index',self.index), kw.pop('probe',self.probe),
            kw.pop('mission',self.mission), sha(b'probe'), sha(b'index'),
            kw.pop('condition',self.condition), kw.pop('other',None))

    def test_byte_identical_mission_only(self):
        x=self.build()
        self.assertEqual(x['schema'],SCHEMA)
        self.assertEqual(x['status'],'PARTIAL_MISSION_BYTES_ONLY')
        self.assertEqual(x['baseline']['nativeMissionRecords'],3)
        self.assertEqual(x['target']['gameVersion'],'1.26.2')
        self.assertTrue(x['evidence']['missionFullFileBytesIdentical'])
        self.assertTrue(x['evidence']['conditionSourceChanged'])
        self.assertEqual(x['limits']['currentLocaleTexts'],'NOT_VERIFIED_DO_NOT_RELABEL')
        self.assertEqual(x['limits']['conditionDefinitions'],'CHANGED_NOT_REUSED')

    def test_changed_mission_fails_closed(self):
        p=copy.deepcopy(self.probe)
        p['itemlistCandidates']['Mission.json']['sha256']=sha(b'changed mission!')
        with self.assertRaisesRegex(ValueError,'Mission source changed'):
            self.build(probe=p)

    def test_old_mission_tampering_fails_closed(self):
        self.mission.write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError,'old Mission bytes'):
            self.build()

    def test_cross_version_platform_fails_closed(self):
        for key,value in [('platform','Switch'),('gameVersion','1.26.1')]:
            p=copy.deepcopy(self.probe);p[key]=value
            with self.assertRaisesRegex(ValueError,'target probe/version/platform'):
                self.build(probe=p)

    def test_unverified_probe_status_or_path_fails_closed(self):
        for key,value in [('status','truncated'),('source','../Mission.json'),('isJsonText',True)]:
            p=copy.deepcopy(self.probe);p['itemlistCandidates']['Mission.json'][key]=value
            with self.assertRaisesRegex(ValueError,'no verified full-file probe'):
                self.build(probe=p)

    def test_missing_current_condition_source_fails_closed(self):
        p=copy.deepcopy(self.probe);p['itemlistCandidates'].pop('Condition.json')
        with self.assertRaisesRegex(ValueError,'Condition.json'):
            self.build(probe=p)

    def test_missing_old_condition_is_explicit_unknown(self):
        x=self.build(condition=None)
        self.assertIsNone(x['evidence']['conditionSourceChanged'])
        self.assertEqual(x['limits']['conditionDefinitions'],'NOT_INDEPENDENTLY_CONFIRMED')

    def test_bad_old_index_census_or_ids_fails_closed(self):
        for path,value in [(('counts','missions'),2),(('records',0,'id'),'../../escape')]:
            i=copy.deepcopy(self.index)
            if len(path)==2: i[path[0]][path[1]]=value
            else: i[path[0]][path[1]][path[2]]=value
            with self.assertRaises(ValueError):self.build(index=i)

    def test_reject_wrong_old_index_sha(self):
        i=copy.deepcopy(self.index);i['source']['sha256']=sha(b'other')
        with self.assertRaisesRegex(ValueError,'old Mission bytes'):
            self.build(index=i)

    def test_no_nonpublic_strings_embedded_in_report(self):
        x=self.build()
        self.assertNotIn('names',x['baseline'])
        self.assertNotIn('records',x)
        self.assertEqual(x['baseline']['searchableMissions'],1)

    def test_real_cli_writes_private_digest_bound_report(self):
        for filename,obj in [('search.json',self.index),('probe.json',self.probe)]:
            (self.path/filename).write_text(json.dumps(obj),encoding='utf-8')
        target=self.path/'audit.json'
        self.assertEqual(main(['--baseline-mission',str(self.mission),
                               '--baseline-search',str(self.path/'search.json'),
                               '--target-probe',str(self.path/'probe.json'),
                               '--baseline-condition',str(self.condition),
                               '--out',str(target)]),0)
        obj=json.loads(target.read_text())
        self.assertEqual(obj['target']['sourceProbeSha256'],sha_file(self.path/'probe.json'))
        self.assertEqual(obj['baseline']['searchIndexSha256'],sha_file(self.path/'search.json'))

if __name__=='__main__':unittest.main()
