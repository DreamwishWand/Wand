#!/usr/bin/env python3
"""Reproduce the original-game terrain packing correlation without assets in Git.

Use the private SRC-05 DB-04 snapshot, NOT user-save positions. The evidence
pin only applies to the exact three archived Steam v1.26.1 original files.
"""
import argparse
import base64
import json
from pathlib import Path

from verify_bundle import validate_snapshot

ROOM = "GridData/Rooms/Room12x16-GridData.json"
MEADOW = "GridData/Villages/Village04-MeadowLevel-GridData.json"
MEADOW_LAYOUT = "SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json"
PINNED = {
    "ddv_Data/StreamingAssets/" + ROOM:
        "c5ce1b0084087479292d2092e10b8963194ead168531c5c221893ab53a0b26e6",
    "ddv_Data/StreamingAssets/" + MEADOW:
        "bfd75928343dacc6f2768f80585a0c2b1d5afe1c12ee2f97777bc94c20a96424",
    "ddv_Data/StreamingAssets/" + MEADOW_LAYOUT:
        "5c6cd62b2ffbeff4b19f1864d1a0a2a4db4528e1685ff79f77cf5a58334f4113",
}
CANDIDATES = (
    ("x_major_msb_first", "x", "msb"),
    ("x_major_lsb_first", "x", "lsb"),
    ("y_major_msb_first", "y", "msb"),
    ("y_major_lsb_first", "y", "lsb"),
)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def candidate_value(grid, x, y, axis, bit_order):
    sx, sy = grid["sizeX"], grid["sizeY"]
    palette = grid["nativeFloorTypePalette"]
    bits = (len(palette) - 1).bit_length()
    if bits not in (1, 2):
        raise ValueError("unverified native packing width")
    offset = ((x * sy + y) if axis == "x" else (y * sx + x)) * bits
    shift = (8 - bits - offset % 8) if bit_order == "msb" else offset % 8
    index = (grid["_raw"][offset // 8] >> shift) & ((1 << bits) - 1)
    return palette[index] if index < len(palette) else None


def reproduce(snapshot):
    root = Path(snapshot).resolve(strict=True)
    integrity = validate_snapshot(root)
    manifest = load(root / "manifest.json")
    hashes = {row["path"]: row["sha256"] for row in manifest["sources"]}
    if manifest.get("gameVersion") != "1.26.1" or any(
            hashes.get(path) != sha for path, sha in PINNED.items()):
        return {"status": "source_files_not_pinned_steam_1.26.1"}
    grids = {row["gridId"]: row for row in load(root / "grids.json")}
    if ROOM not in grids or MEADOW not in grids:
        return {"status": "insufficient_grid_source_subset"}
    room, meadow = grids[ROOM], grids[MEADOW]
    if (room["sizeX"], room["sizeY"], room["nativeFloorTypePalette"]) != (
            12, 16, [0, 3072, 1024]):
        raise ValueError("Room benchmark dimensions/palette changed")
    if (meadow["sizeX"], meadow["sizeY"],
            meadow["nativeFloorTypePalette"]) != (
            196, 100, [0, 4, 256, 512]):
        raise ValueError("Meadow benchmark dimensions/palette changed")
    for grid in (room, meadow):
        grid["_raw"] = base64.b64decode(grid["compactedFloorTypesBase64"],
                                        validate=True)
    items = {row["itemId"]: row for row in load(root / "objects.json")}
    native_origins = [row for row in load(root / "layoutObjects.json")
                      if row["layoutId"] == MEADOW_LAYOUT]
    origins = []
    for obj in native_origins:
        item = items.get(obj["itemId"])
        footprint = item and item.get("footprint")
        if (not isinstance(footprint, dict) or
                type(footprint.get("acceptedFloorTypesFlag")) is not int):
            continue
        if not (0 <= obj["x"] < 196 and 0 <= obj["y"] < 100):
            continue
        origins.append((obj, footprint["acceptedFloorTypesFlag"]))
    if not origins:
        return {"status": "missing_native_initial_object_evidence"}
    compared = {}
    for name, axis, order in CANDIDATES:
        room_matches = sum(
            candidate_value(room, x, y, axis, order) ==
            (3072 if x in (0, 11) or y in (0, 15) else 1024)
            for x in range(12) for y in range(16))
        matches, bad = 0, []
        for obj, allowed in origins:
            native = candidate_value(meadow, obj["x"], obj["y"], axis, order)
            if native is not None and native & allowed:
                matches += 1
            else:
                bad.append({
                    "nativeObjectId": obj["gridObjectIdNative"],
                    "itemId": obj["itemId"],
                    "x": obj["x"], "y": obj["y"],
                    "nativeFloorFlagAtOrigin": native})
        compared[name] = {
            "roomBorderMatches": room_matches, "roomTotal": 192,
            "meadowAcceptedOrigins": matches, "meadowEvaluatedOrigins": len(origins),
            "meadowMismatches": bad[:10],
        }
    candidate = compared["x_major_msb_first"]
    other = [row for key, row in compared.items() if key != "x_major_msb_first"]
    validated = (
        candidate["roomBorderMatches"] == 192 and len(origins) >= 100 and
        candidate["meadowAcceptedOrigins"] / len(origins) >= 0.99 and
        candidate["roomBorderMatches"] >
        max(row["roomBorderMatches"] for row in other) and
        candidate["meadowAcceptedOrigins"] >
        max(row["meadowAcceptedOrigins"] for row in other))
    return {
        "status": "source_correlated" if validated else "insufficient_decoding_evidence",
        "schema": manifest["schema"], "gameVersion": "1.26.1",
        "pinnedSourceSha256": PINNED, "snapshotIntegrity": integrity["status"],
        "nativeCodeBodyVerified": False, "placementLegalityVerified": False,
        "gridPositionBasis": "nativeGridLocal",
        "initialLayoutObjectsTotal": len(native_origins),
        "evaluatedKnownItemOrigins": len(origins),
        "candidatePackingScores": compared,
    }


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--snapshot", required=True, type=Path)
    args = cli.parse_args()
    try:
        print(json.dumps(reproduce(args.snapshot), ensure_ascii=False,
                         sort_keys=True, indent=2))
    except (OSError, ValueError, KeyError, TypeError) as error:
        cli.exit(1, f"DB-04 packing evidence failed: {error}\\n")


if __name__ == "__main__":
    main()
