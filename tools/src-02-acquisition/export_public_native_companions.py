#!/usr/bin/env python3
"""Recreate source-native Companion Item ID/name-key index from Steam 1.26.2.

Only the 394 original definition IDs + internal name keys are published.
No original game file, local save, native image, or gameplay claim is uploaded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ORIGINAL_SHA = "62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219"
PUBLIC_SHA = "53ec1620d42cddc074043075e94aa7f580814c800b1efdfb67ff773f76253f88"
PUBLIC_BYTES = 16882
KEY = re.compile(r"[A-Za-z0-9_!.-]{1,130}\Z")

def varint(buf: bytes, pos: int) -> tuple[int, int]:
    value = 0
    for shift in range(0, 70, 7):
        if pos >= len(buf):
            raise ValueError("COMPANION_SOURCE_TRUNCATED_VARINT")
        octet = buf[pos]
        pos += 1
        value |= (octet & 127) << shift
        if octet < 128:
            return value, pos
    raise ValueError("COMPANION_SOURCE_BAD_VARINT")

def fields(buf: bytes) -> dict[int, list[tuple[int, int | bytes]]]:
    pos = 0
    out: dict[int, list[tuple[int, int | bytes]]] = {}
    while pos < len(buf):
        tag, pos = varint(buf, pos)
        field, wire = tag >> 3, tag & 7
        if field < 1:
            raise ValueError("COMPANION_SOURCE_ZERO_FIELD")
        if wire == 0:
            value, pos = varint(buf, pos)
        elif wire == 2:
            length, pos = varint(buf, pos)
            if pos + length > len(buf):
                raise ValueError("COMPANION_SOURCE_TRUNCATED_FIELD")
            value = buf[pos:pos + length]
            pos += length
        elif wire in (1, 5):
            length = 8 if wire == 1 else 4
            if pos + length > len(buf):
                raise ValueError("COMPANION_SOURCE_FIXED_FIELD")
            value = buf[pos:pos + length]
            pos += length
        else:
            raise ValueError("COMPANION_SOURCE_WIRE_TYPE")
        out.setdefault(field, []).append((wire, value))
    return out

def generate(path: Path) -> bytes:
    original = path.read_bytes()
    if len(original) != 123360 or hashlib.sha256(original).hexdigest() != ORIGINAL_SHA:
        raise ValueError("COMPANION_SOURCE_SHA")
    rows: list[list[int | str]] = []
    keys: set[str] = set()
    item_ids: set[int] = set()
    pos = 0
    while pos < len(original):
        _, pos = varint(original, pos)
        size, pos = varint(original, pos)
        if size < 1 or pos + size > len(original):
            raise ValueError("COMPANION_FRAME")
        row = fields(original[pos:pos + size])
        pos += size
        if not all(len(row.get(i, [])) == 1 for i in (1, 2, 3)):
            raise ValueError("COMPANION_FIELDS")
        id_wire, item = row[1][0]
        key_wire, raw_key = row[2][0]
        loc_wire, raw_loc = row[3][0]
        if id_wire != 0 or key_wire != 2 or loc_wire != 2:
            raise ValueError("COMPANION_FIELDS_WIRE")
        if not isinstance(item, int) or item <= 0 or \
                not isinstance(raw_key, bytes) or \
                not isinstance(raw_loc, bytes):
            raise ValueError("COMPANION_FIELDS_VALUE")
        key = raw_key.decode("ascii")
        loc = raw_loc.decode("ascii")
        if not KEY.fullmatch(key) or loc != "Companion." + key + "_DisplayName":
            raise ValueError("COMPANION_IDENTITY_KEY")
        if item in item_ids or key in keys:
            raise ValueError("COMPANION_DUPLICATE")
        item_ids.add(item)
        keys.add(key)
        rows.append([item, key])
    rows.sort(key=lambda row: row[0])
    if len(rows) != 394 or len(keys) != 394 or len(item_ids) != 394:
        raise ValueError("COMPANION_CENSUS")
    if [row for row in rows if "SakuraDragon" in row[1]] != [
        [120000191, "Expansion02!BabyDragon!SakuraDragon"]
    ] or [row for row in rows if "PirateCrocodile" in row[1]] != [
        [120000249, "Crocodile!PirateCrocodile"]
    ]:
        raise ValueError("COMPANION_ORIGINAL_NAME_CROSSWALK")
    doc = {
        "schema": "wand.db02.public-native-companion-identities@1",
        "target": {"platform": "Steam", "gameVersion": "1.26.2"},
        "source": {
            "file": "ddv_Data/StreamingAssets/itemlist/Companion.json",
            "bytes": 123360,
            "sha256": ORIGINAL_SHA
        },
        "coverage": {
            "originalCompanionDefinitions": 394,
            "uniqueNativeNameKeys": 394,
            "distinctCompanionItemIds": 394,
            "sourceCategoryAndCampaignNotImplied": True,
            "localizedDisplayNamesVerified": False,
            "specificCampaignLinksVerified": False,
            "actualPlayerGrantVerified": False
        },
        "identities": rows
    }
    payload = (json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    if len(payload) != PUBLIC_BYTES or hashlib.sha256(payload).hexdigest() != PUBLIC_SHA:
        raise ValueError("COMPANION_PUBLIC_SHA")
    return payload

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--companion", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = generate(args.companion)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    print(f"source-pinned 394 companion identities; sha256={PUBLIC_SHA}")

if __name__ == "__main__":
    main()
