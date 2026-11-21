#!/usr/bin/env python3
"""Audit native default-layout anchors against original grid-local terrain.

This tool reads a PRIVATE, SHA-verified DB-04 snapshot. It never reads or
writes user saves, never judges full-footprint collision, rotation, or whether
an object is legally placeable. The source-level checks are deliberately
narrow: anchor within source grid, and native mask intersection at that anchor.
"""
import argparse
import base64
import json
from collections import Counter
from pathlib import Path

from terrain_codec import describe_native_packing
from verify_bundle import read_json, validate_snapshot


def _index(rows, key):
    return {str(row[key]): row for row in rows}


def audit_snapshot(snapshot: Path, *, max_samples=25):
    if type(max_samples) is not int or not 0 <= max_samples <= 100:
        raise ValueError("native audit sample limit must be 0..100")
    root = Path(snapshot).resolve(strict=True)
    integrity = validate_snapshot(root)
    layouts = _index(read_json(root / "layouts.json"), "layoutId")
    grids = _index(read_json(root / "grids.json"), "gridId")
    objects = _index(read_json(root / "objects.json"), "itemId")
    path = root / "layoutObjects.json"
    initial_objects = read_json(path) if path.is_file() else []

    counters = Counter()
    samples = []
    terrain_cache = {}
    audit_by_grid = {}

    def sample(reason, native, **evidence):
        if len(samples) < max_samples:
            samples.append({
                "code": reason, "layoutObjectId": native["layoutObjectId"],
                "itemId": native["itemId"],
                "nativeGridId": native["gridIdNative"],
                "x": native["x"], "y": native["y"], **evidence,
            })

    for native in initial_objects:
        counters["nativeDefaultObjectsScanned"] += 1
        layout = layouts.get(str(native["layoutId"]))
        if layout is None or layout.get("layoutKind") != "nativeGridCollection":
            counters["noNativeGridCollection"] += 1
            sample("no_native_grid_collection", native)
            continue

        matches = [row for row in layout.get("nativeGridEntries", [])
                   if row["gridIdNative"] == native["gridIdNative"]]
        if len(matches) != 1:
            counters["missingOrAmbiguousNativeGridEntry"] += 1
            sample("missing_or_ambiguous_native_grid_entry", native)
            continue

        grid_path = matches[0]["gridDataPath"]
        grid = grids.get(grid_path)
        if grid is None:
            counters["missingGridFileInSourceSubset"] += 1
            sample("missing_grid_source", native, gridDataPath=grid_path)
            continue

        x, y = native["x"], native["y"]
        if not (type(x) is int and type(y) is int and
                type(grid.get("sizeX")) is int and
                type(grid.get("sizeY")) is int and
                0 <= x < grid["sizeX"] and 0 <= y < grid["sizeY"]):
            counters["anchorOutsideGridOrUnknownDimensions"] += 1
            sample("anchor_outside_native_grid", native, gridDataPath=grid_path)
            continue
        counters["anchorsInsideNativeGrid"] += 1
        audit_by_grid[grid_path] = audit_by_grid.get(grid_path, 0) + 1

        if grid_path not in terrain_cache:
            packed = grid.get("compactedFloorTypesBase64")
            meta = grid.get("terrainDecoding")
            if (packed is None or not isinstance(meta, dict) or
                    meta.get("decoded") is not True or
                    meta.get("packing") != "x_major_msb_first"):
                terrain_cache[grid_path] = None
            else:
                raw = base64.b64decode(packed, validate=True)
                evidence = describe_native_packing(grid["sizeX"], grid["sizeY"],
                                                   grid["nativeFloorTypePalette"],
                                                   raw)
                if evidence != meta:
                    raise ValueError("corrupted grid decoding evidence")
                terrain_cache[grid_path] = (raw, grid["nativeFloorTypePalette"],
                                            grid["sizeY"], evidence["cellBits"])
        parsed = terrain_cache[grid_path]
        if parsed is None:
            counters["unsupportedNativeTerrainPacking"] += 1
            continue
        raw, palette, size_y, bits = parsed
        cell_index = x * size_y + y
        shift = 8 - bits - ((cell_index * bits) % 8)
        palette_index = (raw[(cell_index * bits) // 8] >> shift) & ((1 << bits) - 1)
        if palette_index >= len(palette):
            raise ValueError("decoded native floor palette index out of range")
        value = palette[palette_index]
        counters["anchorNativeFloorDecoded"] += 1

        item = objects.get(str(native["itemId"]))
        footprint = item.get("footprint") if item else None
        mask = (footprint.get("acceptedFloorTypesFlag")
                if isinstance(footprint, dict) else None)
        if type(mask) is not int or not 0 < mask <= 0xffffffff:
            counters["noComparableItemFloorMask"] += 1
            continue
        counters["nativeMaskAtAnchorCompared"] += 1
        if value & mask:
            counters["nativeMaskAtAnchorIntersects"] += 1
        else:
            counters["nativeMaskAtAnchorDisjoint"] += 1
            sample("native_mask_disjoint_at_anchor", native, gridDataPath=grid_path,
                   nativeFloorAtAnchor=value, itemAcceptedFloorMask=mask)

    return {
        "schema": "wand.db04.world@1",
        "status": "source_origin_terrain_diagnostic_only",
        "snapshotVersion": integrity["gameVersion"],
        "snapshotSourceScopeComplete": integrity["sourceScopeVerified"],
        "defaultObjectCount": len(initial_objects),
        "counts": dict(sorted(counters.items())),
        "objectsByGridDataPath": dict(sorted(audit_by_grid.items())),
        "diagnosticSamples": samples,
        "nativeCodeBodyVerified": False,
        "fullFootprintOccupancyVerified": False,
        "placementLegalityVerified": False,
        "worldCoordinatesVerified": False,
        "note": "Grid-local anchor/flag intersection is not placement permission.",
    }


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--snapshot", type=Path, required=True)
    cli.add_argument("--sample-limit", type=int, default=25)
    args = cli.parse_args()
    try:
        print(json.dumps(audit_snapshot(args.snapshot,
                                        max_samples=args.sample_limit),
                         ensure_ascii=False, sort_keys=True, indent=2))
    except (ValueError, OSError, UnicodeError, TypeError, KeyError,
            json.JSONDecodeError) as exc:
        cli.exit(1, f"DB-04 native layout terrain audit failed: {exc}\n")


if __name__ == "__main__":
    main()
