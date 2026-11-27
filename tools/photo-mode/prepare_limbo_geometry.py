"""Publish source-derived companion motion diagnostics without claiming special shader parity."""
import urllib.request
import json
from pathlib import Path
from prepare_actor_delta import apply_actor_archive
from prepare_release_preview import BODY_TYPES,entry,digest,metadata,require,valid_hash

NAME="Dreamwish-Wand-companion-limbo-diagnostic-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SHA="c7908e9936fc91aa89912f5432d500bd65d1a079e66c86f6a91f0b9a28094ed4"
SIZE=4822686

def download_limbo():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(SIZE+1)

def apply_limbo(raw,dest):
    return apply_actor_archive(raw,dest,size=SIZE,sha=SHA,base_count=263,item_count=17,
                               geometry_count=17,schema="wand.photo-mode.companion-limbo-diagnostic@1",
                               manifest="companion-limbo-diagnostic.json",prior={})

    # The original forward pixel program uses the default white texture (no
    # material texture reference), a view-angle radial term and a binary rim.
    # Reuse the immutable geometry asset; retain the partial-rendering notice.
    source=json.loads(Path(__file__).with_name("limbo-materials-1.26.2.json").read_text(encoding="utf-8"))
    path=dest/"index.json";public=json.loads(path.read_bytes())
    ids={item for item,row in public["items"].items() if all(row[b].get("limboGeometryDiagnostic") is True for b in BODY_TYPES)}
    require(public["gameVersion"]==source["gameVersion"] and ids==set(source["items"]) and len(ids)==17,"limbo material coverage")
    for item in sorted(ids):
        record=source["items"][item];row=public["items"][item]
        require(valid_hash(record["sourceSha256"]) and type(record["palette"]) is int and 0<=record["palette"]<len(source["palettes"]),"limbo material identity")
        for b in BODY_TYPES:
            o=row[b];e=entry(o["actor"]);data=(dest/(e["sha256"]+".glb")).read_bytes()
            require(len(data)==e["bytes"] and digest(data)==e["sha256"],"limbo actor integrity")
            d=metadata(data);matches=[i for i,v in enumerate(d["materials"]) if v.get("name")==record["material"]]
            require(len(matches)==1 and any(p["material"]==matches[0] for mesh in d["meshes"] for p in mesh["primitives"]),"limbo source material not found: "+item+" "+str([x.get("name") for x in d["materials"]]))
            o["limboMaterial"]={"material":record["material"],"sourceSha256":record["sourceSha256"],**source["palettes"][record["palette"]]}
    path.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Source limbo forward materials: 17 items; no additional geometry or textures")
