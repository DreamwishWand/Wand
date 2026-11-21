"""Read-only original GridData packed-floor decoding for 1/2/4-bit cases.

Source-based, empirical validation for Steam 1.26.1:
- Room12x16 grid produces a 192/192 exact rectangular wall border.
- MeadowGrid native starting positions: 742/743 supported furniture/building
  objects have a terrain mask accepted by the associated item footprint.
The single disagreement is a native 11x11 boundary rock (175, 0), for which
the *origin* alone cannot establish all occupied-cell placement conditions.

Steam 1.26.1 source-native disassembly additionally confirms the compiled
get_Item(int,int) uses flat index x*SizeY+y and MSB-first packed bit extraction;
GetNumberOfBitsPerPosition returns 1 for palette <=2, 2 for 3..4, and 4 for
larger counts. No evidence supports palette sizes >16. Native placement,
world transforms, and collision semantics are unrelated and remain unverified.
"""
from __future__ import annotations
from collections import Counter
from typing import Sequence

EVIDENCE = "steam_1.26.1_room12x16_border_192of192_and_meadow_origin_742of743"
PACKING = "x_major_msb_first"
MAX_CELLS = 16_777_216
FOUR_BIT_NATIVE_EVIDENCE = (
    "steam_1.26.1_original_metadata_v31_griddata_get_item_"
    "get_number_of_bits_per_position_x64_body"
)


def validated_cell_bits(palette_size: int) -> int | None:
    """Match native GetNumberOfBitsPerPosition for representable palettes."""
    if type(palette_size) is not int:
        return None
    if 1 <= palette_size <= 2:
        return 1
    if 3 <= palette_size <= 4:
        return 2
    if 5 <= palette_size <= 16:
        return 4
    return None


def _validate_dimensions(size_x: int, size_y: int) -> None:
    if (type(size_x) is not int or type(size_y) is not int or
            size_x < 1 or size_y < 1 or
            size_x * size_y > MAX_CELLS):
        raise ValueError("invalid native compacted GridData dimensions")


def describe_native_packing(size_x: int, size_y: int,
                            palette: Sequence[int], packed: bytes,
                            *, source_game_version: str) -> dict:
    """Preserve raw bytes; interpret packing only with original-version proof."""
    _validate_dimensions(size_x, size_y)
    if (not isinstance(palette, (list, tuple)) or not palette or
            len(palette) > 65536 or
            any(type(v) is not int or not 0 <= v <= 0xffffffff
                for v in palette)):
        raise ValueError("invalid native compacted floor palette")
    if not isinstance(packed, bytes):
        raise ValueError("native packed-floor payload must be bytes")
    if not isinstance(source_game_version, str) or not source_game_version:
        raise ValueError("missing source game version for native GridData proof")
    # Original IL2CPP grid getter/bit-width semantics have been validated
    # against Steam 1.26.1 only. For newer archives, preserve source bytes
    # without applying this decoder, sizing rule, padding rule or histogram.
    if source_game_version != "1.26.1":
        return {
            "status": "native_packing_not_verified_for_game_version",
            "decoded": False,
            "sourceGameVersion": source_game_version,
            "verifiedNativeGameVersion": "1.26.1",
            "nativeCodeBodyVerified": False,
            "placementLegalityVerified": False,
        }
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
            "sampleBasedEncodingEvidence": (
                EVIDENCE if bits in (1, 2) else FOUR_BIT_NATIVE_EVIDENCE),
            "packing": PACKING, "cellBits": bits,
            "cellIndexFormula": "x*sizeY+y",
            "byteBitOrder": "most_significant_first",
            "gridLocalCoordinatesOnly": True,
            "placementLegalityVerified": False}


def _flat_index(packed: bytes, bits: int, index: int) -> int:
    offset = index * bits
    shift = 8 - bits - (offset % 8)
    return (packed[offset // 8] >> shift) & ((1 << bits) - 1)



def count_packed_palette_indices(size_x: int, size_y: int,
                                 palette: Sequence[int],
                                 packed: bytes,
                                 *, source_game_version: str) -> list[int] | None:
    """Exact source-byte palette index histogram without allocating a 2D grid.

    This counts *candidate-codec* cell values, not gameplay placement legality.
    An unsupported native palette width returns None instead of guessed bins.
    The histogram is keyed by original palette index, preserving repeated
    uint32 palette values without collapsing them.
    """
    evidence = describe_native_packing(
        size_x, size_y, palette, packed,
        source_game_version=source_game_version)
    if not evidence["decoded"]:
        return None
    bits = evidence["cellBits"]
    mask = (1 << bits) - 1
    cells = size_x * size_y
    cells_per_byte = 8 // bits
    complete_bytes, tail_cells = divmod(cells, cells_per_byte)
    counts = [0] * len(palette)

    # Counting 256 byte codes once, rather than allocating 16M decoded cells,
    # keeps large native GridData inputs bounded by packed source size.
    for byte, repeats in Counter(packed[:complete_bytes]).items():
        for position in range(cells_per_byte):
            palette_index = (byte >> (8 - bits * (position + 1))) & mask
            if palette_index >= len(palette):
                raise ValueError("compacted floor index missing from native palette")
            counts[palette_index] += repeats

    if tail_cells:
        tail = packed[complete_bytes]
        for position in range(tail_cells):
            palette_index = (tail >> (8 - bits * (position + 1))) & mask
            if palette_index >= len(palette):
                raise ValueError("compacted floor index missing from native palette")
            counts[palette_index] += 1
    if sum(counts) != cells:
        raise ValueError("native terrain cell histogram cardinality mismatch")
    return counts


def floor_at(size_x: int, size_y: int, palette: Sequence[int],
             packed: bytes, x: int, y: int,
             *, source_game_version: str) -> int:
    evidence = describe_native_packing(
        size_x, size_y, palette, packed,
        source_game_version=source_game_version)
    if not evidence["decoded"]:
        raise ValueError("native floor encoding unresolved for this palette")
    if (type(x) is not int or type(y) is not int or
            not (0 <= x < size_x and 0 <= y < size_y)):
        raise ValueError("native floor position outside grid bounds")
    return palette[_flat_index(packed, evidence["cellBits"], x * size_y + y)]


def decode_window(size_x: int, size_y: int, palette: Sequence[int],
                  packed: bytes, x: int, y: int,
                  width: int, height: int,
                  *, source_game_version: str) -> list[list[int]]:
    """Return rows in display Y-major order; native cells are X-major."""
    evidence = describe_native_packing(
        size_x, size_y, palette, packed,
        source_game_version=source_game_version)
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
