"""Source-correlated Steam v1.26.1 GridArea oblique LOCAL cell lookup.

Original GameAssembly.dll:
  Definitions.Grid.GridArea.MoreRotationGetGridLocalPosition
  token 0x0600344B, RVA 0x3923D80..0x3923FDB (603 native bytes).
  Called from TryGetGridLocalPosition for the twelve noncardinal codes.
The original method centers both input and area rectangles in hundredths
of a cell, applies the integer GetUnRotated coefficient arithmetic and
checks the result against original GridArea dimensions.

This implementation is deliberately restricted to GridArea and caller
tessellation ratio 1:1. Its raw GridLayers values do NOT define physical
occupancy, grid-object anchor, collision or editor permission.
"""
from __future__ import annotations

from pathlib import Path
import hashlib

from footprint_hypotheses import validate_footprint
from gridarea_rotation import (
    COS, SIN, _int32, _trunc_div_100,
    gridarea_orientation_base_size,
)
from gridarea_cardinal_local import (
    CARDINAL, GAME_VERSION, DLL_SHA256,
    MIN_I32, MAX_I32,
)
from pe_unwind import read_pe_runtime_functions

SOURCE_RVA = 0x3923D80
SOURCE_END = 0x3923FDB
SOURCE_SHA256 = "befff8088fb717e1cef8501fb9c66b956f4e54fff24e8067a325ed493477ad9b"
OBLIQUE = tuple(code for code in range(16) if code not in CARDINAL)


def verify_original_oblique_local_method(game_assembly) -> dict:
    """Reject a new DLL, moved entry, or modified original 603-byte body."""
    from native_pe_evidence import (
        sha256_file, pe64_sections, file_offset_for_rva,
    )
    path = Path(game_assembly)
    if path.is_symlink() or sha256_file(path) != DLL_SHA256:
        raise ValueError("original Steam v1.26.1 DLL source identity mismatch")
    records, _, pdata_sha = read_pe_runtime_functions(path)
    if sum((start, end) == (SOURCE_RVA, SOURCE_END)
           for start, end, _ in records) != 1:
        raise ValueError("original native oblique unwind function boundary mismatch")
    offset, mapping = file_offset_for_rva(
        pe64_sections(path), SOURCE_RVA, SOURCE_END - SOURCE_RVA)
    if mapping["readLength"] != SOURCE_END - SOURCE_RVA:
        raise ValueError("incomplete original oblique method byte range")
    with path.open("rb") as binary:
        binary.seek(offset)
        raw = binary.read(SOURCE_END - SOURCE_RVA)
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("original oblique native method body digest mismatch")
    return {
        "schema": "wand.db04.original-gridarea-oblique-local@1",
        "gameVersion": GAME_VERSION,
        "status": "original_steam_1_26_1_oblique_native_body_verified",
        "originalDllSha256": DLL_SHA256,
        "originalPeUnwindTableSha256": pdata_sha,
        "methodRva": SOURCE_RVA,
        "methodEndRva": SOURCE_END,
        "methodByteLength": SOURCE_END - SOURCE_RVA,
        "methodSha256": SOURCE_SHA256,
        "obliqueOrientationCodes": list(OBLIQUE),
        "nativeNoncardinalPositionTransformVerified": True,
        "perItemTessellationFactorVerified": False,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }


def oblique_local_position(size_x: int, size_y: int, x: int, y: int,
                           orientation: int) -> dict:
    """Source-native oblique cell-center transform, conditional on ratio 1:1.

    The signed x86 IMUL products are truncated toward zero individually.
    The final /100 is executed only after the centered coordinate is
    nonnegative (so it is a floor for accepted coordinates). A noncardinal
    projection may map multiple output pixels to the SAME original cell,
    or may map some corner pixels outside the original area.
    """
    area = gridarea_orientation_base_size(size_x, size_y, orientation)
    if (type(x) is not int or type(y) is not int or
            not MIN_I32 <= x <= MAX_I32 or
            not MIN_I32 <= y <= MAX_I32):
        raise ValueError("invalid original GridArea signed cell coordinates")
    if orientation in CARDINAL:
        raise ValueError("oblique source helper requires a noncardinal orientation")
    width, height = area["sizeX"], area["sizeY"]
    flags = {
        "status": "source_correlated_noncardinal_local_position",
        "orientationCode": orientation,
        "orientedSizeX": width, "orientedSizeY": height,
        "originalSizeX": size_x, "originalSizeY": size_y,
        "gridToAreaTessellationRatioAssumed": "1:1",
        "fullNativeTessellationScalingApplied": False,
        "nativeNoncardinalPositionTransformVerified": True,
        "rawLayerValuesNotOccupancy": True,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }
    # The read-only viewport is bounded to the source-calculated
    # orientation rectangle. A call outside that box never fabricates a
    # native layer even if the internal native function would extrapolate.
    if not 0 <= x < width or not 0 <= y < height:
        return {**flags, "status": "outside_original_oriented_gridarea",
                "inside": False}
    # Mirror source x86 32-bit IMUL, including wraparound. Cell-centre
    # arithmetic and the area-size midpoint use scale 100, then /100.
    centered_x = _int32(_int32(_int32(x * 100) + 50) - _int32(width * 50))
    centered_y = _int32(_int32(_int32(y * 100) + 50) - _int32(height * 50))
    cos, sin = COS[orientation], SIN[orientation]
    rx = _int32(
        _int32(_trunc_div_100(_int32(centered_x * cos)) +
               _trunc_div_100(_int32(centered_y * sin))) +
        _int32(size_x * 50))
    ry = _int32(
        _int32(_trunc_div_100(_int32(centered_y * cos)) -
               _trunc_div_100(_int32(centered_x * sin))) +
        _int32(size_y * 50))
    if rx < 0 or ry < 0:
        return {**flags, "status": "outside_original_gridarea",
                "inside": False}
    original_x, original_y = rx // 100, ry // 100
    if not 0 <= original_x < size_x or not 0 <= original_y < size_y:
        return {**flags, "status": "outside_original_gridarea",
                "inside": False}
    return {
        **flags, "inside": True,
        "originalLocalX": original_x,
        "originalLocalY": original_y,
        "originalFlatIndex": original_x * size_y + original_y,
        "positionBasis": "unrotated_gridarea_local",
    }


def oblique_layer_window(size_x: int, size_y: int, layers,
                         orientation: int, x: int, y: int,
                         width: int, height: int) -> dict:
    """Y-major conditional view; None marks a *native unmapped* output cell."""
    validate_footprint(size_x, size_y, layers)
    area = gridarea_orientation_base_size(size_x, size_y, orientation)
    if orientation in CARDINAL:
        raise ValueError("native oblique viewport requires a noncardinal orientation")
    oriented_x, oriented_y = area["sizeX"], area["sizeY"]
    if (any(type(n) is not int for n in (x, y, width, height)) or
            not 0 <= x < oriented_x or not 0 <= y < oriented_y or
            not 1 <= width <= 256 or not 1 <= height <= 256 or
            x + width > oriented_x or y + height > oriented_y):
        raise ValueError("original GridArea oblique viewport outside bounds")
    rows = []
    unmapped = 0
    for yy in range(y, y + height):
        row = []
        for xx in range(x, x + width):
            position = oblique_local_position(
                size_x, size_y, xx, yy, orientation)
            if position.get("inside"):
                row.append(layers[position["originalFlatIndex"]])
            else:
                row.append(None)
                unmapped += 1
        rows.append(row)
    return {
        "status": "source_correlated_noncardinal_oriented_gridarea_layers",
        "orientationCode": orientation,
        "orientedSizeX": oriented_x, "orientedSizeY": oriented_y,
        "x": x, "y": y, "width": width, "height": height,
        "rows": rows, "unmappedOutputCellCount": unmapped,
        "gridToAreaTessellationRatioAssumed": "1:1",
        "fullNativeTessellationScalingApplied": False,
        "nativeNoncardinalPositionTransformVerified": True,
        "rawLayerValuesNotOccupancy": True,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }


def main():
    import argparse
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(verify_original_oblique_local_method(args.dll),
                         sort_keys=True, indent=2))
    except (ValueError, TypeError, OSError) as error:
        parser.exit(1, f"DB-04 original oblique source verification failed: {error}\n")


if __name__ == "__main__":
    main()
