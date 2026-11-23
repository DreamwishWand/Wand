#!/usr/bin/env python3
"""Public *projection* of Steam v1.26.2 native recipe results.

Read ONLY the original ddv_Data/StreamingAssets/itemlist/ActivityData.json.
Never read, copy or publish the owner-private SRC-02 r5 snapshot, private Save,
unknown runtime conditions or original full game source. Source Item/Tag
selectors are kept distinct; no live unlock or crafting claim is made.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from acquisition import parse_activity, PINNED

ORIGINAL_SHA = "2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296"
OUTPUT_SHA = "ee767b8808f9bef078234d978c3893b5a9649050c7ccf8ee460bd3a32ef02f0e"
OUTPUT_BYTES = 150180

def require(ok: bool, error: str) -> None:
    if not ok:
        raise ValueError("DB02_PUBLIC_RECIPE_" + error)

def convert_ingredient(row: dict, crafting: bool) -> list:
    kind = row["kind"]
    if kind == "item":
        value = row["itemId"]
        amount = row["quantity"]
        require(isinstance(value, int) and value > 0, "INGREDIENT_ID")
        require(isinstance(amount, int) and amount > 0, "INGREDIENT_AMOUNT")
        require(not crafting or amount > 0, "CRAFT_INGREDIENT")
        return [0, value, amount] if crafting else [0, value]
    require(not crafting, "CRAFT_SELECTOR_NOT_ITEM")
    if kind == "anyTag":
        value = row["tagId"]
        require(isinstance(value, int) and value > 0, "TAG_ID")
        return [1, value]
    if kind in ("itemAlternatives", "tagAlternatives"):
        values = row["itemIds" if kind == "itemAlternatives" else "tagIds"]
        require(bool(values) and all(isinstance(i, int) and i > 0 for i in values),
                "ALTERNATIVE_IDS")
        return [2 if kind == "itemAlternatives" else 3, sorted(set(values))]
    raise ValueError("DB02_PUBLIC_RECIPE_UNKNOWN_SELECTOR")

def generate(original: Path) -> bytes:
    data = original.read_bytes()
    require(PINNED["activity"] == ORIGINAL_SHA, "PARSER_VERSION_PIN")
    require(len(data) == 260627 and hashlib.sha256(data).hexdigest() == ORIGINAL_SHA,
            "ORIGINAL_SOURCE_PIN")
    recipes, paths, unsupported = parse_activity(data)
    require(len(recipes) == 1943 and len(paths) == 663 and len(unsupported) == 24,
            "SOURCE_ACTIVITY_CENSUS")
    rows: list[list] = []
    for recipe in recipes:
        crafting = recipe["type"] == "crafting"
        require(crafting or recipe["type"] == "cooking", "RECIPE_KIND")
        recipe_id, item_id, quantity = (
            recipe["recipeId"], recipe["resultItemId"], recipe["resultQuantity"])
        require(isinstance(recipe_id, int) and recipe_id > 0 and
                isinstance(item_id, int) and item_id > 0, "RECIPE_IDS")
        require(crafting == (quantity is not None), "RECIPE_QUANTITY")
        ingredients = [convert_ingredient(ingredient, crafting)
                       for ingredient in recipe["ingredients"]]
        rows.append([recipe_id, 1 if crafting else 0, item_id, quantity, ingredients])
    rows.sort(key=lambda x: x[0])
    require(len({row[0] for row in rows}) == 1943, "RECIPE_ID_UNIQUE")
    require(len({row[2] for row in rows}) == 1912, "RECIPE_OUTPUT_ID_UNIQUE")
    require(sum(row[1] == 1 for row in rows) == 1318 and
            sum(row[1] == 0 for row in rows) == 625, "RECIPE_TYPE_CENSUS")
    payload = {
        "schema": "wand.db02.native-recipe-results@1",
        "target": {"platform": "Steam", "gameVersion": "1.26.2"},
        "source": {
            "file": "ddv_Data/StreamingAssets/itemlist/ActivityData.json",
            "sha256": ORIGINAL_SHA, "bytes": 260627,
        },
        "coverage": {
            "sourceActivityDefinitions": 2630,
            "recipeDefinitions": 1943,
            "craftingRecipes": 1318,
            "cookingRecipes": 625,
            "distinctResultItemIds": 1912,
            "playerCanCraftVerified": False,
            "recipeUnlockedVerified": False,
            "cookingYieldKnown": False,
            "liveConditionsEvaluated": False,
            "allAcquisitionRoutesCovered": False,
        },
        "ingredientEncoding": {
            "0": "item", "1": "any_tag",
            "2": "item_alternatives", "3": "tag_alternatives",
        },
        "recipes": rows,
    }
    projection = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    require(len(projection) == OUTPUT_BYTES and
            hashlib.sha256(projection).hexdigest() == OUTPUT_SHA,
            "PUBLIC_BYTE_PIN")
    return projection

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--activity-data", type=Path, required=True,
                        help="Original Steam 1.26.2 itemlist/ActivityData.json")
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    data = generate(options.activity_data)
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_bytes(data)
    print(f"verified 1943 recipes ({len(data)} bytes; sha256={OUTPUT_SHA})")

if __name__ == "__main__":
    main()
