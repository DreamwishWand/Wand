import json
from pathlib import Path
import tempfile
import unittest

from audit_activity_recovery_state import (
    amount_wrapper, candidate_methods, observed_profiles, source_fields, state_shape,
)


class ActivityRecoveryStateAuditTest(unittest.TestCase):
    def native(self):
        return {
            "Profile": [("World", 1, "World"), ("Player", 2, "Player")],
            "World": [("GridCollection", 1, "GridCollection")],
            "GridCollection": [("Grids", 1, "MapField<uint, Grid>")],
            "Grid": [("Objects", 1, "MapField<uint, GridObject>")],
            "GridObject": [("State", 6, "GridState")],
            "Player": [("ContainerInventories", 1, "MapField<uint, ContainerInventory>")],
            "ContainerInventory": [("Inventory", 1, "RepeatedField<ItemInstance>")],
            "ItemInstance": [("State", 3, "ItemState")],
            "GridState": [("Sample", 1, "ItemState"), ("Toggle", 2, "Toggle")],
            "ItemState": [("MealData", 1, "MealData")],
        }

    def test_exact_state_routes(self):
        n = self.native()
        fields = source_fields(n)
        self.assertEqual(fields["GridState"][0]["type"], "ItemState")
        n["GridObject"] = [("State", 6, "Wrong")]
        with self.assertRaises(ValueError):
            source_fields(n)

    def test_amount_wrapper_exact_native_tags_and_types(self):
        native = self.native()
        native["GridState"] = [("ItemAmountState", 2, "AmountWithState")]
        native["AmountWithState"] = [
            ("Amount", 1, "Nullable<int>"),
            ("State", 2, "ItemState"),
            ("AssignedPlayer", 3, "Nullable<int>"),
        ]
        report = amount_wrapper(native)
        self.assertEqual(report["gridField"]["tag"], 2)
        self.assertEqual(report["fields"][1], {"name": "State", "tag": 2, "type": "ItemState"})
        self.assertFalse(report["nativeCallFlowVerified"])
        native["AmountWithState"][2] = ("AssignedPlayer", 3, "int")
        with self.assertRaises(ValueError):
            amount_wrapper(native)

    def test_census_uses_membership_and_hides_all_private_keys_and_values(self):
        fields = source_fields(self.native())
        profile = {
            "GameInfo": {"Version": 643},
            "World": {"GridCollection": {
                "Grids": {"privateGrid": {"Objects": {
                    "privateObject": {"ItemID": 30000001, "State": {"Sample": {"privateValue": 123}}},
                    "other": {"ItemID": 40000001, "State": {"Toggle": True}},
                }}},
                "DiffGrids": {"privateDiff": {"ModifiedObjects": {
                    "privateObject2": {"ItemID": 30000002, "State": {"PRIVATE_KEY": "PRIVATE_VALUE"}},
                }}},
            }},
            "Player": {"ContainerInventories": {"privateChest": {"Inventory": [
                {"ItemID": 30000001, "Amount": 2, "State": {"MealData": {}}},
                {"ItemID": 30000002, "Amount": 1},
            ]}}},
        }
        r = observed_profiles([profile], {30000001, 30000002}, fields)
        self.assertEqual(r["counts"]["fullGrid"], {"Sample": 1})
        self.assertEqual(r["counts"]["diffModified"], {"<unknown>": 1})
        self.assertEqual(r["counts"]["inventory"], {"MealData": 1, "null": 1})
        self.assertIn({"gridShape": "Sample", "inventoryShape": "MealData", "distinctDefinitions": 1},
                      r["sameItemDefinitionShapePairs"])
        raw = json.dumps(r)
        for value in ("privateGrid", "privateObject", "PRIVATE_KEY", "PRIVATE_VALUE",
                      "privateValue", "privateChest", "30000001", "30000002"):
            self.assertNotIn(value, raw)
        self.assertTrue(r["sameItemDefinitionDoesNotProveInstanceConversion"])

    def test_metadata_candidates_are_not_executable_evidence(self):
        raw = """// Namespace: Meta
public sealed class PickUpContainerItem.Types.Response : IMessage
{
    // RVA: 0x1234 Offset: 0x1234 VA: 0x1234
    public void ApplyThis() { }
    // RVA: 0x1240 Offset: 0x1240 VA: 0x1240
    public void Other() { }
}
// Namespace: Meta.Grids
public class GridObject
{
    // RVA: 0x5678 Offset: 0x5678 VA: 0x5678
    public ItemState Convert(GridState state) { }
}
"""
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "dump.cs"
            p.write_text(raw, encoding="utf-8")
            rows = candidate_methods(p)
        self.assertEqual([x["rva"] for x in rows], ["0x1234", "0x5678"])
        self.assertEqual(state_shape([], {}), "invalid_kind")
        self.assertEqual(state_shape({}, {}), "empty")


if __name__ == "__main__":
    unittest.main()
