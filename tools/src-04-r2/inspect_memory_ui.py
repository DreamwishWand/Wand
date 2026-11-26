#!/usr/bin/env python3
"""Private Steam 1.26.2 Memory UI evidence, targeted after the first scan.
Only exact MonoScript header pointers establish component class identity.
Aligned pointer matches in stripped payloads remain candidates, not fields.
No game/save/R2 writes; no copied binary assets or pre-rendered images.
"""
import argparse
import hashlib
import json
import re
import struct
from collections import defaultdict
from pathlib import Path
from types import SimpleNamespace
from inspect_memory_rendering import asset_name, pointer, get, pairs, compressed_segments, dxbc_chunks, disassemble

SCRIPTS = {
    538: "CollectionMemoryShardsItem",
    3369: "CollectionTooltipMemoryShards",
    5274: "CollectionMemoryShards",
    5740: "CollectionMemoryShardsView",
    8311: "MemoryShardsPopUp",
    8848: "CollectionMemoryShardsGroup",
}
NATIVE = "globalgamemanagers.assets"
SHADER_NAMES = re.compile(r"memory|shard|puzzle|(^|/)ui(/|$)|mask|sprite|reveal|hidden", re.I)
PROP_NAMES = re.compile(r"shard|piece|memory|reveal|unlock|mask|outline", re.I)
SHADER_SKIP = re.compile(r"textmeshpro|font|pbr|particle|^vfx/|^urp/", re.I)
MATERIAL_TYPES = {"Material", "Shader", "Texture2D", "Sprite", "MonoBehaviour", "GameObject", "RectTransform", "Transform"}
MAX_COMPONENT_BYTES = 65536
MAX_PROGRAMS_PER_SHADER = 24
MAX_PROGRAMS = 160
MAX_TEXT = 6 * 1024 * 1024


def raw_ptr(obj, raw, offset):
    if offset < 0 or offset + 12 > len(raw):
        return None
    fid, pid = struct.unpack_from("<iq", raw, offset)
    return pointer(obj, SimpleNamespace(m_FileID=fid, m_PathID=pid))


def raw_links(obj, raw, index, start=0):
    if len(raw) > MAX_COMPONENT_BYTES:
        raise ValueError("Component payload exceeds scan budget")
    matches = []
    for offset in range(start, len(raw)-11, 4):
        target = raw_ptr(obj, raw, offset)
        found = index.get(target, [])
        if len(found) == 1 and found[0]["type"] in MATERIAL_TYPES:
            matches.append({"offset": offset, **found[0]})
    return matches


def scan_paths(game):
    data = game / "ddv_Data"
    aa = data / "StreamingAssets" / "aa"
    roots = list(data.glob("*.assets"))
    # Explicit UI groups, not substring 'ui' inside fruit/building/suit.
    bundles = [p for p in aa.rglob("*.bundle") if
               p.name.startswith(("ui-", "menu-", "shaders_", "urp-shaders_", "ddv_unitybuiltinshaders")) or
               any(part.startswith(("ui-", "menu-")) for part in p.relative_to(aa).parts[:-1])]
    return sorted(set(roots + bundles))


def shader_props(value):
    form = get(value, "m_ParsedForm")
    name = str(get(form, "m_Name") or get(value, "m_Name") or "")
    props = [str(get(p, "m_Name", "")) for p in get(get(form, "m_PropInfo"), "m_Props", []) or []]
    return name, props


def row_for(obj, rel, name=None):
    return {"source": rel, "assetFile": asset_name(obj), "pathId": obj.path_id,
            "type": obj.type.name, "name": name or ""}


def inspect(game):
    import UnityPy
    paths = scan_paths(game)
    if not paths:
        raise ValueError("No Unity sources")
    index = defaultdict(list)
    shader_rows = []
    material_rows = {}
    script_rows = {}
    components = []
    errors = []
    for n, path in enumerate(paths, 1):
        rel = path.relative_to(game).as_posix()
        print(f"  UI source {n}/{len(paths)} {rel}", flush=True)
        try:
            env = UnityPy.load(str(path))
            for obj in env.objects:
                kind = obj.type.name
                if kind not in MATERIAL_TYPES and kind != "MonoScript":
                    continue
                key = (asset_name(obj), obj.path_id)
                try:
                    if kind == "MonoScript" and key[0] == NATIVE and key[1] in SCRIPTS:
                        value = obj.read()
                        if get(value,"m_ClassName") != SCRIPTS[key[1]] or get(value,"m_Namespace") != "Mdl.Ui":
                            raise ValueError("Pinned MonoScript identity mismatch")
                        script_rows[key[1]] = row_for(obj, rel, SCRIPTS[key[1]])
                    elif kind == "Shader":
                        name, props = shader_props(obj.read())
                        row = row_for(obj, rel, name)
                        shader_rows.append({**row, "properties": props})
                        index[key].append(row)
                    elif kind == "Material":
                        value = obj.read()
                        row = row_for(obj, rel, str(get(value,"m_Name","")))
                        saved = get(value, "m_SavedProperties")
                        mat = {**row, "shaderPointer": pointer(obj, get(value,"m_Shader")),
                               "textures": [str(k) for k,_ in pairs(get(saved,"m_TexEnvs"))],
                               "floats": [str(k) for k,_ in pairs(get(saved,"m_Floats"))],
                               "colors": [str(k) for k,_ in pairs(get(saved,"m_Colors"))]}
                        index[key].append(row)
                        material_rows[(rel,*key)] = mat
                    elif kind == "MonoBehaviour":
                        raw = obj.get_raw_data()
                        script = raw_ptr(obj, raw, 16)
                        row = row_for(obj, rel, SCRIPTS.get(script[1],"") if script and script[0]==NATIVE else "")
                        index[key].append(row)
                        if script and script[0]==NATIVE and script[1] in SCRIPTS:
                            components.append({**row,"scriptPathId":script[1],"bytes":len(raw),
                                               "rawSha256":hashlib.sha256(raw).hexdigest()})
                    else:
                        # Name is optional. Avoid decoding large textures.
                        index[key].append(row_for(obj, rel))
                except Exception as exc:
                    errors.append({"source":rel,"pathId":obj.path_id,"type":kind,"error":str(exc)[:200]})
            del env
        except Exception as exc:
            errors.append({"source":rel,"error":str(exc)[:200]})
    if set(script_rows) != set(SCRIPTS):
        raise ValueError("Missing pinned MonoScript definitions")
    wanted = defaultdict(list)
    for row in components:
        wanted[row["source"]].append(row)
    linked_materials = set()
    for rel, rows in wanted.items():
        env = UnityPy.load(str(game/rel))
        local = {(asset_name(o),o.path_id):o for o in env.objects}
        for row in rows:
            obj = local[(row["assetFile"],row["pathId"])]
            raw = obj.get_raw_data()
            try:
                links = raw_links(obj,raw,index,28)
                row["alignedPointerCandidates"] = links
                # Inspect direct referenced UI components for material pointers;
                # these are candidate fields until native type layout is proven.
                nested = []
                for link in links:
                    if link["type"] != "MonoBehaviour" or link["source"] != rel:
                        continue
                    child = local.get((link["assetFile"],link["pathId"]))
                    if child is None:
                        continue
                    child_raw = child.get_raw_data()
                    if len(child_raw)>MAX_COMPONENT_BYTES:
                        continue
                    for match in raw_links(child,child_raw,index,28):
                        if match["type"] in ("Material","Shader","Texture2D","Sprite"):
                            nested.append({"viaComponent":link["pathId"],**match})
                row["referencedComponentCandidates"] = nested
                for link in links+nested:
                    if link["type"]=="Material":
                        linked_materials.add((link["source"],link["assetFile"],link["pathId"]))
            except Exception as exc:
                row["error"] = str(exc)[:200]
        del env
    linked_shader_keys = {tuple(material_rows[k]["shaderPointer"]) for k in linked_materials
                          if k in material_rows and material_rows[k]["shaderPointer"]}
    def score(row):
        name,props=row["name"],row["properties"]
        linked=(row["assetFile"],row["pathId"]) in linked_shader_keys
        if linked and not SHADER_SKIP.search(name):
            return 100
        if SHADER_SKIP.search(name):
            return 0
        if re.search(r"memory|shard|puzzle",name,re.I):
            return 90
        if any(re.search(r"shard|piece|memory|unlock|reveal",p,re.I) for p in props):
            return 80
        if SHADER_NAMES.search(name) and any(PROP_NAMES.search(p) for p in props):
            return 50
        return 0
    programs = {}
    examined = []
    text_bytes = 0
    for row in sorted(shader_rows,key=lambda r:(-score(r),r["name"],r["pathId"])):
        rank=score(row)
        if not rank:
            continue
        rel=row["source"]
        result={**row,"priority":rank,"programs":[],"truncated":False}
        examined.append(result)
        if len(programs)>=MAX_PROGRAMS or text_bytes>=MAX_TEXT:
            result["truncated"]=True
            continue
        try:
            env=UnityPy.load(str(game/rel))
            obj=next(o for o in env.objects if o.type.name=="Shader" and asset_name(o)==row["assetFile"] and o.path_id==row["pathId"])
            result["rawObjectSha256"]=hashlib.sha256(obj.get_raw_data()).hexdigest()
            seen=set()
            stop=False
            for segment,raw in compressed_segments(obj.read()):
                for chunk in dxbc_chunks(raw):
                    digest=hashlib.sha256(chunk).hexdigest()
                    if digest in seen:
                        continue
                    if len(seen)>=MAX_PROGRAMS_PER_SHADER or len(programs)>=MAX_PROGRAMS:
                        result["truncated"]=True;stop=True;break
                    seen.add(digest)
                    if digest not in programs:
                        try:
                            listing=disassemble(chunk)
                            size=len(listing.encode("utf-8"))
                            if text_bytes+size>MAX_TEXT:
                                result["truncated"]=True;stop=True;break
                            programs[digest]={"text":listing,"bytes":len(chunk)}
                            text_bytes+=size
                        except Exception as exc:
                            programs[digest]={"error":str(exc)[:200]}
                    result["programs"].append({"segment":segment,"sha256":digest})
                if stop:break
            del env
        except Exception as exc:
            result["error"]=str(exc)[:200]
    return {"schema":"wand.media.private-memory-ui-evidence@1","gameVersion":"1.26.2",
            "privateOnly":True,"renderingVerified":False,"pieceBitMappingVerified":False,
            "scannedSources":len(paths),"scripts":list(script_rows.values()),"components":components,
            "linkedMaterialCandidates":[material_rows[k] for k in sorted(linked_materials) if k in material_rows],
            "shaderInventory":shader_rows,"examinedShaders":examined,"disassembly":programs,"failures":errors}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--game",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args();game=a.game.resolve();out=a.out.resolve()
    if not re.search(r"(?:^|-)v1\.26\.2(?:-|$)",(game/"FullVersion.txt").read_text(encoding="utf-8-sig").strip()):
        raise ValueError("Steam 1.26.2 required")
    if out.exists() or out.is_relative_to(game) or any((x/".git").exists() for x in out.parents):
        raise ValueError("New private output required")
    result=inspect(game)
    with out.open("x",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2)
    print("Components:",len(result["components"]),"Shaders:",len(result["shaderInventory"]),
          "Examined:",len(result["examinedShaders"]),"Programs:",len(result["disassembly"]),
          "Failures:",len(result["failures"]),flush=True)
    print("Private report:",out)


if __name__=="__main__":
    main()
