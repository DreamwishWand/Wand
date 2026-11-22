#!/usr/bin/env python3
"""DB-04 owner-private exact-source world/area/grid/item-reference graph.

Offline only. It deliberately does NOT equate:
  origin world, acquisition world, native default placement,
  player save placement, or placement permission.
All game-derived output goes outside the public Git checkout.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

SCHEMA = "wand.db04.native-reference-graph@1"
FILES = ("manifest", "worlds", "scenes", "areas", "layouts", "grids", "layoutObjects")
MAX_TOTAL = 256 * 1024 * 1024
MAX_MEMBER = 128 * 1024 * 1024
ALLOWED_STATUSES = {
    "partial_game_native_evidence",
    # Owner-private extended source subset. This is not a public release gate.
    "native_partial_world_extraction_preview",
}
HASH = re.compile(r"[a-f0-9]{64}\Z")


def require(condition, message):
    if not condition:
        raise ValueError("DB04_REFERENCE_GRAPH:" + message)


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":")) + "\n").encode("utf-8")


def decimal(value, label):
    require(type(value) is int and value >= 0, "INVALID_" + label)
    return value


def source_path(value, prefix):
    require(isinstance(value, str) and value.startswith(prefix) and
            value.endswith(".json") and ".." not in value and
            "\\" not in value, "INVALID_SOURCE_PATH")
    return value


def load_snapshot(path):
    """Strict byte-integrity check. SHA self-consistency is not publisher trust."""
    path = Path(path)
    if path.is_file():
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            names = [i.filename for i in infos]
            require(len(names) == len(set(names)) and len(names) < 200,
                    "DUPLICATE_OR_EXCESS_ZIP_ENTRIES")
            require(all(i.file_size <= MAX_MEMBER for i in infos) and
                    sum(i.file_size for i in infos) <= MAX_TOTAL,
                    "OVERSIZED_PRIVATE_ZIP")
            require(all("/" not in n and "\\" not in n and not n.startswith(".")
                        for n in names), "UNSAFE_PRIVATE_ZIP_MEMBER")
            def read(name):
                require(name in names, "MISSING_" + name)
                return archive.read(name)
            raw = {name: read(name + ".json") for name in FILES}
    else:
        require(path.is_dir(), "PRIVATE_SOURCE_NOT_FOUND")
        def read(name):
            member = path / name
            require(member.is_file() and not member.is_symlink() and
                    member.stat().st_size <= MAX_MEMBER, "INVALID_SOURCE_FILE")
            return member.read_bytes()
        raw = {name: read(name + ".json") for name in FILES}
    result = {name: json.loads(data.decode("utf-8-sig"))
              for name, data in raw.items()}
    m = result["manifest"]
    require(isinstance(m, dict) and m.get("schema") == "wand.db04.world@1" and
            m.get("status") in ALLOWED_STATUSES and
            m.get("platform") == "Steam" and
            isinstance(m.get("gameVersion"), str), "INVALID_PRIVATE_MANIFEST")
    registry = m.get("outputSha256")
    require(isinstance(registry, dict), "MISSING_SHA_REGISTRY")
    for name, data in raw.items():
        if name == "manifest":
            continue
        expected = registry.get(name + ".json")
        require(isinstance(expected, str) and HASH.fullmatch(expected) and
                hashlib.sha256(data).hexdigest() == expected,
                "SOURCE_HASH_MISMATCH_" + name)
    for name in FILES:
        if name != "manifest":
            require(isinstance(result[name], list), "INVALID_FAMILY_" + name)
    return result, hashlib.sha256(raw["manifest"]).hexdigest()


def unique(rows, key):
    lookup = {}
    for row in rows:
        require(isinstance(row, dict) and key in row, "MALFORMED_" + key)
        identity = row[key]
        require(isinstance(identity, (str, int)) and identity not in lookup,
                "DUPLICATE_" + key)
        lookup[identity] = row
    return lookup


def build_reference_graph(snapshot, manifest_digest):
    m = snapshot["manifest"]
    worlds = unique(snapshot["worlds"], "worldId")
    scenes = unique(snapshot["scenes"], "sceneId")
    native_areas = unique(snapshot["areas"], "areaId")
    layouts = unique(snapshot["layouts"], "layoutId")
    grids = unique(snapshot["grids"], "gridId")
    unique(snapshot["layoutObjects"], "layoutObjectId")

    # World entries include native Worlds! names *and* six derived DefaultVillage
    # paths. Preserve the actual identity kind rather than claiming a native ID.
    world_rows = []
    world_by_root = {}
    for world_id, row in sorted(worlds.items()):
        root = source_path(row.get("defaultGridLayoutPath"), "SceneLayouts/")
        kind = row.get("worldIdKind")
        require(kind in ("nativeWorldName", "derivedLayoutKey") and
                row.get("worldType") in ("realm", "village_layout"),
                "UNKNOWN_WORLD_IDENTITY_KIND")
        scene = row.get("sceneId")
        if scene is not None:
            decimal(scene, "WORLD_SCENE_ID")
            require(scene in scenes, "WORLD_SCENE_NOT_IN_SOURCE")
        linked = layouts.get(root)
        if kind == "derivedLayoutKey":
            require(world_id == "village-layout:" + root and
                    linked is not None and
                    linked.get("layoutKind") == "nativeDefaultVillageData",
                    "VILLAGE_DERIVED_ID_NOT_CORROBORATED")
            exact_scene = linked.get("defaultVillageSceneId")
            if exact_scene is not None:
                decimal(exact_scene, "VILLAGE_SCENE_ID")
                require(exact_scene in scenes, "VILLAGE_SCENE_NOT_IN_SOURCE")
                scene = exact_scene
        if root in world_by_root:
            raise ValueError("DB04_REFERENCE_GRAPH:DUPLICATE_WORLD_ROOT")
        world_by_root[root] = world_id
        world_rows.append({
            "worldId": world_id, "worldIdKind": kind,
            "worldType": row["worldType"],
            "nativeSceneId": scene,
            "defaultLayoutId": root,
            "sourceRootPresent": linked is not None,
            "sourceScopeLabel": root.split("/")[1],
            "nativeUniverseTagItemId": row.get("universeTagItemId"),
            "contentPackId": None,
            "contentPackRelationVerified": False,
            "worldCoverageComplete": False,
        })

    # The original Expansion04 village root explicitly contains three
    # 'separatedAreasRaw' root paths; this is a proven reference, not a claim
    # about spatial adjacency or DLC purchase.
    separated_parent = {}
    for root in layouts.values():
        if root.get("layoutKind") != "nativeDefaultVillageData":
            continue
        for child in root.get("separatedAreasRaw") or []:
            source_path(child, "SceneLayouts/")
            require(child not in separated_parent and child != root["layoutId"],
                    "AMBIGUOUS_SEPARATE_AREA_ROOT")
            separated_parent[child] = root["layoutId"]

    root_to_world = dict(world_by_root)
    for child_root, parent_root in sorted(separated_parent.items()):
        if parent_root in world_by_root:
            require(child_root not in root_to_world, "AMBIGUOUS_WORLD_PROJECTION")
            root_to_world[child_root] = world_by_root[parent_root]
    area_rows = []
    area_by_grid_layout = {}
    area_counts_by_world = Counter()
    unresolved_area_paths = []
    for root_id, root in sorted(layouts.items()):
        if root.get("layoutKind") != "nativeDefaultVillageData":
            continue
        scene = root.get("defaultVillageSceneId")
        if scene is not None:
            decimal(scene, "AREA_SCENE_ID")
            require(scene in scenes, "AREA_SCENE_NOT_IN_SOURCE")
        seen_codes = set()
        for area in root.get("areaLayoutReferences", []):
            decimal(area.get("nativeAreaTypeCode"), "AREA_TYPE")
            code = area["nativeAreaTypeCode"]
            require(code not in seen_codes, "DUPLICATE_NATIVE_AREA_TYPE_IN_ROOT")
            seen_codes.add(code)
            layout = source_path(area.get("gridLayoutPath"), "SceneLayouts/")
            ref_id = root_id + "#areaType=" + str(code)
            require(layout not in area_by_grid_layout,
                    "AMBIGUOUS_NATIVE_AREA_LAYOUT_PARENT")
            area_by_grid_layout[layout] = ref_id
            present = layout in layouts
            if not present:
                unresolved_area_paths.append(layout)
            world_id = root_to_world.get(root_id)
            # Only 8 published Area IDs are from protoDb.bin; the remaining
            # areaRefIds are stable composite *references*, not native IDs.
            native_id = str(scene) + ":" + str(code) if scene is not None else None
            native_area = native_areas.get(native_id)
            area_rows.append({
                "areaRefId": ref_id,
                "areaRefIdKind": "derivedRootLayoutAreaTypeComposite",
                "nativeAreaId": native_id if native_area else None,
                "nativeAreaTypeCode": code,
                "nativeAreaTypeName": area.get("nativeAreaTypeName"),
                "parentVillageLayoutId": root_id,
                "separateAreaParentLayoutId": separated_parent.get(root_id),
                "nativeSceneId": scene,
                "worldId": world_id,
                "gridLayoutId": layout,
                "gridLayoutPresent": present,
                "sourceProof": "Meta.DefaultVillageData.areaLayoutReferences",
                "sourceWorldRelationVerified": world_id is not None,
                "gameplayBiomeMembershipVerified": False,
                "placementLegalityVerified": False,
            })
            if world_id is not None:
                area_counts_by_world[world_id] += 1

    # Every Grid.ID is scoped by a literal source Layout path; Grid.ID alone
    # is NOT globally unique. Do not associate Houses or OffGridBuildings
    # with world locations using a naming convention.
    layout_to_world = {}
    for root_id, wid in root_to_world.items():
        if root_id in layouts:
            layout_to_world[root_id] = wid
    for area in area_rows:
        if area["gridLayoutPresent"] and area["worldId"] is not None:
            layout_to_world[area["gridLayoutId"]] = area["worldId"]
    grid_ref_rows, grid_ref_by_scoped_id = [], {}
    grid_ref_by_id = {}
    grid_count_by_world = Counter()
    for layout_id, layout in sorted(layouts.items()):
        if layout.get("layoutKind") != "nativeGridCollection":
            continue
        seen_ids = set()
        for entry in layout.get("nativeGridEntries", []):
            native_id = decimal(entry.get("gridIdNative"), "SCOPED_GRID_ID")
            require(native_id not in seen_ids, "DUPLICATE_SCOPED_GRID_ID")
            seen_ids.add(native_id)
            grid_path = source_path(entry.get("gridDataPath"), "GridData/")
            grid_ref_id = layout_id + "#grid=" + str(native_id)
            world_id = layout_to_world.get(layout_id)
            grid_ref = {
                "gridRefId": grid_ref_id,
                "gridRefIdKind": "derivedLayoutGridIdComposite",
                "layoutId": layout_id,
                "nativeGridId": native_id,
                "gridDataPath": grid_path,
                "gridDataPresent": grid_path in grids,
                "areaRefId": area_by_grid_layout.get(layout_id),
                "worldId": world_id,
                "tessellationFactor": entry.get("tessellationFactor"),
                "originalDefaultObjectCount": entry.get("defaultObjectCount"),
                "nativeWorldCoordinatesVerified": False,
                "placementLegalityVerified": False,
            }
            grid_ref_rows.append(grid_ref)
            grid_ref_by_id[grid_ref_id] = grid_ref
            grid_ref_by_scoped_id[(layout_id, native_id)] = grid_ref
            if world_id is not None:
                grid_count_by_world[world_id] += 1

    # Index only initial *source* GridObjects. This does NOT represent player
    # ownership, acquired stock, user save grid, or a legal placement.
    placements = defaultdict(int)
    total_per_world = Counter()
    unlinked_objects = 0
    for row in snapshot["layoutObjects"]:
        lid = row.get("layoutId")
        gid = decimal(row.get("gridIdNative"), "OBJECT_GRID_ID")
        item = decimal(row.get("itemId"), "OBJECT_ITEM_ID")
        ref = grid_ref_by_scoped_id.get((lid, gid))
        require(ref is not None and row.get("worldCoordinatesVerified") is False,
                "OBJECT_REF_NOT_EXACT_SOURCE_GRID")
        placements[(item, ref["gridRefId"])] += 1
        if ref["worldId"] is not None:
            total_per_world[ref["worldId"]] += 1
        else:
            unlinked_objects += 1
    counts_per_grid = Counter()
    for (item, grid_ref), count in placements.items():
        counts_per_grid[grid_ref] += count
    for entry in grid_ref_rows:
        require(counts_per_grid[entry["gridRefId"]] ==
                entry["originalDefaultObjectCount"],
                "NATIVE_GRID_OBJECT_CARDINALITY_MISMATCH")
    item_rows = []
    for (item, grid_id), count in sorted(placements.items()):
        ref = grid_ref_by_id[grid_id]
        item_rows.append({
            "itemId": str(item), "relation": "nativeSourceDefaultGridObject",
            "gridRefId": grid_id, "layoutId": ref["layoutId"],
            "gridDataPath": ref["gridDataPath"],
            "worldId": ref["worldId"], "areaRefId": ref["areaRefId"],
            "instanceCount": count,
            "itemOriginWorldId": None,
            "itemAcquisitionWorldId": None,
            "playerPlacedWorldId": None,
            "placeableWorldId": None,
            "otherFourRelationsVerified": False,
            "nativeCoordinatesStoredInOriginalLayoutObjects": True,
        })
    # Separate primary native entities from links; every non-explicit
    # parentWorldId remains null. This includes House/Room/OffGrid scenes.
    scene_to_world = {}
    for world in world_rows:
        scene = world["nativeSceneId"]
        if scene is not None:
            existing = scene_to_world.get(scene)
            require(existing is None or existing == world["worldId"],
                    "AMBIGUOUS_SCENE_WORLD")
            scene_to_world[scene] = world["worldId"]
    for root_id, world_id in root_to_world.items():
        root = layouts.get(root_id)
        if root and root.get("layoutKind") == "nativeDefaultVillageData":
            scene = root.get("defaultVillageSceneId")
            if scene is not None:
                existing = scene_to_world.get(scene)
                require(existing is None or existing == world_id,
                        "AMBIGUOUS_SEPARATE_AREA_SCENE_WORLD")
                scene_to_world[scene] = world_id
    scene_rows = [{
        "nativeSceneId": sid,
        "nativeSceneName": scene.get("nativeName"),
        "nativeSceneKindCode": scene.get("nativeSceneKindCode"),
        "worldId": scene_to_world.get(sid),
        "worldMembershipVerifiedByExactSourceLink": sid in scene_to_world,
    } for sid, scene in sorted(scenes.items())]
    layout_rows = [{
        "layoutId": lid,
        "layoutKind": layout.get("layoutKind"),
        "nativeDefaultObjectCount": layout.get("defaultObjectCount"),
        "parentWorldId": layout_to_world.get(lid),
        "parentAreaRefId": area_by_grid_layout.get(lid),
        "nativeSourceScopeLabel": lid.split("/")[1],
        "sourceWorldMembershipVerified": lid in layout_to_world,
        "worldCoordinatesVerified": False,
        "placementLegalityVerified": False,
    } for lid, layout in sorted(layouts.items())]
    grid_data_rows = [{
        "gridDataPath": gid,
        "nativeSizeX": grid.get("sizeX"),
        "nativeSizeY": grid.get("sizeY"),
        "nativeSourceFormat": grid.get("nativeSourceFormat"),
        "gridLocalToWorldTransformVerified": False,
        "placementLegalityVerified": False,
    } for gid, grid in sorted(grids.items())]
    world_coverage = [
        {"worldId": w["worldId"], "sourceAreaRefCount": area_counts_by_world[w["worldId"]],
         "sourceGridRefCount": grid_count_by_world[w["worldId"]],
         "initialSourceGridObjectCount": total_per_world[w["worldId"]],
         "allGameAreasCovered": False, "allSourceLayoutsCovered": False}
        for w in world_rows
    ]
    return {
        "schema": SCHEMA,
        "target": {"platform": m["platform"], "gameVersion": m["gameVersion"],
                   "nativeWorldManifestSha256": manifest_digest},
        "status": "private_partial_exact_source_relations",
        "sourceManifestStatus": m["status"],
        "privateOnly": True, "publicationAuthorized": False,
        "provenance": {
            "worlds": "protoDb Worlds / DefaultVillages exact native fields",
            "scenes": "itemlist/Scene.json literal Scene.ID",
            "areas": "Meta.DefaultVillageData areaLayoutReferences",
            "separatedAreas": "Meta.DefaultVillageData separatedAreasRaw",
            "grids": "Meta.GridCollection native scoped Grid.ID / GridDataPath",
            "initialItemPlacement": "Meta.Grids.GridObject original default anchors",
            "noInferenceFromPathPrefixes": True,
        },
        "worlds": world_rows,
        "scenes": scene_rows,
        "areas": area_rows,
        "layouts": layout_rows,
        "gridData": grid_data_rows,
        "gridRefs": grid_ref_rows,
        "initialItemRefs": item_rows,
        "worldCoverage": world_coverage,
        "coverage": {
            "worldDefinitionsInSubset": len(world_rows),
            "nativeNamedWorlds": sum(w["worldIdKind"] == "nativeWorldName" for w in world_rows),
            "derivedVillageWorldRoots": sum(w["worldIdKind"] == "derivedLayoutKey" for w in world_rows),
            "nativeScenesInSubset": len(scenes),
            "nativeAreasInProtoDbSubset": len(native_areas),
            "sourceVillageRoots": sum(l.get("layoutKind") == "nativeDefaultVillageData"
                                      for l in layouts.values()),
            "nativeAreaLayoutReferences": len(area_rows),
            "unresolvedAreaLayoutPaths": sorted(unresolved_area_paths),
            "gridReferencesInSubset": len(grid_ref_rows),
            "nativeGridFilesInSubset": len(grids),
            "nativeLayoutsInSubset": len(layouts),
            "worldLinkedNativeLayouts": len(layout_to_world),
            "sourceInitialGridObjects": len(snapshot["layoutObjects"]),
            "sourceInitialGridObjectsWithoutVerifiedWorldLink": unlinked_objects,
            "completeGameHierarchyVerified": False,
            "allDlcAndAdventurePackIdsVerified": False,
            "worldPlacementPermissionVerified": False,
            "sourceCoverageComplete": False,
        },
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="DB-04 private source-native world reference graph")
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    output = args.out.resolve()
    source = args.snapshot.resolve()
    repository = Path(__file__).resolve().parents[2]
    require(not output.exists() and not output.is_relative_to(repository) and
            output != source and not source.is_relative_to(output) and
            not (source.is_dir() and output.is_relative_to(source)),
            "OUTPUT_OVERLAPS_GIT_OR_PRIVATE_SOURCE")
    snapshot, digest = load_snapshot(source)
    graph = build_reference_graph(snapshot, digest)
    output.parent.mkdir(parents=True, exist_ok=True)
    data = canonical(graph)
    output.write_bytes(data)
    print(json.dumps({"schema": SCHEMA, "out": str(output),
                      "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                      "coverage": graph["coverage"]}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
