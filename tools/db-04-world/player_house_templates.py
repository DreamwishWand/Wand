"""Decode the native PlayerHouse wrapper to a private, source-local graph.

No profile writer, public publication, or inferred defaults beyond protobuf
scalar defaults. State-bearing objects are classified, not reconstructed.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import zlib

from world import wire_fields, one, text_field, native_int32, native_uint32, ORIENTATION_NAMES


def checked(data, allowed):
    fields = wire_fields(data)
    if any((n, w) not in allowed for n, w, _ in fields):
        raise ValueError("unexpected field in player house template")
    return fields


def entries(fields, number, decoder, key_decoder=native_uint32):
    result = {}
    for n, w, raw in fields:
        if n != number:
            continue
        if w != 2:
            raise ValueError("invalid map wire")
        f = checked(raw, {(1, 0), (2, 0), (2, 2), (2, 5)})
        k = key_decoder(one(f, 1, 0))
        vals = [(wire, val) for field, wire, val in f if field == 2]
        if len(vals) != 1 or k in result:
            raise ValueError("missing value or duplicate key")
        result[k] = decoder(*vals[0])
    return result


def message(wire, data):
    if wire != 2:
        raise ValueError("expected message")
    return data


def scalar(wire, data):
    if wire != 0:
        raise ValueError("expected scalar")
    return native_uint32(data)


def room(wire, data):
    f = checked(message(wire, data), {(1,2),(2,0),(3,2),(4,2),(5,0),(6,2),(8,0)})
    walls = entries(f, 3, scalar, native_int32)
    papers = entries(f, 6, scalar, native_int32)
    if set(walls) != {0,1,2,3} or set(papers) != set(walls):
        raise ValueError("unexpected wall set")
    return {"Name": text_field(f,1) or "", "FloorGridID": native_uint32(one(f,2,0)),
            "WallGridIDs": walls, "RoomPrefabAddress": text_field(f,4,True),
            "Flooring": native_int32(one(f,5,0)), "Wallpapers": papers,
            "Ceiling": native_int32(one(f,8,0))}


def floor(data):
    f = checked(data, {(1,2)})
    rooms = entries(f,1,room,native_int32)
    if not rooms or not set(rooms) <= {0,1,2,3}:
        raise ValueError("invalid room slots")
    return {"Rooms": rooms}


def object_row(wire, data):
    f = checked(message(wire,data), {(1,0),(2,0),(3,0),(4,0),(5,0),(6,2)})
    direction = native_int32(one(f,5,0))
    item = native_int32(one(f,2,0,True))
    if not 0 <= direction < len(ORIENTATION_NAMES) or item <= 0:
        raise ValueError("invalid object")
    row = {"ID":native_uint32(one(f,1,0)), "ItemID":item,
           "X":native_int32(one(f,3,0)), "Y":native_int32(one(f,4,0)),
           "Orientation":"GridOrientation_"+ORIENTATION_NAMES[direction]}
    state = one(f,6,2)
    if state is not None:
        parts = wire_fields(state)
        if len(parts) != 1 or parts[0][1] != 2:
            raise ValueError("unknown state envelope")
        tag, _, payload = parts[0]
        row["sourceStateField"] = tag
        row["sourceStateSha256"] = hashlib.sha256(state).hexdigest()
        if tag == 1:
            child = checked(payload,{(1,0)})
            row["sourceSubGridID"] = native_uint32(one(child,1,0))
    return row


def grid(wire, data):
    f = checked(message(wire,data), {(1,0),(2,2),(3,2),(4,0),(5,2),(6,0)})
    path = text_field(f,2,True)
    if not path.startswith("GridData/") or not path.endswith(".json") or ".." in path.split("/"):
        raise ValueError("invalid native grid path")
    objects = entries(f,5,object_row)
    next_id = native_uint32(one(f,6,0))
    factor = native_int32(one(f,4,0))
    if factor not in (1,2) or any(k!=o["ID"] or k>=next_id for k,o in objects.items()):
        raise ValueError("invalid grid object allocator")
    return {"ID":native_uint32(one(f,1,0)), "GridDataPath":path,
            "GridDefaultLayoutPath":text_field(f,3) or "", "TessellationFactor":factor,
            "Objects":objects, "NextGridObjectID":next_id}


def decode(raw, layout_path):
    root = checked(raw,{(1,2),(2,2)})
    h = checked(one(root,1,2,True),{(1,2)})
    floors = [floor(v) for _,_,v in h]
    if not floors:
        raise ValueError("missing floor")
    c = checked(one(root,2,2,True),{(1,2),(3,0)})
    grids = entries(c,1,grid)
    next_grid = native_uint32(one(c,3,0,True))
    if not grids or any(k!=g["ID"] or k>=next_grid for k,g in grids.items()):
        raise ValueError("invalid source grid allocator")
    refs = []
    for f in floors:
        for r in f["Rooms"].values():
            refs.append(r["FloorGridID"])
            refs.extend(r["WallGridIDs"].values())
    states = {}
    for g in grids.values():
        for o in g["Objects"].values():
            if "sourceStateField" in o:
                k = o["sourceStateField"]
                states[k] = states.get(k,0)+1
            if "sourceSubGridID" in o:
                refs.append(o["sourceSubGridID"])
    if len(set(refs))!=len(refs) or set(refs)!=set(grids):
        raise ValueError("incomplete or shared grid reference closure")
    return {"layoutPath":layout_path,"sourceSha256":hashlib.sha256(raw).hexdigest(),
            "floors":floors,"grids":grids,"sourceNextGridID":next_grid,
            "stateFields":states,"stateFree":not states}


def building_bindings(source):
    field = source["fields"]["Building.DefaultGridLayoutPath@string"]
    rows = json.loads(zlib.decompress(base64.b64decode(field["packed"],validate=True)))
    if len(rows)!=field["count"]:
        raise ValueError("source count mismatch")
    result = {}
    item = 0
    for delta,path in rows:
        if not isinstance(delta,int) or delta<=0 or not isinstance(path,str):
            raise ValueError("invalid source binding")
        item += delta
        if item//100000==205:
            result[item]=path
    return result


def extract(directory, source):
    templates = {}
    for file in sorted(directory.glob("PlayerHouse-*_DefaultLayout.json")):
        path="SceneLayouts/Houses/"+file.name
        templates[path]=decode(file.read_bytes(),path)
    bindings=building_bindings(source)
    missing=set(bindings.values())-set(templates)
    if missing:
        raise ValueError("referenced player house template absent")
    return {"schema":"wand.private.player-house-template-graph@1",
            "gameVersion":source["gameVersion"],"sourceItemsSha256":source["sourceItemsSha256"],
            "templates":templates,"buildingBindings":bindings,
            "runtimeVerified":False,"writerAuthorized":False}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("houses",type=Path)
    p.add_argument("reviewed_scalars",type=Path)
    p.add_argument("private_output",type=Path)
    a=p.parse_args()
    source=json.loads(a.reviewed_scalars.read_text(encoding="utf-8"))
    result=extract(a.houses,source)
    # Source-derived graph must not be put into the public repository.
    output=a.private_output.resolve()
    repo=Path(__file__).resolve().parents[2]
    if output.is_relative_to(repo):
        raise ValueError("private output must be outside the repository")
    with output.open("x",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,separators=(",",":"))
    print(json.dumps({"templates":len(result["templates"]),
        "buildings":len(result["buildingBindings"]),
        "stateFreeBuildings":sum(result["templates"][p]["stateFree"] for p in result["buildingBindings"].values()),
        "rooms":sum(len(f["Rooms"]) for t in result["templates"].values() for f in t["floors"]),
        "grids":sum(len(t["grids"]) for t in result["templates"].values())}))


if __name__=="__main__":
    main()
