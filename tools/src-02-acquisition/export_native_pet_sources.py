#!/usr/bin/env python3
"""Offline-only v1.26.2 PetItemData.Source projection.

Usage:
  python tools/src-02-acquisition/export_native_pet_sources.py \\
    --input /path/to/Steam-v1.26.2/ddv_Data/StreamingAssets/itemlist/Companion.json \\
    --output /path/to/pet-source-categories-1.26.2.json

Source bytes remain local. Only six source-category Item-ID arrays are published.
Never infer a specific Twitch campaign, promo-code redemption or ownership.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ORIGINAL_SHA = "62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219"
PUBLIC_SHA = "7a582908a3b89df6508ab36ae59bcf2ba88c580e8ad1167e5852e7b1f4203975"
CATEGORIES = (
    (1, "quest", 8), (2, "timebending", 1), (3, "event", 9),
    (4, "star_path", 7), (5, "premium_shop", 95),
    (6, "exclusive_promotion", 14),
)


def varint(buf: bytes, start: int) -> tuple[int, int]:
    value, shift, position = 0, 0, start
    while position < len(buf) and shift < 70:
        octet = buf[position]
        position += 1
        value |= (octet & 127) << shift
        if not octet & 128:
            return value, position
        shift += 7
    raise ValueError("invalid protobuf varint")


def protobuf_fields(data: bytes):
    pos = 0
    while pos < len(data):
        tag, pos = varint(data, pos)
        field, wire = tag >> 3, tag & 7
        if field < 1:
            raise ValueError("invalid protobuf field")
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            n, pos = varint(data, pos)
            if pos + n > len(data):
                raise ValueError("truncated message")
            value = data[pos:pos + n]
            pos += n
        elif wire in (1, 5):
            n = 8 if wire == 1 else 4
            if pos + n > len(data):
                raise ValueError("truncated fixed field")
            value = data[pos:pos + n]
            pos += n
        else:
            raise ValueError("unsupported protobuf wire type")
        yield field, wire, value


def source_projection(original: bytes) -> bytes:
    if len(original) != 123360 or hashlib.sha256(original).hexdigest() != ORIGINAL_SHA:
        raise ValueError("wrong Steam v1.26.2 Companion.json source")
    groups = {code: [] for code, _, _ in CATEGORIES}
    offset, count = 0, 0
    while offset < len(original):
        _, offset = varint(original, offset)  # original native map key
        length, offset = varint(original, offset)
        if offset + length > len(original):
            raise ValueError("truncated original record")
        fields = list(protobuf_fields(original[offset:offset + length]))
        offset += length
        count += 1
        ids = [value for field, wire, value in fields if field == 1 and wire == 0]
        sources = [value for field, wire, value in fields if field == 9 and wire == 0]
        if len(ids) != 1:
            raise ValueError("ambiguous original Item ID")
        item_id = ids[0]
        if 120000000 <= item_id < 120100000 and sources:
            if len(sources) != 1 or sources[0] not in groups:
                raise ValueError("unknown or duplicate PetItemData.Source")
            groups[sources[0]].append(item_id)
    if count != 394 or offset != len(original):
        raise ValueError("wrong native source record count")
    categories = []
    all_ids: set[int] = set()
    for code, name, expected in CATEGORIES:
        ids = sorted(groups[code])
        if len(ids) != expected or any(i in all_ids for i in ids):
            raise ValueError("wrong source category census")
        all_ids.update(ids)
        categories.append([name, ids])
    if len(all_ids) != 134:
        raise ValueError("wrong original Source cardinality")
    doc = {
        "schema": "wand.db02.native-pet-source-categories@1",
        "target": {"platform": "Steam", "gameVersion": "1.26.2"},
        "source": {
            "originalFile": "StreamingAssets/itemlist/Companion.json",
            "originalSha256": ORIGINAL_SHA,
            "originalBytes": 123360,
            "recordType": "Definitions.Items.PetItemData",
            "enumType": "Definitions.Items.MetaLocation",
            "sourceFieldNumber": 9,
            "onlyExplicitNonWorldSourceValues": True,
        },
        "categories": categories,
        "coverage": {
            "sourcePinnedPetRows": 134,
            "groupSizes": [c[2] for c in CATEGORIES],
            "individualCampaignLinksVerified": False,
            "playerAcquisitionVerified": False,
            "allItemTypesCovered": False,
        },
    }
    payload = (json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    if len(payload) != 2061 or hashlib.sha256(payload).hexdigest() != PUBLIC_SHA:
        raise ValueError("projection SHA mismatch")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    payload = source_projection(args.input.read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)


if __name__ == "__main__":
    main()
