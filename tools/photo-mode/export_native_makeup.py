"""Export the complete Steam 1.26.2 makeup source set as native BC blocks.

Private offline build output. No new Item DB, no original bundles or player saves,
no inferred blend order, color conversion, or final shader parity.
"""
import argparse
import json
import math
import re
import struct
import sys
import zipfile
from collections import Counter
from pathlib import Path

from resolve_animation_bundle import Reader, container_entries, digest, serialized_objects, unityfs
from pose_curves import require
from pose_material import read_streamed_texture

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "db-01-items"))
from build_full_native_fields import fields, frames

PINS = {
    "items": "ce83251a6ac082690c7a93698fee7526cf465b13a09d9e117d2e158500effe22",
    "bundle": "6228c50a9c862b34f507fe3ee2ad91f433dd217a1e4f876570cf7f27ce2834c3",
    "resources": "6085ded9a4449db200f64c5096960c0dae17f0891abc6fc4f6f7225d4ea126af",
}
SUBTYPES = {1:14, 2:3, 3:10, 4:3, 5:26, 6:6, 7:4, 10:3}
LAYOUTS = {(1024,1024,10,1):109, (1024,1024,26,1):12,
           (1024,1024,25,1):1, (2048,2048,10,1):2, (1024,1024,10,11):4}
WIRE = {1:0, 7:2, 8:2, 9:0, 10:0, 11:0, 12:5, 13:5}
GUID = re.compile(r"guid:([0-9a-f]{32})")

def source(path,key):
    raw = path.read_bytes()
    require(digest(raw) == PINS[key], "source identity "+key)
    return raw

def objects(raw):
    version, rows = serialized_objects(raw)
    require(version == "6000.0.62f1", "Unity serialized version")
    return {p:(c, raw[o:o+n]) for p,(c,o,n) in rows.items()}

def int32(v):
    if 0 <= v <= 0x7fffffff:
        return v
    require(2**64-2**31 <= v < 2**64, "invalid signed protobuf int32")
    return v-2**64

def extract_items(raw):
    rows = {}
    for _, message in frames(raw):
        f = {}
        for n,w,v,_ in fields(message):
            if n not in WIRE:
                continue
            require(w == WIRE[n] and n not in f, "makeup scalar wire")
            f[n] = v
        item = f[1]
        require(item//10_000_000 == 14 and item not in rows, "makeup item identity")
        masks = {}
        for body, n in (("female",7),("male",8)):
            ref = GUID.fullmatch(f[n].decode("utf-8"))
            require(ref is not None, "makeup texture address")
            masks[body] = ref[1]
        colors = [int32(f.get(n,0)) for n in (9,10,11)]
        require(all(-1 <= c < 75 for c in colors), "makeup color index")
        opacity,gloss = (struct.unpack("<f",f.get(n,bytes(4)))[0] for n in (12,13))
        require(all(math.isfinite(v) and 0 <= v <= 1 for v in (opacity,gloss)), "makeup parameters")
        rows[item] = {"subtype":item//100_000%100, "masks":masks,
                      "defaultColorIndices":colors, "defaultOpacity":opacity, "defaultGloss":gloss}
    require(len(rows)==69 and Counter(r["subtype"] for r in rows.values())==SUBTYPES,
            "makeup item coverage")
    require(sum(c==-1 for r in rows.values() for c in r["defaultColorIndices"])==77,
            "native signed color coverage")
    return rows

def extract_palette(raw):
    hits = []
    for cls, data in objects(raw).values():
        if cls != 114 or len(data) < 32:
            continue
        r = Reader(data)
        r.take(28)
        try:
            name = r.string()
        except (ValueError,UnicodeError):
            continue
        if name != "AvatarMakeupColorConfig":
            continue
        n, = r.unpack("i")
        require(n == 75 and len(data)-r.pos == 4*n, "Color32 array layout")
        hits.append((digest(data), [list(r.take(4)) for _ in range(n)]))
    require(len(hits)==1, "makeup palette identity")
    return hits[0]

def build(items,resources,bundle,out):
    rows = extract_items(items)
    palette_sha,palette = extract_palette(resources)
    targets = {g for r in rows.values() for g in r["masks"].values()}
    require(len(targets)==128, "native texture reference coverage")
    version,files = unityfs(bundle,include_resources=True)
    cabs = [n for n in files if not n.endswith(".resS")]
    require(version=="6000.0.62f1" and len(cabs)==1,"makeup CAB layout")
    source_objects = objects(files[cabs[0]])
    entries = {}
    for cls,data in source_objects.values():
        if cls==142:
            for guid,ref in container_entries(data).items():
                require(guid not in entries,"duplicate makeup reference")
                entries[guid]=ref
    require(len(entries)==131 and targets <= entries.keys(), "makeup reference coverage")
    require(sum(c==28 for c,_ in source_objects.values())==131,"makeup texture object coverage")
    textures,blobs,stats = {},{},Counter()
    for guid in sorted(targets):
        fid,pid = entries[guid]
        require(fid==0 and source_objects[pid][0]==28,"local texture reference")
        info,payload,lengths = read_streamed_texture(source_objects[pid][1],files)
        layout = tuple(info[k] for k in ("width","height","format","mips"))
        stats[layout] += 1
        key = digest(payload)
        if key in blobs:
            require(blobs[key]==payload,"payload identity")
        blobs[key]=payload
        textures[guid] = {
            **{k:info[k] for k in ("width","height","format","mips","sourceSha256")},
            "mipByteLengths":lengths,
            "asset":{"sha256":key,"bytes":len(payload)}
        }
    require(stats==LAYOUTS,"makeup native format coverage")
    # Keep the palette bytes and source texture compression unchanged. BC4 is a
    # red-channel texture, not an RGB grayscale image. The shader must select
    # the correct native channels and apply the verified runtime color rules.
    manifest = {
        "schema":"wand.photo-mode.private-native-makeup@1",
        "gameVersion":"1.26.2","privateOnly":True,"publicationAuthorized":False,
        "shaderParityVerified":False,"blendOrderVerified":False,
        "sourcePins":PINS,"encoding":"native-bc-mip-chain",
        "coordinateSpace":"UnityTextureRows","paletteEncoding":"Color32RGBA",
        "paletteSourceSha256":palette_sha,"palette":palette,
        "items":{str(k):v for k,v in sorted(rows.items())},"textures":textures,
    }
    with zipfile.ZipFile(out,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        z.writestr("makeup.json",json.dumps(manifest,separators=(",",":"),allow_nan=False))
        for key,payload in sorted(blobs.items()):
            z.writestr(key+".wmt",payload)
    with zipfile.ZipFile(out) as z:
        require(z.testzip() is None and set(z.namelist())=={"makeup.json",*(k+".wmt" for k in blobs)},
                "makeup archive integrity")
        for key in blobs:
            require(digest(z.read(key+".wmt"))==key,"makeup archive payload identity")
    print(json.dumps({"items":len(rows),"textureReferences":len(targets),
                      "uniquePayloads":len(blobs),"paletteColors":len(palette),
                      "bytes":out.stat().st_size,"sha256":digest(out.read_bytes())}))

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for k in ("items","resources","bundle","out"):
        p.add_argument("--"+k,type=Path,required=True)
    a=p.parse_args()
    out=a.out.resolve()
    require(not any((x/".git").exists() for x in (out,*out.parents)),"private output outside Git")
    build(source(a.items,"items"),source(a.resources,"resources"),source(a.bundle,"bundle"),out)
