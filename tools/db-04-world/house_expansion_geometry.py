"""Reproduce reviewed HouseExpansion geometry from the SHA-pinned Steam protoDb.
Only room name, prefab identifier and five literal GridData paths are projected.
No original bytes, prices, purchase state, or personal saves are published.
"""
import argparse
import hashlib
import json
from pathlib import Path
from world import wire_fields, one, text_field

SOURCE_SHA = "dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623"

def projection(raw):
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
        raise ValueError("unexpected source digest")
    payloads = []
    for n, w, data in wire_fields(raw):
        if (n, w) != (1, 2):
            raise ValueError("unexpected database envelope")
        entry = wire_fields(data)
        metadata = wire_fields(one(entry, 2, 2, True))
        if text_field(entry, 1) == "HouseExpansion" and text_field(metadata, 5) == "Meta.HouseExpansion":
            payloads.append(one(metadata, 6, 2, True))
    if len(payloads) != 1:
        raise ValueError("missing or duplicate expansion")
    interior = wire_fields(one(wire_fields(payloads[0]), 1, 2, True))
    main = [v for n, w, v in interior if (n, w) == (1, 2)]
    additional = [v for n, w, v in interior if (n, w) == (2, 2)]
    if main != additional or len(main) != 26 or one(interior, 4, 0, True) != 20:
        raise ValueError("unexpected room/floor census")
    rooms = []
    for payload in main:
        row = wire_fields(payload)
        name, prefab, floor = (text_field(row, n, True) for n in (1, 2, 3))
        walls = {}
        for n, w, v in row:
            if (n, w) == (4, 2):
                fields = wire_fields(v)
                key = one(fields, 1, 0)
                key = 0 if key is None else key
                if key in walls:
                    raise ValueError("duplicate wall")
                walls[key] = text_field(fields, 2, True)
        if set(walls) != set(range(4)):
            raise ValueError("missing wall")
        rooms.append(dict(name=name, prefab=prefab, paths=[floor]+[walls[i] for i in range(4)]))
    if len({r["name"] for r in rooms}) != 26 or len({r["prefab"] for r in rooms}) != 26:
        raise ValueError("duplicate room geometry")
    return dict(schema="wand.world.house-expansion-geometry@1",gameVersion="1.26.2",
                sourceProtoDbSha256=SOURCE_SHA,sourceRecord="Meta.HouseExpansion",maxFloors=20,rooms=rooms)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("original", type=Path)
    parser.add_argument("catalog", type=Path)
    args=parser.parse_args()
    if projection(args.original.read_bytes()) != json.loads(args.catalog.read_text(encoding="utf-8")):
        raise ValueError("reviewed geometry differs from original")
    print("26 original geometries verified; maximum floors: 20")

if __name__ == "__main__":
    main()
