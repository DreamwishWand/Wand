#!/usr/bin/env python3
"""Build the DB-02 -> DB-01 six-category Item ID handoff from SHA-pinned game extracts.

Offline build only. Never reads or publishes private game originals, Save files,
online campaigns, shop sale calendars, prices, promo-code strings, or user data.
A source-defined reward is NOT proof of acquisition or current availability.

Run from repository root:
  python tools/src-02-acquisition/build_db01_item_acquisition.py --check
  python tools/src-02-acquisition/build_db01_item_acquisition.py --write
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = "static/acquisition/public/db01-item-acquisition-1.26.2.json"
SCHEMA = "wand.db02.db01-item-acquisition@1"
CATEGORIES = (
    "ordinary_gameplay",
    "premium_shop",
    "star_path",
    "in_game_limited_event",
    "real_time_limited_event",
    "iap_package_reward",
)
# Each source is an existing SHA-verified PUBLIC projection of game originals,
# not external shop history, official news, wiki content or name-only guesses.
SOURCES = {
    "shop_current": (
        "static/acquisition/public/shop-cache-2026-11-22.json",
        "310e1f0cfc907efda4107b6d8602fbf6c5af92739edff6592d0ce10449a5ad07",
        "wand.db02.public-native-shop-snapshot@1",
    ),
    "shop_archive": (
        "static/acquisition/public/shop-cache-2026-07-15.json",
        "fe10a2d69728b6f3cef8445922f4773f64d5946c6a7dbc01518d84f7fe960b1b",
        "wand.db02.public-native-shop-snapshot@1",
    ),
    "iap": (
        "static/acquisition/public/iap-rewards-1.26.2.json",
        "b6de9c8d4798373cd57b1df149751a6b58286be9f3767bce92c88071e58920cf",
        "wand.db02.public-static-iap@1",
    ),
    "star_path": (
        "static/guide/public/starpath-cache-2026-11-22.json",
        "78819b4d36042e3c60b576583149e58541d3ca297fa0c3ba8a9a775009614198",
        "wand.db03.public-starpath-cache@1",
    ),
    "event_friendship": (
        "static/guide/public/event-friendship-rewards-1.26.2.json",
        "9b8857dfaa557a458a8e922ea4145895bc698e50d8d1ce0ad68017492f18b5c9",
        "wand.db03.public-event-friendship-rewards@1",
    ),
    "quest": (
        "static/guide/public/quest-rewards-1.26.2.json",
        "473c2eab85f294d0f9169306db8630bcdaa47dea080f48dd0303575b0a6f9ae3",
        "wand.db03.public-quest-rewards@1",
    ),
    "recipes": (
        "static/acquisition/public/recipe-results-1.26.2.json",
        "ee767b8808f9bef078234d978c3893b5a9649050c7ccf8ee460bd3a32ef02f0e",
        "wand.db02.native-recipe-results@1",
    ),
    "activities": (
        "static/acquisition/public/activity-result-paths-1.26.2.json",
        "97d02a35dbe78dab637f4eda7d6fdf61cf528bb77aab6f684483a5cf542eebbb",
        "wand.db02.native-activity-results@1",
    ),
    "pets": (
        "static/acquisition/public/pet-source-categories-1.26.2.json",
        "7a582908a3b89df6508ab36ae59bcf2ba88c580e8ad1167e5852e7b1f4203975",
        "wand.db02.native-pet-source-categories@1",
    ),
    "online": (
        "static/acquisition/public/online-categories-1.26.2.json",
        "abece12c9fc204abc13cc8dbe071e5e393fd3bee27f0dc4ba9901cf609cf0170",
        "wand.db02.native-online-category@1",
    ),
}
# Names are stable across DB-01/DB-00 consumers. Subtypes remain independently
# identifiable, rather than flattening Twitch Drops and codes into one label.
DETAILS = {
    "ordinary_gameplay": (
        "cooking", "crafting", "fishing", "mining", "timebending",
        "farming", "quest_reward_candidate", "friendship_reward_candidate",
        "pet_quest", "pet_timebending",
    ),
    "premium_shop": ("shop_offer", "archived_shop_offer", "pet_premium_shop"),
    "star_path": ("free_reward", "premium_reward", "vault_reward", "pet_star_path"),
    "in_game_limited_event": (
        "mini_event_reward_candidate", "floating_festival_reward_candidate",
        "pet_event",
    ),
    "real_time_limited_event": (
        "exclusive_promotion_unspecified", "twitch_drop", "redeem_code",
    ),
    "iap_package_reward": ("iap_package_direct_reward", "iap_package_extended_reward"),
}
# No per-row timestamps, sale price, native code or external campaign identity.
BASIS = {
    "cooking": "configured_result", "crafting": "configured_result",
    "fishing": "configured_result", "mining": "configured_result",
    "timebending": "configured_result", "farming": "configured_result",
    "quest_reward_candidate": "static_candidate",
    "friendship_reward_candidate": "static_candidate",
    "pet_quest": "native_category_only",
    "pet_timebending": "native_category_only",
    "shop_offer": "configured_item_link",
    "archived_shop_offer": "configured_item_link_from_older_archive",
    "pet_premium_shop": "native_category_only",
    "free_reward": "configured_item_link",
    "premium_reward": "configured_item_link",
    "vault_reward": "configured_item_link",
    "pet_star_path": "native_category_only",
    "mini_event_reward_candidate": "static_candidate",
    "floating_festival_reward_candidate": "static_candidate",
    "pet_event": "native_category_only",
    "exclusive_promotion_unspecified": "native_category_only",
    "twitch_drop": "no_original_item_link_available",
    "redeem_code": "no_original_item_link_available",
    "iap_package_direct_reward": "configured_item_link",
    "iap_package_extended_reward": "configured_item_link",
}
ID_MAX = 9007199254740991


def require(ok: bool, code: str) -> None:
    if not ok:
        raise ValueError("DB02_DB01_HANDOFF_" + code)


def normalized_id(value: object) -> str:
    # The exact numeric Item ID (not a name, SKU, offer, tag or receipt).
    require(type(value) in (int, str), "INVALID_ID_TYPE")
    s = str(value)
    require(s.isdecimal() and not s.startswith("0") and
            0 < int(s) <= ID_MAX, "INVALID_ITEM_ID")
    return s


def read_sources(root: Path) -> dict:
    loaded = {}
    for key, (path, sha, schema) in SOURCES.items():
        data = (root / path).read_bytes()
        require(hashlib.sha256(data).hexdigest() == sha, "SOURCE_SHA_" + key)
        row = json.loads(data)
        require(row.get("schema") == schema, "SOURCE_SCHEMA_" + key)
        if key == "star_path":
            source = row.get("source", {})
            require(source.get("platform") == "Steam" and
                    source.get("ownerDeclaredGameVersion") == "1.26.2",
                    "STAR_PATH_VERSION")
        else:
            target = row.get("target", {})
            # July archived store source has no independently verified full
            # game build. Its target is null, NOT invented as Steam 1.26.2.
            required_version = None if key == "shop_archive" else "1.26.2"
            require(target.get("platform") == "Steam" and
                    target.get("gameVersion") == required_version,
                    "SOURCE_TARGET_" + key)
        loaded[key] = row
    return loaded


def build(root: Path = ROOT) -> dict:
    d = read_sources(root)
    by_item: dict[str, dict[str, set[str]]] = {}
    online: dict[str, set[str]] = {}
    relation_counts: dict[str, int] = {}
    def add(item: object, category: str, detail: str, key: str):
        require(category in CATEGORIES and detail in DETAILS[category],
                "UNKNOWN_CLASSIFICATION")
        id_ = normalized_id(item)
        by_item.setdefault(id_, {}).setdefault(category, set()).add(detail)
        relation_counts[key] = relation_counts.get(key, 0) + 1

    for key, detail, n in (("shop_current", "shop_offer", 156),
                            ("shop_archive", "archived_shop_offer", 128)):
        row = d[key]
        require(len(row["offers"]) == (29 if key == "shop_current" else 27),
                "SHOP_OFFERS")
        count = 0
        for offer in row["offers"]:
            for item in offer[5]:
                add(item[0], "premium_shop", detail, key)
                count += 1
        require(count == n, "SHOP_ITEMS_" + key)

    for package in d["iap"]["packages"]:
        for reward in package[9]:
            add(reward[0], "iap_package_reward", "iap_package_direct_reward",
                "iap_direct")
        for reward in package[10]:
            add(reward[0], "iap_package_reward", "iap_package_extended_reward",
                "iap_extended")
    require(relation_counts.get("iap_direct") == 150 and
            relation_counts.get("iap_extended") == 141 and
            len(d["iap"]["packages"]) == 53, "IAP_CENSUS")

    for season in d["star_path"]["seasons"]:
        for page in (season["rewardPages"] + season["bonusPages"]):
            for reward in page["rewards"]:
                detail = "premium_reward" if reward["premium"] else "free_reward"
                add(reward["itemId"], "star_path", detail, "star_path")
        for reward in season["vaultRewards"]:
            # Alternate item ID is a candidate, NOT the granted reward.
            add(reward["itemId"], "star_path", "vault_reward", "star_path")
    require(relation_counts.get("star_path") == 67 and
            len(d["star_path"]["seasons"]) == 2, "STAR_PATH_CENSUS")

    for event in d["event_friendship"]["events"]:
        require(event["kind"] in ("mini_event", "floating_festival"),
                "EVENT_FAMILY")
        detail = ("mini_event_reward_candidate" if event["kind"] == "mini_event"
                  else "floating_festival_reward_candidate")
        for reward in event["rewards"]:
            add(reward[2], "in_game_limited_event", detail, "event")
    for reward in d["event_friendship"]["defaultFriendshipRewards"]:
        add(reward[3], "ordinary_gameplay", "friendship_reward_candidate",
            "friendship")
    require(relation_counts.get("event") == 202 and
            relation_counts.get("friendship") == 16, "EVENT_CENSUS")

    for quest in d["quest"]["rows"].values():
        for currency in quest.get("currency", []):
            add(currency[0], "ordinary_gameplay", "quest_reward_candidate",
                "quest")
        for loot in quest.get("additionalLoot", []):
            add(loot[2], "ordinary_gameplay", "quest_reward_candidate", "quest")
    require(relation_counts.get("quest") == 395, "QUEST_CENSUS")

    for recipe in d["recipes"]["recipes"]:
        require(recipe[1] in (0, 1), "RECIPE_METHOD")
        detail = "cooking" if recipe[1] == 0 else "crafting"
        add(recipe[2], "ordinary_gameplay", detail, "recipes")
    require(relation_counts.get("recipes") == 1943, "RECIPES_CENSUS")

    methods = ("fishing", "mining", "timebending", "farming")
    for path in d["activities"]["paths"]:
        require(path[1] in range(4), "ACTIVITY_METHOD")
        add(path[2], "ordinary_gameplay", methods[path[1]], "activities")
    require(relation_counts.get("activities") == 763, "ACTIVITIES_CENSUS")

    pets = {
        "quest": ("ordinary_gameplay", "pet_quest", 8),
        "timebending": ("ordinary_gameplay", "pet_timebending", 1),
        "event": ("in_game_limited_event", "pet_event", 9),
        "star_path": ("star_path", "pet_star_path", 7),
        "premium_shop": ("premium_shop", "pet_premium_shop", 95),
        "exclusive_promotion": (
            "real_time_limited_event", "exclusive_promotion_unspecified", 14),
    }
    require(len(d["pets"]["categories"]) == 6, "PET_FAMILIES")
    for kind, item_ids in d["pets"]["categories"]:
        require(kind in pets, "PET_SOURCE")
        category, detail, expected = pets[kind]
        require(len(item_ids) == expected, "PET_SOURCE_COUNT")
        for id_ in item_ids:
            add(id_, category, detail, "pets")
    require(relation_counts.get("pets") == 134, "PET_CENSUS")

    for family in d["online"]["families"]:
        for flag, source_name in (("premium", "premium"),
                                  ("time_limited", "timeLimited")):
            for raw in family[source_name]:
                online.setdefault(normalized_id(raw), set()).add(flag)
    require(sum(flag in hints for hints in online.values()
                for flag in hints) == 2198 and
            sum("premium" in flags for flags in online.values()) == 1830 and
            sum("time_limited" in flags for flags in online.values()) == 368,
            "ONLINE_CENSUS")
    # OnlineCategory.Premium and TimeLimited are NOT item-acquisition methods.
    # They can only appear as separate, explicitly unresolved original hints.
    ids = sorted(set(by_item) | set(online), key=int)
    items = [
        [
            id_,
            [[category, [d for d in DETAILS[category]
                         if d in by_item.get(id_, {}).get(category, ())]]
             for category in CATEGORIES if category in by_item.get(id_, {})],
            [flag for flag in ("premium", "time_limited")
             if flag in online.get(id_, ())],
        ]
        for id_ in ids
    ]
    distinct = {c: sum(c in groups for groups in by_item.values())
                for c in CATEGORIES}
    ambiguous = sum(id_ not in by_item for id_ in online)
    require(all(len(row[1]) or len(row[2]) for row in items),
            "EMPTY_ITEM_RECORD")
    require(distinct["real_time_limited_event"] >= 14 and
            distinct["premium_shop"] >= 186 and
            distinct["ordinary_gameplay"] >= 1912, "COVERAGE_REGRESSION")
    return {
        "schema": SCHEMA,
        "target": {"platform": "Steam", "gameVersion": "1.26.2"},
        "categoryOrder": list(CATEGORIES),
        "details": {k: list(v) for k, v in DETAILS.items()},
        "detailEvidenceLevel": BASIS,
        "sources": {key: {"path": path, "sha256": sha}
                    for key, (path, sha, _) in SOURCES.items()},
        "coverage": {
            "allGameItemIdsCovered": False,
            "missingItemIdMeans": "unclassified_not_unobtainable",
            "separateActiveAvailabilityVerified": False,
            "twitchDropItemIdLinks": 0,
            "redeemCodeItemIdLinks": 0,
            "distinctClassifiedItemIds": len(by_item),
            "distinctOriginalOnlineHintItemIds": len(online),
            "unclassifiedWithOriginalOnlineHints": ambiguous,
            "recordsIncludingUnresolvedHints": len(items),
            "itemIdsByCategory": distinct,
            "sourceRelationOccurrences": {
                key: relation_counts[key] for key in sorted(relation_counts)
            },
        },
        "items": items,
    }


def serialized(root: Path = ROOT) -> bytes:
    return (json.dumps(build(root), ensure_ascii=False,
                       separators=(",", ":")) + "\n").encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = serialized()
    dst = ROOT / OUTPUT
    if args.check:
        require(dst.is_file() and dst.read_bytes() == data,
                "OUTDATED_OR_CORRUPT_HANDOFF")
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
    report = json.loads(data)["coverage"]
    print(json.dumps({"output": OUTPUT, "sha256": hashlib.sha256(data).hexdigest(),
                      "coverage": report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
