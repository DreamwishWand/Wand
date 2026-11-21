"""Static MissionItemData policy-field regression tests."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import native_guide as n
from mission_semantics import condition_tree, localized_key
from activation_policies import parse_mission_policies


def v(n1,val):return n.encode_varint((n1<<3)|0)+n.encode_varint(val)
def m(n1,val):
    if isinstance(val,str):val=val.encode('utf-8')
    return n.encode_varint((n1<<3)|2)+n.encode_varint(len(val))+val

class FakeLocale:
    def resolve(self,key):return ({'en':'Visible','ja':'表示'} if key=='Quest.UI' else {}), 'Quest.locbin'

class PolicyProjectionTests(unittest.TestCase):
    def parse(self,payload):
        links=[];missing=[]
        data=parse_mission_policies(n.wire_fields(payload),'2070000001',
            (n.wire_fields,n.text_field,n.int_field,n.sha,n.plain_display),
            FakeLocale(),missing,links,condition_tree,localized_key)
        return data,links,missing

    def test_auto_accept_choice_default_and_nested_status(self):
        raw=m(23,m(2,m(2,m(270,v(1,2070000002)+v(3,8)))))
        data,links,missing=self.parse(raw)
        p=data['autoAcceptOptions'][0]
        self.assertEqual(p['choice'],'Any')
        self.assertTrue(p['choiceFromProtoDefault'])
        self.assertEqual(p['conditions']['operator'],'AND')
        self.assertEqual(p['conditions']['conditions'][0]['missionState'],'Completed')
        self.assertEqual(links[0]['toId'],'2070000002')
        self.assertEqual(missing,[])

    def test_owner_override_custom_does_not_infer_character(self):
        options=m(19,m(1,m(2,m(65,v(1,10000004))))+m(3,b'opaque-policy'))
        data,links,_=self.parse(options)
        b=data['ownerOverrides'][0]
        self.assertEqual(b['ownerKind'],'custom')
        self.assertIn('customPayloadSha256',b)
        self.assertEqual(len(links),1)
        self.assertEqual(links[0]['predicate'],'CharacterUnlocked')

    def test_owner_override_explicit_character_is_a_reference(self):
        data,links,_=self.parse(m(19,m(1,m(2,m(20,b'')))+v(2,10000004)))
        b=data['ownerOverrides'][0]
        self.assertEqual(b['characterId'],'10000004')
        self.assertEqual(links[0]['predicate'],'OwnerOverride.character')
        self.assertEqual(links[0]['relationKind'],'static_owner_override_reference')

    def test_ui_unlock_preserves_source_localization(self):
        data,_,missing=self.parse(m(22,m(1,m(2,m(270,v(1,2070000002))))+m(2,'Quest.UI')))
        p=data['uiUnlockConditions'][0]
        self.assertEqual(p['text']['plainText']['ja'],'表示')
        self.assertEqual(p['conditions']['conditions'][0]['missionId'],'2070000002')
        self.assertEqual(len(missing),6)

    def test_owner_oneof_corruption_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'OWNER_OVERRIDE_MULTIPLE_ONEOF'):
            self.parse(m(19,v(2,10000004)+m(3,b'unsafe')))
        with self.assertRaisesRegex(ValueError,'DUPLICATE_AUTO_ACCEPT_CONDITIONS'):
            self.parse(m(23,m(2,b'')+m(2,b'')))

if __name__=='__main__':unittest.main()
