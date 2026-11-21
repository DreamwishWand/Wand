"""Synthetic native protobuf fixtures: no proprietary game files required."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import native_guide as native
from mission_semantics import condition_tree, localized_key
from mission_item_flows import (decode_bringsubstep,decode_mission_item_flows,
                                decode_loot_table,packed_ids)


def v(n,val):return native.encode_varint((n<<3)|0)+native.encode_varint(val)
def b(n,raw):
    if isinstance(raw,str):raw=raw.encode('utf8')
    return native.encode_varint((n<<3)|2)+native.encode_varint(len(raw))+raw

class FakeLocale:
    def resolve(self,key):return ({'en':'Give items','ja':'アイテムを渡す'} if key=='Quest.Ready' else {}),'Quest.locbin'

class ItemFlowTests(unittest.TestCase):
    def setup_tools(self):
        links=[];missing=[]
        args=(('2070000001'),(native.wire_fields,native.text_field,native.int_field,
            native.sha,native.plain_display),FakeLocale(),missing,links)
        return args

    def parse_mission(self,payload):
        mid,helpers,locale,missing,links=self.setup_tools()
        result=decode_mission_item_flows(native.wire_fields(payload),mid,helpers,
            locale,missing,links,condition_tree,localized_key,native.varint)
        return result,links

    def test_intro_selector_and_packed_cleanup(self):
        # AnyItemSelector.ItemToGive = 2, ItemSelector.Item = 1,
        # MissionItemGenerator.Item = 1, GeneratorItem.Item = 1.
        selector=b(2,b(1,b(1,v(1,30000031))))
        amount=b(1,v(1,3))
        intro=b(33,b(1,selector)+b(2,amount))
        cleanup=b(63,native.encode_varint(30000031)+native.encode_varint(31200002))
        result,_=self.parse_mission(intro+cleanup+v(63,777))
        self.assertEqual(result['introItemsToGive'][0]['itemSelector']['itemCandidates'][0]['id'],'30000031')
        self.assertEqual(result['introItemsToGive'][0]['configuredAmount']['value'],3)
        self.assertEqual(result['itemsToDeleteAfterMission'],['30000031','31200002','777'])

    def test_explicit_bring_handoff_keep_items_and_scene(self):
        mid,helpers,locale,missing,links=self.setup_tools()
        raw=(b(1,'Quest.Ready')+v(2,1)+v(10,2)+v(12,1540000010)
             +b(14,v(1,30400001)+v(2,2)))
        result=decode_bringsubstep(native.wire_fields(b(20,raw)),mid,0,1,
            helpers,locale,missing,links,localized_key)
        self.assertTrue(result['keepItems'])
        self.assertEqual(result['itemsToGive'][0]['amount'],2)
        self.assertEqual(result['text']['readyDescription']['plainText']['ja'],'アイテムを渡す')
        self.assertEqual(links[0]['toFamily'],'worlds')
        self.assertEqual(links[0]['toId'],'1540000010')
        self.assertEqual(len(missing),6)

    def test_keep_items_absent_marked_proto_default(self):
        mid,helpers,locale,missing,links=self.setup_tools()
        parsed=decode_bringsubstep(native.wire_fields(b(20,b(14,v(1,30000001)+v(2,1)))),
            mid,0,0,helpers,locale,missing,links,localized_key)
        self.assertFalse(parsed['keepItems'])
        self.assertTrue(parsed['keepItemsFromProtoDefault'])

    def test_weighted_additional_loot_not_assumed_guaranteed(self):
        raw=b(1, v(1,1)+v(2,2)+v(3,5)+b(10,v(1,31500001))
                   +b(10,v(1,31500002)))
        result,_=self.parse_mission(b(61,raw))
        table=result['additionalRewards']['subLootTables'][0]
        self.assertEqual((table['minimumRolls'],table['maximumRolls'],table['weight']), (1,2,5))
        self.assertEqual([x['itemId'] for x in table['items']],['31500001','31500002'])
        self.assertIsNone(result['additionalRewards'].get('guaranteedItemId'))

    def test_conditionally_available_loot_preserves_ast(self):
        cond=b(2,b(65,v(1,10000004)))
        bucket=b(1,cond)+b(2,v(1,30300001))
        sub=b(11,bucket)+b(101,cond)
        result,links=self.parse_mission(b(61,b(1,sub)))
        loot=result['additionalRewards']['subLootTables'][0]
        self.assertEqual(loot['conditionalItems'][0]['items'][0]['itemId'],'30300001')
        self.assertEqual(loot['availableWhen']['conditions'][0]['characterId'],'10000004')
        self.assertEqual(len(links),2)

    def test_override_rewards_references_not_guaranteed_item_ids(self):
        result,_=self.parse_mission(b(60,b(31,native.encode_varint(30200001))))
        self.assertEqual(result['overrideRewardReferences'],['30200001'])
        self.assertNotIn('grantedItems',result)

    def test_invalid_oneof_and_packed_id_rejected(self):
        mid,helpers,locale,missing,links=self.setup_tools()
        with self.assertRaisesRegex(ValueError,'MULTIPLE_SUBSTEP_EXTRA_ONEOF'):
            decode_bringsubstep(native.wire_fields(b(20,b'')+b(21,b'')),mid,0,0,
                helpers,locale,missing,links,localized_key)
        with self.assertRaises(ValueError):
            packed_ids(native.wire_fields(b(63,b'\x80')),63,native.varint)
        with self.assertRaises(ValueError):
            self.parse_mission(b(60,b'')+b(60,b''))

class ExtractedIndexTests(unittest.TestCase):
    def test_item_flows_end_to_end(self):
        from test_native_guide import NativeGuideTests,frame,sf,vf
        fixture=NativeGuideTests('test_extract_and_locales_and_relations')
        fixture.setUp()
        try:
            anysel=sf(2,sf(1,sf(1,vf(1,30000031))))
            intro=sf(33,sf(1,anysel)+sf(2,sf(1,vf(1,2))))
            step=sf(40,sf(20,sf(20,sf(14,vf(1,30000031)+vf(2,1)))))
            loot=sf(61,sf(1,sf(10,vf(1,30000031))))
            mission=(vf(1,fixture.quest)+sf(2,'Story!MyQuest')+intro+step+
                    sf(63,native.encode_varint(30000031))+loot)
            group=vf(1,fixture.quest_group)+sf(2,'Story!Group')
            (fixture.src/'itemlist'/'Mission.json').write_bytes(
                frame(1,mission)+frame(200001,group))
            native.extract(fixture.game,fixture.out,'1.26.1','Steam',fixture.items)
            data=json.loads((fixture.out/'database/quest-item-flows.json').read_text())
            self.assertEqual(len(data['links']),4)
            self.assertEqual({x['flowKind'] for x in data['links']},
               {'intro_item_grant_candidate','post_mission_cleanup_reference',
                'substep_handoff_definition','additional_reward_loot_candidate'})
            self.assertEqual(json.loads((fixture.out/'manifest.json').read_text())['questItemFlowLinks'],4)
        finally:
            fixture.doCleanups()

if __name__ == '__main__':unittest.main()
