"""Candidate-only GridAreaData 2D projections for native footprint study.

Native facts: GridAreaData SizeX/SizeY, fixed32 LayerValues, GridObject
integer X/Y, GridOrientation 0..15. Original GridArea.get_Item(x,y) indexes
the unrotated layer list as x*SizeY+y; cardinal width/height are established
by the native orientation dimension getters. NOT verified: rotated cell
positions, grid anchor placement, or which layer bits mean occupied. All transformations in this module are
explicit, hypothesis-labelled experiments, never editor permission.
"""
from __future__ import annotations

from typing import Sequence

CARDINAL_ORIENTATIONS = (0, 4, 8, 12)
CELL_ORDERS = ("x_major", "y_major")
ANCHOR_MODELS = ("top_left", "center_floor")
MAX_FOOTPRINT_CELLS = 16384


def projection_hypotheses() -> tuple[tuple[str, str], ...]:
    return tuple((order, anchor) for order in CELL_ORDERS
                 for anchor in ANCHOR_MODELS)


def validate_footprint(size_x: int, size_y: int,
                       layer_values: Sequence[int]) -> None:
    if (type(size_x) is not int or type(size_y) is not int or
            size_x < 1 or size_y < 1 or
            size_x > 256 or size_y > 256 or
            size_x * size_y > MAX_FOOTPRINT_CELLS or
            not isinstance(layer_values, (list, tuple)) or
            len(layer_values) != size_x * size_y or
            any(type(value) is not int or not 0 <= value <= 0xffffffff
                for value in layer_values)):
        raise ValueError("invalid original GridAreaData fixed32 footprint")


# Confirmed against Steam v1.26.1 ORIGINAL source method pointers:
# Definitions.Grid.GridArea.get_Item(int x, int y), token 0x0600343F,
# RVA 0x3923370, whose native body indexes area[x * SizeY + y].
# Cardinal dimension swaps also follow the original
# GridArea.GetHorizontal/VerticalSizeForOrientation getters. These facts do
# NOT confirm how rotated masks map to world positions or which layer bits
# count as occupied cells.
GRIDAREA_NATIVE_INDEX_EVIDENCE = (
    "steam_1.26.1_original_metadata_v31_gridarea_get_item_"
    "2_params_rva_0x3923370"
)
GRIDAREA_NATIVE_CARDINAL_SIZE_EVIDENCE = (
    "steam_1.26.1_original_gridarea_horizontal_vertical_orientation_getters"
)


def native_gridarea_layer_at(size_x: int, size_y: int,
                             layer_values: Sequence[int],
                             x: int, y: int) -> int:
    """Source-corroborated base GridArea.get_Item(x,y), NOT a collision test."""
    validate_footprint(size_x, size_y, layer_values)
    if (type(x) is not int or type(y) is not int or
            not (0 <= x < size_x and 0 <= y < size_y)):
        raise ValueError("original GridArea local layer coordinates out of bounds")
    return layer_values[x * size_y + y]


def native_gridarea_layer_window(size_x: int, size_y: int,
                                 layer_values: Sequence[int],
                                 x: int, y: int, width: int,
                                 height: int) -> list[list[int]]:
    """Render raw layer values as Y-major rows, from X-major native storage."""
    validate_footprint(size_x, size_y, layer_values)
    if (any(type(v) is not int for v in (x, y, width, height)) or
            not 0 <= x < size_x or not 0 <= y < size_y or
            not 1 <= width <= 256 or not 1 <= height <= 256 or
            x + width > size_x or y + height > size_y):
        raise ValueError("invalid source GridArea layer viewport")
    return [[layer_values[xx * size_y + yy]
             for xx in range(x, x + width)]
            for yy in range(y, y + height)]


def native_gridarea_cardinal_dimensions(size_x: int, size_y: int,
                                       layer_values: Sequence[int],
                                       orientation_code: int) -> dict:
    """Native cardinal width/height only; no transformed cell positions."""
    validate_footprint(size_x, size_y, layer_values)
    if type(orientation_code) is not int or not 0 <= orientation_code < 16:
        raise ValueError("invalid native GridOrientation code")
    if orientation_code not in CARDINAL_ORIENTATIONS:
        return {
            "status": "noncardinal_gridarea_dimensions_not_derived",
            "orientationCode": orientation_code,
            "nativeCardinalSizeVerified": False,
            "rotatedCellMappingVerified": False,
            "placementLegalityVerified": False,
        }
    swap = orientation_code in (4, 12)
    return {
        "status": "source_correlated_cardinal_gridarea_dimensions",
        "orientationCode": orientation_code,
        "sizeX": size_y if swap else size_x,
        "sizeY": size_x if swap else size_y,
        "nativeCardinalSizeVerified": True,
        "tessellationScalingApplied": False,
        "rotatedCellMappingVerified": False,
        "anchorModelVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
        "nativeEvidence": GRIDAREA_NATIVE_CARDINAL_SIZE_EVIDENCE,
    }


def candidate_layer_cells(size_x: int, size_y: int,
                          layer_values: Sequence[int], *,
                          cell_order: str, orientation_code: int,
                          anchor_mode: str, x: int, y: int
                          ) -> dict:
    """Return candidate offsets for nonzero native fixed32 layer masks only.

    Zero-vs-nonzero is used solely for an *experiment*. It is not proven to be
    the game's occupied-cell predicate, nor a collision category. Four cardinal
    enum codes are geometrically interpreted for candidate comparison only;
    the other 12 enum codes are intentionally unsupported until native proof.
    """
    validate_footprint(size_x, size_y, layer_values)
    if cell_order not in CELL_ORDERS or anchor_mode not in ANCHOR_MODELS:
        raise ValueError("unknown footprint projection hypothesis")
    if type(orientation_code) is not int or not 0 <= orientation_code < 16:
        raise ValueError("invalid native GridOrientation enum value")
    if type(x) is not int or type(y) is not int:
        raise ValueError("invalid native grid-local anchor")
    if orientation_code not in CARDINAL_ORIENTATIONS:
        return {
            "status": "unsupported_noncardinal_orientation_hypothesis",
            "orientationCode": orientation_code,
            "cellOrderHypothesis": cell_order,
            "anchorModelHypothesis": anchor_mode,
            "nativeCodeBodyVerified": False,
            "occupancyPredicateVerified": False,
            "placementLegalityVerified": False,
        }

    rotated_x = size_x if orientation_code % 8 == 0 else size_y
    rotated_y = size_y if orientation_code % 8 == 0 else size_x
    offset_x = x - (rotated_x // 2 if anchor_mode == "center_floor" else 0)
    offset_y = y - (rotated_y // 2 if anchor_mode == "center_floor" else 0)
    cells = []
    for orig_x in range(size_x):
        for orig_y in range(size_y):
            idx = (orig_x * size_y + orig_y if cell_order == "x_major"
                   else orig_y * size_x + orig_x)
            mask = layer_values[idx]
            if not mask:
                continue
            if orientation_code == 0:
                local_x, local_y = orig_x, orig_y
            elif orientation_code == 4:
                local_x, local_y = orig_y, size_x - 1 - orig_x
            elif orientation_code == 8:
                local_x, local_y = size_x - 1 - orig_x, size_y - 1 - orig_y
            else:  # 12
                local_x, local_y = size_y - 1 - orig_y, orig_x
            cells.append({
                "x": offset_x + local_x, "y": offset_y + local_y,
                "originalLayerValue": mask,
                "originalFlatIndex": idx,
                "hypotheticalLocalX": local_x, "hypotheticalLocalY": local_y,
            })
    return {
        "status": "explicit_unverified_footprint_projection",
        "sizeXRotatedHypothesis": rotated_x,
        "sizeYRotatedHypothesis": rotated_y,
        "orientationCode": orientation_code,
        "cellOrderHypothesis": cell_order,
        "anchorModelHypothesis": anchor_mode,
        "nonzeroNativeLayerCellCount": len(cells),
        "cells": cells,
        "positionBasis": "nativeGridLocal",
        "nativeCodeBodyVerified": False,
        "cellIndexToXYVerified": False,
        "rotationTransformVerified": False,
        "anchorModelVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }
