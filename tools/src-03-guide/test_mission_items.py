"""Source-contract item selector regression fixtures, independent of game files."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import native_guide as n
from mission_items import project_objective_items


def v(number, value):
    return n.encode_varint((number<<3)|0)+n.encode_varint(value)

def m(number, value):
    return n.encode_varint((number<<3)|2)+n.encode_varint(len(value))+value


def sel(item_id):
    # ItemSelector.Item = MissionItemGenerator.Item = GeneratorItem.Item
    return m(1,m(1,v(1,item_id)))


def amount(value):
    return m(1,v(1,value))


class SourceTypedSelectorTests(unittest.TestCase):
    def decode(self,kind,payload):
        return project_objective_items(kind,payload,n.wire_fields,n.int_field,n.sha)

    def test_craft_one_item_and_amount(self):
        data=m(1,sel(30000031))+m(2,amount(6))
        result=self.decode('CraftItem',data)
        self.assertEqual(result['amount']['value'],6)
        self.assertEqual(result['selectors'][0]['mode'],'item')
        self.assertEqual(result['selectors'][0]['itemCandidates'],[
            {'id':'30000031','role':'direct','generatorKind':'item'}])

    def test_bring_item_any_category_and_range(self):
        inner=m(1,m(1,v(1,31200032)))
        any_selector=v(1,19)+m(2,inner)
        range_ = m(2,m(1,v(1,2))+m(2,v(1,5)))
        result=self.decode('BringItem',m(2,any_selector)+m(3,range_))
        self.assertEqual(result['selectors'][0]['anyCategory'],'QuestItem')
        self.assertEqual(result['selectors'][0]['itemCandidates'][0]['id'],'31200032')
        self.assertEqual({k:result['amount'][k] for k in ('kind','min','max')},
                         {'kind':'range','min':2,'max':5})

    def test_weighted_item_list_not_flattened_as_required(self):
        # ItemSelector.ItemList > MissionItemGenerator.Item > GeneratorItem.ItemList.
        # List contains candidate alternatives with relative weights.
        weighted=m(1,v(1,10))+v(2,30000031)
        weighted2=m(1,v(1,5))+v(2,30000032)
        item_list=v(1,0)+m(2,weighted)+m(2,weighted2)
        generator=m(1,m(2,item_list))
        result=self.decode('Possess',m(1,m(2,generator))+m(2,amount(1)))
        options=result['selectors'][0]['itemCandidates']
        self.assertEqual([c['role'] for c in options],['alternative','alternative'])
        self.assertEqual([c['weight'] for c in options],[10,5])
        self.assertEqual(result['selectors'][0]['mode'],'itemList')

    def test_dynamic_selector_not_guessed(self):
        # A filter-only selector has no concrete ID, even if an item type exists.
        data=m(1,m(4,v(3,3)))+m(2,amount(4))
        result=self.decode('Possess',data)
        self.assertEqual(result['selectors'][0]['itemCandidates'],[])
        self.assertEqual(result['selectors'][0]['mode'],'filterGenerator')
        self.assertEqual(result['sourceBackedCandidateCount'],0)

    def test_objectives_without_selector_return_none(self):
        self.assertIsNone(self.decode('TalkToCharacter',b''))
        self.assertEqual(self.decode('PickUp',m(2,sel(31300011)))['selectors'][0]['role'],
                         'ephemeralItem')

    def test_reject_duplicate_selector_source_field(self):
        with self.assertRaises(ValueError):
            self.decode('CraftItem',m(1,sel(100))+m(1,sel(200)))


if __name__=='__main__':unittest.main()
