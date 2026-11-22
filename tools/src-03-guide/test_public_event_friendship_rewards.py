"""Strict native source projection tests. Real owner originals stay off GitHub."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from guide_public_event_friendship_rewards import make, SCHEMA, read, SHA

class GuidePublicEventFriendshipRewardsTests(unittest.TestCase):
    def fixture(self):
        # Synthetic, structurally complete source: 19 native events, 5 festivals,
        # 171+31 source links, 16 default levels; each matched to its native SHA.
        h='a'*64
        minidata={'schema':'wand.db03.protodb-static@1','records':[]}
        festdata={'schema':'wand.db03.protodb-static@1','records':[]}
        links=[]
        for fam,doc,count,total,kind,prefix,suffix in [
            ('mini',minidata,19,171,'static_mini_event_reward_candidate','12','2'),
            ('floating',festdata,5,31,'static_festival_reward_candidate','21','1')]:
            for n in range(count):
                num=(total//count)+(1 if n<total%count else 0)
                name=(fam+'_'+str(n))
                cands=[]
                for k in range(num):
                    item=str(40000000+(0 if fam=='mini' else 100000)+len(links))
                    cands.append({'index':k,'itemId':item,'configuredAmount':1,'sourceWireSha256':h})
                    links.append({'relationKind':kind,'fromId':name,
                        'fromFamily':'miniEvents' if fam=='mini' else 'floatingFestivals',
                        'toFamily':'items','toId':item,
                        'sourceField':'protobuf.'+prefix+'['+str(k)+'].'+suffix,
                        'targetIndexMembership':'present_in_optional_partial_index',
                        'source':{'sha256':'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623',
                                  'file':'ddv_Data/StreamingAssets/protoDb.bin',
                                  'definitionWireSha256':h,'referenceWireSha256':h}})
                doc['records'].append({'id':name,'nativeWireSha256':h,
                    'source':{'file':'ddv_Data/StreamingAssets/protoDb.bin',
                               'sha256':'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623',
                               'nativeWireSha256':h},
                    'text':{'title':{'plainText':{'en':name,'ja':name}}},
                    'featuredRewardCandidates' if fam=='mini' else 'rewardDefinitions':cands})
        # unrelated 179 source references including all full census categories.
        filler={'static_mini_event_duty_reference':84,
                'static_mini_event_quest_reference':66,
                'static_festival_target_scene_reference':5,
                'static_festival_target_subscene_reference':12,
                'static_expansion_tag_item_reference':6,
                'static_expansion_village_scene_reference':6}
        for kind,n in filler.items():
            links.extend({'relationKind':kind} for _ in range(n))
        self.assertEqual(len(links),381)
        event={'schema':'wand.db03.guide-event-links@1',
               'source':'archived_verified_protoDb_projection',
               'status':'static_source_links_only_not_live_events_or_player_inventory',
               'counts':{'total':381,'byRelationKind':{
                   **filler,'static_mini_event_reward_candidate':171,
                   'static_festival_reward_candidate':31}},'links':links}
        stages=('FirstIntermediateReward','SecondIntermediateReward','ThirdIntermediateReward','CompletedReward')
        defaults=[]
        for level in range(1,5):
            for stage in stages:
                defaults.append({'id':f'default:{level}:{stage}:0',
                    'scope':'default_friendship_level_not_character_specific',
                    'level':level,'rewardStage':stage,'nativeRewardId':
                    '80000000' if stage!='CompletedReward' else '80100000','amount':100,
                    'source':{'file':'ddv_Data/StreamingAssets/friendship_levels_default.json',
                              'sha256':'90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22'}})
        friendship={'schema':'wand.db03.native-guide@1','scope':'default_friendship_levels_only',
                    'target':{'gameVersion':'1.26.1','platform':'Steam'},'records':defaults}
        composite={'schema':'wand.db03.guide-source-composite@2',
            'target':{'gameVersion':'1.26.2','platform':'Steam'},
            'staticProtoDb':{'originalSha256':'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623',
                             'nativeEntries':2246},
            'friendshipDefaultSource':{'nativeSourceSha256':'90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22',
                                       'exactFullOriginalFileContentIdentical':True,'records':16}}
        return event,minidata,festdata,friendship,composite

    def test_real_source_census_synthetic_native_slots(self):
        a=self.fixture()
        # Synthetic item IDs have unique IDs for each candidate: production source
        # has only 139 distinct IDs. Verify all source slot checks run before
        # the specific published census disallows replacement of real source.
        with self.assertRaisesRegex(ValueError,'ITEM_ID_CENSUS'):
            make(*a)

    def test_mismatched_protobuf_source_fails_before_any_publication(self):
        a=list(self.fixture())
        a[0]['links'][0]['source']['definitionWireSha256']='b'*64
        with self.assertRaisesRegex(ValueError,'ORIGINAL_REFERENCE_MISMATCH'):
            make(*a)

    def test_wrong_native_item_id_source_fails(self):
        a=list(self.fixture());a[2]['records'][0]['rewardDefinitions'][0]['itemId']='99999999'
        with self.assertRaisesRegex(ValueError,'ORIGINAL_REFERENCE_MISMATCH'):
            make(*a)

    def test_changed_current_source_must_not_be_silently_reused(self):
        a=list(self.fixture())
        a[4]['friendshipDefaultSource']['exactFullOriginalFileContentIdentical']=False
        with self.assertRaisesRegex(ValueError,'SOURCE_EQUIVALENCE'):
            make(*a)

    def test_friendship_reward_not_character_specific(self):
        a=list(self.fixture())
        a[3]['records'][0]['scope']='character-specific'
        with self.assertRaisesRegex(ValueError,'DEFAULT_FRIENDSHIP_ROW'):
            make(*a)

if __name__=='__main__':unittest.main()