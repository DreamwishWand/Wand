#!/usr/bin/env python3
"""Reproduce DB-02 Steam v1.26.2 public OnlineCategory data offline.

Input is the owner-local ddv_Data/StreamingAssets/itemlist directory.
Never publish the original files or save data. Native Premium/TimeLimited
metadata does NOT prove a shop offer, Twitch campaign, code or ownership.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

SOURCES = (
    ("Furniture", "cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196", 2823488, 6746, [52], 929, 197),
    ("Clothing", "a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946", 698960, 2041, [35], 541, 109),
    ("Trimming", "a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c", 78930, 365, [52], 33, 17),
    ("MountGear", "c7d3f2fc5198e9886eac9fa1843c2b37eaa05cd2195e913f4966214d603bb28b", 12182, 63, [52], 7, 5),
    ("Makeup", "ce83251a6ac082690c7a93698fee7526cf465b13a09d9e117d2e158500effe22", 17940, 69, [22], 15, 5),
    ("Tool", "2126651d27fcee9974f79e1ab86bf961be70d6182a778c2fb62d6c3c09a1457d", 25546, 126, [15], 86, 17),
    ("Character", "da6794c66a801a1de43a6ac7b7b79d77a663661f3226bc51a249092632777f0f", 192762, 142, [82], 2, 0),
    ("Companion", "62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219", 123360, 394, [27], 111, 11),
    ("Skin", "c557b76c8a762afb3d6cdd66e9c6ced22e7d863ff3dc7426f8f9aff3939e6371", 32463, 163, [17, 27], 106, 7),
)
EXPECTED_PUBLIC_SHA = "abece12c9fc204abc13cc8dbe071e5e393fd3bee27f0dc4ba9901cf609cf0170"

def varint(data: bytes, pos: int) -> tuple[int, int]:
    value = 0
    for shift in range(0, 70, 7):
        if pos >= len(data):
            raise ValueError("truncated protobuf varint")
        octet = data[pos]
        pos += 1
        value |= (octet & 127) << shift
        if not octet & 128:
            return value, pos
    raise ValueError("oversized protobuf varint")

def decode_fields(data: bytes) -> dict[int, list[tuple[int, int | bytes]]]:
    out: dict[int, list[tuple[int, int | bytes]]] = {}
    pos = 0
    while pos < len(data):
        tag, pos = varint(data, pos)
        number, wire = tag >> 3, tag & 7
        if not number:
            raise ValueError("invalid protobuf field")
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            n, pos = varint(data, pos)
            if pos + n > len(data):
                raise ValueError("truncated protobuf message")
            value = data[pos:pos + n]
            pos += n
        elif wire in (1, 5):
            n = 8 if wire == 1 else 4
            if pos + n > len(data):
                raise ValueError("truncated fixed protobuf field")
            value = data[pos:pos + n]
            pos += n
        else:
            raise ValueError("unknown protobuf wire type")
        out.setdefault(number, []).append((wire, value))
    return out

def extract_family(folder: Path, entry: tuple) -> dict:
    name, digest, size, records, field_numbers, premium_count, limited_count = entry
    original = (folder / f"{name}.json").read_bytes()
    if len(original) != size or hashlib.sha256(original).hexdigest() != digest:
        raise ValueError(f"{name}: wrong Steam 1.26.2 original")
    pos = count = 0
    seen: set[int] = set()
    categories: dict[int, list[int]] = {1: [], 2: []}
    while pos < len(original):
        _, pos = varint(original, pos)
        length, pos = varint(original, pos)
        if pos + length > len(original):
            raise ValueError("truncated native Item record")
        row = decode_fields(original[pos:pos + length])
        pos += length
        count += 1
        ids = row.get(1, [])
        if len(ids) != 1 or ids[0][0] != 0 or not isinstance(ids[0][1], int):
            raise ValueError("invalid native Item ID")
        item_id = ids[0][1]
        if item_id <= 0 or item_id in seen:
            raise ValueError("duplicate or invalid native Item ID")
        seen.add(item_id)
        field = 27 if name == "Skin" and item_id // 100000 == 1700 else (
            17 if name == "Skin" else field_numbers[0]
        )
        category = row.get(field, [])
        if not category:
            continue
        if (len(category) != 1 or category[0][0] != 0 or
                category[0][1] not in (1, 2)):
            raise ValueError("unknown native OnlineCategory")
        categories[category[0][1]].append(item_id)
    if (count != records or len(categories[1]) != premium_count or
            len(categories[2]) != limited_count):
        raise ValueError(f"{name}: original category census changed")
    return {
        "family": name,
        "sourceFile": f"StreamingAssets/itemlist/{name}.json",
        "originalSha256": digest,
        "originalBytes": size,
        "nativeRecords": records,
        "categoryFields": field_numbers,
        "premium": sorted(categories[1]),
        "timeLimited": sorted(categories[2]),
    }

def projection(input_dir: Path) -> bytes:
    families = [extract_family(input_dir, source) for source in SOURCES]
    ids = [i for family in families
           for kind in ("premium", "timeLimited") for i in family[kind]]
    if len(ids) != 2198 or len(set(ids)) != 2198:
        raise ValueError("native category totals or uniqueness changed")
    output = {
        "schema": "wand.db02.native-online-category@1",
        "target": {"platform": "Steam", "gameVersion": "1.26.2"},
        "nativeEnum": "Definitions.Items.OnlineCategory",
        "families": families,
        "coverage": {
            "sourceFamilies": 9,
            "sourceDefinitionRecords": 10109,
            "premiumCategoryRows": 1830,
            "timeLimitedCategoryRows": 368,
            "explicitNonzeroCategoryRows": 2198,
            "singleOfferOrCampaignLinkVerified": False,
            "currentAvailabilityVerified": False,
            "playerAcquisitionVerified": False,
            "allItemTypesCovered": False,
        }
    }
    payload = (json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    if len(payload) != 22925 or hashlib.sha256(payload).hexdigest() != EXPECTED_PUBLIC_SHA:
        raise ValueError("public projection bytes/hash mismatch")
    return payload

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True,
                        help="Steam ddv_Data/StreamingAssets/itemlist")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    payload = projection(args.input_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)
    print(f"verified {len(payload)} bytes sha256={EXPECTED_PUBLIC_SHA}")

if __name__ == "__main__":
    main()
