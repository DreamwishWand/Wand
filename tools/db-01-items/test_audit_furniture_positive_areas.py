"""Fail-closed synthetic audit for the original 6746 Furniture native area tags."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest

SOURCE=Path(__file__).with_name("audit_furniture_positive_areas.py")
spec=importlib.util.spec_from_file_location(
    "db01_original_furniture_positive_areas_audit",SOURCE)
assert spec is not None and spec.loader is not None
audit=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=audit
spec.loader.exec_module(audit)

from test_extract_furniture_subtypes import synthetic_corpus,TAGS

CONFIG=[
    {"collectionArea":1,"gameplayTagId":2001200028},
    {"collectionArea":2,"gameplayTagId":2001200029},
    {"collectionArea":3,"gameplayTagId":2001200030},
    {"collectionArea":4,"gameplayTagId":2001200040},
    {"collectionArea":5,"gameplayTagId":2001200066},
    {"collectionArea":4097,"gameplayTagId":2001200067},
    {"collectionArea":0,"gameplayTagId":0},
]
SET={2040000009:(2000500001,)}


class NativeFurnitureAreaAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items=synthetic_corpus()

    def test_synthetic_furniture_has_exact_seven_classes_and_no_area_inheritance(self):
        result=audit.source_summary(
            self.items,TAGS,SET,CONFIG,pin_original_census=False)
        self.assertEqual(result["originalFurnitureCount"],6746)
        self.assertEqual(result["positiveNativeAreaTagItems"],6322)
        self.assertEqual(result["withoutPositiveNativeAreaTag"],424)
        self.assertEqual(
            result["positiveNativeAreaTagMatches"][1],6322)
        self.assertEqual(
            sum(result["positiveNativeAreaTagMatches"].values()),6322)
        self.assertEqual(result["sourceInheritedPositiveAreaMatches"],0)
        self.assertEqual(result["sourceItemsMatchingMultiplePositiveAreas"],0)
        self.assertFalse(result["originalAllAreasDefaultHasTagEvaluated"])
        self.assertFalse(result["gameRuntimeCollectionGroupMembershipVerified"])

    def test_source_census_is_fail_closed_until_original_source_counts_match(self):
        with self.assertRaisesRegex(ValueError,
                                    "ORIGINAL_AREA_TAG_CENSUS_DRIFT"):
            audit.source_summary(
                self.items,TAGS,SET,CONFIG,pin_original_census=True)
        self.assertEqual(sum(audit.EXPECTED_AREAS.values()),6303)
        self.assertEqual(audit.EXPECTED_UNASSIGNED,443)
        self.assertEqual(6303+443,6746)

    def test_native_area_config_must_be_original_order_and_7_rows(self):
        for altered in [
            CONFIG[::-1],
            CONFIG[:-1],
            CONFIG+[CONFIG[-1]],
            [*CONFIG[:6],{"collectionArea":0,"gameplayTagId":2001200028}],
            [*CONFIG[:5],{"collectionArea":4097,"gameplayTagId":2001200028},
             CONFIG[6]],
        ]:
            with self.subTest(altered=altered):
                with self.assertRaisesRegex(ValueError,
                                            "ORIGINAL_SERIALIZED_AREA_CONFIG"):
                    audit.source_summary(
                        self.items,TAGS,SET,altered,
                        pin_original_census=False)

    def test_unresolved_native_set_reference_must_not_be_treated_as_no_tags(self):
        with self.assertRaisesRegex(ValueError,
                                    "ORIGINAL_SET_LOOKUP_NOT_COMPLETE"):
            audit.source_summary(
                self.items,TAGS,{},CONFIG,pin_original_census=False)

    def test_non_world_tags_are_not_collection_areas(self):
        # The real original synthetic source's IHasSet fallback carries
        # Mickey universe tag 2000500001. It must never promote a positive
        # area when the game's original Unity configs do not reference it.
        result=audit.source_summary(
            self.items,TAGS,SET,CONFIG,pin_original_census=False)
        self.assertNotIn(2000500001,result["positiveNativeAreaTagMatches"])
        self.assertEqual(result["withoutPositiveByNativeSubtype"][
            "FurnitureBlockerItemData"],403)
        self.assertEqual(result["withoutPositiveByNativeSubtype"][
            "FenceAndRoadItemData"],21)

    def test_zero_or_duplicate_config_tag_id_is_not_gameplay_tag_evidence(self):
        altered=copy.deepcopy(CONFIG)
        altered[0]["gameplayTagId"]=0
        with self.assertRaisesRegex(ValueError,
                                    "ORIGINAL_SERIALIZED_AREA_CONFIG"):
            audit.source_summary(
                self.items,TAGS,SET,altered,pin_original_census=False)
        altered[0]["gameplayTagId"]=123456789
        with self.assertRaisesRegex(ValueError,
                                    "ORIGINAL_SERIALIZED_AREA_CONFIG"):
            audit.source_summary(
                self.items,TAGS,SET,altered,pin_original_census=False)


if __name__=="__main__":
    unittest.main()
