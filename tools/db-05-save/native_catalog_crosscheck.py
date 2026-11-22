#!/usr/bin/env python3
"""Owner-private DB-05 crosscheck against DB-01's complete SHA-audited catalog.

Input: strictly decoded save JSON on stdin (prefer the Node strict P1G wrapper).
Output: anonymous counts on stdout. Never writes, prints or stores private IDs,
save values, native names, source paths, account information, or game assets.

A reference ID existing in native metadata is not proof of item ownership,
entitlement, reward availability, gameplay correctness or Writer compatibility.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import zipfile

CATALOG_SCHEMA = "wand.db01.items@1"
REPORT_SCHEMA = "wand.db05.owner-private-save-native-catalog-crosscheck@1"
MAX_JSON_BYTES = 96 * 1024 * 1024
MAX_ZIP_BYTES = 128 * 1024 * 1024
MAX_DEFINITIONS = 100_000
MAX_FAMILY_REFERENCES = 200_000
MAX_BRANCHES = 200_000
SAFE_INT = 2 ** 53 - 1
EXPECTED_CATEGORY = {
    "achievement_duty_id": "DutyAch",
    "active_mission_slot": "Mission",
    "village_scene": "Scene",
}
# A fixed, public field-source list; private map keys are never output.
FAMILIES = (
    ("inventory_item_key", "Player/ListInventories/{}/Inventory/{key}"),
    ("chest_item", "Player/ContainerInventories/{}/Inventory[]/ItemID"),
    ("collection_item_key", "Player/CollectionSets[]/GroupData[]/GroupsCollectionItems/{key}"),
    ("placed_grid_object_item", "World/GridCollection/Grids/{}/Objects/{}/ItemID"),
    ("modified_grid_object_item", "World/GridCollection/DiffGrids/{}/ModifiedObjects/{}/ItemID"),
    ("container_parent_item", "Player/ContainerInventories/{}/ParentItemID"),
    ("active_mission_slot", "World/MissionSlots/{}/Slots[]/MissionId"),
    ("achievement_duty_id", "Player/AchievementsData[]/AchievementID"),
    ("mount_item", "Player/Mounts[]/MountItemID"),
    ("village_scene", "World/Villages[]/SceneItemId"),
)
GRID_RULE = "native_grid_source_path"


def fail(message: str) -> None:
    raise ValueError("DB05_NATIVE_CATALOG_" + message)


def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def object_pairs(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            fail("DUPLICATE_JSON_FIELD")
        obj[key] = value
    return obj


def strict_json(blob: bytes):
    def parse_int(text):
        value = int(text)
        if not -SAFE_INT <= value <= SAFE_INT:
            fail("UNSAFE_JSON_INTEGER")
        return value

    def bad_constant(_):
        fail("NONFINITE_JSON_NUMBER")

    def parse_float(text):
        value = float(text)
        if not math.isfinite(value):
            fail("NONFINITE_JSON_NUMBER")
        return value

    return json.loads(
        blob.decode("utf-8", errors="strict"),
        object_pairs_hook=object_pairs, parse_int=parse_int,
        parse_float=parse_float, parse_constant=bad_constant,
    )


def check_source_release(archive: Path, expected_sha256: str):
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        fail("EXPECTED_CATALOG_SHA_REQUIRED")
    if not archive.is_file() or archive.stat().st_size > MAX_ZIP_BYTES:
        fail("CATALOG_SIZE_INVALID")
    with archive.open("rb") as fh:
        h = hashlib.sha256()
        for piece in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(piece)
        if h.hexdigest() != expected_sha256:
            fail("PINNED_CATALOG_ARCHIVE_SHA_MISMATCH")

    with zipfile.ZipFile(archive) as z:
        names = set(z.namelist())
        if len(names) > 512 or len(names) != len(z.namelist()):
            fail("CATALOG_ARCHIVE_MEMBER_COUNT_INVALID")
        for mandatory in (
            "catalog/manifest.json", "shards/manifest.json",
            "release-acceptance.json",
        ):
            if mandatory not in names:
                fail("CATALOG_MANIFEST_MISSING")
            if z.getinfo(mandatory).file_size > 2 * 1024 * 1024:
                fail("CATALOG_MANIFEST_OVERSIZED")
        acceptance = strict_json(z.read("release-acceptance.json"))
        catalog_bytes = z.read("catalog/manifest.json")
        shard_bytes = z.read("shards/manifest.json")
        catalog = strict_json(catalog_bytes)
        shard_manifest = strict_json(shard_bytes)

        if (acceptance.get("status") != "PASS" or
            acceptance.get("schema") != "wand.db01.private-release-acceptance@1" or
            acceptance.get("privateOnly") is not True or
            acceptance.get("publicationAuthorized") is not False or
            (not isinstance(acceptance.get("itemlistFilesVerified"), int) or
             acceptance.get("itemlistFilesVerified") < 1) or
            (not isinstance(acceptance.get("definitionCount"), int) or
             not 0 < acceptance.get("definitionCount") <= MAX_DEFINITIONS) or
            acceptance.get("sourceCatalogSha256") != sha256(catalog_bytes) or
            acceptance.get("shardsManifestSha256") != sha256(shard_bytes) or
            catalog.get("schema") != CATALOG_SCHEMA or
            catalog.get("counts", {}).get("currentDefinitions") != acceptance.get("definitionCount") or
            catalog.get("sourceFilesFullyShaVerified") != acceptance.get("itemlistFilesVerified") or
            catalog.get("sourceFilesTotal") != acceptance.get("itemlistFilesVerified") or
            catalog.get("fullCorpusParsed") is not True or
            catalog.get("publicationAuthorized") is not False or
            catalog.get("gameVersion") != acceptance.get("version") or
            shard_manifest.get("definitions") != acceptance.get("definitionCount")):
            fail("CATALOG_RELEASE_PROVENANCE_INVALID")
        categories = shard_manifest.get("categories")
        if (not isinstance(categories, list) or not 0 < len(categories) <= 128 or
            len(set(categories)) != len(categories)):
            fail("CATALOG_CATEGORY_INDEX_INVALID")
        source_hashes = catalog["source"]["individualOriginalFileHashes"]
        index = {}
        native_category_counts = Counter()
        domain_counts = Counter()
        for category in categories:
            if not isinstance(category, str) or not re.fullmatch(r"[A-Za-z]+", category):
                fail("CATALOG_CATEGORY_NAME_INVALID")
            path = "shards/category/" + category + ".json"
            meta = shard_manifest.get("files", {}).get("category/" + category + ".json")
            if path not in names or not isinstance(meta, dict):
                fail("CATALOG_SHARD_MISSING")
            info = z.getinfo(path)
            if info.file_size > 8 * 1024 * 1024:
                fail("CATALOG_SHARD_TOO_LARGE")
            blob = z.read(path)
            if len(blob) != meta.get("bytes") or sha256(blob) != meta.get("sha256"):
                fail("CATALOG_SHARD_HASH_MISMATCH")
            rows = strict_json(blob)
            if not isinstance(rows, list) or len(rows) != meta.get("count"):
                fail("CATALOG_SHARD_COUNT_MISMATCH")
            original = source_hashes.get(
                "ddv_Data/StreamingAssets/itemlist/" + category + ".json"
            )
            if not isinstance(original, dict):
                fail("CATALOG_ORIGINAL_FILE_PROVENANCE_MISSING")
            for row in rows:
                if not isinstance(row, dict):
                    fail("CATALOG_DEFINITION_INVALID")
                item_id = row.get("itemId")
                domain = row.get("catalogDomain")
                if (type(item_id) is not int or not 0 < item_id <= SAFE_INT or
                    item_id in index or row.get("nativeCategory") != category or
                    domain not in ("item", "definition_unclassified") or
                    row.get("sourceSha256") != original.get("sha256")):
                    fail("CATALOG_SOURCE_DEFINITION_CONFLICT")
                index[item_id] = (category, domain)
                native_category_counts[category] += 1
                domain_counts[domain] += 1
                if len(index) > MAX_DEFINITIONS:
                    fail("CATALOG_DEFINITIONS_BOUNDED")
        if (len(index) != acceptance["definitionCount"] or
            native_category_counts != catalog.get("byNativeCategory")):
            fail("CATALOG_DEFINITION_TOTAL_MISMATCH")

    # The release's original source-file SHA audit is inherited evidence;
    # this program independently SHA-verifies the distributed catalog shards.
    return {
        "index": index,
        "version": acceptance["version"],
        "platform": acceptance["platform"],
        "definitions": len(index),
        "shardsVerified": len(categories),
        "domains": dict(sorted(domain_counts.items())),
    }


def limited_map(value):
    if not isinstance(value, dict):
        fail("SAVE_MAP_KIND_UNEXPECTED")
    if len(value) > MAX_BRANCHES:
        fail("SAVE_MAP_TOO_LARGE")
    return value.values()


def limited_array(value):
    if not isinstance(value, list):
        fail("SAVE_ARRAY_KIND_UNEXPECTED")
    if len(value) > MAX_BRANCHES:
        fail("SAVE_ARRAY_TOO_LARGE")
    return value


def records(save):
    if not isinstance(save, dict):
        fail("SAVE_ROOT_INVALID")
    p = save.get("Player")
    w = save.get("World")
    if not isinstance(p, dict) or not isinstance(w, dict):
        fail("SAVE_ROOT_INVALID")
    grid = w.get("GridCollection")
    if not isinstance(grid, dict):
        fail("SAVE_GRID_ROOT_INVALID")
    out = {name: [] for name, _ in FAMILIES}

    def append(name, iterable):
        target = out[name]
        for value in iterable:
            if len(target) >= MAX_FAMILY_REFERENCES:
                fail("SAVE_FAMILY_TOO_LARGE")
            target.append(value)

    inventories = p.get("ListInventories", {})
    for inv in limited_map(inventories):
        if not isinstance(inv, dict):
            fail("SAVE_INVENTORY_KIND_INVALID")
        slots = inv.get("Inventory", {})
        if not isinstance(slots, dict):
            fail("SAVE_INVENTORY_SLOT_KIND_INVALID")
        append("inventory_item_key", slots.keys())

    containers = p.get("ContainerInventories", {})
    for chest in limited_map(containers):
        if not isinstance(chest, dict):
            fail("SAVE_CHEST_KIND_INVALID")
        append("container_parent_item", [chest.get("ParentItemID")])
        append("chest_item", (
            slot.get("ItemID") if isinstance(slot, dict) else None
            for slot in limited_array(chest.get("Inventory", []))
        ))

    for collection in limited_array(p.get("CollectionSets", [])):
        if not isinstance(collection, dict):
            fail("SAVE_COLLECTION_KIND_INVALID")
        for group in limited_array(collection.get("GroupData", [])):
            if not isinstance(group, dict):
                fail("SAVE_COLLECTION_GROUP_KIND_INVALID")
            items = group.get("GroupsCollectionItems", {})
            if not isinstance(items, dict):
                fail("SAVE_COLLECTION_ITEMS_KIND_INVALID")
            append("collection_item_key", items.keys())

    for group in limited_map(grid.get("Grids", {})):
        if not isinstance(group, dict):
            fail("SAVE_GRID_KIND_INVALID")
        append("placed_grid_object_item", (
            v.get("ItemID") if isinstance(v, dict) else None
            for v in limited_map(group.get("Objects", {}))
        ))

    for group in limited_map(grid.get("DiffGrids", {})):
        if not isinstance(group, dict):
            fail("SAVE_DIFF_GRID_KIND_INVALID")
        append("modified_grid_object_item", (
            v.get("ItemID") if isinstance(v, dict) else None
            for v in limited_map(group.get("ModifiedObjects", {}))
        ))

    for slot_group in limited_map(w.get("MissionSlots", {})):
        if not isinstance(slot_group, dict):
            fail("SAVE_MISSION_GROUP_KIND_INVALID")
        append("active_mission_slot", (
            entry.get("MissionId") if isinstance(entry, dict) else None
            for entry in limited_array(slot_group.get("Slots", []))
        ))

    append("achievement_duty_id", (
        row.get("AchievementID") if isinstance(row, dict) else None
        for row in limited_array(p.get("AchievementsData", []))
    ))
    append("mount_item", (
        row.get("MountItemID") if isinstance(row, dict) else None
        for row in limited_array(p.get("Mounts", []))
    ))
    append("village_scene", (
        row.get("SceneItemId") if isinstance(row, dict) else None
        for row in limited_array(w.get("Villages", []))
    ))
    return out, [group.get("GridDataPath") for group in
                 limited_map(grid.get("Grids", {})) if isinstance(group, dict)]


def scan(save, catalog):
    family_values, grid_paths = records(save)
    index = catalog["index"]
    rows = []
    totals = Counter()
    for name, _ in FAMILIES:
        ref_values = family_values[name]
        matched = unindexed = zero = nulls = malformed = category_mismatch = 0
        normal_item = other_definition = 0
        distinct_matched, distinct_unindexed = set(), set()
        for value in ref_values:
            if name in ("inventory_item_key", "collection_item_key"):
                if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]*", value):
                    malformed += 1
                    continue
                ident = int(value)
                if ident > SAFE_INT or str(ident) != value:
                    malformed += 1
                    continue
            elif value is None and name == "container_parent_item":
                nulls += 1
                continue
            elif type(value) is int and value == 0:
                zero += 1
                continue
            elif type(value) is not int or not 0 < value <= SAFE_INT:
                malformed += 1
                continue
            else:
                ident = value
            native = index.get(ident)
            if native is None:
                unindexed += 1
                distinct_unindexed.add(ident)
                continue
            matched += 1
            distinct_matched.add(ident)
            if native[1] == "item":
                normal_item += 1
            else:
                other_definition += 1
            if name in EXPECTED_CATEGORY and native[0] != EXPECTED_CATEGORY[name]:
                category_mismatch += 1
        row = {
            "id": name,
            "observed": len(ref_values),
            "matchedSourceDefinitions": matched,
            "unindexedInSuppliedDb01Catalog": unindexed,
            "expectedNativeCategoryMismatch": category_mismatch,
            "itemDomainReferences": normal_item,
            "nonItemDefinitionReferences": other_definition,
            "distinctMatchedDefinitions": len(distinct_matched),
            "distinctUnindexedDefinitions": len(distinct_unindexed),
            "zeroSentinels": zero,
            "nullSentinels": nulls,
            "malformed": malformed,
            "exactIdNotProofOfOwnership": True,
            "editorWriterAuthorized": False,
        }
        rows.append(row)
        totals.update({
            "observed": row["observed"],
            "matchedSourceDefinitions": matched,
            "unindexedInSuppliedDb01Catalog": unindexed,
            "expectedNativeCategoryMismatch": category_mismatch,
            "nullSentinels": nulls,
            "zeroSentinels": zero,
            "malformed": malformed,
        })
    grid_paths_valid = sum(isinstance(v, str) and bool(v) for v in grid_paths)
    safe_grid_observations = {
        "id": GRID_RULE,
        "observed": len(grid_paths),
        "nonempty": grid_paths_valid,
        "distinctPaths": len(set(x for x in grid_paths if isinstance(x, str))),
        "db04NativePathIndexSupplied": False,
        "sourcePathMatchesVerified": False,
        "numericGridIdUsedAsNativeSourceKey": False,
        "editorWriterAuthorized": False,
    }
    schema = save.get("GameInfo", {}).get("Version")
    if type(schema) is not int or not 0 <= schema <= SAFE_INT:
        schema = None
    device = save.get("GameInfo", {}).get("LastSaveDeviceInfo")
    device_type = device.get("deviceType") if isinstance(device, dict) else None
    observed_switch = device_type == "DeviceType_Switch"
    return {
        "schema": REPORT_SCHEMA,
        "status": (
            "all_observed_non_sentinel_references_catalogued"
            if not totals["unindexedInSuppliedDb01Catalog"] and
               not totals["malformed"] and
               not totals["expectedNativeCategoryMismatch"]
            else "partial_or_inconclusive_native_id_coverage"
        ),
        "catalog": {
            "gameVersion": catalog["version"],
            "platform": catalog["platform"],
            "definitionRecords": catalog["definitions"],
            "categoryShardsIndependentlyShaVerified": catalog["shardsVerified"],
            "zipShaMatchesOwnerPinnedExpected": True,
            "originalNativeGameSourceBytesIndependentlyRehashedHere": False,
            "releaseSourceEvidenceInheritsDb01Audit": True,
        },
        "save": {
            "observedSchemaVersion": schema,
            "switchDeviceTypeObserved": observed_switch,
            "saveBuildIndependentlyMatchedToSteamBuild": False,
        },
        "families": rows,
        "gridSources": safe_grid_observations,
        "totals": dict(totals),
        "claims": {
            "allGameContentCovered": False,
            "itemOwnershipVerified": False,
            "saveAndSourceBuildJointlyAttested": False,
            "rewardGrantedVerified": False,
            "questCompletionVerified": False,
            "placementPermissionVerified": False,
            "originalSaveBytesModified": False,
            "sourceOriginalsModified": False,
            "editorWriterAuthorized": False,
            "exportAuthorized": False,
        }
    }


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--expected-catalog-sha256", required=True)
    args = parser.parse_args()
    source = sys.stdin.buffer.read(MAX_JSON_BYTES + 1)
    if not source or len(source) > MAX_JSON_BYTES:
        fail("SAVE_INPUT_TOO_LARGE")
    root = strict_json(source)
    catalog = check_source_release(
        Path(args.catalog), args.expected_catalog_sha256,
    )
    result = scan(root, catalog)
    sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Even parser/decode exceptions can contain original strings and paths.
        # A caller must never print private source data from this executable.
        sys.stderr.write("DB05_PRIVATE_NATIVE_CATALOG_CROSSCHECK_FAILED\n")
        sys.exit(1)
