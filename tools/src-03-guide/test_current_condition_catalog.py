"""Synthetic-only tests for the private current Condition registry."""
import hashlib
from pathlib import Path
import tempfile
import unittest

from current_condition_catalog import binary_tree,project_records,build_index,save_private,SCHEMA
from condition_semantic_delta import source_records
from test_condition_semantic_delta import vi,f0,f2,frame,condition,step_oneof,dialogue_oneof,common_oneof


class CurrentConditionCatalogTests(unittest.TestCase):
    def test_source_typed_full_native_definition_retains_hashes(self):
        data=frame(1,condition(2130000001,'Mission!Test',[
            step_oneof(2070000651,12,2),dialogue_oneof(2030501628)]))
        records,census=project_records(source_records(data))
        self.assertEqual(len(records),1)
        self.assertEqual(records[0]['id'],'2130000001')
        self.assertEqual(records[0]['sourceName'],'Mission!Test')
        self.assertEqual(records[0]['conditions']['children'][0]['sourceStatusName'],'OnGoing')
        self.assertEqual(census['missionStepStatusExplicitScalarLeaves'],1)
        self.assertEqual(census['definitionCount'],1)
        self.assertNotIn('playerProgress',str(records))

    def test_nested_subconditions_remain_nested_boolean_ast(self):
        inner=f0(1,1)+f2(2,step_oneof(2070000660,6,4))
        outer=f2(2,f2(10,inner))
        tree=binary_tree(outer)
        self.assertEqual(tree['operator'],'AND')
        self.assertFalse(tree['operatorExplicit'])
        self.assertEqual(tree['children'][0]['kind'],'SubConditions')
        self.assertEqual(tree['children'][0]['nested']['operator'],'OR')
        self.assertEqual(tree['children'][0]['nested']['children'][0]['stepId'],6)
        self.assertEqual(tree['children'][0]['nested']['children'][0]['sourceStatusName'],'Completed')

    def test_omitted_optional_fields_are_never_inferred(self):
        for partial,omitted in [(f0(1,20700001),['stepId','statusCode']),
                                (f0(1,20700001)+f0(3,4),['stepId']),
                                (f0(1,20700001)+f0(2,0),['statusCode'])]:
            row=binary_tree(f2(2,f2(285,partial)))['children'][0]
            self.assertEqual(row['scalarInterpretation'],'source_explicit_fields_only')
            self.assertEqual(row['omittedSourceFields'],omitted)
            if 'stepId' in omitted:self.assertNotIn('stepId',row)
            if 'statusCode' in omitted:self.assertNotIn('sourceStatusName',row)

    def test_future_unknown_tag_and_unverified_payload_stay_opaque(self):
        raw=f2(2,f2(777,b'\x08\x01'))+f2(2,step_oneof(20700001,2,3,extra=f0(18,3)))
        rows=binary_tree(raw)['children']
        self.assertEqual(rows[0]['kind'],'Unknown')
        self.assertNotIn('missionId',rows[0])
        self.assertEqual(rows[1]['scalarInterpretation'],'opaque_unexpected_wire_shape')
        self.assertRegex(rows[0]['payloadSha256'],r'^[a-f0-9]{64}$')

    def test_common_conditions_keeps_original_pointer_not_predecessor(self):
        d=frame(10,condition(2130000010,'Common',[
            common_oneof(2130000077)]))
        rows,census=project_records(source_records(d))
        self.assertEqual(rows[0]['conditions']['children'][0]['commonConditionId'],'2130000077')
        self.assertEqual(census['commonConditionPointerLeaves'],1)
        self.assertNotIn('prerequisite',str(rows))

    def test_source_hash_rejects_unpinned_or_incomplete_input(self):
        with self.assertRaisesRegex(ValueError,'TARGET_PROBE_VERSION'):
            build_index(b'fake',{'schema':'wand.src01.format-probe@1','gameVersion':'1.26.3','platform':'Steam'})
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'native-index.json'
            save_private(path,{'schema':SCHEMA,'records':[{'id':'2130000010'}]})
            self.assertIn('2130000010',path.read_text())
            self.assertEqual(path.read_bytes().count(b'\n'),1)


if __name__=='__main__':unittest.main()
