#!/usr/bin/env python3
"""Validate the DB-04 *private output snapshot*, not the user's save.

No source-game I/O. Source assets remain in SRC-05, never in public Git.
"""
import argparse
import base64
import binascii
import hashlib
import json
import re
import sys
from pathlib import Path

from local_anchor_audit import audit_anchor_envelopes
from terrain_codec import (describe_native_packing, count_packed_palette_indices,
                           describe_native_direct_floor_types,
                           DIRECT_JSON_SOURCE_FORMAT)

SCHEMA = "wand.db04.world@1"
FAMILIES = {
    "objects": "itemId",
    "scenes": "sceneId",
    "worlds": "worldId",
    "areas": "areaId",
    "grids": "gridId",
    "layouts": "layoutId",
    "layoutObjects": "layoutObjectId",
}
LIMIT = 256 * 1024 * 1024
FILE_NAME = re.compile(r"[A-Za-z][A-Za-z0-9-]*\.json\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")


def read_bytes(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > LIMIT:
        raise ValueError(f"unsafe/missing/oversized DB-04 file: {path.name}")
    return path.read_bytes()


def read_json(path):
    return json.loads(read_bytes(path).decode("utf-8-sig"))


def index(rows, key, label):
    if not isinstance(rows, list):
        raise ValueError(f"{label} is not a list")
    found = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"{label} contains a non-object record")
        value = row.get(key)
        if (type(value) not in (str, int) or not str(value) or
                str(value) in found):
            raise ValueError(f"{label} contains duplicate/invalid {key}")
        found[str(value)] = row
    return found


def checked_footprint(item):
    footprint = item.get("footprint")
    if footprint is None:
        return
    if not isinstance(footprint, dict):
        raise ValueError("invalid native footprint")
    x, y = footprint.get("sizeX"), footprint.get("sizeY")
    layers = footprint.get("layerValues")
    if (type(x) is not int or type(y) is not int or
        not 1 <= x <= 256 or not 1 <= y <= 256 or x * y > 16384 or
        not isinstance(layers, list) or len(layers) != x * y or
        any(type(v) is not int or v < 0 or v > 0xffffffff for v in layers)):
        raise ValueError(f"invalid native footprint on item {item.get('itemId')}")
    # Newer original-source snapshots retain protobuf Nullable<int> field
    # 6.5. Legacy source previews had no such key and remain accepted.
    if "strideOverride" in footprint:
        stride = footprint["strideOverride"]
        present = footprint.get("strideOverrideSourceVerified")
        wire = footprint.get("nativeWireFields")
        if (type(present) is not bool or
                (present and (type(stride) is not int or
                              not -0x80000000 <= stride <= 0x7fffffff)) or
                (not present and stride is not None) or
                not isinstance(wire, dict) or
                wire.get("strideOverride") != ("6.5" if present else None) or
                footprint.get("strideOverridePlacementSemanticsVerified")
                is not False):
            raise ValueError("invalid source GridAreaData stride override evidence")
    if footprint.get("cellIndexToXYVerified") is not False:
        raise ValueError("unverified footprint indexing must remain false")


def checked_grid(grid, *, source_game_version):
    x, y = grid.get("sizeX"), grid.get("sizeY")
    if x is not None or y is not None:
        if type(x) is not int or type(y) is not int or not (
                0 < x * y <= 16_777_216 and x > 0 and y > 0):
            raise ValueError("invalid native grid dimensions")
    values = grid.get("nativeFloorTypes")
    if values is not None and (not isinstance(values, list) or
        x is None or len(values) != x * y or
        any(type(v) is not int or not 0 <= v <= 0xffffffff for v in values)):
        raise ValueError("malformed native grid direct floor array")
    packed = grid.get("compactedFloorTypesBase64")
    if grid.get("nativeSourceFormat") is not None:
        if (grid["nativeSourceFormat"] != DIRECT_JSON_SOURCE_FORMAT or
                packed is not None or values is None or
                grid.get("nativeFloorTypePalette") != [] or
                grid.get("nativeCompactedByteCount") is not None or
                grid.get("nativeCompactedSha256") is not None or
                grid.get("nativePaletteIndexCellCounts") is not None):
            raise ValueError("invalid original JSON GridData evidence")
        expected = describe_native_direct_floor_types(
            x, y, values, source_game_version=source_game_version)
        if (grid.get("terrainDecoding") != expected or
                grid.get("nativeFloorIndexToLocalXYCorroborated")
                is not expected["decoded"]):
            raise ValueError("original JSON GridData index evidence mismatches source")
    elif packed is None and (
            grid.get("terrainDecoding") or {}).get("decoded") is True:
        raise ValueError("native direct terrain cannot be asserted without source format")
    if packed is None and grid.get("nativePaletteIndexCellCounts") is not None:
        raise ValueError("unbacked native terrain palette histogram")
    if packed is not None:
        if not isinstance(packed, str):
            raise ValueError("invalid native packed base64")
        try:
            data = base64.b64decode(packed, validate=True)
        except (ValueError, binascii.Error) as error:
            raise ValueError("invalid native packed base64") from error
        if (len(data) != grid.get("nativeCompactedByteCount") or
                hashlib.sha256(data).hexdigest() != grid.get("nativeCompactedSha256")):
            raise ValueError("grid packed-byte integrity mismatch")
        computed = describe_native_packing(
            x, y, grid.get("nativeFloorTypePalette"), data,
            source_game_version=source_game_version)
        declared = grid.get("terrainDecoding")
        if declared is not None:
            if not isinstance(declared, dict):
                raise ValueError("invalid terrain decoding evidence")
            if declared != computed:
                raise ValueError("terrain decoding evidence mismatches native bytes")
        if ("nativeFloorIndexToLocalXYCorroborated" in grid and
                grid["nativeFloorIndexToLocalXYCorroborated"] is not
                computed["decoded"]):
            raise ValueError("native terrain index proof flag mismatches source version")
        if "nativePaletteIndexCellCounts" in grid:
            counted = (count_packed_palette_indices(
                x, y, grid.get("nativeFloorTypePalette"), data,
                source_game_version=source_game_version)
                if computed["decoded"] else None)
            if grid["nativePaletteIndexCellCounts"] != counted:
                raise ValueError("terrain palette histogram mismatches packed bytes")


def validate_snapshot(directory):
    directory = Path(directory).resolve(strict=True)
    manifest = read_json(directory / "manifest.json")
    if manifest.get("schema") != SCHEMA or manifest.get("status") != "partial_game_native_evidence":
        raise ValueError("invalid DB-04 manifest contract")
    entries = manifest.get("outputSha256")
    if not isinstance(entries, dict):
        raise ValueError("missing output hash register")
    for name, expected in entries.items():
        if not FILE_NAME.fullmatch(name) or name == "manifest.json" or not (
                isinstance(expected, str) and HASH.fullmatch(expected)):
            raise ValueError("invalid manifest output file entry")
        actual = hashlib.sha256(read_bytes(directory / name)).hexdigest()
        if actual != expected:
            raise ValueError(f"DB-04 output SHA mismatch: {name}")

    families = {}
    for name, key in FAMILIES.items():
        fname = name + ".json"
        if fname not in entries:
            if name == "layoutObjects":
                # Pre-extension partial previews may predate this entity family.
                families[name] = {}
                continue
            raise ValueError(f"missing required native family {name}")
        families[name] = index(read_json(directory / fname), key, name)
    warnings = []
    for record in families["objects"].values():
        checked_footprint(record)
    for record in families["grids"].values():
        checked_grid(record, source_game_version=manifest.get("gameVersion"))
    for row in families["layoutObjects"].values():
        layout_id = row.get("layoutId")
        layout = families["layouts"].get(str(layout_id))
        if layout is None:
            raise ValueError("layoutObject references absent source layout")
        grid_id = row.get("gridIdNative")
        object_id = row.get("gridObjectIdNative")
        if (layout.get("layoutKind") != "nativeGridCollection" or
            not isinstance(layout_id, str) or
            type(grid_id) is not int or not 0 <= grid_id <= 0xffffffff or
            type(object_id) is not int or not 0 <= object_id <= 0xffffffff or
            row.get("layoutObjectId") !=
                f"{layout_id}#grid={grid_id}#object={object_id}" or
            type(row.get("x")) is not int or type(row.get("y")) is not int or
            type(row.get("itemId")) is not int or
            row.get("worldCoordinatesVerified") is not False or
            row.get("fixedImmovableVerified") is not False):
            raise ValueError("invalid game-native GridObject identity or initial placement")
    for layout in families["layouts"].values():
        if layout.get("layoutKind") != "nativeGridCollection":
            continue
        layout_id = layout["layoutId"]
        rows = [row for row in families["layoutObjects"].values()
                if row["layoutId"] == layout_id]
        if layout.get("defaultObjectCount") != len(rows):
            raise ValueError("default GridCollection object count mismatch")
        entries = layout.get("nativeGridEntries")
        if not isinstance(entries, list):
            raise ValueError("invalid native GridCollection grid list")
        grid_ids = set()
        for grid in entries:
            if not isinstance(grid, dict):
                raise ValueError("invalid native GridCollection grid entry")
            grid_id = grid.get("gridIdNative")
            if (type(grid_id) is not int or not 0 <= grid_id <= 0xffffffff or
                grid_id in grid_ids):
                raise ValueError("duplicate or invalid native GridCollection grid ID")
            grid_ids.add(grid_id)
            hash_keys = {"defaultGridHashCode", "defaultGridDataHashCode",
                         "defaultHashEvidence"}
            if hash_keys.intersection(grid):
                if (not hash_keys.issubset(grid) or
                    manifest.get("platform") != "Steam" or
                    manifest.get("gameVersion") != "1.26.2" or
                    grid["defaultHashEvidence"] != "source_native_method_correlated" or
                    any(type(grid[k]) is not int or not -(1 << 31) <= grid[k] < (1 << 31)
                        for k in ("defaultGridHashCode", "defaultGridDataHashCode")) or
                    grid.get("gridDataPath") not in families["grids"]):
                    raise ValueError("invalid source-native DiffGrid hash pair")
            grid_rows = [row for row in rows if row["gridIdNative"] == grid_id]
            if grid.get("defaultObjectCount") != len(grid_rows):
                raise ValueError("native GridCollection per-grid object count mismatch")
        for row in rows:
            if row["gridIdNative"] not in grid_ids:
                raise ValueError("default object references absent native grid ID")
    # Source subsets are allowed to omit referenced grid/layout files.
    for layout in families["layouts"].values():
        for ref in layout.get("gridReferences", []):
            if ref.get("path") not in families["grids"]:
                warnings.append({"code": "missing_referenced_grid_in_subset",
                                 "layoutId": layout["layoutId"], "path": ref.get("path")})
        for ref in layout.get("areaLayoutReferences", []):
            if ref.get("gridLayoutPath") not in families["layouts"]:
                warnings.append({"code": "missing_area_layout_in_subset",
                                 "layoutId": layout["layoutId"],
                                 "path": ref.get("gridLayoutPath")})
    return {
        "schema": SCHEMA, "status": "integrity_verified_not_placement_verified",
        "gameVersion": manifest.get("gameVersion"),
        "sourceScopeVerified": manifest.get("sourceScopeVerified") is True,
        "counts": {key: len(value) for key, value in families.items()},
        "missingSourceReferences": warnings[:200],
        "missingSourceReferenceCount": len(warnings),
        "nativeAnchorEnvelopeEvidence": audit_anchor_envelopes(
            list(families["layouts"].values()),
            list(families["grids"].values()),
            list(families["layoutObjects"].values())),
        "note": "Integrity proof does not mean complete game coverage or verified placement legality",
    }


def main():
    cli = argparse.ArgumentParser(description="Validate DB-04 private world output hashes and relationships")
    cli.add_argument("--snapshot", required=True, type=Path)
    args = cli.parse_args()
    try:
        print(json.dumps(validate_snapshot(args.snapshot), ensure_ascii=False, sort_keys=True))
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError) as err:
        cli.exit(1, f"DB-04 snapshot verification failed: {err}\n")


if __name__ == "__main__":
    main()
