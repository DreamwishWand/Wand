#!/usr/bin/env python3
"""Source-pinned Steam v1.26.1 GridArea integer-vector rotation (no placement).

Native GridArea.GetRotated/GetUnRotated use TWO separate signed integer
products truncated toward zero after division by 100, not Math.sin/cos or
a floating-point matrix. The 16 coefficients come from two SHA-256-named
64-byte RVA initializer fields in the original IL2CPP metadata v31.
No rotated cell mapping, grid anchor or collision semantics are asserted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

COS = (-100, -92, -71, -38, 0, 38, 71, 92,
       100, 92, 71, 38, 0, -38, -71, -92)
SIN = (0, 38, 71, 92, 100, 92, 71, 38,
       0, -38, -71, -92, -100, -92, -71, -38)

COS_FIELD_HASH = "33E08F575894FB4DC07B1049D58D185ED5B751ABFA51420694C73EC2742B13DE"
SIN_FIELD_HASH = "5B6E0D7F418632DFDBED128C7F41C18AC7EEC9BA8785F67EAC3F3582CDA2B719"
SOURCE_METADATA_SHA = "5005195e74242ec0736987c50204e13efd68c9223cfd01dd00182fb2f388444f"
SOURCE_DLL_SHA = "a11bdf8245c691e6c66c7579193de6f259edb01c035ecc9e01f19fd358ee034d"
MAX_METADATA_BYTES = 256 * 1024 * 1024
INT32_MIN = -0x80000000
INT32_MAX = 0x7fffffff

# Source native PE64 method-body hashes/byte ranges from the exact matching
# original Steam DLL. These are identification evidence, not code bytes.
METHODS = (
    ("GridArea.Cos", 0x3924b10, 115,
     "2f689185fbf77e8945223f3c41e2ed35a901edd2ab0a51eb9106d8dc1c5d7438"),
    ("GridArea.Sin", 0x3924b90, 116,
     "448403e886d74025e7f156ea4b1878d9050255fa70909c9af4a5f048c65907e4"),
    ("GridArea.GetUnRotated", 0x3924c10, 274,
     "33a5a98ff099aea5c559ec2016cd47e562c3d938ae39c4a8acf71a2049451a60"),
    ("GridArea.GetRotated", 0x3924d30, 273,
     "096bed05ad932ef3285b9bd67a4af5d7065a71bc851ee86d72a604887ac78f17"),
    ("GridArea..cctor", 0x3924f80, 404,
     "61041b7aba4d54fd4c30cc40fb9bdefe89be3c360d8ea59d73665143a7f8ccbc"),
)


def _int32(value):
    return ((value + 0x80000000) & 0xffffffff) - 0x80000000


def _trunc_div_100(value):
    return (abs(value) // 100) * (1 if value >= 0 else -1)


def rotate_gridarea_vector(x: int, y: int, orientation: int, *,
                           inverse: bool = False) -> dict:
    """Mirror native 32-bit IMUL and signed divide-toward-zero PER term."""
    if (type(x) is not int or type(y) is not int or
            not INT32_MIN <= x <= INT32_MAX or
            not INT32_MIN <= y <= INT32_MAX or
            type(orientation) is not int or not 0 <= orientation < 16 or
            type(inverse) is not bool):
        raise ValueError("invalid GridArea int32 vector or native orientation")
    cos, sin = COS[orientation], SIN[orientation]
    xc = _trunc_div_100(_int32(x * cos))
    ys = _trunc_div_100(_int32(y * sin))
    xs = _trunc_div_100(_int32(x * sin))
    yc = _trunc_div_100(_int32(y * cos))
    return {
        "x": _int32(xc + ys if inverse else xc - ys),
        "y": _int32(yc - xs if inverse else yc + xs),
        "orientationCode": orientation,
        "status": "steam_1_26_1_source_matched_integer_vector_rotation",
        "operation": "GetUnRotated" if inverse else "GetRotated",
        "nativeIntegerTruncationVerified": True,
        "nativeVectorRotationVerified": True,
        "coefficientScale": 100,
        "rotatedGridAreaCellMappingVerified": False,
        "gridObjectAnchorVerified": False,
        "occupancyPredicateVerified": False,
        "placementLegalityVerified": False,
    }


def _table(raw, word_index):
    offset, length = struct.unpack_from("<II", raw, word_index * 4)
    if (not offset or not length or offset > len(raw) or
            length > len(raw) - offset):
        raise ValueError("invalid original IL2CPP metadata table bounds")
    return offset, length


def verify_original_rotation_metadata(metadata_path, *,
                                      require_steam_1261=True) -> dict:
    """Locate both original field-default blobs BY HASHED FIELD NAME.

    No hard-coded metadata byte offsets. Supports only known metadata v31
    layout; do not accidentally treat a newer game revision as verified.
    """
    path = Path(metadata_path)
    if (path.is_symlink() or not path.is_file() or
            path.stat().st_size < 256 or
            path.stat().st_size > MAX_METADATA_BYTES):
        raise ValueError("invalid original IL2CPP metadata file")
    raw = path.read_bytes()
    if struct.unpack_from("<II", raw, 0) != (0xfab11baf, 31):
        raise ValueError("only original metadata v31 is supported")
    digest = hashlib.sha256(raw).hexdigest()
    if require_steam_1261 and digest != SOURCE_METADATA_SHA:
        raise ValueError("source Steam v1.26.1 metadata SHA mismatch")

    strings_start, strings_len = _table(raw, 6)
    defaults_start, defaults_len = _table(raw, 16)
    data_start, data_len = _table(raw, 18)
    fields_start, fields_len = _table(raw, 24)
    if defaults_len % 12 or fields_len % 12:
        raise ValueError("misaligned original IL2CPP metadata field table")
    wanted = {COS_FIELD_HASH: COS, SIN_FIELD_HASH: SIN}
    # Use the exact field names produced by IL2CPP's source SHA256 naming,
    # not a guessed fixed offset to a 64-byte data region.
    names = {}
    string_bytes = raw[strings_start:strings_start + strings_len]
    for name in wanted:
        needle = name.encode("ascii") + b"\x00"
        first = string_bytes.find(needle)
        if first < 0 or string_bytes.find(needle, first + 1) >= 0:
            raise ValueError("missing or duplicated native field initializer name")
        names[first] = name
    indices = {}
    for idx in range(fields_len // 12):
        name_offset = struct.unpack_from("<I", raw, fields_start + idx * 12)[0]
        if name_offset in names:
            name = names[name_offset]
            if name in indices:
                raise ValueError("ambiguous original rotation initializer field")
            indices[name] = idx
    if len(indices) != len(wanted):
        raise ValueError("missing original rotation initializer field definition")
    offsets = {}
    for i in range(defaults_len // 12):
        field_idx, _, data_index = struct.unpack_from(
            "<III", raw, defaults_start + i * 12)
        for name, idx in indices.items():
            if field_idx == idx:
                if name in offsets:
                    raise ValueError("duplicate original native field-default row")
                offsets[name] = data_index
    if len(offsets) != len(wanted):
        raise ValueError("original native array initializer lacks default values")
    entries = {}
    for name, expected in wanted.items():
        index = offsets[name]
        if index > data_len - 64:
            raise ValueError("truncated native original 16-entry coefficient data")
        blob = raw[data_start + index:data_start + index + 64]
        if hashlib.sha256(blob).hexdigest().upper() != name:
            raise ValueError("native original coefficient field hash mismatch")
        values = struct.unpack("<16i", blob)
        if values != expected:
            raise ValueError("original native rotation coefficients changed")
        entries["cos" if name == COS_FIELD_HASH else "sin"] = {
            "fieldNameSha256": name,
            "fieldDefinitionIndex": indices[name],
            "coefficientCount": 16,
            "coefficientScale": 100,
            "originalValuesSha256": hashlib.sha256(blob).hexdigest(),
        }
    return {
        "status": "original_steam_1261_rotation_tables_verified"
                  if require_steam_1261 else "source_metadata_v31_rotation_tables_verified",
        "metadataVersion": 31,
        "originalMetadataSha256": digest,
        "tables": entries,
        "originalNativeMethodBodyVerified": False,
        "gridObjectAnchorVerified": False,
        "rotatedGridAreaCellMappingVerified": False,
        "placementLegalityVerified": False,
    }


def verify_original_rotation_dll(dll_path) -> dict:
    """Check source version AND native methods actually present in the DLL."""
    from native_pe_evidence import (
        file_offset_for_rva, pe64_sections, sha256_file,
    )
    path = Path(dll_path)
    if path.is_symlink() or sha256_file(path) != SOURCE_DLL_SHA:
        raise ValueError("original Steam v1.26.1 GameAssembly identity mismatch")
    sections = pe64_sections(path)
    with path.open("rb") as binary:
        for name, rva, length, digest in METHODS:
            file_offset, mapping = file_offset_for_rva(
                sections, rva, length)
            if mapping["readLength"] != length:
                raise ValueError("incomplete source-native method window")
            binary.seek(file_offset)
            if hashlib.sha256(binary.read(length)).hexdigest() != digest:
                raise ValueError("native method body has changed: " + name)
    return {
        "status": "original_steam_1261_rotation_bodies_identified",
        "originalDllSha256": SOURCE_DLL_SHA,
        "methodsCorroborated": [m[0] for m in METHODS],
        "fullControlFlowVerified": False,
        "rotatedGridAreaCellMappingVerified": False,
        "placementLegalityVerified": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--dll", required=True, type=Path)
    args = parser.parse_args()
    try:
        report = {
            "schema": "wand.db04.original-gridarea-vector-rotation@1",
            "gameVersion": "1.26.1",
            "metadata": verify_original_rotation_metadata(args.metadata),
            "dll": verify_original_rotation_dll(args.dll),
            "nativeVectorRotationVerified": True,
            "rotatedGridAreaCellMappingVerified": False,
            "gridObjectAnchorVerified": False,
            "occupancyPredicateVerified": False,
            "placementLegalityVerified": False,
        }
        print(json.dumps(report, sort_keys=True, indent=2))
    except (ValueError, OSError, TypeError, UnicodeError, struct.error) as error:
        parser.exit(1, f"DB-04 source-native rotation verification failed: {error}\n")


if __name__ == "__main__":
    main()
