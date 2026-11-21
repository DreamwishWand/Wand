"""Original Steam v1.26.1 GridArea cardinal LOCAL lookup (not placement).

Source: Definitions.Grid.GridArea.TryGetGridLocalPosition, token 0x0600344A,
original GameAssembly RVA 0x3923BB0. Its compiled cardinal branches map
an orientation-frame grid position into original unrotated GridArea coordinates.
GridArea.get_Item(x,y) indexes the original layers as x * SizeY + y.

The native method also converts input tessellation by dividing by the caller
factor and multiplying by GridArea.TessellationFactor. The public helper is
intentionally the 1:1 factor specialization: the original per-object factor
is not proven by the current World DB snapshot. No object anchor, physical
occupancy or move permission is inferred from this calculation.
"""
from __future__ import annotations
from pathlib import Path
import hashlib

from footprint_hypotheses import validate_footprint
from pe_unwind import read_pe_runtime_functions

GAME_VERSION = "1.26.1"
DLL_SHA256 = "a11bdf8245c691e6c66c7579193de6f259edb01c035ecc9e01f19fd358ee034d"
SOURCE_RVA = 0x3923BB0
SOURCE_END = 0x3923D79
SOURCE_SHA256 = "e93c5fb29af0e647e1fa0b3443f3e0b5be2cdea3b48e79643c4bfd453ffe0fab"
UNWIND_SEGMENTS = (
    (0x3923BB0, 0x3923C12),
    (0x3923C12, 0x3923C87),
    (0x3923C87, 0x3923D79),
)
CARDINAL = (0, 4, 8, 12)
MAX_I32 = 0x7FFFFFFF
MIN_I32 = -0x80000000


def verify_original_cardinal_local_method(game_assembly) -> dict:
    """Pin the original DLL and all 3 .pdata segments containing this body.

    The compiler emitted multiple contiguous unwind ranges. Checking only
    the first 98-byte .pdata entry would NOT verify the actual branches.
    """
    from native_pe_evidence import (sha256_file, pe64_sections,
                                    file_offset_for_rva)
    path = Path(game_assembly)
    if path.is_symlink() or sha256_file(path) != DLL_SHA256:
        raise ValueError("original Steam v1.26.1 DLL source identity mismatch")
    records, starts, pdata_sha = read_pe_runtime_functions(path)
    boundaries = {(start, end) for start, end, _ in records}
    if any(pair not in boundaries for pair in UNWIND_SEGMENTS):
        raise ValueError("original native segmented unwind coverage mismatch")
    offset, mapping = file_offset_for_rva(
        pe64_sections(path), SOURCE_RVA, SOURCE_END - SOURCE_RVA)
    if mapping["readLength"] != SOURCE_END - SOURCE_RVA:
        raise ValueError("incomplete original cardinal local method byte range")
    with path.open("rb") as stream:
        stream.seek(offset)
        raw = stream.read(SOURCE_END - SOURCE_RVA)
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("original cardinal local method body digest mismatch")
    return {
        "schema": "wand.db04.original-gridarea-cardinal-local@1",
        "status": "original_steam_1_26_1_segmented_method_bytes_verified",
        "gameVersion": GAME_VERSION,
        "originalDllSha256": DLL_SHA256,
        "originalPeUnwindTableSha256": pdata_sha,
        "methodRva": SOURCE_RVA,
        "methodEndRva": SOURCE_END,
        "methodByteLength": SOURCE_END - SOURCE_RVA,
        "methodSha256": SOURCE_SHA256,
        "originalUnwindRangeCount": len(UNWIND_SEGMENTS),
        "nativeCardinalPositionTransformCorroborated": True,
        "fullNativeNoncardinalPositionTransformVerified": False,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }


def _dimensions(size_x, size_y, orientation):
    if (type(size_x) is not int or type(size_y) is not int
            or not 1 <= size_x <= 256 or not 1 <= size_y <= 256
            or size_x * size_y > 16384 or type(orientation) is not int
            or not 0 <= orientation <= 15):
        raise ValueError("invalid original GridArea size or orientation")
    return ((size_y, size_x) if orientation in (4, 12)
            else (size_x, size_y))


def cardinal_local_position(size_x: int, size_y: int,
                            x: int, y: int, orientation: int) -> dict:
    """Source's input-grid-local to unrotated GridArea local transform.

    Only equal input and area tessellation factors (1:1), a CONDITION not
    established by the snapshot. Noncardinal orientations call a distinct
    native helper and are not reproduced here. Invalid positions never
    expose layer values or suggest legal placement.
    """
    _dimensions(size_x, size_y, orientation)
    if (type(x) is not int or type(y) is not int or
            not MIN_I32 <= x <= MAX_I32 or
            not MIN_I32 <= y <= MAX_I32):
        raise ValueError("invalid GridArea signed 32-bit position")
    flags = {
        "orientationCode": orientation,
        "originalSizeX": size_x, "originalSizeY": size_y,
        "gridToAreaTessellationRatioAssumed": "1:1",
        "fullNativeTessellationScalingApplied": False,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }
    if orientation not in CARDINAL:
        return {**flags, "status": "noncardinal_local_position_unresolved",
                "nativeCardinalPositionTransformVerified": False}
    if x < 0 or y < 0:
        return {**flags, "status": "outside_original_gridarea",
                "nativeCardinalPositionTransformVerified": True,
                "inside": False}
    if orientation == 0:
        local_x, local_y = size_x - 1 - x, size_y - 1 - y
    elif orientation == 4:
        local_x, local_y = y, size_y - 1 - x
    elif orientation == 8:
        local_x, local_y = x, y
    else:  # 12
        local_x, local_y = size_x - 1 - y, x
    if not 0 <= local_x < size_x or not 0 <= local_y < size_y:
        return {**flags, "status": "outside_original_gridarea",
                "nativeCardinalPositionTransformVerified": True,
                "inside": False}
    return {
        **flags, "status": "source_correlated_cardinal_local_position",
        "nativeCardinalPositionTransformVerified": True,
        "inside": True, "originalLocalX": local_x, "originalLocalY": local_y,
        "originalFlatIndex": local_x * size_y + local_y,
        "positionBasis": "unrotated_gridarea_local",
    }


def cardinal_layer_window(size_x: int, size_y: int,
                          layers, orientation: int,
                          x: int, y: int, width: int, height: int) -> dict:
    """Y-major view of original raw GridLayers through the cardinal mapping."""
    validate_footprint(size_x, size_y, layers)
    dimensions = _dimensions(size_x, size_y, orientation)
    if orientation not in CARDINAL:
        return {"status": "noncardinal_local_position_unresolved",
                "orientationCode": orientation,
                "nativeCardinalPositionTransformVerified": False,
                "occupancyPredicateVerified": False,
                "placementLegalityVerified": False}
    rw, rh = dimensions
    if (any(type(n) is not int for n in (x, y, width, height)) or
            not 0 <= x < rw or not 0 <= y < rh or
            not 1 <= width <= 256 or not 1 <= height <= 256 or
            x + width > rw or y + height > rh):
        raise ValueError("original GridArea oriented layer window outside bounds")
    values = []
    for yy in range(y, y + height):
        row = []
        for xx in range(x, x + width):
            position = cardinal_local_position(
                size_x, size_y, xx, yy, orientation)
            if not position.get("inside"):
                raise ValueError("native local coordinate unexpectedly outside")
            row.append(layers[position["originalFlatIndex"]])
        values.append(row)
    return {
        "status": "source_correlated_cardinal_oriented_gridarea_layers",
        "orientationCode": orientation,
        "orientedSizeX": rw, "orientedSizeY": rh,
        "x": x, "y": y, "width": width, "height": height,
        "rows": values,
        "gridToAreaTessellationRatioAssumed": "1:1",
        "fullNativeTessellationScalingApplied": False,
        "nativeCardinalPositionTransformVerified": True,
        "rawLayerValuesNotOccupancy": True,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }
