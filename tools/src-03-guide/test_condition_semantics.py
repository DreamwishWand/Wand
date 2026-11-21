"""Source-evidenced condition AST and cross-family references, no game assets."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import native_guide as n
from mission_semantics import condition_tree
from condition_schema import CONDITION_KINDS


def v(number, value):
    return n.encode_varint((number << 3) | 0) + n.encode_varint(value)


def m(number, raw):
    if isinstance(raw, str): raw = raw.encode('utf-8')
    return n.encode_varint((number << 3) | 2) + n.encode_varint(len(raw)) + raw


def leaf(field, raw):
    return m(2, m(field, raw))


class ConditionASTTests(unittest.TestCase):
    def parse(self, data):
        links = []
        ast = condition_tree(data, n.wire_fields, n.int_field, n.sha, links)
        return ast, links

    def test_source_enum_completeness(self):
        self.assertEqual(len(CONDITION_KINDS), 87)
        self.assertEqual(CONDITION_KINDS[5], 'CommonConditions')
        self.assertEqual(CONDITION_KINDS[465], 'Timestamp')
        self.assertEqual(CONDITION_KINDS[426], 'PlayerUnlockedLiveStarPath')

    def test_common_ref_and_character_refs_are_typed(self):
        data = (leaf(5, v(1, 2130000120)) +
                leaf(65, v(1, 10000055)) +
                leaf(50, v(1, 10000004) + v(2, 5) + v(3, 4)))
        ast, links = self.parse(data)
        self.assertEqual([c['type'] for c in ast['conditions']],
                         ['CommonConditions', 'CharacterUnlocked', 'CharacterFriendship'])
        self.assertEqual(ast['conditions'][0]['conditionId'], '2130000120')
        self.assertEqual(ast['conditions'][2]['friendshipLevel'], 4)
        self.assertEqual(ast['conditions'][2]['comparisonOperator'], 'GreaterThanOrEqual')
        self.assertEqual([(e['toFamily'], e['toId']) for e in links],
                         [('conditions', '2130000120'), ('characters','10000055'),
                          ('characters', '10000004')])
        self.assertTrue(all(e['relationKind']=='static_condition_reference' for e in links))

    def test_nested_or_not_preserves_path_and_polarity(self):
        nested = v(1, 1) + leaf(65, v(1, 10000018) + v(2, 1))
        ast, links = self.parse(leaf(10, nested) + leaf(65, v(1, 10000055)))
        self.assertEqual(ast['operator'],'AND')
        self.assertEqual(ast['conditions'][0]['nested']['operator'],'OR')
        self.assertTrue(ast['conditions'][0]['nested']['conditions'][0]['inversed'])
        self.assertEqual(len(links),2)
        self.assertIn('SubConditions.conditions[0].CharacterUnlocked', links[0]['sourceField'])

    def test_default_area_and_expansion_are_static_not_entitlement(self):
        ast, links = self.parse(leaf(30, b'') + leaf(140,m(1,'Expansion04') + v(2,1) + v(3,1)))
        area,exp = ast['conditions']
        self.assertEqual((area['villageAreaCode'],area['villageArea']), (0,'Beach'))
        self.assertTrue(area['villageAreaFromProtoDefault'])
        self.assertEqual(exp['expansionName'],'Expansion04')
        self.assertTrue(exp['inversed'])
        self.assertTrue(exp['anyPlatform'])
        self.assertNotIn('entitled', exp)
        self.assertEqual(links,[])

    def test_mission_state_scene_inventory_and_event_time(self):
        data = (leaf(270, v(1,2070000620)+v(2,0)+v(3,8))+
                leaf(90, v(1,1540000010))+
                leaf(100, v(1,1540000000)+v(2,1))+
                leaf(195, v(1,31200252)+v(2,5)+v(3,1))+
                leaf(125, m(1,'Event_UI_2026')+v(3,2)))
        ast, links = self.parse(data)
        a,b,c,d,e=ast['conditions']
        self.assertEqual(a['missionState'],'Completed')
        self.assertEqual(a['comparisonOperator'],'Equal')
        self.assertEqual(b['sceneId'],'1540000010')
        self.assertEqual(c['villageSceneId'],'1540000000')
        self.assertTrue(c['inversed'])
        self.assertEqual((d['itemId'],d['amount']),('31200252',1))
        self.assertEqual(d['comparisonOperator'],'GreaterThanOrEqual')
        self.assertEqual(e['requestedEventAvailability'],'Playable')
        self.assertEqual([x['toFamily'] for x in links],['quests','worlds','worlds'])

    def test_unknown_primitive_is_retained_as_unknown(self):
        ast,_ = self.parse(leaf(999,b'\x08\x01'))
        self.assertEqual(ast['conditions'][0]['type'],'Unknown')
        self.assertIn('wireSha256',ast['conditions'][0])


if __name__=='__main__':unittest.main()
