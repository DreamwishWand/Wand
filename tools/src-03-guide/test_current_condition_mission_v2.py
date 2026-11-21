"""Synthetic-only regression coverage for typed private Condition mission links."""
import unittest
from pathlib import Path
from test_condition_semantic_delta import f0,f2,frame,condition,step_oneof,dialogue_oneof
from condition_semantic_delta import source_records
from current_condition_catalog import project_records
from current_condition_mission_v2 import enrich_tree, _field_int, original_missions, original_conditions, build_v2


class V2ConditionMissionReferencesTests(unittest.TestCase):
    def group(self, mission, *leaves):
        raw=condition(2130000001,'Mission!Synthetic',list(leaves))
        row=project_records(source_records(frame(1,raw)))[0][0]
        original_root=next(v for n,w,v in source_records(frame(1,raw))['2130000001']['fields'] if (n,w)==(6,2))
        counts={}
        from collections import Counter
        cnt=Counter()
        enrich_tree(row['conditions'], original_root, mission, cnt)
        return row['conditions'],cnt

    def test_nonstep_mission_states_and_inversion_are_source_typed(self):
        missions={2070000628:{}}
        root,census=self.group(missions,
            f2(255,f0(1,2070000628)+f0(2,1)),
            f2(270,f0(1,2070000628)+f0(2,0)+f0(3,8)),
            f2(260,f0(1,2070000628)))
        a,b,c=root['children']
        self.assertEqual(a['missionId'],'2070000628')
        self.assertIs(a['inversed'],True)
        self.assertEqual(b['missionState'],'Completed')
        self.assertEqual(b['missionStateCode'],8)
        self.assertEqual(b['comparisonOperator'],'Equal')
        self.assertEqual(c['missionId'],'2070000628')
        self.assertNotIn('inversed',c)
        self.assertEqual(census['MissionStatus'],1)

    def test_step_substep_objective_original_identifiers_not_array_positions(self):
        mid=2070001661
        missions={mid:{12:[{3:[{9}]}]}}
        root,census=self.group(missions,
            f2(295,f0(1,mid)+f0(2,12)+f0(3,3)+f0(4,9)+f0(5,2)),
            f2(280,f0(1,mid)+f0(2,12)+f0(3,1)))
        obj,step=root['children']
        self.assertEqual(obj['stepId'],12)
        self.assertEqual(obj['subStepId'],3)
        self.assertEqual(obj['objectiveId'],9)
        self.assertTrue(obj['nativeStepIdVerified'])
        self.assertTrue(step['inversed'])
        self.assertNotIn('status',obj)

    def test_omitted_native_ids_remain_absent_and_uninterpreted(self):
        mid=2070001661
        root,census=self.group({mid:{}},f2(295,f0(1,mid)+f0(5,2)),f2(270,f0(1,mid)))
        objective,state=root['children']
        self.assertNotIn('stepId',objective)
        self.assertNotIn('subStepId',objective)
        self.assertNotIn('objectiveId',objective)
        self.assertNotIn('missionState',state)
        self.assertNotIn('comparisonOperator',state)
        self.assertEqual(objective['missionId'],str(mid))

    def test_existing_step_status_projection_kept_and_type_verified(self):
        mid=2070001661
        root,census=self.group({mid:{9:[{}]}},step_oneof(mid,9,4))
        x=root['children'][0]
        self.assertEqual(x['sourceStatusName'],'Completed')
        self.assertEqual(x['stepId'],9)
        self.assertTrue(x['nativeStepIdVerified'])
        self.assertEqual(census['MissionStepStatus'],1)

    def test_missing_mission_step_or_objective_fails_closed(self):
        mid=2070001661
        with self.assertRaisesRegex(ValueError,'SOURCE_NATIVE_STEP_NOT_UNIQUE_OR_ABSENT'):
            self.group({mid:{9:[{}]}},f2(280,f0(1,mid)+f0(2,12)))
        with self.assertRaisesRegex(ValueError,'SOURCE_NATIVE_SUBSTEP_NOT_UNIQUE_OR_ABSENT'):
            self.group({mid:{9:[{}]}},f2(295,f0(1,mid)+f0(2,9)+f0(3,10)))
        with self.assertRaisesRegex(ValueError,'MISSION_ID_NOT_IN_VERIFIED_SOURCE'):
            self.group({mid:{}},f2(255,f0(1,2070009999)))
        with self.assertRaisesRegex(ValueError,'SOURCE_NATIVE_OBJECTIVE_NOT_IN_SUBSTEP'):
            self.group({mid:{9:[{1:[{2}]}]}},f2(295,f0(1,mid)+f0(2,9)+f0(3,1)+f0(4,7)))

    def test_opaque_nonmission_oneof_and_mismatched_source_fingerprints(self):
        mid=2070001661
        root,census=self.group({mid:{}},dialogue_oneof(2030501628),f2(777,f0(1,mid)))
        self.assertEqual(root['children'][0]['kind'],'DialogueFlag')
        self.assertEqual(root['children'][1]['kind'],'Unknown')
        self.assertNotIn('missionId',root['children'][1])
        self.assertEqual(sum(census.values()),0)
        from collections import Counter
        with self.assertRaisesRegex(ValueError,'BASE_TREE_ORIGINAL_WIRE_MISMATCH'):
            enrich_tree(root,b'bad bytes',{mid:{}},Counter())

    def test_incorrect_original_source_sha_denied(self):
        from pathlib import Path
        with self.assertRaisesRegex(ValueError,'MISSION_ORIGINAL_SHA'):
            original_missions(b'not original')
        with self.assertRaisesRegex(ValueError,'CONDITION_ORIGINAL_SHA'):
            original_conditions(b'not original')


if __name__=='__main__':unittest.main()
