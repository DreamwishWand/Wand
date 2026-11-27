#!/usr/bin/env python3
"""Extract original GridState evidence, never generate or modify a Save."""
import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from world import digest, wire_fields, one, native_uint32, native_int32, text_field

KINDS = {3: "GardenData", 5: "HouseData", 6: "StallData", 7: "FishingStallData", 22: "BuildingWithSkinData"}


def field_shapes(blob):
    return [{"field": f, "wire": w, "count": n}
            for (f, w), n in sorted(Counter((f, w) for f, w, _ in wire_fields(blob)).items())]


def scan(paths):
    sources, rows = [], defaultdict(list)
    for path in sorted(paths):
        raw = path.read_bytes()
        if len(raw) > 64 * 1024 * 1024:
            raise ValueError("source too large")
        root = wire_fields(raw)
        entries = [v for f, w, v in root if (f, w) == (1, 2)]
        if not entries:
            raise ValueError("no GridCollection entries: " + path.name)
        source = {"path": path.name, "sha256": digest(raw)}
        sources.append(source)
        grid_ids = set()
        for entry in entries:
            m = wire_fields(entry)
            gid = native_uint32(one(m, 1, 0))
            grid = wire_fields(one(m, 2, 2, True))
            if gid in grid_ids or gid != native_uint32(one(grid, 1, 0)):
                raise ValueError("Grid map identity")
            grid_ids.add(gid)
            data = text_field(grid, 2, True)
            if not data.startswith("GridData/"):
                raise ValueError("not a native GridCollection")
            object_ids = set()
            for f, w, v in grid:
                if f != 5:
                    continue
                if w != 2:
                    raise ValueError("Grid.Objects wire")
                m = wire_fields(v)
                oid = native_uint32(one(m, 1, 0))
                obj = wire_fields(one(m, 2, 2, True))
                if oid in object_ids or oid != native_uint32(one(obj, 1, 0)):
                    raise ValueError("GridObject map identity")
                object_ids.add(oid)
                item = native_int32(one(obj, 2, 0))
                if not 200 <= item // 100000 <= 205:
                    continue
                state = one(obj, 6, 2)
                tags = [] if state is None else wire_fields(state)
                row = {"layout": path.name, "grid": gid, "object": oid,
                       "statePresent": state is not None,
                       "stateSha256": None if state is None else digest(state),
                       "stateFieldShapes": [] if state is None else field_shapes(state),
                       "knownMessages": [
                           {"kind": KINDS[f], "fieldShapes": field_shapes(v)}
                           for f, w, v in tags if f in KINDS and w == 2],
                       "unclassifiedFields": sorted({f for f, w, _ in tags
                                                     if f not in KINDS or w != 2})}
                rows[item].append(row)
    return {"schema": "wand.dev.building-initial-state-evidence@1",
            "sources": sources, "runtimeCreationVerified": False,
            "instanceCount": sum(map(len, rows.values())), "itemCount": len(rows),
            "items": [{"itemId": item, "instances": instances}
                      for item, instances in sorted(rows.items())]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("layouts", nargs="+", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    paths = set()
    for p in args.layouts:
        if p.is_dir():
            paths.update(p.rglob("*Grids.json"))
        elif p.is_file():
            paths.add(p)
        else:
            parser.error("missing input: " + str(p))
    if not paths:
        parser.error("no layout files")
    out = args.out.resolve()
    repo = Path(__file__).resolve().parents[2]
    if out.is_relative_to(repo):
        parser.error("game-derived evidence must remain outside Git")
    report = scan(paths)
    with out.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({k: report[k] for k in ("itemCount", "instanceCount", "runtimeCreationVerified")}))


if __name__ == "__main__":
    main()
