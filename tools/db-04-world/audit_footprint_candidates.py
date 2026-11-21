#!/usr/bin/env python3
"""Cross-compare UNVERIFIED footprint projections against private native grids.

This is a hypothesis scorecard, NOT game placement validation. Only source
correspondences verified by the DB-04 manifest and native file references are
used. Raw source fixed32 layer values are not asserted to equal occupied cells.
Candidate transforms cannot be promoted to verified by a high match rate alone.
"""
import argparse
import base64
import json
from collections import Counter
from pathlib import Path

from footprint_hypotheses import (
    candidate_layer_cells, projection_hypotheses,
)
from terrain_codec import describe_native_packing
from verify_bundle import read_json, validate_snapshot


def _by_id(records, key):
    return {str(entry[key]): entry for entry in records}


def _grid_decoder(row, *, source_game_version):
    raw = row.get("compactedFloorTypesBase64")
    evidence = row.get("terrainDecoding")
    if not isinstance(raw, str) or not isinstance(evidence, dict):
        return None
    if evidence.get("decoded") is not True or (
            evidence.get("packing") != "x_major_msb_first" or
            evidence.get("nativeCodeBodyVerified") is not False):
        return None
    packed = base64.b64decode(raw, validate=True)
    verified = describe_native_packing(
        row["sizeX"], row["sizeY"], row["nativeFloorTypePalette"], packed,
        source_game_version=source_game_version)
    if verified != evidence:
        raise ValueError("original GridData decoder evidence mismatch")
    return (packed, row["sizeY"], row["nativeFloorTypePalette"],
            verified["cellBits"])


def _terrain_value(decoder, x, y):
    data, sy, palette, bits = decoder
    offset = (x * sy + y) * bits
    value = (data[offset // 8] >> (8 - bits - offset % 8)) & ((1 << bits) - 1)
    if value >= len(palette):
        raise ValueError("invalid native terrain palette index")
    return palette[value]


def audit_footprint_candidates(snapshot, *, max_objects=20000,
                               max_examples=12, max_cells=2_000_000):
    if (type(max_objects) is not int or not 1 <= max_objects <= 250000 or
            type(max_examples) is not int or not 0 <= max_examples <= 100 or
            type(max_cells) is not int or not 1 <= max_cells <= 100_000_000):
        raise ValueError("invalid native candidate audit limits")
    root = Path(snapshot).resolve(strict=True)
    verified = validate_snapshot(root)
    grids = _by_id(read_json(root / "grids.json"), "gridId")
    layouts = _by_id(read_json(root / "layouts.json"), "layoutId")
    objects = _by_id(read_json(root / "objects.json"), "itemId")
    native_path = root / "layoutObjects.json"
    # A legacy verified preview can predate the layoutObjects family.
    # Report no comparable entries rather than breaking private ZIP packaging.
    native = read_json(native_path) if native_path.is_file() else []

    hypotheses = projection_hypotheses()
    totals = {
        f"{order}+{anchor}": Counter() for order, anchor in hypotheses
    }
    per_orientation = {
        f"{order}+{anchor}": {} for order, anchor in hypotheses
    }
    samples = {f"{order}+{anchor}": [] for order, anchor in hypotheses}
    missing = Counter()
    decoded = {}
    considered = 0
    candidate_cells_evaluated = 0
    stopped_at_cell_budget = False
    discrimination = Counter()

    # Deterministic subset in a partial source archive; never claim exhaustive.
    for row in sorted(native, key=lambda obj: obj["layoutObjectId"]):
        if considered >= max_objects:
            break
        considered += 1
        layout = layouts.get(str(row["layoutId"]))
        if not layout or layout.get("layoutKind") != "nativeGridCollection":
            missing["noNativeGridCollection"] += 1
            continue
        entry = [g for g in layout.get("nativeGridEntries", [])
                 if g.get("gridIdNative") == row["gridIdNative"]]
        if len(entry) != 1:
            missing["unknownNativeGridEntry"] += 1
            continue
        path = entry[0]["gridDataPath"]
        grid = grids.get(path)
        if not grid:
            missing["gridAbsentInPartialSource"] += 1
            continue
        item = objects.get(str(row["itemId"]))
        shape = item.get("footprint") if item else None
        if not isinstance(shape, dict):
            missing["itemFootprintUnavailable"] += 1
            continue
        mask = shape.get("acceptedFloorTypesFlag")
        if type(mask) is not int or mask <= 0 or mask > 0xffffffff:
            missing["nativeItemAcceptedFloorMaskUnavailable"] += 1
            continue
        if path not in decoded:
            decoded[path] = _grid_decoder(
                grid, source_game_version=verified["gameVersion"])
        decoder = decoded[path]
        if decoder is None:
            missing["terrainCodecNotCorroborated"] += 1
            continue
        orientation = row["orientationCode"]
        if orientation not in (0, 4, 8, 12):
            missing["nonCardinalOrientationNotModeled"] += 1
            continue
        # A full GridAreaData array is traversed for every hypothetical
        # orientation, including its zero-valued fixed32 layer slots. Budget
        # those total scan slots, not just nonzero cells, so sparse 256x256
        # footprints cannot evade the workload cap.
        candidate_cost = shape["sizeX"] * shape["sizeY"] * len(hypotheses)
        if candidate_cells_evaluated + candidate_cost > max_cells:
            missing["candidateCellBudgetReached"] += 1
            stopped_at_cell_budget = True
            break
        candidate_cells_evaluated += candidate_cost
        nonzero_count = sum(layer != 0 for layer in shape["layerValues"])
        if not nonzero_count:
            missing["noNonzeroNativeFootprintLayerCells"] += 1
            continue
        geometry = set()
        terrain_outcomes = set()
        discrimination["objectsWithComparableHypotheses"] += 1

        for order, anchor in hypotheses:
            name = f"{order}+{anchor}"
            projection = candidate_layer_cells(
                shape["sizeX"], shape["sizeY"], shape["layerValues"],
                cell_order=order, orientation_code=orientation,
                anchor_mode=anchor, x=row["x"], y=row["y"])
            score = totals[name]
            orientation_score = per_orientation[name].setdefault(
                str(orientation), Counter())
            score["objectsWithComparableOriginalSources"] += 1
            orientation_score["objectsWithComparableOriginalSources"] += 1
            c = projection["cells"]
            geometry.add(frozenset((cell["x"], cell["y"]) for cell in c))
            score["nonzeroRawLayerCellsExamined"] += len(c)
            orientation_score["nonzeroRawLayerCellsExamined"] += len(c)
            outside = 0
            mismatch = 0
            matches = 0
            for cell in c:
                x, y = cell["x"], cell["y"]
                if not (0 <= x < grid["sizeX"] and 0 <= y < grid["sizeY"]):
                    outside += 1
                    continue
                value = _terrain_value(decoder, x, y)
                if value & mask:
                    matches += 1
                else:
                    mismatch += 1
            terrain_outcomes.add((outside, mismatch, matches))
            for counter in (score, orientation_score):
                counter["rawLayerCellsOutsideGrid"] += outside
                counter["rawLayerCellsFloorMaskIntersect"] += matches
                counter["rawLayerCellsFloorMaskDisjoint"] += mismatch
                counter["objectsWithOutsideCandidateCells"] += int(outside != 0)
                counter["objectsWithDisjointCandidateCells"] += int(mismatch != 0)
            if (outside or mismatch) and len(samples[name]) < max_examples:
                samples[name].append({
                    "layoutObjectId": row["layoutObjectId"],
                    "itemId": row["itemId"],
                    "orientationCode": orientation,
                    "nativeGridDataPath": path,
                    "outsideCandidateCellCount": outside,
                    "disjointCandidateCellCount": mismatch,
                    "comparableCandidateCellCount": matches + mismatch,
                })
        discrimination["objectsWithGeometricHypothesisDifferences"] += (
            len(geometry) > 1)
        discrimination["objectsWithDifferentTerrainOutcomes"] += (
            len(terrain_outcomes) > 1)
        discrimination["objectsWithIdenticalGeometryAndTerrainOutcomes"] += (
            len(geometry) == 1 and len(terrain_outcomes) == 1)
    return {
        "schema": "wand.db04.world@1",
        "status": "unverified_footprint_projection_candidate_comparison",
        "snapshotVersion": verified["gameVersion"],
        "sourceScopeVerified": verified["sourceScopeVerified"],
        "nativeLayoutObjectCount": len(native),
        "layoutObjectsConsidered": considered,
        "candidateLayerSlotsBudgeted": candidate_cells_evaluated,
        "candidateLayerSlotBudget": max_cells,
        "truncatedByCellBudget": stopped_at_cell_budget,
        "truncatedByMaxObjects": (not stopped_at_cell_budget and
                                  len(native) > considered),
        "unprocessedLayoutObjects": len(native) - considered,
        "crossHypothesisDiscrimination": dict(sorted(discrimination.items())),
        "excludedSourceConditions": dict(sorted(missing.items())),
        "hypotheses": {
            key: {
                "counts": dict(sorted(count.items())),
                "byCardinalOrientationCode": {
                    orient: dict(sorted(tally.items())) for orient, tally in
                    sorted(per_orientation[key].items(), key=lambda e: int(e[0]))
                },
                "diagnosticExamples": samples[key],
            } for key, count in sorted(totals.items())
        },
        "nativeCodeBodyVerified": False,
        "footprintLayerIndexOrderVerified": False,
        "cardinalRotationTransformVerified": False,
        "nonzeroLayerEqualsOccupiedCellVerified": False,
        "floorMaskAppliedToEveryCellVerified": False,
        "nativeAnchorConventionVerified": False,
        "placementLegalityVerified": False,
        "note": (
            "The 4 candidate projections are geometric/statistical "
            "experiments only. Comparing native layer-cell candidates "
            "with a terrain mask is not evidence of legal placement."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--max-objects", type=int, default=20000)
    parser.add_argument("--max-examples", type=int, default=12)
    parser.add_argument("--max-cells", type=int, default=2_000_000)
    args = parser.parse_args()
    try:
        result = audit_footprint_candidates(
            args.snapshot, max_objects=args.max_objects,
            max_examples=args.max_examples, max_cells=args.max_cells)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    except (ValueError, OSError, TypeError, KeyError, UnicodeError,
            json.JSONDecodeError) as error:
        parser.exit(1, f"DB-04 candidate footprint audit failed: {error}\n")


if __name__ == "__main__":
    main()
