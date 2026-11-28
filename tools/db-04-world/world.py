#!/usr/bin/env python3
"""DB-04: read-only extraction of native DDV world/placement evidence.

No guessed world hierarchy, terrain mask, orientation, or save-state coordinates.
Game-derived outputs MUST remain outside the Git repository.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import struct
import tempfile
from collections import Counter
from pathlib import Path

from verify_bundle import validate_snapshot
from terrain_codec import (describe_native_packing, count_packed_palette_indices,
                           describe_native_direct_floor_types,
                           DIRECT_JSON_SOURCE_FORMAT)

SCHEMA = "wand.db04.world@1"
STREAM = Path("ddv_Data/StreamingAssets")
BASE_IDS = {"Furniture": 40000000, "Building": 20000000, "Scene": 1540000000}
RESTRICTION_FIELDS = {
    1: "canMove", 2: "canRotate", 4: "canBeRemoved",
    6: "canBeSelected", 7: "canSwitchGrid",
}
MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_FILES = 30000
VERSION_RE = re.compile(r"(?<![0-9.])([0-9]+\.[0-9]+\.[0-9]+)(?![0-9.])")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def varint(data, pos):
    start, value = pos, 0
    for index in range(10):
        if pos >= len(data):
            raise ValueError("truncated protobuf varint")
        byte = data[pos]
        pos += 1
        if index == 9 and byte > 1:
            raise ValueError("overflow protobuf varint")
        value |= (byte & 127) << (7 * index)
        if byte < 128:
            if encode_varint(value) != data[start:pos]:
                raise ValueError("noncanonical protobuf varint")
            return value, pos
    raise ValueError("unterminated protobuf varint")


def encode_varint(value):
    if value < 0:
        raise ValueError("negative protobuf integer")
    out = bytearray()
    while value >= 128:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)


def wire_fields(data):
    """Decode protobuf wire framing, never infer unknown field semantics."""
    pos, result = 0, []
    while pos < len(data):
        tag, pos = varint(data, pos)
        field, wire = tag >> 3, tag & 7
        if field == 0 or wire not in (0, 1, 2, 5):
            raise ValueError("invalid protobuf tag")
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            size, pos = varint(data, pos)
            if size > len(data) - pos:
                raise ValueError("truncated length-delimited protobuf field")
            value = data[pos:pos + size]
            pos += size
        else:
            size = 8 if wire == 1 else 4
            if size > len(data) - pos:
                raise ValueError("truncated fixed-width protobuf field")
            value = data[pos:pos + size]
            pos += size
        result.append((field, wire, value))
    return result


def one(fields, number, wire, required=False):
    found = [value for field, kind, value in fields if field == number and kind == wire]
    invalid = [1 for field, kind, _ in fields if field == number and kind != wire]
    if len(found) > 1 or invalid or (required and not found):
        raise ValueError(f"missing, duplicate or wrong-wire field {number}")
    return found[0] if found else None


def text_field(fields, number, required=False):
    raw = one(fields, number, 2, required)
    if raw is None:
        return None
    value = raw.decode("utf-8")
    if required and not value:
        raise ValueError("empty required string")
    return value


def parse_itemlist(data, kind):
    if kind not in BASE_IDS:
        raise ValueError("unsupported native category")
    pos, result = 0, {}
    while pos < len(data):
        frame_id, pos = varint(data, pos)
        size, pos = varint(data, pos)
        if size == 0 or size > MAX_SOURCE_BYTES or size > len(data) - pos:
            raise ValueError("invalid indexed native record size")
        fields = wire_fields(data[pos:pos + size])
        pos += size
        native_id = one(fields, 1, 0, True)
        if native_id - BASE_IDS[kind] != frame_id or native_id in result:
            raise ValueError("duplicate or mismatched native ID/frame key")
        raw_name = text_field(fields, 2, True)
        label_key = text_field(fields, 3)
        result[native_id] = (fields, raw_name, label_key)
    if not result:
        raise ValueError(f"empty native category: {kind}")
    return result


def footprint(fields):
    # Building field 6 is also a varint for some native variants. Do not
    # interpret that scalar as GridAreaData or reject the entire source.
    variants = [(wire, data) for number, wire, data in fields if number == 6]
    if not variants:
        return None
    if len(variants) != 1:
        raise ValueError("ambiguous native field 6")
    if variants[0][0] != 2:
        return None
    raw = variants[0][1]
    inner = wire_fields(raw)
    width = one(inner, 1, 0, True)
    height = one(inner, 2, 0, True)
    layers = one(inner, 3, 2, True)
    floor_flag = one(inner, 4, 0)
    # Original GridAreaData.StrideOverride is Nullable<int> wire field 5.
    # A *present* field 5 is a protobuf int32 wrapper with an optional
    # nested scalar field 1. An empty wrapper means explicit int32 zero,
    # while an absent outer field means null; do not conflate them.
    raw_stride = one(inner, 5, 2)
    stride = None
    if raw_stride is not None:
        wrapper = wire_fields(raw_stride)
        if any(number != 1 or wire != 0
               for number, wire, _ in wrapper):
            raise ValueError("invalid source GridAreaData nullable stride wrapper")
        value = one(wrapper, 1, 0)
        stride = native_int32(value) if value is not None else 0
    if not 0 < width <= 256 or not 0 < height <= 256 or width * height > 16384:
        raise ValueError("invalid native footprint dimensions")
    if len(layers) != width * height * 4:
        raise ValueError("native layer array is not SizeX*SizeY uint32 cells")
    return {
        "sizeX": width, "sizeY": height,
        "layerValues": list(struct.unpack("<" + "I" * (width * height), layers)),
        "acceptedFloorTypesFlag": floor_flag,
        "strideOverride": stride,
        "strideOverrideSourceVerified": raw_stride is not None,
        "nativeWireFields": {
            "sizeX": "6.1", "sizeY": "6.2",
            "layerValues": "6.3", "acceptedFloorTypesFlag": "6.4",
            **({"strideOverride": "6.5"} if raw_stride is not None else {}),
        },
        "strideOverridePlacementSemanticsVerified": False,
        "cellIndexToXYVerified": False,
        "layerMaskSemanticsVerified": False,
    }


def restrictions(fields):
    raw = one(fields, 25, 2)
    if raw is None:
        return {}
    values = {}
    for field, wire, data in wire_fields(raw):
        name = RESTRICTION_FIELDS.get(field)
        if not name or wire != 2:
            continue
        value = one(wire_fields(data), 1, 0)
        if value is not None:
            if value not in (0, 1):
                raise ValueError("non-boolean edit restriction")
            values[name] = {"value": bool(value), "nativeWireField": f"25.{field}.1"}
    return values


def safe_reference(value):
    if not value or "\\" in value or ":" in value or value.startswith("/"):
        return False
    parts = value.split("/")
    return all(part not in ("", ".", "..") for part in parts)


def explicit_references(data, depth=0, prefix=""):
    """Collect literal paths in nested protobuf STRING fields only; no linking by filename."""
    if depth > 7:
        return []
    try:
        fields = wire_fields(data)
    except ValueError:
        return []
    found = []
    for field, wire, value in fields:
        if wire != 2 or len(value) > 1024 * 1024:
            continue
        where = f"{prefix}.{field}" if prefix else str(field)
        try:
            decoded = value.decode("utf-8")
        except UnicodeDecodeError:
            decoded = None
        if decoded and (decoded.startswith("GridData/") or
                        decoded.startswith("SceneLayouts/")) and decoded.endswith(".json"):
            if safe_reference(decoded):
                found.append({"path": decoded, "wireField": where})
        if value:
            found.extend(explicit_references(value, depth + 1, where))
    return found


def source_bytes(root, relative, sources):
    path = root / relative
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"missing or unsafe source: {relative}")
    if path.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError(f"oversized native source: {relative}")
    raw = path.read_bytes()
    sources.append({"path": relative.as_posix(), "bytes": len(raw), "sha256": digest(raw)})
    return raw


def optional_files(root, relative, sources):
    folder = root / relative
    if not folder.is_dir() or folder.is_symlink():
        return []
    paths = sorted(folder.rglob("*.json"), key=lambda p: p.relative_to(root).as_posix())
    if len(paths) > MAX_FILES:
        raise ValueError("too many world source files")
    for path in paths:
        if path.is_symlink() or not path.is_file():
            raise ValueError("unsafe native source symlink")
    return [p.relative_to(root) for p in paths]


# Native WorldData, VillageAreaData and DefaultVillageList types verified
# against Steam 1.26.1 IL2CPP metadata. The namespaced "village-layout:"
# keys are database IDs only; they are NOT game-provided world IDs.
VILLAGE_AREA_NAMES = {
    0: "Beach", 1: "Wetland", 2: "Meadow", 3: "Urban",
    4: "Savannah", 5: "Forest", 6: "DarkMountains", 7: "Cliff",
    8: "AtlanteanOutpost01", 9: "AtlanteanOutpost02",
    10: "AtlanteanOutpost03", 11: "AtlanteanOutpost04",
    12: "Desert01", 13: "Desert02", 14: "Desert03", 15: "Desert04",
    16: "Jungle01", 17: "Jungle02", 18: "Jungle03", 19: "Jungle04",
    20: "Mythology01", 21: "Mythology02", 22: "Mythology03", 23: "Mythology04",
    24: "FairyTales01", 25: "FairyTales02", 26: "FairyTales03", 27: "FairyTales04",
    28: "Library01", 29: "Library02", 30: "Library03",
    31: "Rockies01", 32: "Rockies02", 33: "Rockies03",
    34: "Rockies04", 35: "Rockies05",
    36: "Fashion01", 37: "Fashion02", 38: "Fashion03", 39: "Fashion04",
    40: "Wishland01", 41: "Wishland02", 42: "Wishland03", 43: "Wishland04",
    44: "Honeywood01", 45: "Honeywood02", 46: "Honeywood03", 47: "Honeywood04",
    48: "Pirates01", 49: "Pirates02", 50: "Pirates03", 51: "Pirates04",
    52: "Candy01", 53: "Candy02", 54: "Candy03", 55: "Candy04",
    56: "Kingdom01", 57: "Kingdom02", 58: "Kingdom03",
    59: "Kingdom04", 60: "Kingdom05",
    61: "UnderwaterPirates", 62: "UnderwaterCandy", 63: "UnderwaterKingdom",
}


def parse_world_registry(data, known_scene_ids):
    """Parse explicit world hierarchy from protoDb.bin, not inferred names."""
    needed_types = {
        "Worlds": "Definitions.WorldData",
        "DefaultVillages": "Meta.DefaultVillageList",
        "Village04Layout1": "Definitions.Scene.VillageAreaData",
    }
    entries = {}
    for field, wire, raw in wire_fields(data):
        if (field, wire) != (1, 2):
            raise ValueError("unknown protoDb top-level schema")
        outer = wire_fields(raw)
        name = text_field(outer, 1, True)
        if name not in needed_types:
            continue
        if name in entries:
            raise ValueError("duplicate world-registry protoDb entry")
        metadata = wire_fields(one(outer, 2, 2, True))
        typename = text_field(metadata, 5, True)
        if typename != needed_types[name]:
            raise ValueError("conflicting protoDb native world schema")
        entries[name] = one(metadata, 6, 2, True)
    result, areas, unresolved = [], [], []
    world_data = entries.get("Worlds")
    if world_data is not None:
        for field, wire, payload in wire_fields(world_data):
            if (field, wire) != (1, 2):
                continue  # WorldData.IncrementalPrice is field 2.
            native = wire_fields(payload)
            name = text_field(native, 1, True)
            parent = text_field(native, 2)
            scene_id = one(native, 22, 0, True)
            layout = text_field(native, 21, True)
            if not safe_reference(layout) or not layout.startswith("SceneLayouts/"):
                raise ValueError("invalid native world layout reference")
            if scene_id not in known_scene_ids:
                unresolved.append({"reason": "native_world_scene_missing", "worldName": name,
                                   "sceneId": scene_id})
            result.append({
                "worldId": name, "worldIdKind": "nativeWorldName",
                "nativeWorldName": name, "worldType": "realm",
                "parentWorldId": parent, "sceneId": scene_id,
                "universeTagItemId": one(native, 20, 0),
                "defaultGridLayoutPath": layout,
                "conditionalUnlockUnknown": True,
                "source": {"path": (STREAM / "protoDb.bin").as_posix(),
                           "entry": "Worlds", "nativeFields": [1, 2, 20, 21, 22]},
            })
    village_data = entries.get("DefaultVillages")
    if village_data is not None:
        for field, wire, payload in wire_fields(village_data):
            if wire != 2 or field not in (1, 2):
                continue
            path = payload.decode("utf-8") if field == 1 else text_field(
                wire_fields(payload), 1, True)
            if not safe_reference(path) or not path.startswith("SceneLayouts/"):
                raise ValueError("invalid native default village layout")
            result.append({
                "worldId": "village-layout:" + path, "worldIdKind": "derivedLayoutKey",
                "nativeWorldName": None, "worldType": "village_layout",
                "parentWorldId": None, "sceneId": None,
                "universeTagItemId": None, "defaultGridLayoutPath": path,
                "conditionalUnlockUnknown": field == 2,
                "source": {"path": (STREAM / "protoDb.bin").as_posix(),
                           "entry": "DefaultVillages", "nativeFields": [field]},
            })
    area_data = entries.get("Village04Layout1")
    if area_data is not None:
        native = wire_fields(area_data)
        parent_scene = one(native, 1, 0, True)
        if parent_scene not in known_scene_ids:
            unresolved.append({"reason": "village_scene_missing",
                               "sceneId": parent_scene})
        for _, wire, payload in (row for row in native if row[0] == 2):
            if wire != 2:
                raise ValueError("invalid village area protobuf")
            entry = wire_fields(payload)
            area_type = one(entry, 1, 0)
            area_type = 0 if area_type is None else area_type  # protobuf enum default
            if area_type not in VILLAGE_AREA_NAMES:
                unresolved.append({"reason": "unknown_village_area_enum",
                                   "areaTypeCode": area_type})
            areas.append({
                "areaId": f"{parent_scene}:{area_type}",
                "areaIdKind": "sceneAndAreaTypeComposite",
                "parentSceneId": parent_scene,
                "nativeAreaTypeCode": area_type,
                "nativeAreaTypeName": VILLAGE_AREA_NAMES.get(area_type),
                "nativeAreaTypeFieldPresent": one(entry, 1, 0) is not None,
                "unlockPlayerLevel": one(entry, 2, 0),
                "groundNavMeshAreaId": one(entry, 7, 0),
                "waterNavMeshAreaId": one(entry, 8, 0),
                "source": {"path": (STREAM / "protoDb.bin").as_posix(),
                           "entry": "Village04Layout1", "nativeFields": [1, 2]},
            })
    # References are strict; never make dangling parent-world links silently.
    known_world_names = {r["worldId"] for r in result if r["worldIdKind"] == "nativeWorldName"}
    for row in result:
        if row["parentWorldId"] and row["parentWorldId"] not in known_world_names:
            unresolved.append({"reason": "world_parent_missing",
                               "worldName": row["worldId"],
                               "parentWorldId": row["parentWorldId"]})
    for name in needed_types:
        if name not in entries:
            unresolved.append({"reason": "missing_protoDb_world_registry_entry",
                               "entry": name})
    if len(set(row["worldId"] for row in result)) != len(result):
        raise ValueError("duplicate native or derived world registry ID")
    if len(set(row["areaId"] for row in areas)) != len(areas):
        raise ValueError("duplicate scene/area IDs")
    return result, areas, unresolved


def world_registry(root, sources, known_scene_ids):
    relative = STREAM / "protoDb.bin"
    if not (root / relative).is_file():
        return [], [], [{"reason": "protoDb.bin_not_available"}]
    data = source_bytes(root, relative, sources)
    return parse_world_registry(data, known_scene_ids)


def native_objects(root, sources):
    results, scenes, missing = [], [], Counter()
    for kind in ("Scene", "Building", "Furniture"):
        relative = STREAM / "itemlist" / (kind + ".json")
        data = parse_itemlist(source_bytes(root, relative, sources), kind)
        for native_id, (fields, name, label_key) in sorted(data.items()):
            evidence = {"path": relative.as_posix(), "idField": "1",
                        "nameField": "2", "labelKeyField": "3"}
            if kind == "Scene":
                scenes.append({
                    "sceneId": native_id, "nativeName": name,
                    "localizationKey": label_key,
                    "nativeSceneKindCode": one(fields, 6, 0),
                    "parentWorldId": None, "parentAreaId": None,
                    "worldHierarchyVerified": False, "source": evidence,
                })
                continue
            grid = footprint(fields)
            if grid is None:
                missing[kind] += 1
            # Building field 42 is an explicit layout path, not a derived world placement.
            layout = text_field(fields, 42) if kind == "Building" else None
            if layout is not None and (not layout.startswith("SceneLayouts/") or
                                       not layout.endswith(".json") or not safe_reference(layout)):
                raise ValueError("unsafe native building layout reference")
            # Field 10 may also be length-delimited for different building
            # definitions. A non-integer field10 must never be an inferred Scene ID.
            scene_values = [(wire, value) for field, wire, value in fields if field == 10]
            if len(scene_values) > 1:
                raise ValueError("ambiguous native field 10")
            scene_id = (scene_values[0][1] if kind == "Building" and scene_values
                        and scene_values[0][0] == 0 else None)
            results.append({
                "itemId": native_id, "nativeType": kind, "nativeName": name,
                "localizationKey": label_key, "footprint": grid,
                "gridEditRestrictions": restrictions(fields),
                "sceneReferenceNativeField10": scene_id,
                "unresolvedField6WireTypes": [wire for field, wire, _ in fields
                                              if field == 6 and wire != 2],
                "unresolvedField10WireTypes": [wire for field, wire, _ in fields
                                               if field == 10 and wire != 0],
                "sceneLayoutPathNativeField42": layout,
                "orientationOrderVerified": False,
                "placeableInWorldVerified": False,
                "source": evidence,
            })
    return results, scenes, missing


# Verified against IL2CPP Definitions.Grid.GridData class fields in Steam 1.26.1.
# Field4 is the native palette (repeated uint32); field5 is packed index bytes.
# Index bit order/stride and 2D placement remain unverified.
GRID_FLOOR_TYPES = {
    1: "Beach", 2: "Wetland", 4: "Meadow", 8: "Urban",
    16: "Savannah", 32: "Forest", 64: "DarkMountains", 128: "Cliff",
    256: "Shore", 512: "Water", 1024: "Floor", 2048: "Wall",
    4096: "Surface", 8192: "AtlanteanOutpost", 16384: "Desert",
    32768: "Jungle", 65536: "Mythology", 131072: "FairyTales",
    262144: "BlockAutomaticSpawning", 524288: "Library",
    1048576: "Puzzle", 2097152: "PuzzleSurface", 4194304: "Rockies",
    8388608: "Fashion", 16777216: "Wishland", 33554432: "OutsideFloor",
    67108864: "Honeywood", 134217728: "Pirates",
    268435456: "Candy", 536870912: "Kingdom",
}


def repeated_uint32(fields, number):
    # Native GridData uses packed FIXED32, not varint (e.g. 00 0c 00 00
    # for the enum mask 3072). Confirmed by native room grid samples.
    values = []
    for field, wire, raw in fields:
        if field != number:
            continue
        if wire == 5:
            if len(raw) != 4:
                raise ValueError("truncated fixed32 grid field")
            values.append(struct.unpack("<I", raw)[0])
        elif wire == 2:
            if len(raw) % 4:
                raise ValueError("packed grid fixed32 byte count invalid")
            values.extend(struct.unpack("<" + "I" * (len(raw) // 4), raw))
        else:
            raise ValueError("unexpected fixed32 grid field wire type")
    return values


def parse_original_json_direct_grid(raw, *, source_game_version):
    """Strictly preserve literal Steam GridData JSON (direct FloorTypes).

    Four original Village04 BlockSpawn grids are text JSON, despite the
    binary .json convention used by other native GridData files.
    This parser does not turn spawn flags into collision/placement rules.
    """
    def distinct_fields(pairs):
        row = {}
        for key, value in pairs:
            if key in row:
                raise ValueError("duplicate original GridData JSON field")
            row[key] = value
        return row

    def reject_constant(value):
        raise ValueError("nonfinite GridData JSON number")

    document = json.loads(raw.decode("utf-8-sig"),
                          object_pairs_hook=distinct_fields,
                          parse_constant=reject_constant)
    # Original Steam 1.26.2 Expansion02/MythDungeon GridData has a second
    # direct-value JSON envelope: the same populated FloorTypes array plus
    # *empty* compacted representation fields. Empty [] / "" are source
    # evidence of no active packed payload, NOT a palette or byte stream.
    # Reject nonempty or partially present compacted fields rather than
    # silently choosing a representation when both may be active.
    required = {"SizeX", "SizeY", "FloorTypes"}
    extended = required | {"CompactedFloorTypeIndex", "CompactedFloorTypes"}
    if not isinstance(document, dict) or set(document) not in (required, extended):
        raise ValueError("unsupported original JSON GridData schema")
    if set(document) == extended and (
            document["CompactedFloorTypeIndex"] != [] or
            document["CompactedFloorTypes"] != ""):
        raise ValueError("active or malformed compacted original JSON GridData")
    x, y, values = (document["SizeX"], document["SizeY"],
                    document["FloorTypes"])
    evidence = describe_native_direct_floor_types(
        x, y, values, source_game_version=source_game_version)
    return {
        "sizeX": x, "sizeY": y, "nativeFloorTypes": values,
        "nativeFloorTypePalette": [],
        "compactedFloorTypesBase64": None,
        "nativeCompactedByteCount": None, "nativeCompactedSha256": None,
        "terrainDecoding": evidence, "nativePaletteIndexCellCounts": None,
        "nativeSourceFormat": DIRECT_JSON_SOURCE_FORMAT,
        "nativeFloorIndexToLocalXYCorroborated": evidence["decoded"],
        "floorTypeEnumSymbols": {
            str(value): name for value, name in GRID_FLOOR_TYPES.items()},
        "cellIndexToXYVerified": False, "compactedBitOrderVerified": False,
        "terrainFlagValuesVerified": True,
        "status": "native_uncompacted_floor_values",
    }


def parse_grid_structure(raw, *, source_game_version):
    # Callers must provide the exact source version; the standalone parser
    # must not silently treat an unknown archive as the proven 1.26.1 build.
    if not isinstance(source_game_version, str) or not source_game_version:
        raise ValueError("missing original GridData source game version")
    if raw.lstrip().startswith(b"{") or raw.lstrip().startswith(b"\xef\xbb\xbf{"):
        return parse_original_json_direct_grid(
            raw, source_game_version=source_game_version)
    fields = wire_fields(raw)
    x, y = one(fields, 1, 0, True), one(fields, 2, 0, True)
    if x <= 0 or y <= 0 or x * y > 16_777_216:
        raise ValueError("invalid native GridData dimensions")
    floor_types = repeated_uint32(fields, 3)
    palette = repeated_uint32(fields, 4)
    compacted = one(fields, 5, 2)
    if not palette and compacted is not None:
        raise ValueError("packed grid without a floor-type palette")
    if floor_types and len(floor_types) != x * y:
        raise ValueError("direct floor type list size does not match dimensions")
    if floor_types and compacted is not None:
        raise ValueError("multiple active native terrain representations")
    if not floor_types and compacted is None:
        # A truly empty/incomplete grid needs explicit unresolved status.
        status = "dimensions_only"
    elif compacted is None:
        status = "native_uncompacted_floor_values"
    else:
        status = "native_compacted_palette_and_index_bytes"
    packing = (describe_native_packing(
                   x, y, palette, compacted,
                   source_game_version=source_game_version)
               if compacted is not None else {
                   "status": "not_compacted", "decoded": False})
    palette_counts = (count_packed_palette_indices(
                          x, y, palette, compacted,
                          source_game_version=source_game_version)
                      if compacted is not None and packing["decoded"] else None)
    return {
        "sizeX": x, "sizeY": y,
        "nativeFloorTypes": floor_types or None,
        "nativeFloorTypePalette": palette,
        "compactedFloorTypesBase64": base64.b64encode(compacted).decode("ascii")
        if compacted is not None else None,
        "nativeCompactedByteCount": len(compacted) if compacted is not None else None,
        "nativeCompactedSha256": digest(compacted) if compacted is not None else None,
        "terrainDecoding": packing,
        "nativePaletteIndexCellCounts": palette_counts,
        "nativeFloorIndexToLocalXYCorroborated": packing["decoded"],
        "floorTypeEnumSymbols": {str(value): name for value, name in GRID_FLOOR_TYPES.items()},
        "cellIndexToXYVerified": False,
        "compactedBitOrderVerified": False,
        "terrainFlagValuesVerified": True,  # Enum in the game's IL2CPP metadata
        "status": status,
    }


def grid_assets(root, sources, *, source_game_version, native_data_hashes=None):
    grids = []
    for relative in optional_files(root, STREAM / "GridData", sources):
        raw = source_bytes(root, relative, sources)
        try:
            entry = parse_grid_structure(
                raw, source_game_version=source_game_version)
            if native_data_hashes is not None and source_game_version == "1.26.2":
                try:
                    native_data_hashes[relative.relative_to(STREAM).as_posix()] = native_grid_data_hash(raw)
                except (ValueError, UnicodeError, struct.error):
                    pass  # Leave unsupported hash representation unresolved.
        except (ValueError, UnicodeError) as error:
            # Do not silently turn a corrupted/unsupported native GridData
            # file into a "good" empty grid. Preserve a per-file reason and
            # exclude it from 2D rendering; do not stop unrelated extraction.
            reason = str(error)[:160]
            entry = {"status": "unrecognized_binary_structure",
                     "parseError": reason,
                     "terrainDecoding": {"status": "parse_failed",
                                         "decoded": False},
                     "nativePaletteIndexCellCounts": None,
                     "nativeFloorIndexToLocalXYCorroborated": False,
                     "cellIndexToXYVerified": False,
                     "compactedBitOrderVerified": False}
        entry.update({
            "gridId": relative.relative_to(STREAM).as_posix(),
            "sourcePartition": relative.relative_to(STREAM / "GridData").parts[0],
            "source": {"path": relative.as_posix()},
        })
        grids.append(entry)
    return grids


# SceneLayouts/GridCollection is authoritative default-game state, not
# a player's save snapshot. Fields below are mapped to Steam IL2CPP types:
# Meta.GridCollection -> Meta.Grids.Grid -> Meta.Grids.GridObject.
ORIENTATION_NAMES = (
    "Up", "UpUpRight", "UpRight", "UpRightRight",
    "Right", "DownRightRight", "DownRight", "DownDownRight",
    "Down", "DownDownLeft", "DownLeft", "DownLeftLeft",
    "Left", "UpLeftLeft", "UpLeft", "UpUpLeft",
)


def native_int32(value):
    if value is None:
        return 0  # protobuf omitted scalar has its declared default
    if value <= 0xffffffff:
        return value - (1 << 32) if value >= 0x80000000 else value
    if (1 << 64) - (1 << 31) <= value < (1 << 64):
        return (value & 0xffffffff) - (1 << 32)
    raise ValueError("invalid protobuf int32")


def native_uint32(value):
    if value is None:
        return 0
    if not 0 <= value <= 0xffffffff:
        raise ValueError("invalid protobuf uint32")
    return value



# Steam 1.26.2 native GetHashCode implementation, corroborated against
# original PE/IL2CPP methods and matching private Save identity pairs.
# This is a deliberately bounded subset: only source-correlated GridState,
# no unknown protobuf fields or direct-JSON initialization semantics.
_HASH_MASK = 0xffffffff


def native_string_hash(text):
    units = text.encode("utf-16-le")
    a = b = 5381
    for index, (unit,) in enumerate(struct.iter_unpack("<H", units)):
        if unit == 0:
            break
        if index % 2:
            b = ((b * 33) ^ unit) & _HASH_MASK
        else:
            a = ((a * 33) ^ unit) & _HASH_MASK
    return (a + b * 1566083941) & _HASH_MASK


def native_accum31(values, seed=0):
    for value in values:
        seed = (seed * 31 + value) & _HASH_MASK
    return seed


def native_grid_data_hash(raw):
    """Hash the original wire representation, not expanded terrain cells."""
    fields = wire_fields(raw)
    if any((f, w) not in ((1, 0), (2, 0), (3, 2), (3, 5),
                          (4, 2), (4, 5), (5, 2)) for f, w, _ in fields):
        raise ValueError("unverified native GridData hash field")
    x = native_uint32(one(fields, 1, 0, True))
    y = native_uint32(one(fields, 2, 0, True))
    compacted = one(fields, 5, 2)
    return native_int32((1 ^ x ^ y ^
                         native_accum31(repeated_uint32(fields, 3)) ^
                         native_accum31(repeated_uint32(fields, 4)) ^
                         (native_accum31(compacted, 23) if compacted else 0))
                        & _HASH_MASK)


# GridState.GetHashCode XORs the selected child's hash and oneof case
# with the seed 1. Confirmed in original Steam 1.26.2 native bodies.
# The same recursive primitives serve all supported GridState families.
def native_hash_fields(raw, schema, repeated=()):
    result = {}
    for number, kind, value in wire_fields(raw):
        if (schema.get(number) != kind or
                (number in result and number not in repeated)):
            raise ValueError("unverified nested hash field")
        if number in repeated:
            result.setdefault(number, []).append(value)
        else:
            result[number] = value
    return result


def native_wrapped_int(raw):
    return native_int32(native_hash_fields(raw, {1: 0}).get(1))


def native_bool(value):
    if value not in (0, 1):
        raise ValueError("unsupported bool encoding")
    return value


def native_item_state_hash(raw, depth=0):
    if depth > 32:
        raise ValueError("excessive nested item state")
    fields = native_hash_fields(raw, {2: 0, 4: 2, 5: 0})
    if len(fields) > 1:
        raise ValueError("ambiguous ItemState oneof")
    if not fields:
        return 1
    number, value = next(iter(fields.items()))
    if number in (2, 5):
        return 1 ^ number ^ native_int32(value)
    items = native_hash_fields(value, {1: 2}, (1,)).get(1, [])
    return 1 ^ number ^ 1 ^ native_accum31(
        native_item_instance_hash(item, depth + 1) for item in items)


def native_item_instance_hash(raw, depth):
    fields = native_hash_fields(raw, {1: 0, 2: 0, 3: 2})
    return (1 ^ native_int32(fields.get(1)) ^ native_int32(fields.get(2)) ^
            (native_item_state_hash(fields[3], depth) if 3 in fields else 0))


def native_item_with_state_hash(raw):
    fields = native_hash_fields(raw, {1: 0, 2: 2})
    return (1 ^ native_int32(fields.get(1)) ^
            (native_item_state_hash(fields[2]) if 2 in fields else 0))


def native_grid_state_hash(raw):
    # Unsupported nested representations remain excluded. A present empty
    # message is not equivalent to an absent message or absent oneof.
    fields = native_hash_fields(raw, {n: 2 for n in (1, 2, 8, 11, 14, 15, 22, 23)})
    if len(fields) > 1:
        raise ValueError("ambiguous GridState oneof")
    if not fields:
        return 1
    number, value = next(iter(fields.items()))
    h = 1
    if number == 1:  # SubGrid
        child = native_hash_fields(value, {1: 0, 2: 2})
        h ^= native_uint32(child.get(1))
        if 2 in child:
            h ^= native_wrapped_int(child[2])
    elif number == 2:  # AmountWithState
        child = native_hash_fields(value, {1: 2, 2: 2, 3: 2})
        for field in (1, 3):
            if field in child:
                h ^= native_wrapped_int(child[field])
        if 2 in child:
            h ^= native_item_state_hash(child[2])
    elif number == 8:  # WeedData, Treasure oneof
        child = native_hash_fields(value, {2: 2})
        if 2 in child:
            h ^= 2 ^ native_item_with_state_hash(child[2])
    elif number == 11:  # StorageGridData
        child = native_hash_fields(value, {1: 0, 2: 2, 3: 0, 4: 2, 5: 2})
        h ^= native_uint32(child.get(1)) ^ native_int32(child.get(3))
        for field in (2, 4):
            if child.get(field):
                h ^= native_string_hash(child[field].decode("utf-8"))
        if 5 in child:
            h ^= native_wrapped_int(child[5])
    elif number == 14:  # ToggleGridData
        child = native_hash_fields(value, {1: 2, 2: 2})
        if 1 in child:
            h ^= native_bool(native_wrapped_int(child[1]))
        if 2 in child:
            h ^= native_wrapped_int(child[2])
    elif number == 15:  # IndexGridData
        h ^= native_int32(native_hash_fields(value, {1: 0}).get(1))
    elif number == 22:  # BuildingWithSkinData
        child = native_hash_fields(value, {1: 2, 3: 0})
        if 1 in child:
            h ^= 1 ^ native_int32(native_hash_fields(child[1], {1: 0}).get(1))
        h ^= native_int32(child.get(3))
    elif number == 23:  # FenceModeGridData
        h ^= native_bool(native_hash_fields(value, {1: 0}).get(1, 0))
    return 1 ^ number ^ h


def native_stateless_grid_hash(fields):
    """Native Grid and GridObject hash, including supported nested state."""
    if any((f, w) not in ((1, 0), (2, 2), (3, 2), (4, 0),
                          (5, 2), (6, 0)) for f, w, _ in fields):
        raise ValueError("unverified native Grid hash field")
    h = (1 ^ native_uint32(one(fields, 1, 0)) ^
         native_int32(one(fields, 4, 0)) ^
         native_uint32(one(fields, 6, 0)))
    for number in (2, 3):
        text = text_field(fields, number, number == 2)
        if text:
            h ^= native_string_hash(text)
    seen = set()
    for f, w, raw in fields:
        if f != 5:
            continue
        entry = wire_fields(raw)
        if any((n, k) not in ((1, 0), (2, 2)) for n, k, _ in entry):
            raise ValueError("unverified native GridObject map field")
        key = native_uint32(one(entry, 1, 0))
        obj = wire_fields(one(entry, 2, 2, True))
        if (key in seen or native_uint32(one(obj, 1, 0)) != key or
                any((n, k) not in ((1, 0), (2, 0), (3, 0), (4, 0),
                                   (5, 0), (6, 2), (7, 0)) for n, k, _ in obj)):
            raise ValueError("unverified GridObject state or identity")
        seen.add(key)
        oh = 1 ^ key
        for number in (2, 3, 4, 5):
            oh ^= native_int32(one(obj, number, 0))
        state = one(obj, 6, 2)
        if state is not None:
            oh ^= native_grid_state_hash(state)
        source = one(obj, 7, 0)
        if source is not None:
            oh ^= 7 ^ native_int32(source)
        h ^= (31 * key + oh) & _HASH_MASK
    return native_int32(h & _HASH_MASK)


def attach_native_diffgrid_hashes(layout, raw, data_hashes):
    """Join hash pairs to already parsed entries; unsupported grids stay absent.

    Source-derived evidence is not Save authentication or writer permission.
    Both independent hashes still have to match the actual Save identity.
    """
    if data_hashes is None or layout["layoutKind"] != "nativeGridCollection":
        return
    try:
        root = wire_fields(raw)
        if layout.get("embeddedGridCollectionWireField") == 2:
            root = wire_fields(one(root, 2, 2, True))
        by_id = {}
        for number, wire, value in root:
            if (number, wire) != (1, 2):
                continue
            entry = wire_fields(value)
            if any((n, k) not in ((1, 0), (2, 2)) for n, k, _ in entry):
                return
            key = native_uint32(one(entry, 1, 0))
            fields = wire_fields(one(entry, 2, 2, True))
            if key in by_id or key != native_uint32(one(fields, 1, 0)):
                return
            by_id[key] = fields
        if set(by_id) != {e["gridIdNative"] for e in layout["nativeGridEntries"]}:
            return
    except (ValueError, UnicodeError, struct.error):
        return
    for entry in layout["nativeGridEntries"]:
        try:
            fields = by_id[entry["gridIdNative"]]
            path = text_field(fields, 2, True)
            if path != entry["gridDataPath"] or path not in data_hashes:
                continue
            grid_hash = native_stateless_grid_hash(fields)
            entry.update(defaultGridHashCode=grid_hash,
                         defaultGridDataHashCode=data_hashes[path],
                         defaultHashEvidence="source_native_method_correlated")
        except (ValueError, UnicodeError, struct.error):
            continue


def native_layout_object(payload, map_id, grid_id, layout_id, relative):
    """Use exact protobuf declared fields; omitted X/Y/orientation default to 0."""
    obj = wire_fields(payload)
    native_id = native_uint32(one(obj, 1, 0))
    if native_id != map_id:
        raise ValueError("GridObject protobuf map key and ID disagree")
    item_id = native_int32(one(obj, 2, 0))
    x = native_int32(one(obj, 3, 0))
    y = native_int32(one(obj, 4, 0))
    orientation = native_int32(one(obj, 5, 0))
    raw_state = one(obj, 6, 2)
    return {
        "layoutObjectId": f"{layout_id}#grid={grid_id}#object={native_id}",
        "layoutObjectIdKind": "derivedLayoutGridObjectComposite",
        "layoutId": layout_id,
        "gridIdNative": grid_id, "gridObjectIdNative": native_id,
        "itemId": item_id, "itemIdFieldPresent": any(f == 2 for f, _, _ in obj),
        "x": x, "y": y, "orientationCode": orientation,
        "orientationName": ORIENTATION_NAMES[orientation]
        if 0 <= orientation < len(ORIENTATION_NAMES) else None,
        "stateByteCount": len(raw_state) if raw_state is not None else 0,
        "stateSha256": digest(raw_state) if raw_state is not None else None,
        "fromNativeCode": one(obj, 7, 0),
        "positionBasis": "nativeGridLocal",
        "worldCoordinatesVerified": False, "fixedImmovableVerified": False,
        "source": {"path": relative.as_posix(),
                   "nativeType": "Meta.Grids.GridObject",
                   "nativeFields": {"id": 1, "itemId": 2, "x": 3,
                                    "y": 4, "orientation": 5, "state": 6}},
    }


def grid_collection_layout(data, relative):
    """Return None only if not a GridCollection; malformed known types fail."""
    root = wire_fields(data)
    map_entries = [part for f, w, part in root if (f, w) == (1, 2)]
    if not map_entries:
        return None  # empty file cannot prove its native message type
    try:
        first_entry = wire_fields(map_entries[0])
        native = one(first_entry, 2, 2)
        if native is None:
            return None
        native_fields = wire_fields(native)
        grid_data_path = text_field(native_fields, 2)
    except (ValueError, UnicodeError):
        return None  # not known GridCollection, preserve via unresolved fallback
    if not grid_data_path or not grid_data_path.startswith("GridData/"):
        return None  # e.g. DefaultVillageData.Village, not a GridCollection
    if len(map_entries) > 8192:
        raise ValueError("excessive native GridCollection grid count")
    layout_id = relative.relative_to(STREAM).as_posix()
    grids, objects, keys = [], [], set()
    for message in map_entries:
        entry = wire_fields(message)
        map_grid_id = native_uint32(one(entry, 1, 0))
        if map_grid_id in keys:
            raise ValueError("duplicate native GridCollection grid key")
        keys.add(map_grid_id)
        blob = one(entry, 2, 2, True)
        fields = wire_fields(blob)
        grid_id = native_uint32(one(fields, 1, 0))
        if grid_id != map_grid_id:
            raise ValueError("grid map key and native Grid.ID disagree")
        data_path = text_field(fields, 2, True)
        if not (data_path.startswith("GridData/") and
                data_path.endswith(".json") and safe_reference(data_path)):
            raise ValueError("invalid explicit GridData path")
        default_path = text_field(fields, 3)
        if default_path is not None and not (
            default_path.startswith("SceneLayouts/") and
            default_path.endswith(".json") and safe_reference(default_path)
        ):
            raise ValueError("invalid native GridDefaultLayoutPath")
        tessellation = native_int32(one(fields, 4, 0))
        if not 0 <= tessellation <= 256:
            raise ValueError("unsupported native TessellationFactor")
        seen_objects = set()
        for f, wire, item in fields:
            if f != 5:
                continue
            if wire != 2 or len(objects) >= 250000:
                raise ValueError("invalid or excessive native Grid.Objects")
            object_entry = wire_fields(item)
            object_map_key = native_uint32(one(object_entry, 1, 0))
            if object_map_key in seen_objects:
                raise ValueError("duplicate GridObject map key")
            seen_objects.add(object_map_key)
            value = one(object_entry, 2, 2, True)
            objects.append(native_layout_object(
                value, object_map_key, grid_id, layout_id, relative))
        grids.append({
            "gridIdNative": grid_id, "gridDataPath": data_path,
            "gridDefaultLayoutPath": default_path,
            "tessellationFactor": tessellation,
            "nextGridObjectIdNative": native_uint32(one(fields, 6, 0)),
            "defaultObjectCount": len(seen_objects),
            "gridDataPathWireField": "1.2.2",
        })
    return ({
        "layoutId": layout_id, "layoutKind": "nativeGridCollection",
        "gridReferences": [{"path": row["gridDataPath"],
                            "wireField": row["gridDataPathWireField"]}
                           for row in grids],
        "nativeGridEntries": grids,
        "defaultObjectCount": len(objects),
        "diffGridEntriesUnparsed": sum(1 for f, w, _ in root if f == 2 and w == 2),
        "worldCoordinatesVerified": False,
        "fixedObjectsVerified": False,
        "source": {"path": relative.as_posix(),
                   "nativeType": "Meta.GridCollection"},
    }, objects)



def floating_island_grid_collection_layout(data, relative):
    """Decode native Steam FloatingIslands wrapper without world-space claims.

    Original SceneLayouts/FloatingIslands/FloatingIsland_*/<island>Layout.json
    contains a context message in root.1 with an explicit CustomLocations
    reference in 1.4; the native Meta.GridCollection is embedded at root.2.
    Native grid IDs, object coordinates and terrain remain grid-local.
    """
    parts = relative.relative_to(STREAM).parts
    if len(parts) != 4 or parts[:2] != ("SceneLayouts", "FloatingIslands"):
        return None
    if relative.name == "CustomLocations.json":
        return None
    # Preserve direct collections if a future native source uses that form.
    if grid_collection_layout(data, relative) is not None:
        return None
    root = wire_fields(data)
    context_raw = one(root, 1, 2)
    if context_raw is None:
        return None
    try:
        custom = text_field(wire_fields(context_raw), 4)
    except (ValueError, UnicodeError):
        return None
    if custom is None:
        return None
    expected = (relative.parent / "CustomLocations.json").relative_to(
        STREAM).as_posix()
    if custom != expected or not safe_reference(custom):
        raise ValueError("native floating island custom location path mismatch")
    embedded = one(root, 2, 2, True)
    parsed = grid_collection_layout(embedded, relative)
    if parsed is None:
        raise ValueError("floating island wrapper missing native GridCollection")
    layout, objects = parsed
    layout["embeddedGridCollectionWireField"] = 2
    layout["floatingIslandCustomLocationPath"] = custom
    layout["source"] = {
        "path": relative.as_posix(),
        "nativeType": "floating_island_source_with_embedded_Meta.GridCollection",
        "embeddedGridCollectionWireField": 2,
    }
    for entry in layout["nativeGridEntries"]:
        entry["gridDataPathWireField"] = "2.1.2.2"
    layout["gridReferences"] = [
        {"path": entry["gridDataPath"], "wireField": "2.1.2.2"}
        for entry in layout["nativeGridEntries"]
    ]
    return layout, objects


def interior_grid_collection_layout(data, relative):
    """Read native House/Room wrapped GridCollections without guessing context.

    Source-original Homes and certain Rooms (e.g. Boutique) store an opaque
    context message at root field 1 and a Meta.GridCollection at root field 2.
    Other Rooms store a *direct* native GridCollection; those are deliberately
    handled by grid_collection_layout(), not this wrapper-specific reader.
    The context SHA is provenance only: it is neither a world transform nor
    evidence of room-edit or placement permission.
    """
    parts = relative.relative_to(STREAM).parts
    if len(parts) < 3 or parts[:2] not in (
        ("SceneLayouts", "Houses"), ("SceneLayouts", "Rooms")
    ) or relative.name == "CustomLocations.json":
        return None
    # Native direct GridCollections are handled by the ordinary reader.
    if grid_collection_layout(data, relative) is not None:
        return None
    root = wire_fields(data)
    context_raw = one(root, 1, 2)
    if context_raw is None:
        return None
    # We have a matching source family and context. An unexpected envelope
    # must fail closed instead of dropping source-native fields silently.
    if any((number, wire) not in ((1, 2), (2, 2))
           for number, wire, _ in root):
        raise ValueError("unexpected native interior wrapper wire fields")
    embedded = one(root, 2, 2, True)
    parsed = grid_collection_layout(embedded, relative)
    if parsed is None:
        raise ValueError("native interior wrapper missing a GridCollection")
    layout, objects = parsed
    layout["embeddedGridCollectionWireField"] = 2
    layout["unparsedInteriorContextSha256"] = digest(context_raw)
    layout["source"] = {
        "path": relative.as_posix(),
        "nativeType": "interior_source_with_embedded_Meta.GridCollection",
        "embeddedGridCollectionWireField": 2,
    }
    for entry in layout["nativeGridEntries"]:
        entry["gridDataPathWireField"] = "2.1.2.2"
    layout["gridReferences"] = [
        {"path": entry["gridDataPath"], "wireField": "2.1.2.2"}
        for entry in layout["nativeGridEntries"]
    ]
    # The original source's local Grid.ID, x/y and initial objects are NOT
    # verified world coordinates, collision constraints or furniture rules.
    return layout, objects


def realm_grid_collection_layout(data, relative):
    """Read only explicit SceneLayouts/Realms native embedded GridCollections.

    Unlike Village.DefaultVillageData (AreaType -> layout reference), realm
    original source stores the GridCollection directly in its protobuf root
    field 2, while root field 1 contains realm context/custom-location path.
    This is source-local evidence, NOT a verified gameplay world transform.
    """
    inside = relative.relative_to(STREAM).parts
    if len(inside) < 4 or inside[:2] != ("SceneLayouts", "Realms"):
        return None
    if relative.name == "CustomLocations.json" or "PuzzleAnswer" in relative.name:
        return None
    root = wire_fields(data)
    context_raw = one(root, 1, 2)
    if context_raw is None:
        return None
    try:
        context = wire_fields(context_raw)
        custom_path = text_field(context, 3)
    except (ValueError, UnicodeError):
        return None
    if custom_path is None:
        return None
    if not (custom_path.startswith("SceneLayouts/Realms/") and
            custom_path.endswith(".json") and safe_reference(custom_path)):
        raise ValueError("invalid native realm custom location reference")
    embedded = one(root, 2, 2, True)
    parsed = grid_collection_layout(embedded, relative)
    if parsed is None:
        raise ValueError("native realm wrapper has no recognized embedded GridCollection")
    layout, objects = parsed
    # Keep the existing pure GridCollection API so its grid-local anchors,
    # windows, and fail-closed terrain reader remain valid. Preserve exact
    # provenance of the outer realm wrapper (rather than claiming that the
    # entire original source is a top-level Meta.GridCollection).
    layout["embeddedGridCollectionWireField"] = 2
    layout["realmCustomLocationPath"] = custom_path
    layout["source"] = {
        "path": relative.as_posix(),
        "nativeType": "realm_source_with_embedded_Meta.GridCollection",
        "embeddedGridCollectionWireField": 2,
    }
    for entry in layout["nativeGridEntries"]:
        entry["gridDataPathWireField"] = "2.1.2.2"
    layout["gridReferences"] = [
        {"path": entry["gridDataPath"], "wireField": "2.1.2.2"}
        for entry in layout["nativeGridEntries"]
    ]
    return layout, objects



def offgrid_grid_collection_layout(data, relative):
    """Decode only explicit original OffGridBuildings embedded collections.

    The OffGrid original native wrapper differs from Realm in its context:
    root.1.2 = source custom locations path (Realm uses root.1.3).
    root.2 contains a native Meta.GridCollection in BOTH source families.
    All native anchors remain grid-local and read-only; the wrapper is not
    an area or evidence of a world-space transform.
    """
    parts = relative.relative_to(STREAM).parts
    if len(parts) < 3 or parts[:2] != ("SceneLayouts", "OffGridBuildings"):
        return None
    if relative.name == "CustomLocations.json" or "PuzzleAnswer" in relative.name:
        return None
    root = wire_fields(data)
    # Original OffGrid scene sources have two distinct wire envelopes.
    # Some event visual layouts (Steam 1.26.2 Halloween 2025/2026) are
    # direct Meta.GridCollection values with repeated root field 1 map
    # entries, not context(1) + embedded collection(2). Dispatch those
    # through scene_layouts()' normal direct collection reader, otherwise
    # one(root, 1, 2) would reject the repeated map as a duplicate field.
    # A malformed *known* direct GridCollection still fails closed here.
    if grid_collection_layout(data, relative) is not None:
        return None
    context_raw = one(root, 1, 2)
    if context_raw is None:
        return None
    try:
        context = wire_fields(context_raw)
        custom = text_field(context, 2)
    except (ValueError, UnicodeError):
        return None
    if custom is None:
        return None
    if not (custom.startswith("SceneLayouts/OffGridBuildings/") and
            custom.endswith("/CustomLocations.json") and
            safe_reference(custom)):
        raise ValueError("invalid native off-grid custom location reference")
    # Fail closed for a missing or malformed native GridCollection. Do not
    # silently reinterpret a native off-grid scene as a village AreaType.
    embedded = one(root, 2, 2, True)
    parsed = grid_collection_layout(embedded, relative)
    if parsed is None:
        raise ValueError("native off-grid wrapper has no recognized embedded GridCollection")
    layout, objects = parsed
    layout["embeddedGridCollectionWireField"] = 2
    layout["offGridCustomLocationPath"] = custom
    layout["source"] = {
        "path": relative.as_posix(),
        "nativeType": "offgrid_source_with_embedded_Meta.GridCollection",
        "embeddedGridCollectionWireField": 2,
    }
    for entry in layout["nativeGridEntries"]:
        entry["gridDataPathWireField"] = "2.1.2.2"
    layout["gridReferences"] = [
        {"path": entry["gridDataPath"], "wireField": "2.1.2.2"}
        for entry in layout["nativeGridEntries"]
    ]
    return layout, objects


def default_village_layout(data, relative):
    """Meta.DefaultVillageData with explicit area->GridLayoutPath map."""
    root = wire_fields(data)
    villages = [value for f, w, value in root if (f, w) == (1, 2)]
    paths = [value for f, w, value in root if (f, w) == (2, 2)]
    if len(villages) != 1 or not paths:
        return None
    village = wire_fields(villages[0])
    scene_id = one(village, 2, 0)  # Village.SceneItemId
    area_data_name = text_field(village, 3)  # Village.VillageAreaDataName
    if scene_id is None or not area_data_name:
        return None
    # Village.CustomLocationPositionsPath and separated paths are
    # source-defined but not decoded as 2D coordinates here.
    custom_paths = [value.decode("utf-8") for field, wire, value in village
                    if (field, wire) in ((6, 2), (7, 2))]
    for custom in custom_paths:
        if not (custom.startswith("SceneLayouts/") and
                custom.endswith(".json") and safe_reference(custom)):
            raise ValueError("invalid native custom location path")
    separated_area_names = [value.decode("utf-8") for field, wire, value in root
                            if (field, wire) == (3, 2)]
    areas, area_keys = [], set()
    for message in paths:
        entry = wire_fields(message)
        area_type = native_int32(one(entry, 1, 0))
        if area_type in area_keys:
            raise ValueError("duplicate DefaultVillageData GridLayoutPaths key")
        area_keys.add(area_type)
        path = text_field(entry, 2, True)
        if not (path.startswith("SceneLayouts/") and
                path.endswith(".json") and safe_reference(path)):
            raise ValueError("invalid default village GridLayoutPaths reference")
        areas.append({
            "nativeAreaTypeCode": area_type,
            "nativeAreaTypeName": VILLAGE_AREA_NAMES.get(area_type),
            "gridLayoutPath": path,
        })
    layout_id = relative.relative_to(STREAM).as_posix()
    return {
        "layoutId": layout_id, "layoutKind": "nativeDefaultVillageData",
        "defaultVillageSceneId": native_int32(scene_id),
        "nativeVillageAreaDataName": area_data_name,
        "customLocationPaths": custom_paths,
        "separatedAreasRaw": separated_area_names,
        "areaLayoutReferences": sorted(
            areas, key=lambda row: row["nativeAreaTypeCode"]),
        "gridReferences": [],
        "nativeGridEntries": [], "defaultObjectCount": 0,
        "worldCoordinatesVerified": False, "fixedObjectsVerified": False,
        "source": {"path": relative.as_posix(),
                   "nativeType": "Meta.DefaultVillageData"},
    }


def scene_layouts(root, sources, *, native_data_hashes=None):
    layouts, layout_objects = [], []
    for relative in optional_files(root, STREAM / "SceneLayouts", sources):
        data = source_bytes(root, relative, sources)
        offgrid = offgrid_grid_collection_layout(data, relative)
        if offgrid is not None:
            layout, objects = offgrid
            attach_native_diffgrid_hashes(layout, data, native_data_hashes)
            layouts.append(layout)
            layout_objects.extend(objects)
            continue
        floating = floating_island_grid_collection_layout(data, relative)
        if floating is not None:
            layout, objects = floating
            attach_native_diffgrid_hashes(layout, data, native_data_hashes)
            layouts.append(layout)
            layout_objects.extend(objects)
            continue
        interior = interior_grid_collection_layout(data, relative)
        if interior is not None:
            layout, objects = interior
            attach_native_diffgrid_hashes(layout, data, native_data_hashes)
            layouts.append(layout)
            layout_objects.extend(objects)
            continue
        realm = realm_grid_collection_layout(data, relative)
        if realm is not None:
            layout, objects = realm
            attach_native_diffgrid_hashes(layout, data, native_data_hashes)
            layouts.append(layout)
            layout_objects.extend(objects)
            continue
        parsed = grid_collection_layout(data, relative)
        if parsed is not None:
            layout, objects = parsed
            attach_native_diffgrid_hashes(layout, data, native_data_hashes)
            layouts.append(layout)
            layout_objects.extend(objects)
            continue
        default = default_village_layout(data, relative)
        if default is not None:
            layouts.append(default)
            continue
        links = explicit_references(data)
        refs = sorted({(entry["path"], entry["wireField"]) for entry in links})
        layouts.append({
            "layoutId": relative.relative_to(STREAM).as_posix(),
            "layoutKind": "unresolvedBinaryLayout",
            "gridReferences": [{"path": path, "wireField": field} for path, field in refs],
            "nativeGridEntries": [], "defaultObjectCount": None,
            "worldCoordinatesVerified": False, "fixedObjectsVerified": False,
            "source": {"path": relative.as_posix()},
        })
    return layouts, layout_objects


def validate_overrides(root, sources, objects):
    by_id = {row["itemId"]: row for row in objects}
    conflicts, inspected = [], 0
    for relative in optional_files(root, STREAM / "Furniture", sources):
        raw = source_bytes(root, relative, sources)
        try:
            document = json.loads(raw.decode("utf-8-sig"))
        except (ValueError, UnicodeError):
            conflicts.append({"path": relative.as_posix(), "reason": "non_json_override"})
            continue
        inspected += 1
        if not isinstance(document, dict) or type(document.get("ID")) is not int:
            conflicts.append({"path": relative.as_posix(), "reason": "unknown_override_schema"})
            continue
        native_id = document["ID"]
        record = by_id.get(native_id)
        if record is None:
            conflicts.append({"path": relative.as_posix(), "itemId": native_id,
                              "reason": "native_itemlist_id_not_found"})
        elif record["nativeName"] != document.get("Name"):
            conflicts.append({"path": relative.as_posix(), "itemId": native_id,
                              "reason": "name_mismatch_with_itemlist",
                              "itemlistName": record["nativeName"],
                              "overrideName": document.get("Name")})
        else:
            # The explicitly stored JSON is supplementary evidence, NEVER an implicit override.
            record["additionalSource"] = {"path": relative.as_posix()}
    return conflicts, inspected


def semantic(record):
    return {key: value for key, value in record.items()
            if key not in ("source", "additionalSource")}


def diff_records(old, new, key, authoritative_membership=False):
    before = {str(item[key]): semantic(item) for item in old}
    after = {str(item[key]): semantic(item) for item in new}
    if len(before) != len(old) or len(after) != len(new):
        raise ValueError("duplicate entity ID in DB-04 snapshot diff")
    old_keys, new_keys = set(before), set(after)
    changed = []
    for ident in sorted(old_keys & new_keys):
        if canonical(before[ident]) != canonical(after[ident]):
            changed.append({"id": ident,
                            "fields": sorted(k for k in set(before[ident]) | set(after[ident])
                                             if before[ident].get(k) != after[ident].get(k))})
    added, removed = sorted(new_keys - old_keys), sorted(old_keys - new_keys)
    if authoritative_membership:
        return {"added": added, "removed": removed, "changed": changed,
                "membershipConfidence": "verified"}
    # Source subsets differ across original-game snapshots. Reporting an ID
    # as truly added/removed would otherwise confuse missing source coverage
    # with a game update.
    return {"added": [], "removed": [], "candidateAdded": added,
            "candidateRemoved": removed, "changed": changed,
            "membershipConfidence": "unverified_source_coverage"}


def make_diff(previous, outputs):
    if previous is None:
        return {"schema": SCHEMA, "status": "no_previous_snapshot",
                "note": "An initial snapshot cannot establish update deltas."}
    previous_evidence = validate_snapshot(previous)
    result = {"schema": SCHEMA, "status": "compared",
              "sourceMembershipVerified": False,
              "previousSourceScopeVerified": previous_evidence["sourceScopeVerified"],
              "note": "Added/removed entities are candidate-only until both complete source scopes are independently verified.",
              "entities": {}}
    for name, key in (("scenes", "sceneId"), ("objects", "itemId"),
                      ("grids", "gridId"), ("layouts", "layoutId"),
                      ("worlds", "worldId"), ("areas", "areaId"),
                      ("layoutObjects", "layoutObjectId")):
        file = previous / (name + ".json")
        if not file.is_file():
            if name == "layoutObjects":
                result["entities"][name] = {
                    "status": "previous_snapshot_lacks_layout_objects",
                    "note": "No default-object diff is inferred for a legacy snapshot."}
                continue
            raise ValueError(f"missing prior snapshot: {file.name}")
        old = json.loads(file.read_text(encoding="utf-8"))
        if not isinstance(old, list):
            raise ValueError(f"invalid prior snapshot: {file.name}")
        result["entities"][name] = diff_records(old, outputs[name], key)
    return result


def write_json(path, value):
    payload = (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    fd, temp = tempfile.mkstemp(prefix=".db04-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return digest(payload)


def checked_dirs(game, out):
    if not game.is_dir() or game == out or game in out.parents or out in game.parents:
        raise ValueError("input/output directories must exist and never overlap")
    if any((parent / ".git").exists() for parent in (out, *out.parents)):
        raise ValueError("game-derived output cannot be written into a Git worktree")


def extract(game, out, previous=None):
    game, out = game.resolve(), out.resolve()
    previous = previous.resolve() if previous is not None else None
    checked_dirs(game, out)
    if previous is not None and (previous == out or previous == game or game in previous.parents):
        raise ValueError("invalid previous snapshot path")
    sources = []
    version = source_bytes(game, Path("FullVersion.txt"), sources)
    matches = sorted(set(VERSION_RE.findall(version.decode("utf-8-sig"))))
    if len(matches) != 1:
        raise ValueError("FullVersion.txt does not establish a single game version")
    objects, scenes, missing = native_objects(game, sources)
    worlds, areas, hierarchy_unresolved = world_registry(
        game, sources, {scene["sceneId"] for scene in scenes})
    by_scene = {scene["sceneId"]: scene for scene in scenes}
    for world in worlds:
        scene = by_scene.get(world["sceneId"])
        if scene is not None and world["worldIdKind"] == "nativeWorldName":
            scene["parentWorldId"] = world["worldId"]
            scene["worldHierarchyVerified"] = True
    native_data_hashes = {} if matches[0] == "1.26.2" else None
    grids = grid_assets(game, sources, source_game_version=matches[0],
                        native_data_hashes=native_data_hashes)
    layouts, layout_objects = scene_layouts(game, sources,
                                            native_data_hashes=native_data_hashes)
    conflicts, overrides = validate_overrides(game, sources, objects)
    source_paths = {row["path"] for row in sources}
    missing_refs = sorted({
        ref["path"] for layout in layouts for ref in layout["gridReferences"]
        if (STREAM / ref["path"]).as_posix() not in source_paths
    })
    missing_area_layouts = sorted({
        ref["gridLayoutPath"]
        for layout in layouts
        for ref in layout.get("areaLayoutReferences", [])
        if (STREAM / ref["gridLayoutPath"]).as_posix() not in source_paths
    })
    known_object_ids = {obj["itemId"] for obj in objects}
    object_types_outside_db04 = sorted({
        row["itemId"] for row in layout_objects
        if row["itemId"] not in known_object_ids
    })
    unresolved = {
        "schema": SCHEMA,
        "unknownSemantics": [
            "Scene parent-world/biome hierarchy is not established by native Scene ID alone",
            "GridData packed 1/2/4-bit source-local read-only decoding is corroborated for original Steam 1.26.1 and 1.26.2 native read paths; later builds retain raw bytes without verified coordinate interpretation",
            "Footprint layer values are native uint32 values; their bit meanings and XY indexing are unverified",
            "AcceptedFloorTypesFlag is a raw mask, not a validated placement permission",
            "Rotation order, wall/floor placement, road/fence adjacency and terrain transitions are unverified",
            "No save-specific positions are included (DB-05 owns them)",
        ],
        "missingFootprintsByCategory": dict(sorted(missing.items())),
        "unresolvedExplicitGridReferences": missing_refs,
        "unresolvedDefaultVillageAreaLayouts": missing_area_layouts,
        "layoutObjectIdsNotInDB04FurnitureBuilding": object_types_outside_db04,
        "nativeOverrideConflicts": conflicts,
        "worldRegistryUnresolved": hierarchy_unresolved,
    }
    outputs = {"scenes": scenes, "objects": objects, "grids": grids,
               "layouts": layouts, "layoutObjects": layout_objects,
               "worlds": worlds, "areas": areas}
    delta = make_diff(previous, outputs)
    out.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name, rows in outputs.items():
        hashes[name + ".json"] = write_json(out / (name + ".json"), rows)
    hashes["unresolved.json"] = write_json(out / "unresolved.json", unresolved)
    hashes["diff.json"] = write_json(out / "diff.json", delta)
    report = {
        "schema": SCHEMA, "gameVersion": matches[0],
        "status": "native_partial_world_extraction",
        "sceneCount": len(scenes), "worldCount": len(worlds),
        "areaCount": len(areas), "objectCount": len(objects),
        "withNativeFootprint": sum(row["footprint"] is not None for row in objects),
        "gridFileCount": len(grids),
        "nativeGridDecodeFailures": sum(row["status"] == "unrecognized_binary_structure"
                                        for row in grids),
        "nativePackedGridHistogramCount": sum(
            row.get("nativePaletteIndexCellCounts") is not None
            for row in grids),
        "layoutFileCount": len(layouts),
        "defaultLayoutObjectCount": len(layout_objects),
        "typedGridCollectionCount": sum(row["layoutKind"] == "nativeGridCollection"
                                        for row in layouts),
        "typedDefaultVillageCount": sum(row["layoutKind"] == "nativeDefaultVillageData"
                                       for row in layouts),
        "furnitureOverridesInspected": overrides,
        "nativeOverrideConflictCount": len(conflicts), "unresolvedGridReferenceCount": len(missing_refs),
    }
    hashes["report.json"] = write_json(out / "report.json", report)
    manifest = {
        "schema": SCHEMA, "status": "partial_game_native_evidence",
        "platform": "Steam", "gameVersion": matches[0],
        "gameVersionEvidence": "FullVersion.txt", "worldHierarchyComplete": False,
        "placementRulesComplete": False, "sources": sorted(sources, key=lambda x: x["path"]),
        "outputSha256": hashes,
        "note": "All game-derived output belongs in private SRC-05; no assets or save-state copied to Git.",
    }
    write_json(out / "manifest.json", manifest)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description="DB-04 original-game world evidence (read-only)")
    parser.add_argument("--game", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args(argv)
    try:
        print(canonical(extract(args.game, args.out, args.previous)))
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError, struct.error) as error:
        parser.exit(1, f"DB-04 failed: {error}\n")


if __name__ == "__main__":
    main()
