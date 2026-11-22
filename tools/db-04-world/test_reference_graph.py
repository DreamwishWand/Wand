"""DB-04 typed source-reference graph: synthetic-only regression cases."""
from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reference_graph import (SCHEMA, build_reference_graph,
                             load_snapshot, canonical)

R = "SceneLayouts/Realms/Example/Realm.json"
V = "SceneLayouts/Village04/Village.json"
A = "SceneLayouts/Village04/Meadow.json"
U = "SceneLayouts/VillageExpansion04UnderwaterAreas/UnderwaterCandy/Underwater.json"
G = "SceneLayouts/VillageExpansion04UnderwaterAreas/UnderwaterCandy/AreaGrids.json"
F = "SceneLayouts/OffGridBuildings/Example/Test.json"
VP = "village-layout:" + V
WR = "Worlds!Example"


def entry(path, count, native_id=0):
    return {
        "gridDataPath": path, "gridIdNative": native_id,
        "tessellationFactor": 1, "defaultObjectCount": count
    }


def grid_layout(path, file, count, native_id=0):
    return {
        "layoutId": path, "layoutKind": "nativeGridCollection",
        "defaultObjectCount": count,
        "nativeGridEntries": [entry(file, count, native_id)]
    }


def default_object(layout, native_id, object_id, item_id):
    return {
        "layoutObjectId": f"{layout}#grid={native_id}#object={object_id}",
        "layoutId": layout,
        "gridIdNative": native_id, "gridObjectIdNative": object_id,
        "itemId": item_id, "x": 10, "y": 10,
        "worldCoordinatesVerified": False,
    }


def synthetic():
    return {
        "manifest": {
            "schema": "wand.db04.world@1",
            "status": "partial_game_native_evidence",
            "platform": "Steam", "gameVersion": "1.26.2",
            "outputSha256": {}
        },
        "worlds": [
            {"worldId": WR, "worldIdKind": "nativeWorldName", "worldType": "realm",
             "defaultGridLayoutPath": R, "sceneId": 20,
             "universeTagItemId": 777},
            {"worldId": VP, "worldIdKind": "derivedLayoutKey", "worldType": "village_layout",
             "defaultGridLayoutPath": V, "sceneId": None, "universeTagItemId": None}
        ],
        "scenes": [
            {"sceneId": 10, "nativeName": "Village", "nativeSceneKindCode": 1},
            {"sceneId": 11, "nativeName": "Underwater", "nativeSceneKindCode": 1},
            {"sceneId": 20, "nativeName": "Realm", "nativeSceneKindCode": 2},
            {"sceneId": 30, "nativeName": "House", "nativeSceneKindCode": 4},
        ],
        "areas": [
            {"areaId": "10:2", "nativeAreaTypeCode": 2, "parentSceneId": 10}
        ],
        "layouts": [
            grid_layout(R, "GridData/Realms/Example.json", 1),
            {"layoutId": V, "layoutKind": "nativeDefaultVillageData",
             "defaultVillageSceneId": 10,
             "areaLayoutReferences": [
                 {"gridLayoutPath": A, "nativeAreaTypeCode": 2,
                  "nativeAreaTypeName": "Meadow"}
             ],
             "separatedAreasRaw": [U]},
            grid_layout(A, "GridData/Village/Meadow.json", 2, 1),
            {"layoutId": U, "layoutKind": "nativeDefaultVillageData",
             "defaultVillageSceneId": 11,
             "areaLayoutReferences": [
                 {"gridLayoutPath": G, "nativeAreaTypeCode": 62,
                  "nativeAreaTypeName": "UnderwaterCandy"}
             ]},
            grid_layout(G, "GridData/Underwater/Candy.json", 1),
            grid_layout(F, "GridData/OffGrid/Test.json", 1),
        ],
        "grids": [
            {"gridId": p, "sizeX": 30, "sizeY": 30}
            for p in ["GridData/Realms/Example.json",
                      "GridData/Village/Meadow.json",
                      "GridData/Underwater/Candy.json",
                      "GridData/OffGrid/Test.json"]
        ],
        "layoutObjects": [
            default_object(R, 0, 0, 200),
            default_object(A, 1, 0, 100),
            default_object(A, 1, 1, 100),
            default_object(G, 0, 0, 300),
            default_object(F, 0, 0, 400),
        ],
    }


class ReferenceGraphTests(unittest.TestCase):
    def setUp(self):
        self.source = synthetic()

    def graph(self):
        return build_reference_graph(self.source, "a" * 64)

    def test_exact_native_and_derived_world_id_kinds(self):
        graph = self.graph()
        self.assertEqual(graph["schema"], SCHEMA)
        worlds = {w["worldId"]: w for w in graph["worlds"]}
        self.assertEqual(worlds[WR]["worldIdKind"], "nativeWorldName")
        self.assertEqual(worlds[VP]["worldIdKind"], "derivedLayoutKey")
        self.assertEqual(worlds[VP]["nativeSceneId"], 10)
        self.assertIsNone(worlds[VP]["contentPackId"])
        self.assertFalse(worlds[VP]["contentPackRelationVerified"])

    def test_village_area_and_separated_underwater_exact_path(self):
        graph = self.graph()
        areas = {a["gridLayoutId"]: a for a in graph["areas"]}
        self.assertEqual(areas[A]["nativeAreaId"], "10:2")
        self.assertEqual(areas[A]["nativeAreaTypeCode"], 2)
        self.assertEqual(areas[G]["worldId"], VP)
        self.assertEqual(areas[G]["nativeSceneId"], 11)
        self.assertEqual(areas[G]["separateAreaParentLayoutId"], V)
        self.assertIsNone(areas[G]["nativeAreaId"])
        self.assertFalse(areas[G]["placementLegalityVerified"])
        scenes = {s["nativeSceneId"]: s for s in graph["scenes"]}
        self.assertEqual(scenes[11]["worldId"], VP)
        self.assertIsNone(scenes[30]["worldId"])

    def test_scoped_grid_ids_never_join_by_integer_alone(self):
        graph = self.graph()
        refs = {ref["layoutId"]: ref for ref in graph["gridRefs"]}
        self.assertEqual(refs[R]["nativeGridId"], 0)
        self.assertEqual(refs[G]["nativeGridId"], 0)
        self.assertNotEqual(refs[R]["gridRefId"], refs[G]["gridRefId"])
        self.assertIsNone(refs[F]["worldId"])
        self.assertEqual(refs[R]["worldId"], WR)
        self.assertEqual(refs[G]["worldId"], VP)

    def test_five_item_relations_remain_distinct(self):
        graph = self.graph()
        items = {int(row["itemId"]): row for row in graph["initialItemRefs"]}
        self.assertEqual(items[100]["instanceCount"], 2)
        self.assertEqual(items[100]["worldId"], VP)
        self.assertEqual(items[200]["worldId"], WR)
        self.assertEqual(items[300]["worldId"], VP)
        self.assertIsNone(items[400]["worldId"])
        for record in items.values():
            self.assertEqual(record["relation"], "nativeSourceDefaultGridObject")
            self.assertIsNone(record["itemOriginWorldId"])
            self.assertIsNone(record["itemAcquisitionWorldId"])
            self.assertIsNone(record["playerPlacedWorldId"])
            self.assertIsNone(record["placeableWorldId"])
            self.assertFalse(record["otherFourRelationsVerified"])
        self.assertEqual(graph["coverage"]["sourceInitialGridObjects"], 5)
        self.assertEqual(graph["coverage"][
            "sourceInitialGridObjectsWithoutVerifiedWorldLink"], 1)
        self.assertFalse(graph["coverage"]["completeGameHierarchyVerified"])

    def test_ambiguous_area_code_and_stale_grid_count_fail(self):
        s = synthetic()
        s["layouts"][1]["areaLayoutReferences"].append(
            s["layouts"][1]["areaLayoutReferences"][0].copy())
        with self.assertRaisesRegex(ValueError, "DUPLICATE_NATIVE_AREA_TYPE"):
            build_reference_graph(s, "f" * 64)
        s = synthetic()
        s["layouts"][0]["nativeGridEntries"][0]["defaultObjectCount"] = 3
        with self.assertRaisesRegex(ValueError, "CARDINALITY_MISMATCH"):
            build_reference_graph(s, "f" * 64)

    def test_manifest_hashes_and_preview_source_status(self):
        source = synthetic()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for key, value in source.items():
                if key == "manifest":
                    continue
                raw = canonical(value)
                (root / (key + ".json")).write_bytes(raw)
                source["manifest"]["outputSha256"][key + ".json"] = hashlib.sha256(raw).hexdigest()
            (root / "manifest.json").write_bytes(canonical(source["manifest"]))
            loaded, digest = load_snapshot(root)
            self.assertEqual(digest, hashlib.sha256((root / "manifest.json").read_bytes()).hexdigest())
            self.assertEqual(len(build_reference_graph(loaded, digest)["worlds"]), 2)
            (root / "grids.json").write_text("[]", encoding="utf8")
            with self.assertRaisesRegex(ValueError, "SOURCE_HASH_MISMATCH"):
                load_snapshot(root)
            # ZIP replay uses independent integrity validation, no file writes.
            (root / "grids.json").write_bytes(canonical(source["grids"]))
            with zipfile.ZipFile(root / "source.zip", "w") as archive:
                for file in root.glob("*.json"):
                    archive.write(file, file.name)
            loaded, _ = load_snapshot(root / "source.zip")
            self.assertEqual(build_reference_graph(loaded, "a" * 64)["coverage"][
                "nativeAreaLayoutReferences"], 2)


if __name__ == "__main__":
    unittest.main()
