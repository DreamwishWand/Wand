"""DB-04 world-reference diff preserves source-subset uncertainty."""
import json
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from reference_graph import build_reference_graph
from reference_graph_diff import (
    SCHEMA, compare, read_private_graph, encode
)
from test_reference_graph import synthetic


class ReferenceGraphDiffTests(unittest.TestCase):
    def base(self):
        return build_reference_graph(synthetic(), "f" * 64)

    def test_unchanged_sources_do_not_create_differences(self):
        previous = self.base()
        result = compare(previous, deepcopy(previous), "1" * 64, "2" * 64)
        self.assertEqual(result["schema"], SCHEMA)
        self.assertTrue(result["sameGameVersion"])
        for rows in result["families"].values():
            self.assertEqual(rows["candidateAdded"], [])
            self.assertEqual(rows["oldOnlyUnverified"], [])
            self.assertEqual(rows["changedWithinSharedIds"], [])
            self.assertEqual(rows["authoritativeRemoved"], [])
        self.assertFalse(result["sourceCoverageComparableForRemoval"])

    def test_new_version_and_partial_subset_never_certify_removals(self):
        previous = self.base()
        current = deepcopy(previous)
        current["target"]["gameVersion"] = "1.26.3"
        old_world = current["worlds"].pop()
        current["initialItemRefs"] = current["initialItemRefs"][:2]
        result = compare(previous, current, "1" * 64, "2" * 64)
        self.assertFalse(result["sameGameVersion"])
        self.assertIn({"worldId": old_world["worldId"]},
                      result["families"]["worlds"]["oldOnlyUnverified"])
        self.assertEqual(result["families"]["worlds"]["authoritativeRemoved"], [])
        self.assertGreater(len(result["families"]["initialItemRefs"][
            "oldOnlyUnverified"]), 0)
        self.assertFalse(result["nativePlacementLegalityCompared"])
        self.assertFalse(result["itemPlayerSavePlacementCompared"])

    def test_same_identity_changes_are_field_only_and_not_new_id(self):
        old = self.base()
        new = deepcopy(old)
        new["worlds"][0]["sourceScopeLabel"] = "ChangedSource"
        result = compare(old, new, "1" * 64, "2" * 64)
        self.assertEqual(result["families"]["worlds"]["candidateAdded"], [])
        changes = result["families"]["worlds"]["changedWithinSharedIds"]
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["changedFields"], ["sourceScopeLabel"])

    def test_invalid_or_duplicate_ids_fail(self):
        old = self.base()
        new = deepcopy(old)
        new["gridRefs"].append(deepcopy(new["gridRefs"][0]))
        with self.assertRaisesRegex(ValueError, "DUPLICATE_RELATION_ID"):
            compare(old, new, "1" * 64, "2" * 64)
        new = deepcopy(old)
        new["publicationAuthorized"] = True
        with self.assertRaisesRegex(ValueError, "UNVERIFIED_SOURCE_KIND"):
            compare(old, new, "1" * 64, "2" * 64)

    def test_private_graph_reader_refuses_public_or_invalid_data(self):
        graph = self.base()
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "source.json"
            file.write_bytes(encode(graph))
            loaded, sha = read_private_graph(file)
            self.assertEqual(loaded["schema"], graph["schema"])
            self.assertEqual(len(sha), 64)
            graph["privateOnly"] = False
            file.write_text(json.dumps(graph), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "NOT_PRIVATE_SOURCE_GRAPH"):
                read_private_graph(file)


if __name__ == "__main__":
    unittest.main()
