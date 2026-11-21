"""Synthetic-only contract tests for the complete 32-shard private Guide audit."""
import json
import copy
import tempfile
import unittest
from pathlib import Path

from guide_shard_source_audit import (
    BASE_SEARCH_SHA, FRIENDSHIP_SHA, MISSION_SHA, SOURCE, SCHEMA,
    audit, canonical, sha, strict_json,
)
H=lambda x: format(x,'064x')


def fake_source(root:Path):
    data=b'f'*2095
    original_sha=sha(data)
    base={
        'schema':'wand.db03.native-guide@1',
        'target':{'gameVersion':'1.26.1','platform':'Steam'},
        'sources':{'quests':{'file':'itemlist/Mission.json','sha256':MISSION_SHA,'records':1030}},
        'friendshipRewardSource':{'file':'friendship_levels_default.json',
                                  'sha256':original_sha,'bytes':2095,'records':16},
    }
    search={
        'schema':'wand.db03.quest-search@1','target':copy.deepcopy(base['target']),
        'source':{'file':SOURCE,'sha256':MISSION_SHA},
        'counts':{'missions':733,'excludedQuestGroups':289,
                  'excludedUnclassified':8,'sourceNativeRecords':1030},
        'records':[],
    }
    probe={'schema':'wand.src01.format-probe@1','gameVersion':'1.26.2',
           'platform':'Steam','itemlistCandidates':{'Mission.json':{'sha256':MISSION_SHA}}}
    content=[[] for _ in range(32)]
    for i in range(1,1031):
        kind='mission' if i<=733 else 'questGroup' if i<=1022 else 'unclassified'
        bucket=(i-1)%32
        record={
            'id':str(i), 'recordKind':kind,'nativeWireSha256':H(i),
            'source':{'file':SOURCE,'sha256':MISSION_SHA,'frameIndex':i},
            'rawName':f'Synthetic{i}',
        }
        content[bucket].append(record)
        if kind=='mission':
            search['records'].append({'id':str(i),'detail':{
                'file':f'quest-shards/part-{bucket:02}.json',
                'nativeWireSha256':H(i),'recordSha256':sha(canonical(record))}})
    for bucket,records in enumerate(content):
        doc={'schema':'wand.db03.quest-detail-shards@1',
             'evaluation':'static_definition_only',
             'source':search['source'],'target':search['target'],
             'bucket':bucket,'records':records}
        (root/f'part-{bucket:02}.json').write_text(
            json.dumps(doc,sort_keys=True,separators=(',',':'))+'\n',encoding='utf-8')
    return base,search,probe,data,original_sha


class GuideShardSourceAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.base,self.index,self.probe,self.friend,self.friend_sha=fake_source(self.root)

    def run_audit(self, **kwargs):
        return audit(self.base,self.index,self.probe,self.friend,self.friend,self.root,
                     require_exact_bytes=False,friendship_source_sha=self.friend_sha,**kwargs)

    def test_32_exact_files_733_record_hashes_and_friendship(self):
        result=self.run_audit()
        self.assertEqual(result['schema'],SCHEMA)
        self.assertEqual(result['questShards']['nativeSourceRecords'],1030)
        self.assertEqual(result['questShards']['verifiedSearchQuestRecordDigests'],733)
        self.assertEqual(len(result['questShards']['entries']),32)
        self.assertEqual(result['questShards']['recordsByKind'],
                         {'mission':733,'questGroup':289,'unclassified':8})
        self.assertEqual(result['friendshipDefault']['fullSourceSha256'],self.friend_sha)
        self.assertEqual(result['originalOutput']['gameVersion'],'1.26.1')
        self.assertFalse(result['limits']['fullCurrentGuideExtraction'])

    def test_missing_or_extra_shard_fails_closed(self):
        (self.root/'part-31.json').unlink()
        with self.assertRaisesRegex(ValueError,'SHARD_FILENAMES_MISSING_OR_EXTRA'):
            self.run_audit()
        self._restore()
        (self.root/'part-32.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'SHARD_FILENAMES_MISSING_OR_EXTRA'):
            self.run_audit()

    def _restore(self):
        self.base,self.index,self.probe,self.friend,self.friend_sha=fake_source(self.root)

    def test_editing_one_verified_quest_record_is_detected(self):
        p=self.root/'part-00.json'
        doc=json.loads(p.read_text())
        doc['records'][0]['rawName']='Modified Synthetic Source'
        p.write_text(json.dumps(doc,sort_keys=True,separators=(',',':')))
        with self.assertRaisesRegex(ValueError,'MISSION_DETAIL_SHA_MISMATCH'):
            self.run_audit()

    def test_quest_detail_transplanted_to_another_shard_is_detected(self):
        p=self.root/'part-00.json'
        doc=json.loads(p.read_text());doc['records'][0]['id']='733'
        p.write_text(json.dumps(doc,sort_keys=True,separators=(',',':')))
        with self.assertRaisesRegex(ValueError,'MISSION_LOCATOR_MISMATCH|SHARD_RECORD_PROVENANCE'):
            self.run_audit()

    def test_native_record_duplicate_detected(self):
        p=self.root/'part-01.json'
        doc=json.loads(p.read_text());doc['records'].append(doc['records'][0])
        p.write_text(json.dumps(doc,sort_keys=True,separators=(',',':')))
        with self.assertRaisesRegex(ValueError,'SHARD_RECORD_PROVENANCE'):
            self.run_audit()

    def test_wrong_source_mission_sha_or_version_rejected(self):
        self.probe['itemlistCandidates']['Mission.json']['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'TARGET_SOURCE'):
            self.run_audit()
        self._restore()
        self.index['target']['gameVersion']='1.26.2'
        with self.assertRaisesRegex(ValueError,'OLD_QUEST_SOURCE'):
            self.run_audit()

    def test_changed_friendship_target_rejected(self):
        with self.assertRaisesRegex(ValueError,'FRIENDSHIP_SOURCE_CHANGED'):
            audit(self.base,self.index,self.probe,self.friend,b'X'*2095,self.root,
                  require_exact_bytes=False,friendship_source_sha=self.friend_sha)

    def test_duplicate_json_keys_fail_before_source_interpretation(self):
        with self.assertRaisesRegex(ValueError,'DUPLICATE_JSON_KEY'):
            strict_json(b'{"bucket":0,"bucket":1}')

    def test_exact_source_byte_census_is_not_optional_in_production(self):
        with self.assertRaisesRegex(ValueError,'ORIGINAL_SHARD_TOTAL_BYTES'):
            audit(self.base,self.index,self.probe,self.friend,self.friend,self.root,
                  require_exact_bytes=True,friendship_source_sha=self.friend_sha)


if __name__=='__main__':unittest.main()
