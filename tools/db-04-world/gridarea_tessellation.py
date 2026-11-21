"""Steam 1.26.1 GridAreaData-to-Grid tessellation (READ ONLY).

Original source:
  GridAreaData.GetGridArea (token 0x0600309F, RVA 0x38FA210)
    lazy-creates GridArea with tessellationFactor=1.
  GridArea.TryGetGridLocalPosition (token 0x0600344A,
    RVA 0x3923BB0) converts nonnegative grid coordinates using
    trunc(position / callerGridFactor) * areaFactor before original
    cardinal or oblique local position mapping.
  GridArea.GetSizeForOrientation scales source size by callerGridFactor
    and divides by the area factor.

Only the GridAreaData.GetGridArea factory path's areaFactor=1 is asserted.
Caller Grid.TessellationFactor must be provided explicitly; nothing here
guesses it from a different layout or current save. Raw layer masks do
NOT imply physical occupancy, collision, or permission to place an object.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

from footprint_hypotheses import validate_footprint
from gridarea_cardinal_local import cardinal_local_position, CARDINAL
from gridarea_oblique_local import oblique_local_position
from gridarea_rotation import gridarea_orientation_base_size
from pe_unwind import read_pe_runtime_functions

DLL_SHA256 = "a11bdf8245c691e6c66c7579193de6f259edb01c035ecc9e01f19fd358ee034d"
SOURCE_METHODS = (
    ("GridAreaData.GetGridArea", 0x38FA210, 0x38FA37A,
     "97e6863ce412541cebadbf72f384097962d7da7367fb3b2c8e42201a389c08b3"),
    ("GridArea.Transform(instance)", 0x3923550, 0x392355B,
     "2284f609423aef813db63aff7b09a456b03e42ba77cf4d6095b30b31f3b44c1b"),
    ("GridArea.Transform(static)", 0x3923560, 0x392356A,
     "b846c804ed1f0b469012d33ed9a1a1e9caddd6fbf2b1a3196ebf18559dbf9ead"),
    ("GridArea.TryGetGridLocalPosition", 0x3923BB0, 0x3923D79,
     "e93c5fb29af0e647e1fa0b3443f3e0b5be2cdea3b48e79643c4bfd453ffe0fab"),
    ("GridArea.GetStrideFor(instance)", 0x39241A0, 0x3924200,
     "7178291ab336a2e05631763003c7d1c016779ff6f69eb69697b4184b0e99abce"),
    ("GridArea.GetStrideFor(static)", 0x3924200, 0x392426C,
     "8768912978fad51027cbe0938a5fa2570d855b046e3bb20acaa6197ecd9f651f"),
)
GETGRIDAREA_UNWIND = (
    (0x38FA210, 0x38FA271),
    (0x38FA271, 0x38FA31A),
    (0x38FA31A, 0x38FA37A),
)
TRYGET_UNWIND = (
    (0x3923BB0, 0x3923C12),
    (0x3923C12, 0x3923C87),
    (0x3923C87, 0x3923D79),
)
MAX_GRID_FACTOR = 256
STRIDE_METHOD_UNWIND = (
    (0x39241A0, 0x3924200),
    (0x3924200, 0x392426C),
)
MAX_I32 = 0x7fffffff


def verify_original_item_gridarea_tessellation(game_assembly) -> dict:
    """Pin original full source methods; short leaf methods omit .pdata."""
    from native_pe_evidence import (
        sha256_file, pe64_sections, file_offset_for_rva,
    )
    path = Path(game_assembly)
    if path.is_symlink() or sha256_file(path) != DLL_SHA256:
        raise ValueError("original Steam v1.26.1 DLL identity mismatch")
    records, _, pdata_sha = read_pe_runtime_functions(path)
    regions = {(start, end) for start, end, _ in records}
    if any(pair not in regions for pair in
           GETGRIDAREA_UNWIND + TRYGET_UNWIND + STRIDE_METHOD_UNWIND):
        raise ValueError("original GridArea tessellation source unwind mismatch")
    sections = pe64_sections(path)
    with path.open("rb") as binary:
        for name, rva, end, digest in SOURCE_METHODS:
            file_offset, record = file_offset_for_rva(
                sections, rva, end - rva)
            if record["readLength"] != end - rva:
                raise ValueError("incomplete original source method " + name)
            binary.seek(file_offset)
            raw = binary.read(end - rva)
            if hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError("original native source method changed: " + name)
    return {
        "schema": "wand.db04.original-tessellation-factory@1",
        "gameVersion": "1.26.1",
        "status": "original_item_gridarea_factory_and_transform_bodies_verified",
        "originalDllSha256": DLL_SHA256,
        "peUnwindTableSha256": pdata_sha,
        "verifiedMethodNames": [m[0] for m in SOURCE_METHODS],
        "itemGridAreaFactoryTessellationFactor": 1,
        "itemFactoryRouteVerified": True,
        "otherFactoryRoutesVerified": False,
        "callerGridTessellationFactorInferred": False,
        "nativeStrideCalculationMethodBodiesVerified": True,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }


def source_gridarea_computed_stride(stride_override, grid_factor: int,
                                   *, source_record_complete: bool = True) -> dict:
    """Original GridArea.GetStrideFor: null -> 1, value -> int32(value*factor).

    A missing property in a *legacy snapshot* is not evidence of a nullable
    null, hence source_record_complete must be supplied explicitly.
    This is a raw source calculation, NOT placement validity or occupancy.
    """
    if (type(grid_factor) is not int or not 1 <= grid_factor <= MAX_GRID_FACTOR
            or type(source_record_complete) is not bool or
            (stride_override is not None and
             (type(stride_override) is not int or not
              -0x80000000 <= stride_override <= 0x7fffffff))):
        raise ValueError("invalid original GridArea nullable stride/grid factor")
    base = {
        "callerGridTessellationFactor": grid_factor,
        "strideOverride": stride_override,
        "callerGridFactorExplicitlyProvided": True,
        "callerGridFactorProvenanceVerified": False,
        "sourceFactoryRoutePerRecordVerified": False,
        "strideOverridePlacementSemanticsVerified": False,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }
    if not source_record_complete:
        return {**base, "status": "legacy_snapshot_stride_source_unavailable",
                "nativeStrideCalculationVerified": False}
    value = 1 if stride_override is None else (
        (stride_override * grid_factor + 0x80000000) & 0xffffffff) - 0x80000000
    return {
        **base,
        "status": "source_correlated_gridarea_get_stride_for",
        "nativeComputedStride": value,
        "nativeStrideCalculationVerified": True,
        "sourceGameVersion": "1.26.1",
    }


def _validate(size_x, size_y, grid_factor, orientation):
    if (type(size_x) is not int or type(size_y) is not int or
            not 1 <= size_x <= 256 or not 1 <= size_y <= 256 or
            size_x * size_y > 16384 or
            type(grid_factor) is not int or
            not 1 <= grid_factor <= MAX_GRID_FACTOR or
            type(orientation) is not int or
            not 0 <= orientation < 16):
        raise ValueError("invalid native GridArea source size/orientation/grid factor")


def gridarea_scaled_source_cell(size_x: int, size_y: int,
                                x: int, y: int, orientation: int,
                                grid_factor: int) -> dict:
    """Map one caller-grid cell to a raw item GridAreaData source cell.

    Area factor is 1 ONLY for the original item GetGridArea factory route.
    The explicitly provided caller grid factor is not asserted to match
    any default world/save grid until the caller independently verifies it.
    """
    _validate(size_x, size_y, grid_factor, orientation)
    if (type(x) is not int or type(y) is not int or
            not -MAX_I32-1 <= x <= MAX_I32 or
            not -MAX_I32-1 <= y <= MAX_I32):
        raise ValueError("invalid original GridArea caller-grid int32 position")
    base = gridarea_orientation_base_size(size_x, size_y, orientation)
    size_x_scaled = base["sizeX"] * grid_factor
    size_y_scaled = base["sizeY"] * grid_factor
    flags = {
        "orientationCode": orientation,
        "orientedSizeX": size_x_scaled,
        "orientedSizeY": size_y_scaled,
        "callerGridTessellationFactor": grid_factor,
        "callerGridFactorExplicitlyProvided": True,
        "callerGridFactorProvenanceVerified": False,
        "itemAreaTessellationFactorSourceValue": 1,
        "itemGetGridAreaFactorySourceVerified": True,
        "nativeTessellationCoordinateConversionVerified": True,
        "sourceGameVersion": "1.26.1",
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }
    if x < 0 or y < 0 or x >= size_x_scaled or y >= size_y_scaled:
        return {**flags, "status": "outside_oriented_gridarea",
                "inside": False}
    source_input_x = x // grid_factor
    source_input_y = y // grid_factor
    resolved = (
        cardinal_local_position(size_x, size_y, source_input_x,
                                source_input_y, orientation)
        if orientation in CARDINAL else
        oblique_local_position(size_x, size_y, source_input_x,
                               source_input_y, orientation)
    )
    if not resolved.get("inside"):
        return {**flags, "status": "outside_original_gridarea",
                "inside": False}
    return {
        **flags,
        "status": "source_correlated_item_gridarea_explicit_tessellation",
        "inside": True,
        "normalizedInputX": source_input_x,
        "normalizedInputY": source_input_y,
        "originalLocalX": resolved["originalLocalX"],
        "originalLocalY": resolved["originalLocalY"],
        "originalFlatIndex": resolved["originalFlatIndex"],
        "positionBasis": "unrotated_item_gridarea_local",
    }


def gridarea_scaled_layer_window(size_x: int, size_y: int,
                                 layer_values, orientation: int,
                                 grid_factor: int, x: int, y: int,
                                 width: int, height: int) -> dict:
    """Bounded raw mask viewport. None means source area unmapped, NOT free."""
    validate_footprint(size_x, size_y, layer_values)
    _validate(size_x, size_y, grid_factor, orientation)
    size = gridarea_orientation_base_size(size_x, size_y, orientation)
    oriented_x = size["sizeX"] * grid_factor
    oriented_y = size["sizeY"] * grid_factor
    if (any(type(n) is not int for n in (x, y, width, height)) or
            not 0 <= x < oriented_x or not 0 <= y < oriented_y or
            not 1 <= width <= 256 or not 1 <= height <= 256 or
            x + width > oriented_x or y + height > oriented_y):
        raise ValueError("original item GridArea scaled viewport outside bounds")
    rows = []
    unmapped = 0
    for row_y in range(y, y + height):
        line = []
        for col_x in range(x, x + width):
            cell = gridarea_scaled_source_cell(
                size_x, size_y, col_x, row_y, orientation, grid_factor)
            if cell["inside"]:
                line.append(layer_values[cell["originalFlatIndex"]])
            else:
                line.append(None)
                unmapped += 1
        rows.append(line)
    return {
        "status": "source_correlated_item_gridarea_scaled_raw_layers",
        "orientationCode": orientation,
        "callerGridTessellationFactor": grid_factor,
        "orientedSizeX": oriented_x,
        "orientedSizeY": oriented_y,
        "x": x, "y": y, "width": width, "height": height,
        "rows": rows,
        "unmappedOutputCellCount": unmapped,
        "nullMeansUnmappedNotUnoccupied": True,
        "itemAreaTessellationFactorSourceValue": 1,
        "callerGridFactorExplicitlyProvided": True,
        "callerGridFactorProvenanceVerified": False,
        "nativeTessellationCoordinateConversionVerified": True,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(
            verify_original_item_gridarea_tessellation(args.dll),
            indent=2, sort_keys=True))
    except (ValueError, OSError, TypeError) as error:
        parser.exit(1, f"DB-04 source tessellation verification failed: {error}\n")


if __name__ == "__main__":
    main()
