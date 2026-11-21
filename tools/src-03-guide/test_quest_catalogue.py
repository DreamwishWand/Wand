"""Synthetic-only compact Guide catalogue contract tests."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from quest_catalogue import summary,project_quest_catalogue

TARGET={'platform':'Steam','gameVersion':'1.26.1'}
SRC={'file':'ddv_Data/StreamingAssets/itemlist/Mission.json','sha256':'a'*64}


def base(id_,kind='mission'):
    return {'id':id_,'rawName':'SyntheticQuest','recordKind':kind,'source':dict(SRC),
            'nativeWireSha256':'b'*64,'names':{'en':'Synthetic Quest','ja':'合成クエスト'},
            'nameKey':'Synth.Quest','groupId': '202' if kind=='mission' else None,
            'characterId':'1001' if kind=='mission' else None,
            'nativeStepCount':1 if kind=='mission' else 0,
            'typeCode':1,'sourceScopeTokens':[],
            'structured':{'questMeta':{'updateVersion':'UpdateSynthetic','missionType':'Story'},
            'stepsDetailed':[{'subSteps':[{'objectives':[{'type':'CraftItem'},
                {'type':'CollectItem'}], 'extraBringItem': {'configured':True}}]}] if kind=='mission' else [],
            'rewardsDecoded':{'currency':[{'currencyId':'80000000','amountMin':30,'amountMax':60}]},
            'activationPolicies':{'autoAcceptOptions':[{}],'ownerOverrides':[], 'uiUnlockConditions':[]},
            'conditions':{'unlockConditions':{'nativeWireSha256':'c'*64}},
            'itemFlows':{'introItemsToGive':[{}], 'itemsToDeleteAfterMission':['1','2'],
                'overrideRewardReferences':[], 'additionalRewards':None}},
            }


class QuestCatalogueTests(unittest.TestCase):
    def entries(self):
        return [base('101'), base('202','questGroup'), base('303','unclassified')]

    def test_compact_mission_and_group_are_not_playable_equivalents(self):
        doc=summary(self.entries(),TARGET)
        self.assertEqual(doc['counts']['missions'],1)
        self.assertEqual(doc['counts']['questGroups'],1)
        self.assertEqual(doc['counts']['unclassified'],1)
        r=doc['missions'][0]
        self.assertEqual(r['names']['ja'],'合成クエスト')
        self.assertEqual(r['groupIndexMembership'],'present_in_native_source_index')
        self.assertEqual(doc['questGroups'][0]['missionIds'],['101'])
        self.assertEqual(r['objectiveKinds'],{'CollectItem':1,'CraftItem':1})
        self.assertEqual(r['sourceObjectiveCount'],2)
        self.assertEqual(r['sourceSubStepCount'],1)
        self.assertEqual(r['configuredRewards']['currency'][0]['amountMax'],60)
        self.assertEqual(r['itemFlowDefinitionCounts']['postMissionCleanupItemReferences'],2)
        self.assertEqual(r['itemFlowDefinitionCounts']['bringItemSubsteps'],1)
        self.assertTrue(r['conditionDefinitions']['unlockConditions']['present'])
        self.assertFalse(r['conditionDefinitions']['availableConditions']['present'])
        self.assertNotIn('completedNow',json.dumps(doc))
        self.assertNotIn('rewardsGuaranteed',json.dumps(doc))

    def test_source_missing_group_is_not_removal(self):
        m=base('101');m['groupId']='777'
        doc=summary([m],TARGET)
        self.assertEqual(doc['missions'][0]['groupIndexMembership'],'not_in_native_source_index')
        self.assertEqual(doc['counts']['missionsWithVerifiedGroup'],0)
        self.assertEqual(doc['counts']['missions'],1)

    def test_partial_localization_retained_exactly(self):
        m=base('101');m['names']={'ja':'日本語のみ'}
        doc=summary([m],TARGET)
        self.assertEqual(doc['missions'][0]['names'],{'ja':'日本語のみ'})
        self.assertNotIn('en',doc['missions'][0]['names'])
        m['names']={}
        self.assertEqual(summary([m],TARGET)['counts']['missionsWithNoResolvedLocaleName'],1)

    def test_bad_step_count_rejected(self):
        m=base('101');m['nativeStepCount']=2
        with self.assertRaisesRegex(ValueError,'STEP_COUNT_MISMATCH'):
            summary([m],TARGET)

    def test_duplicate_or_invalid_source_rejected(self):
        m=base('101')
        with self.assertRaisesRegex(ValueError,'DUPLICATE_ID'):
            summary([m,copy.deepcopy(m)],TARGET)
        m['source']['sha256']='short'
        with self.assertRaisesRegex(ValueError,'SOURCE_PROVENANCE_MISMATCH'):
            summary([m],TARGET)

    def test_different_source_versions_rejected(self):
        a,b=base('101'),base('102')
        b['source']={**b['source'],'sha256':'d'*64}
        with self.assertRaisesRegex(ValueError,'MIXED_SOURCE_VERSIONS'):
            summary([a,b],TARGET)

    def test_writes_private_derived_schema_only(self):
        from native_guide import save
        with tempfile.TemporaryDirectory() as tmp:
            output=Path(tmp)
            r=project_quest_catalogue(self.entries(),TARGET,output,save)
            out=json.loads((output/'guide/quest-catalogue.json').read_text())
            self.assertEqual(r['nativeSourceRecords'],3)
            self.assertEqual(out['counts']['missions'],1)
            self.assertEqual(out['source']['file'],'ddv_Data/StreamingAssets/itemlist/Mission.json')

if __name__=='__main__':unittest.main()
