#!/usr/bin/env python3
"""DB-02 -> DB-01 exact Item ID / original acquisition source-ID crosswalk.

This is an OFFLINE, source-verified build from committed public projections.
It never uses third-party campaign lists, wiki guesses, user Saves, external
web requests, or owner-private original binary files.

Run from repository root:
  python tools/src-02-acquisition/build_db01_item_source_relations.py --check
  python tools/src-02-acquisition/build_db01_item_source_relations.py --write
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from build_db01_item_acquisition import ROOT, read_sources, require

FILE = "static/acquisition/public/db01-item-source-relations-1.26.2.json"
SCHEMA = "wand.db02.db01-item-source-relations@1"
SOURCE_FILES = {
    "quest": "static/guide/public/quest-rewards-1.26.2.json",
    "quest_index": "static/guide/public/quest-index.json",
    "star_path": "static/guide/public/starpath-cache-2026-11-22.json",
    "event_friendship": "static/guide/public/event-friendship-rewards-1.26.2.json",
    "recipes": "static/acquisition/public/recipe-results-1.26.2.json",
    "activities": "static/acquisition/public/activity-result-paths-1.26.2.json",
    "shop_current": "static/acquisition/public/shop-cache-2026-11-22.json",
    "shop_archive": "static/acquisition/public/shop-cache-2026-07-15.json",
    "iap": "static/acquisition/public/iap-rewards-1.26.2.json",
    "loot": "static/acquisition/public/native-loot-candidates-1.26.2.json",
    "stalls": "static/acquisition/public/native-stall-slots-1.26.2.json",
    "pets": "static/acquisition/public/pet-source-categories-1.26.2.json",
}
EXTRA_PINS = {
    "loot": (
        "fba1d8163c30156941b108ce2ba37544f32e9c7d419f4c2b1f126b017c470a00",
        "wand.db02.public-native-loot-candidates@1",
    ),
    "stalls": (
        "ef18e94df460d7bd5c768ebc720c48425570ac549a49ebdac00ade34e5468d2a",
        "wand.db02.public-native-stall-slots@1",
    ),
}
K = [
    "quest", "star_path", "event", "friendship_default", "recipe",
    "activity", "shop_offer", "iap_package", "loot_table", "stall",
    "native_pet_source",
]
R = [
    "quest_currency_reward",
    "quest_additional_loot_candidate",
    "star_path_free_reward",
    "star_path_premium_reward",
    "star_path_vault_reward",
    "star_path_vault_alternative_candidate",
    "star_path_premium_access_currency",
    "mini_event_reward_candidate",
    "floating_festival_reward_candidate",
    "friendship_default_reward_candidate",
    "cooking_result",
    "crafting_result",
    "recipe_ingredient_item",
    "fishing_result",
    "mining_result",
    "timebending_result",
    "farming_result",
    "premium_shop_component",
    "archived_premium_shop_component",
    "iap_direct_reward",
    "iap_extended_reward",
    "loot_table_candidate",
    "stall_loot_pool_candidate",
    "native_pet_quest",
    "native_pet_timebending",
    "native_pet_event",
    "native_pet_star_path",
    "native_pet_premium_shop",
    "native_pet_exclusive_promotion",
]
# Index into the *Owner-approved* six-category taxonomy. Null means a
# related source-only item (ingredient, Loot Table, vault alternative, etc.)
# and is NOT a verified way to receive an item.
ROLE_CATEGORY = [
    0, 0, 2, 2, 2, None, None, 3, 3, 0, 0, 0, None, 0, 0,
    0, 0, 1, 1, 5, 5, None, None, 0, 0, 3, 2, 1, 4,
]
CATEGORIES = [
    "ordinary_gameplay", "premium_shop", "star_path",
    "in_game_limited_event", "real_time_limited_event", "iap_package_reward",
]
ACTIVITY_ROLES = [
    "fishing_result", "mining_result", "timebending_result", "farming_result",
]
PET_ROLES = {
    "quest": "native_pet_quest",
    "timebending": "native_pet_timebending",
    "event": "native_pet_event",
    "star_path": "native_pet_star_path",
    "premium_shop": "native_pet_premium_shop",
    "exclusive_promotion": "native_pet_exclusive_promotion",
}


def item_id(value: object) -> str:
    require(type(value) in (int, str), "RELATION_ID_TYPE")
    string = str(value)
    require(string.isdecimal() and not string.startswith("0") and
            0 < int(string) <= 9007199254740991, "RELATION_ID")
    return string


def original_data(root: Path) -> dict:
    loaded = read_sources(root)
    for key, (sha, schema) in EXTRA_PINS.items():
        raw = (root / SOURCE_FILES[key]).read_bytes()
        require(hashlib.sha256(raw).hexdigest() == sha, "RELATION_SHA_" + key)
        doc = json.loads(raw)
        require(doc["schema"] == schema and
                doc["target"] == {"platform": "Steam", "gameVersion": "1.26.2"},
                "RELATION_SOURCE_" + key)
        loaded[key] = doc
    index = json.loads((root / SOURCE_FILES["quest_index"]).read_bytes())
    require(index["schema"] == "wand.db03.public-guide-quests@1" and
            index["counts"]["quests"] == len(index["quests"]) == 733 and
            index["target"] == {"platform": "Steam", "gameVersion": "1.26.2"} and
            index["provenance"]["missionFullFileSha256"] ==
            "f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24" and
            index["provenance"]["missionSourceIdenticalAcrossVersions"] is True,
            "RELATION_QUEST_INDEX")
    loaded["quest_index"] = index
    return loaded


def build(root: Path = ROOT) -> dict:
    d = original_data(root)
    require(len(K) == 11 and len(R) == len(ROLE_CATEGORY) == 29,
            "RELATION_DICTIONARY")
    by_item: dict[str, list[list]] = {}
    occ: Counter[str] = Counter()

    def link(raw_item: object, kind: str, source: object, role: str,
             slot: int, context: list | None = None) -> None:
        iid = item_id(raw_item)
        require(kind in K and role in R and
                type(slot) is int and slot >= 0, "RELATION_LINK")
        source_id = str(source)
        require(len(source_id) > 0, "RELATION_SOURCE_ID")
        edge = [K.index(kind), source_id, R.index(role), slot,
                context if context is not None else []]
        by_item.setdefault(iid, []).append(edge)
        occ[role] += 1

    require(len(d["quest_index"]["quests"]) == 733 and
            len(d["quest"]["rows"]) == 247, "RELATION_QUEST_CENSUS")
    quest_ids = {q["id"] for q in d["quest_index"]["quests"]}
    for qid, q in d["quest"]["rows"].items():
        require(qid in quest_ids, "RELATION_UNKNOWN_QUEST")
        for n, row in enumerate(q.get("currency", [])):
            link(row[0], "quest", qid, "quest_currency_reward", n)
        for n, row in enumerate(q.get("additionalLoot", [])):
            link(row[2], "quest", qid,
                 "quest_additional_loot_candidate", n, [row[0], row[1]])

    star_count = 0
    require(len(d["star_path"]["seasons"]) == 2, "RELATION_STAR_SEASONS")
    for season in d["star_path"]["seasons"]:
        n = 0
        for section, pages in ((0, season["rewardPages"]),
                               (1, season["bonusPages"])):
            for page in pages:
                for index, reward in enumerate(page["rewards"]):
                    link(reward["itemId"], "star_path", season["id"],
                         "star_path_premium_reward" if reward["premium"]
                         else "star_path_free_reward",
                         n, [section, page["page"], index])
                    n += 1
                    star_count += 1
        for index, reward in enumerate(season["vaultRewards"]):
            link(reward["itemId"], "star_path", season["id"],
                 "star_path_vault_reward", n, [2, None, index])
            n += 1
            star_count += 1
            if reward.get("alternateItemId"):
                link(reward["alternateItemId"], "star_path", season["id"],
                     "star_path_vault_alternative_candidate", index,
                     [2, None, index, str(reward["itemId"])])
        link(season["premiumPrice"]["itemId"], "star_path", season["id"],
             "star_path_premium_access_currency", 0)
    require(star_count == 67, "RELATION_STAR_REWARDS")

    for event in d["event_friendship"]["events"]:
        require(event["kind"] in ("mini_event", "floating_festival"),
                "RELATION_EVENT_KIND")
        role = ("mini_event_reward_candidate"
                if event["kind"] == "mini_event"
                else "floating_festival_reward_candidate")
        for row in event["rewards"]:
            link(row[2], "event", event["id"], role, row[1], [row[0]])
    for row in d["event_friendship"]["defaultFriendshipRewards"]:
        link(row[3], "friendship_default", "default_friendship",
             "friendship_default_reward_candidate",
             row[0], [row[1], row[2]])

    for recipe in d["recipes"]["recipes"]:
        require(recipe[1] in (0, 1), "RELATION_RECIPE_MODE")
        rid = item_id(recipe[0])
        link(recipe[2], "recipe", rid,
             "cooking_result" if recipe[1] == 0 else "crafting_result", 0)
        for n, ingredient in enumerate(recipe[4]):
            if ingredient[0] == 0:
                link(ingredient[1], "recipe", rid,
                     "recipe_ingredient_item", n)
            elif ingredient[0] == 2:
                for item in ingredient[1]:
                    link(item, "recipe", rid,
                         "recipe_ingredient_item", n, [1])
            else:
                require(ingredient[0] in (1, 3),
                        "RELATION_RECIPE_INGREDIENT")
                # Tag references do not justify inferring any exact Item ID.
    for n, row in enumerate(d["activities"]["paths"]):
        require(type(row[1]) is int and row[1] in range(4),
                "RELATION_ACTIVITY_KIND")
        link(row[2], "activity", row[0], ACTIVITY_ROLES[row[1]], n)
    for key, role in (("shop_current", "premium_shop_component"),
                      ("shop_archive", "archived_premium_shop_component")):
        snapshot = d[key]["source"]["snapshotKey"]
        for offer in d[key]["offers"]:
            for n, component in enumerate(offer[5]):
                link(component[0], "shop_offer", offer[0], role, n,
                     [snapshot, offer[1]])
    for package in d["iap"]["packages"]:
        for n, row in enumerate(package[9]):
            link(row[0], "iap_package", package[1],
                 "iap_direct_reward", n, [package[0]])
        for n, row in enumerate(package[10]):
            link(row[0], "iap_package", package[1],
                 "iap_extended_reward", n, [package[0]])

    by_table = {item_id(table_id): groups
                for table_id, groups in d["loot"]["tables"]}
    require(len(by_table) == 960, "RELATION_LOOT_TABLE_CENSUS")
    for table_id, groups in d["loot"]["tables"]:
        for group_index, group in enumerate(groups):
            for ordinal, row in enumerate(group[1]):
                link(row[0], "loot_table", table_id,
                     "loot_table_candidate", group_index,
                     [ordinal, group[0], row[1]])
    require(len(d["stalls"]["stalls"]) == 65, "RELATION_STALL_CENSUS")
    for stall in d["stalls"]["stalls"]:
        for slot, table_id in enumerate(stall[3]):
            groups = by_table.get(item_id(table_id))
            require(groups is not None, "RELATION_STALL_TABLE_NOT_FOUND")
            for group_index, group in enumerate(groups):
                for ordinal, row in enumerate(group[1]):
                    link(row[0], "stall", stall[0],
                         "stall_loot_pool_candidate", slot,
                         [str(table_id), group_index, ordinal])
    for category, ids in d["pets"]["categories"]:
        require(category in PET_ROLES, "RELATION_PET_ENUM")
        for iid in ids:
            link(iid, "native_pet_source", category,
                 PET_ROLES[category], 0)

    rows = [[iid, by_item[iid]]
            for iid in sorted(by_item, key=int)]
    known: dict[str, list[str]] = {}
    for iid, edges in rows:
        known[iid] = [CATEGORIES[i] for i in sorted(set(
            ROLE_CATEGORY[e[2]] for e in edges if ROLE_CATEGORY[e[2]] is not None
        ))]
    previous = json.loads((root / (
        "static/acquisition/public/db01-item-acquisition-1.26.2.json"
    )).read_bytes())
    require(previous["schema"] == "wand.db02.db01-item-acquisition@1" and
            previous["categoryOrder"] == CATEGORIES and
            previous["coverage"]["distinctClassifiedItemIds"] == 3247,
            "RELATION_PREVIOUS_BASELINE")
    for iid, groups, _hints in previous["items"]:
        if groups:
            require([group[0] for group in groups] == known.get(iid, []),
                    "RELATION_CLASSIFIED_REGRESSION")
    category_counts = {
        name: sum(name in groups for groups in known.values())
        for name in CATEGORIES
    }
    source_counts = {kind: 0 for kind in K}
    for edges in by_item.values():
        for edge in edges:
            source_counts[K[edge[0]]] += 1
    role_counts = {role: occ[role] for role in R if occ[role] > 0}
    coverage = {
        "itemIdsWithLinks": len(rows),
        "classifiedItemIdsFromLinks": sum(bool(g) for g in known.values()),
        "previousClassifiedItemIds": 3247,
        "sourceLinks": sum(len(edges) for edges in by_item.values()),
        "itemIdsByCategory": category_counts,
        "linksBySourceKind": source_counts,
        "linksByRole": role_counts,
        "sourceProjectionCount": len(SOURCE_FILES),
    }
    require(coverage["itemIdsWithLinks"] == 4137 and
            coverage["classifiedItemIdsFromLinks"] == 3247 and
            coverage["sourceLinks"] == 15444 and
            source_counts["quest"] == 395 and
            source_counts["recipe"] == 8088 and
            source_counts["loot_table"] == 3804 and
            source_counts["stall"] == 1385 and
            source_counts["star_path"] == 82,
            "RELATION_COVERAGE")
    return {
        "schema": SCHEMA,
        "target": {"platform": "Steam", "gameVersion": "1.26.2"},
        "linkKey": "itemId",
        "categoryOrder": CATEGORIES,
        "sourceKinds": K,
        "roles": R,
        "roleCategory": ROLE_CATEGORY,
        "sourceProjections": SOURCE_FILES,
        "semantics": {
            "categoryNull": "related_item_reference_not_verified_acquisition",
            "unlistedItem": "no_known_link_not_unobtainable",
            "expertOnlyIds": True,
            "displayNames": "resolve_via_DB01_DB03_original_named_sources",
            "sourceDefinitionsOnly": True,
            "guaranteedItemGrantVerified": False,
            "currentAvailabilityVerified": False,
            "allOriginalSourcesCovered": False,
        },
        "encoding": [
            "itemId",
            ["sourceKindIndex", "sourceId", "roleIndex",
             "occurrenceIndex", "sourcePosition"],
        ],
        "coverage": coverage,
        "items": rows,
    }


def serialized(root: Path = ROOT) -> bytes:
    return (json.dumps(build(root), ensure_ascii=False,
                       separators=(",", ":")) + "\n").encode("utf-8")


def main() -> None:
    p = argparse.ArgumentParser()
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = p.parse_args()
    data = serialized()
    output = ROOT / FILE
    if args.check:
        require(output.is_file() and output.read_bytes() == data,
                "RELATION_OUTDATED_OR_CORRUPTED")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
    report = json.loads(data)["coverage"]
    print(json.dumps({"file": FILE, "sha256": hashlib.sha256(data).hexdigest(),
                      "coverage": report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
