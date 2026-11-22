#!/usr/bin/env python3
"""DB-04 source-native anchor envelope correlation; NOT a placement validator.

Does not calculate world coordinates, rotated footprints, occupancy, collision,
terrain permissions, nor save-state placement legality.
"""
import argparse
import json
from collections import Counter
from pathlib import Path

SCHEMA = "wand.db04.nativeAnchorEnvelopeEvidence@1"


def _index(rows, key):
    output = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get(key), str):
            raise ValueError(f"invalid {key} record")
        value = row[key]
        if value in output:
            raise ValueError(f"duplicate {key}: {value}")
        output[value] = row
    return output


def audit_anchor_envelopes(layouts, grids, layout_objects):
    """Correlate original default anchors with literal source GridData extents.

    For source-native grid tessellation factor T, test the *observed*
    coordinate envelope [0, SizeX*T) × [0, SizeY*T). This is empirical
    structural source consistency only. The factor must not be treated as
    a verified world-unit transform, runtime collision or edit permission.
    """
    by_layout = _index(layouts, "layoutId")
    by_grid = _index(grids, "gridId")
    scoped_grid = {}
    for layout in layouts:
        if layout.get("layoutKind") != "nativeGridCollection":
            continue
        entries = layout.get("nativeGridEntries")
        if not isinstance(entries, list):
            raise ValueError("missing nativeGridEntries")
        for entry in entries:
            if not isinstance(entry, dict):
                raise ValueError("invalid native grid entry")
            native_id = entry.get("gridIdNative")
            if type(native_id) is not int or native_id < 0:
                raise ValueError("invalid native grid ID")
            key = (layout["layoutId"], native_id)
            if key in scoped_grid:
                raise ValueError("duplicate layout grid ID")
            scoped_grid[key] = entry
    totals = Counter()
    by_factor = {}
    by_family = {}
    for anchor in layout_objects:
        if not isinstance(anchor, dict):
            raise ValueError("invalid native layout object")
        layout_id = anchor.get("layoutId")
        native_id = anchor.get("gridIdNative")
        x, y = anchor.get("x"), anchor.get("y")
        if (not isinstance(layout_id, str) or layout_id not in by_layout or
                type(native_id) is not int or type(x) is not int or
                type(y) is not int):
            raise ValueError("invalid source-local anchor identity or x/y")
        entry = scoped_grid.get((layout_id, native_id))
        if entry is None:
            raise ValueError("anchor references absent layout-native Grid.ID")
        factor = entry.get("tessellationFactor")
        path = entry.get("gridDataPath")
        source = by_grid.get(path)
        family = (layout_id.split("/")[1] if layout_id.startswith(
            "SceneLayouts/") and len(layout_id.split("/")) > 1 else "other")
        totals["anchorsExamined"] += 1
        if source is None:
            totals["missingGridOriginal"] += 1
            by_family.setdefault(family, Counter())["missingGridOriginal"] += 1
            continue
        width, height = source.get("sizeX"), source.get("sizeY")
        if (type(width) is not int or type(height) is not int or
                width < 1 or height < 1 or type(factor) is not int or
                factor < 1 or factor > 256):
            totals["unknownNativeDimensionsOrFactor"] += 1
            by_family.setdefault(family, Counter())["unknownNativeDimensionsOrFactor"] += 1
            continue
        factors = by_factor.setdefault(str(factor), Counter())
        fam = by_family.setdefault(family, Counter())
        factors["examined"] += 1
        fam["examined"] += 1
        if 0 <= x < width and 0 <= y < height:
            label = "withinRawDimensions"
        elif 0 <= x < width * factor and 0 <= y < height * factor:
            label = "outsideRawWithinTessellationEnvelope"
        else:
            label = "outsideTessellationEnvelope"
        totals[label] += 1
        factors[label] += 1
        fam[label] += 1
    return {
        "schema": SCHEMA,
        "status": "source_native_coordinate_correlation_only",
        "counts": {key: totals[key] for key in (
            "anchorsExamined", "withinRawDimensions",
            "outsideRawWithinTessellationEnvelope",
            "outsideTessellationEnvelope", "missingGridOriginal",
            "unknownNativeDimensionsOrFactor")},
        "byTessellationFactor": {
            factor: dict(sorted(data.items()))
            for factor, data in sorted(by_factor.items(), key=lambda a: int(a[0]))},
        "bySourceFamily": {
            family: dict(sorted(data.items()))
            for family, data in sorted(by_family.items())},
        "nativeWorldTransformVerified": False,
        "occupancyPredicateVerified": False,
        "collisionRulesVerified": False,
        "placementLegalityVerified": False,
        "coordinateEnvelopeIsNotEditPermission": True,
        "note": "Empirical source-anchor correlation; extent is not world transform, footprint, occupancy, navigation, collision or placement legality.",
    }


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--snapshot", type=Path, required=True)
    cli.add_argument("--output", type=Path)
    args = cli.parse_args()
    root = args.snapshot
    evidence = audit_anchor_envelopes(*[
        json.loads((root / (name + ".json")).read_text(encoding="utf-8"))
        for name in ("layouts", "grids", "layoutObjects")])
    data = json.dumps(evidence, sort_keys=True, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(data, encoding="utf-8")
    else:
        print(data, end="")


if __name__ == "__main__":
    main()
