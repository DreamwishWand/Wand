"""DB-02 source-ID handoff regression and source authenticity tests."""
import json
import unittest

from build_db01_item_source_relations import (
    CATEGORIES, FILE, K, R, ROLE_CATEGORY, ROOT, SCHEMA, SOURCE_FILES,
    build, serialized,
)


class Db01ItemSourceRelationsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = build(ROOT)
        cls.lookup = {item: edges for item, edges in cls.document["items"]}

    def test_materialized_public_file_matches_source_pinned_generator(self):
        expected = serialized(ROOT)
        self.assertEqual((ROOT / FILE).read_bytes(), expected)
        self.assertEqual(json.loads(expected), self.document)
        self.assertEqual(self.document["schema"], SCHEMA)
        self.assertEqual(self.document["target"],
                         {"platform": "Steam", "gameVersion": "1.26.2"})
        self.assertEqual(self.document["sourceKinds"], K)
        self.assertEqual(self.document["roles"], R)
        self.assertEqual(self.document["categoryOrder"], CATEGORIES)
        self.assertEqual(self.document["roleCategory"], ROLE_CATEGORY)
        self.assertEqual(self.document["sourceProjections"], SOURCE_FILES)

    def test_exact_coverage_and_no_regression_of_six_categories(self):
        c = self.document["coverage"]
        self.assertEqual(c["sourceProjectionCount"], 12)
        self.assertEqual(c["itemIdsWithLinks"], 4137)
        self.assertEqual(c["sourceLinks"], 15444)
        self.assertEqual(c["classifiedItemIdsFromLinks"], 3247)
        self.assertEqual(c["previousClassifiedItemIds"], 3247)
        self.assertEqual(c["itemIdsByCategory"], {
            "ordinary_gameplay": 2667,
            "premium_shop": 272,
            "star_path": 64,
            "in_game_limited_event": 139,
            "real_time_limited_event": 14,
            "iap_package_reward": 158,
        })
        self.assertEqual(c["linksBySourceKind"], {
            "quest": 395, "star_path": 82, "event": 202,
            "friendship_default": 16, "recipe": 8088,
            "activity": 763, "shop_offer": 284,
            "iap_package": 291, "loot_table": 3804,
            "stall": 1385, "native_pet_source": 134,
        })

    def test_exact_source_identifiers_have_occurrence_and_roles(self):
        rows = self.document["items"]
        self.assertEqual([row[0] for row in rows],
                         sorted(self.lookup, key=int))
        source_types = set()
        roles = set()
        for item_id, links in rows:
            self.assertGreater(int(item_id), 0)
            self.assertTrue(links)
            for kind, source_id, role, occurrence, pos in links:
                self.assertIn(kind, range(len(K)))
                self.assertIsInstance(source_id, str)
                self.assertTrue(source_id)
                self.assertIn(role, range(len(R)))
                self.assertIsInstance(occurrence, int)
                self.assertGreaterEqual(occurrence, 0)
                self.assertIsInstance(pos, list)
                source_types.add(K[kind])
                roles.add(R[role])
        self.assertEqual(source_types, set(K))
        self.assertEqual(roles, set(R))
        # Known original Quest ID; no invented friendly name is required in
        # relation data because DB-03 owns original eight-language names.
        quest_examples = [
            (iid, edge) for iid, edges in rows for edge in edges
            if K[edge[0]] == "quest"
        ]
        self.assertEqual(len(quest_examples), 395)
        self.assertTrue(all(edge[1].isdecimal() for _, edge in quest_examples))

    def test_candidate_links_do_not_claim_acquisition(self):
        candidate_roles = (
            "recipe_ingredient_item",
            "loot_table_candidate",
            "stall_loot_pool_candidate",
            "star_path_vault_alternative_candidate",
            "star_path_premium_access_currency",
        )
        for role in candidate_roles:
            self.assertIsNone(ROLE_CATEGORY[R.index(role)], role)
        for role in ("quest_currency_reward", "quest_additional_loot_candidate",
                     "friendship_default_reward_candidate"):
            self.assertEqual(ROLE_CATEGORY[R.index(role)], 0)
        self.assertEqual(
            ROLE_CATEGORY[R.index("native_pet_exclusive_promotion")], 4)
        self.assertEqual(
            self.document["semantics"]["displayNames"],
            "resolve_via_DB01_DB03_original_named_sources")
        self.assertTrue(self.document["semantics"]["expertOnlyIds"])
        self.assertFalse(
            self.document["semantics"]["guaranteedItemGrantVerified"])
        self.assertFalse(
            self.document["semantics"]["allOriginalSourcesCovered"])


if __name__ == "__main__":
    unittest.main()
