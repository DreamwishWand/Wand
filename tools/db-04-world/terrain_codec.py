"""Read-only native GridData packed-floor decoding for validated 1/2-bit cases.

Source-based, empirical validation for Steam 1.26.1:
- Room12x16 grid produces a 192/192 exact rectangular wall border.
- MeadowGrid native starting positions: 742/743 supported furniture/building
  objects have a terrain mask accepted by the associated item footprint.
The single disagreement is a native 11x11 boundary rock (175, 0), for which
the *origin* alone cannot establish all occupied-cell placement conditions.

This proves useful grid-local rendering consistency, NOT the implementation
of the game's decoder or complete placement/collision/rotation legality.
"""
from __future__ import annotations
from typing import Sequence

EVIDENCE = "steam_1.26.1_room12x16_border_192of192_and_meadow_origin_742of743"
PACKING = "x_major_msb_first"
MAX_CELLS = 16_777_216


def validated_cell_bits(palette_size: int) -> int | None:
    """Beyond 2 bits/cell, do not guess the game's byte-boundary packing."""
    if palette_size == 2:
        return 1
    if palette_size in (3, 4):
        return 2
    return None


def _validate_dimensions(size_x: int, size_y: int) -> None:
    if (type(size_x) is not int or type(size_y) is not int or
            size_x < 1 or size_y < 1 or
            size_x * size_y > MAX_CELLS):
        raise ValueError("invalid native compacted GridData dimensions")


def describe_native_packing(size_x: int, size_y: int,
                            palette: Sequence[int], packed: bytes) -> dict:
    """Validate palette symbols, source byte length and trailing padding."""
    _validate_dimensions(size_x, size_y)
    if (not isinstance(palette, (list, tuple)) or not palette or
            len(palette) > 65536 or
            any(type(v) is not int or not 0 <= v <= 0xffffffff
                for v in palette)):
        raise ValueError("invalid native compacted floor palette")
    if not isinstance(packed, bytes):
        raise ValueError("native packed-floor payload must be bytes")
    bits = validated_cell_bits(len(palette))
    if bits is None:
        return {"status": "unresolved_palette_cardinality", "decoded": False,
                "reason": "No source-corroborated native packing for this palette size"}
    used_bits = size_x * size_y * bits
    expected = (used_bits + 7) // 8
    if len(packed) != expected:
        raise ValueError("compacted floor payload length does not match dimensions")
    if used_bits % 8:
        mask = (1 << (8 - used_bits % 8)) - 1
        if packed[-1] & mask:
            raise ValueError("nonzero padding bits in compacted native floor bytes")
    if len(palette) < 1 << bits:
        # For 3-entry, 2-bit palettes, code 3 is invalid; check every cell.
        for i in range(size_x * size_y):
            if _flat_index(packed, bits, i) >= len(palette):
                raise ValueError("compacted floor index missing from native palette")
    return {"status": "cross_validated_native_samples", "decoded": True,
            "nativeCodeBodyVerified": False,
            "sampleBasedEncodingEvidence": EVIDENCE,
            "packing": PACKING, "cellBits": bits,
            "cellIndexFormula": "x*sizeY+y",
            "byteBitOrder": "most_significant_first",
            "gridLocalCoordinatesOnly": True,
            "placementLegalityVerified": False}


def _flat_index(packed: bytes, bits: int, index: int) -> int:
    offset = index * bits
    shift = 8 - bits - (offset % 8)
    return (packed[offset // 8] >> shift) & ((1 << bits) - 1)


def floor_at(size_x: int, size_y: int, palette: Sequence[int],
             packed: bytes, x: int, y: int) -> int:
    evidence = describe_native_packing(size_x, size_y, palette, packed)
    if not evidence["decoded"]:
        raise ValueError("native floor encoding unresolved for this palette")
    if (type(x) is not int or type(y) is not int or
            not (0 <= x < size_x and 0 <= y < size_y)):
        raise ValueError("native floor position outside grid bounds")
    return palette[_flat_index(packed, evidence["cellBits"], x * size_y + y)]


def decode_window(size_x: int, size_y: int, palette: Sequence[int],
                  packed: bytes, x: int, y: int,
                  width: int, height: int) -> list[list[int]]:
    """Return rows in display Y-major order; native cells are X-major."""
    evidence = describe_native_packing(size_x, size_y, palette, packed)
    if not evidence["decoded"]:
        raise ValueError("native floor encoding unresolved for this palette")
    if (any(type(n) is not int for n in (x, y, width, height)) or
            not (0 <= x < size_x and 0 <= y < size_y and
                 0 < width <= 256 and 0 < height <= 256 and
                 x + width <= size_x and y + height <= size_y)):
        raise ValueError("invalid native floor window bounds")
    bits = evidence["cellBits"]
    return [[palette[_flat_index(packed, bits, xx * size_y + yy)]
             for xx in range(x, x + width)]
            for yy in range(y, y + height)]
