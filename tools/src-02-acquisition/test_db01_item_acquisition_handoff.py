"""Regression tests for the materialized DB-02 -> DB-01 original-game-only handoff."""
import json
import unittest

from build_db01_item_acquisition import (
    BASIS, CATEGORIES, DETAILS, OUTPUT, ROOT, SCHEMA, SOURCES, build, serialized
)


class Db01AcquisitionHandoffTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.obj = build(ROOT)
        cls.rows = {r[0]: r for r in cls.obj["items"]}

    def test_source_pins_and_reproducibility(self):
        # Exercises all ten actual public projection SHA checks, schema pins,
        # source-only mappings, stable order and byte-for-byte publication.
        payload = serialized(ROOT)
        self.assertEqual((ROOT / OUTPUT).read_bytes(), payload)
        self.assertEqual(json.loads(payload), self.obj)
        self.assertEqual(self.obj["schema"], SCHEMA)
        self.assertEqual(self.obj["target"],
                         {"platform": "Steam", "gameVersion": "1.26.2"})
        self.assertEqual(self.obj["categoryOrder"], list(CATEGORIES))
        self.assertEqual(self.obj["details"],
                         {key: list(value) for key, value in DETAILS.items()})
        self.assertEqual(self.obj["detailEvidenceLevel"], BASIS)
        self.assertEqual(set(self.obj["sources"]), set(SOURCES))

    def test_exact_census_not_artificially_completed(self):
        c = self.obj["coverage"]
        self.assertFalse(c["allGameItemIdsCovered"])
        self.assertFalse(c["separateActiveAvailabilityVerified"])
        self.assertEqual(c["missingItemIdMeans"],
                         "unclassified_not_unobtainable")
        self.assertEqual(c["distinctClassifiedItemIds"], 3247)
        self.assertEqual(c["distinctOriginalOnlineHintItemIds"], 2198)
        self.assertEqual(c["unclassifiedWithOriginalOnlineHints"], 1628)
        self.assertEqual(c["recordsIncludingUnresolvedHints"], 4875)
        self.assertEqual(c["itemIdsByCategory"], {
            "ordinary_gameplay": 2667,
            "premium_shop": 272,
            "star_path": 64,
            "in_game_limited_event": 139,
            "real_time_limited_event": 14,
            "iap_package_reward": 158,
        })
        self.assertEqual(c["sourceRelationOccurrences"], {
            "activities": 763, "event": 202, "friendship": 16,
            "iap_direct": 150, "iap_extended": 141,
            "pets": 134, "quest": 395, "recipes": 1943,
            "shop_archive": 128, "shop_current": 156, "star_path": 67,
        })

    def test_sorted_unique_item_ids_and_multiple_categories(self):
        rows = self.obj["items"]
        self.assertEqual(len(rows), len(self.rows))
        self.assertEqual([r[0] for r in rows],
                         sorted(self.rows, key=int))
        for item_id, groups, hints in rows:
            self.assertTrue(int(item_id) > 0)
            self.assertTrue(groups or hints)
            self.assertEqual([g for g, _ in groups],
                             [g for g in CATEGORIES
                              if g in {group for group, _ in groups}])
            for group, details in groups:
                self.assertIn(group, DETAILS)
                self.assertTrue(details)
                self.assertEqual(details,
                                 [d for d in DETAILS[group] if d in details])
            self.assertEqual(hints, [h for h in ("premium", "time_limited")
                                     if h in hints])

    def test_external_promotion_does_not_invent_twitch_or_code(self):
        c = self.obj["coverage"]
        self.assertEqual(c["twitchDropItemIdLinks"], 0)
        self.assertEqual(c["redeemCodeItemIdLinks"], 0)
        ids = [id_ for id_, groups, _ in self.obj["items"]
               if any(g == "real_time_limited_event" for g, _ in groups)]
        self.assertEqual(len(ids), 14)
        for item_id in ids:
            details = dict(self.rows[item_id][1])["real_time_limited_event"]
            self.assertEqual(details, ["exclusive_promotion_unspecified"])
        # The original broad OnlineCategory.Premium is not automatically a
        # Premium Shop offer or a named limited-time promotion.
        unresolved = [r for r in self.obj["items"] if not r[1] and r[2]]
        self.assertEqual(len(unresolved), 1628)
        self.assertTrue(any("premium" in r[2] for r in unresolved))


if __name__ == "__main__":
    unittest.main()
