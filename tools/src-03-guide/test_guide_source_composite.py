"""Source-free regression tests for strict Steam Guide composite provenance."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from guide_source_composite import (
    BASE_SHA, CONDITION_SHA, CONDITION_V2_SHA, LOCALES, MISSION_SHA,
    PROBE_SHA, PROTO_DB_SHA, SEARCH_SHA, SCHEMA,
    FAMILIES, build, read_pinned,
)

H = lambda v: format(v, '064x')


def synthetic_documents():
    names = {name:H(i+100) for i,name in enumerate(FAMILIES.values())}
    names['Mission.json'] = MISSION_SHA
    names['Condition.json'] = H(300)
    old_src={};new_src={}
    for family,name in FAMILIES.items():
        count=5439 if family=='conditions' else 1030 if family=='quests' else 10
        old_src[family]={'file':'itemlist/'+name,'bytes':1000,'sha256':names[name],
                         'records':count}
        new_src[name]={'source':'ddv_Data/StreamingAssets/itemlist/'+name,
                       'size':1000,'sha256':CONDITION_SHA if family=='conditions' else names[name],
                       'isJsonText':False,'status':'binary_structure_probe'}
    search={
        'schema':'wand.db03.quest-search@1',
        'target':{'platform':'Steam','gameVersion':'1.26.1'},
        'source':{'file':'ddv_Data/StreamingAssets/itemlist/Mission.json','sha256':MISSION_SHA},
        'counts':{'missions':733,'sourceNativeRecords':1030,
                  'excludedQuestGroups':289,'excludedUnclassified':8},
        'records':[{'id':str(i+1),'detail':{
            'file':f'quest-shards/part-{i%32:02}.json',
            'recordSha256':H(i+1),'nativeWireSha256':H(i+1000)}} for i in range(733)],
    }
    old_loc={};new_loc={};loc_report={}
    for i,(lang,suffix) in enumerate(LOCALES.items()):
        a,b=H(i+40),H(i+50)
        old_loc[lang]={'file':f'LocDB_{suffix}.zip','sha256':a}
        new_loc[lang]={'source':f'ddv_Data/StreamingAssets/Localization/LocDB_{suffix}.zip',
                       'sha256':b,'archiveEntries':17852}
        loc_report[lang]={
            'memberPayloadsIdentical':True,'addedMembers':0,'changedMemberPayloads':0,
            'removedMembers':0,
            'baseline':{'zipSha256':a,'memberTreeSha256':H(i+70),
                        'memberCount':17852,'uncompressedBytes':123456},
            'target':{'zipSha256':b,'memberTreeSha256':H(i+70),
                      'memberCount':17852,'uncompressedBytes':123456},
        }
    base={'schema':'wand.db03.native-guide@1',
          'target':{'platform':'Steam','gameVersion':'1.26.1'},
          'sources':old_src,'localizationSources':old_loc}
    probe={'schema':'wand.src01.format-probe@1','gameVersion':'1.26.2','platform':'Steam',
           'itemlistCandidates':new_src,'localization':new_loc}
    locales={'schema':'wand.db03.locale-payload-bridge@1',
             'status':'PAYLOAD_IDENTICAL_ALL_EIGHT_LOCALES','localeCount':8,
             'memberComparisons':142816,
             'baseline':{'manifestSha256':BASE_SHA},
             'target':{'sourceProbeSha256':PROBE_SHA},'locales':loc_report}
    protodb={'schema':'wand.db03.protodb-source-bridge@1',
             'status':'IDENTICAL_ARCHIVED_STATIC_SOURCE',
             'proof':{'fullOriginalBytesIdentical':True},
             'baseline':{'sha256':PROTO_DB_SHA,'protoDbEntries':2246},
             'target':{'sha256':PROTO_DB_SHA,'protoDbEntries':2246},
             'starPath':{'archivedSeasonDefinitions':0},
             'staticCensusReused':{'miniEvents':19,'dreamSnaps':182}}
    source={'sha256':CONDITION_SHA,'formatProbeSha256':PROBE_SHA,'bytes':571341}
    mission={'sha256':MISSION_SHA}
    cond={'schema':'wand.db03.condition-native-index-manifest@2',
          'target':{'platform':'Steam','gameVersion':'1.26.2'},
          'source':source,'missionSource':mission,
          'privateIndexSha256':CONDITION_V2_SHA,'privateIndexBytes':4093730,
          'counts':{'definitionCount':5440,'missionReferenceLeaves':4960,'kindTotal':9861},
          'limits':{'missionPredicateTruthEvaluated':False,
                    'currentStarPathOrLiveEventVerified':False}}
    ci={'schema':'wand.db03.condition-native-index@2',
        'source':copy.deepcopy(source),'missionSource':copy.deepcopy(mission),
        'target':copy.deepcopy(cond['target']),
        'records':[{'id':str(x)} for x in range(1,5441)]}
    return [base,probe,search,locales,protodb,cond,ci]


class GuideSourceCompositeTests(unittest.TestCase):
    def setUp(self):
        self.docs=synthetic_documents()

    def test_full_nine_family_static_composite_keeps_old_output_version(self):
        output=build(*self.docs)
        self.assertEqual(output['schema'],SCHEMA)
        self.assertEqual(output['target']['gameVersion'],'1.26.2')
        self.assertEqual(output['questSearch']['originalOutputGameVersion'],'1.26.1')
        self.assertEqual(output['questSearch']['originalOutputSha256'],SEARCH_SHA)
        self.assertEqual(output['questSearch']['uniqueReferencedShardPaths'],32)
        self.assertEqual(output['currentConditions']['typedMissionMentions'],4960)
        self.assertEqual(output['originalGuideFamilySources']['conditions']['reuseMode'],
                         'REEXTRACT_CURRENT_CHANGED_ORIGINAL')
        self.assertTrue(all(x['reuseMode']=='EXACT_ORIGINAL_FULL_FILE_SHA256'
            for k,x in output['originalGuideFamilySources'].items() if k!='conditions'))
        self.assertFalse(output['limits']['currentStarPathOrLiveEventVerified'])
        self.assertFalse(output['questSearch']['shardFileBytesVerifiedByThisManifest'])

    def test_other_original_family_change_requires_reextraction(self):
        self.docs[1]['itemlistCandidates']['Character.json']['sha256']=H(999)
        with self.assertRaisesRegex(ValueError,'FAMILY_CHANGE_CONTRACT_characters'):
            build(*self.docs)

    def test_condition_byte_equality_is_not_accepted_as_current(self):
        old=self.docs[0]['sources']['conditions']['sha256']
        self.docs[1]['itemlistCandidates']['Condition.json']['sha256']=old
        with self.assertRaisesRegex(ValueError,'FAMILY_CHANGE_CONTRACT_conditions'):
            build(*self.docs)

    def test_mismatched_baseline_search_or_missing_shard_denied(self):
        self.docs[2]['target']['gameVersion']='1.26.2'
        with self.assertRaisesRegex(ValueError,'BASELINE_SEARCH_ORIGIN'):
            build(*self.docs)
        self.docs=synthetic_documents()
        self.docs[2]['records'][0]['detail']['file']='quest-shards/part-32.json'
        with self.assertRaisesRegex(ValueError,'UNEXPECTED_SHARD_LOCATORS'):
            build(*self.docs)

    def test_mismatched_source_probe_and_full_sha_denied(self):
        self.docs[1]['itemlistCandidates']['Mission.json']['sha256']=H(999)
        with self.assertRaisesRegex(ValueError,'FAMILY_CHANGE_CONTRACT_quests'):
            build(*self.docs)
        self.docs=synthetic_documents()
        self.docs[1]['gameVersion']='1.26.1'
        with self.assertRaisesRegex(ValueError,'TARGET_SOURCE_VERSION'):
            build(*self.docs)

    def test_changed_localized_member_or_zip_source_denied(self):
        self.docs[3]['locales']['ja']['changedMemberPayloads']=1
        with self.assertRaisesRegex(ValueError,'LOCALE_PAYLOAD_MISMATCH_ja'):
            build(*self.docs)
        self.docs=synthetic_documents()
        self.docs[1]['localization']['de']['sha256']=H(999)
        with self.assertRaisesRegex(ValueError,'LOCALE_PAYLOAD_MISMATCH_de'):
            build(*self.docs)

    def test_static_proto_not_mistaken_for_live_star_path(self):
        self.docs[4]['starPath']['archivedSeasonDefinitions']=1
        with self.assertRaisesRegex(ValueError,'PROTO_STATIC_LIMITS'):
            build(*self.docs)

    def test_changed_condition_manifest_or_v2_digest_rejected(self):
        self.docs[5]['privateIndexSha256']=H(999)
        with self.assertRaisesRegex(ValueError,'LATEST_CONDITION_INDEX_CONTRACT'):
            build(*self.docs)
        self.docs=synthetic_documents()
        self.docs[6]['source']['sha256']=H(999)
        with self.assertRaisesRegex(ValueError,'LATEST_CONDITION_INDEX_SOURCE'):
            build(*self.docs)

    def test_wrong_source_file_fingerprint_is_rejected_before_json_decoding(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'manifest.json'
            path.write_text('{"schema":"wrong"}',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'ORIGINAL_FINGERPRINT'):
                read_pinned(path, BASE_SHA)


if __name__ == '__main__':
    unittest.main()
