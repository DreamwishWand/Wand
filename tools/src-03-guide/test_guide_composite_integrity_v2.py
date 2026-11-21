"""Synthetic-only tests for v2 private Guide evidence composition."""
import copy
import unittest
from guide_composite_integrity_v2 import (
    SHARD_BYTES,FRIENDSHIP_SHA,SHARD_AUDIT_SHA,SOURCE_SHA,
    SOURCE_MISSION_SHA,OUTPUT_SCHEMA,build_v2,
)


def fixture():
    base={
      'schema':'wand.db03.guide-source-composite@1',
      'status':'SOURCE_VERIFIED_STATIC_COMPOSITE',
      'target':{'gameVersion':'1.26.2','platform':'Steam'},
      'questSearch':{'originalOutputGameVersion':'1.26.1',
          'originalOutputSha256':'26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d',
          'uniqueReferencedShardPaths':32,'shardFileBytesVerifiedByThisManifest':False},
      'currentConditions':{'nativeDefinitions':5440,'typedMissionMentions':4960},
      'limits':{'fullQuestShardFileBytesValidated':False,
                'friendshipDefaultCrossVersionEqualityVerified':False},
    }
    entries=[]
    n,m=divmod(SHARD_BYTES,32)
    for i in range(32):
        mission=23 if i<29 else 22
        group=9 if i<31 else 10
        unclassified=1 if i<8 else 0
        entries.append({'file':f'quest-shards/part-{i:02}.json',
            'sha256':format(100+i,'064x'),'bytes':n+(i<m),
            'nativeRecords':mission+group+unclassified,
            'recordKinds':{'mission':mission,'questGroup':group,'unclassified':unclassified}})
    # Fix per-kind totals without relying on artificial source content.
    total_mission=sum(e['recordKinds']['mission'] for e in entries)
    total_group=sum(e['recordKinds']['questGroup'] for e in entries)
    entries[0]['recordKinds']['mission']+=733-total_mission
    entries[0]['recordKinds']['questGroup']+=289-total_group
    entries[0]['nativeRecords']=sum(entries[0]['recordKinds'].values())
    report={
      'schema':'wand.db03.guide-shard-source-audit@1',
      'status':'ALL_32_SHARDS_AND_FRIENDSHIP_ORIGINALS_VERIFIED',
      'targetSourceCompatibleWith':{'gameVersion':'1.26.2','missionSha256':SOURCE_MISSION_SHA},
      'originalOutput':{'gameVersion':'1.26.1','nativeSourceSha256':SOURCE_MISSION_SHA,
           'originalSearchSha256':base['questSearch']['originalOutputSha256'],
           'versionRelabelled':False},
      'friendshipDefault':{'fullSourceSha256':FRIENDSHIP_SHA,'bytes':2095,
                           'nativeRecords':16,'exactBaselineAndTargetBytesIdentical':True},
      'questShards':{'files':32,'totalBytes':SHARD_BYTES,'nativeSourceRecords':1030,
          'verifiedSearchQuestRecordDigests':733,'recordsByKind':{'mission':733,'questGroup':289,'unclassified':8},
          'fullShardFileSha256Available':True,'entries':entries},
      'limits':{'fullCurrentGuideExtraction':False,
                'currentStarPathOrServerEventsVerified':False,
                'proprietaryGameStringsPublished':False},
    }
    return base,report


class CompositeIntegrityV2Tests(unittest.TestCase):
    def setUp(self):self.base,self.audit=fixture()

    def test_integrates_all_32_full_shard_hashes_and_friendship_without_relabelling(self):
        out=build_v2(self.base,self.audit)
        self.assertEqual(out['schema'],OUTPUT_SCHEMA)
        self.assertEqual(out['sourceCompositeV1Sha256'],SOURCE_SHA)
        self.assertEqual(out['fullShardAndFriendshipAuditSha256'],SHARD_AUDIT_SHA)
        self.assertTrue(out['friendshipDefaultSource']['exactFullOriginalFileContentIdentical'])
        self.assertEqual(out['originalQuestShardFullHashes']['totalBytes'],SHARD_BYTES)
        self.assertEqual(len(out['originalQuestShardFullHashes']['fileHashes']),32)
        self.assertTrue(out['limits']['fullQuestShardFileBytesValidated'])
        self.assertTrue(out['questSearch']['shardFileBytesVerifiedByThisManifest'])
        self.assertFalse(out['limits']['completeGameGuideOrLiveServiceCoverage'])
        self.assertFalse(self.base['limits']['fullQuestShardFileBytesValidated'])

    def test_baseline_relabelling_or_fake_version_rejected(self):
        self.base['questSearch']['originalOutputGameVersion']='1.26.2'
        with self.assertRaisesRegex(ValueError,'SOURCE_COMPOSITE_SCOPE'):
            build_v2(self.base,self.audit)
        self.base,self.audit=fixture()
        self.audit['originalOutput']['versionRelabelled']=True
        with self.assertRaisesRegex(ValueError,'SHARD_AUDIT_SOURCE'):
            build_v2(self.base,self.audit)

    def test_missing_or_duplicate_file_fingerprint_rejected(self):
        self.audit['questShards']['entries'][1]['file']='quest-shards/part-00.json'
        with self.assertRaisesRegex(ValueError,'SHARD_AUDIT_FILE_ENTRY'):
            build_v2(self.base,self.audit)

    def test_falsified_count_and_friendship_rejected(self):
        self.audit['questShards']['totalBytes']-=1
        with self.assertRaisesRegex(ValueError,'SHARD_AUDIT_CENSUS'):
            build_v2(self.base,self.audit)
        self.base,self.audit=fixture()
        self.audit['friendshipDefault']['fullSourceSha256']='0'*64
        with self.assertRaisesRegex(ValueError,'FRIENDSHIP_AUDIT_SOURCE'):
            build_v2(self.base,self.audit)

    def test_no_live_event_or_source_disclosure_promotions(self):
        self.audit['limits']['currentStarPathOrServerEventsVerified']=True
        with self.assertRaisesRegex(ValueError,'SHARD_AUDIT_LIMITS'):
            build_v2(self.base,self.audit)


if __name__=='__main__':unittest.main()
