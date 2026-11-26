#!/usr/bin/env python3
"""Private, read-only inspection of the already located Steam Puzzle shader.
No disassembly or raw asset copying. Exact shader identity, serialized
material parameters and texture references only; dynamic bindings remain unknown.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from inspect_memory_rendering import asset_name, pointer, get, pairs, material_info
from inspect_memory_ui import scan_paths, shader_props

TARGET=("cab-c7b82ed621198ccecdfd17cfe219a777",6352380161537440660)
TARGET_SHA="6590aad4564626d21aec18110b43d05865afb6cf13225667a4424925b714dd32"
TARGET_SOURCE="ddv_Data/StreamingAssets/aa/win/menu-shared_assets_all.bundle"

def primitive(v,depth=0):
    if depth>6:return None
    if v is None or type(v) in (bool,int,float,str):return v
    if isinstance(v,(tuple,list)):return [primitive(x,depth+1) for x in v[:512]]
    if isinstance(v,dict):return {str(k):primitive(x,depth+1) for k,x in list(v.items())[:512]}
    if hasattr(v,"__dict__"):return {k:primitive(x,depth+1) for k,x in vars(v).items() if not k.startswith("_") and k not in ("assets_file","object_reader")}
    fields=get(type(v),"__slots__",[])
    if isinstance(fields,str):fields=[fields]
    return {k:primitive(get(v,k),depth+1) for k in fields if not k.startswith("_") and k not in ("assets_file","object_reader")}

def inspect(game):
    import UnityPy
    paths=scan_paths(game)
    shader_env=UnityPy.load(str(game/TARGET_SOURCE))
    obj=next(o for o in shader_env.objects if o.type.name=="Shader" and (asset_name(o),o.path_id)==TARGET)
    if hashlib.sha256(obj.get_raw_data()).hexdigest()!=TARGET_SHA:raise ValueError("Native shader identity mismatch")
    shader=obj.read()
    form=get(shader,"m_ParsedForm")
    props=[]
    for p in get(get(form,"m_PropInfo"),"m_Props",[]) or []:
        props.append({"name":get(p,"m_Name"),"type":primitive(get(p,"m_Type")),
                      "defaultValue":primitive(get(p,"m_DefValue")),
                      "defaultTexture":primitive(get(p,"m_DefTexture")),
                      "flags":primitive(get(p,"m_Flags"))})
    passes=[]
    for sub in get(form,"m_SubShaders",[]) or []:
        for p in get(sub,"m_Passes",[]) or []:
            prog=get(p,"progFragment") or get(p,"m_ProgFragment")
            # Serialized shader-program bindings, not instructions.
            row={"name":get(p,"m_Name"),"state":primitive(get(p,"m_State")),
                 "fragment":primitive(prog)}
            passes.append(row)
    del shader_env
    mats=[];failures=[];wanted=set()
    for n,path in enumerate(paths,1):
        rel=path.relative_to(game).as_posix()
        print(f"  Material source {n}/{len(paths)} {rel}",flush=True)
        try:
            env=UnityPy.load(str(path))
            for obj in env.objects:
                if obj.type.name!="Material":continue
                try:
                    mat=obj.read()
                    if pointer(obj,get(mat,"m_Shader"))!=TARGET:continue
                    row=material_info(obj,mat)
                    row.update(source=rel,assetFile=asset_name(obj),pathId=obj.path_id,textureBindings={})
                    for key,value in pairs(get(get(mat,"m_SavedProperties"),"m_TexEnvs")):
                        target=pointer(obj,get(value,"m_Texture"))
                        row["textureBindings"][str(key)]={"pointer":target,"scale":primitive(get(value,"m_Scale")),"offset":primitive(get(value,"m_Offset"))}
                        if target:wanted.add(target)
                    mats.append(row)
                except Exception as e:failures.append({"source":rel,"pathId":obj.path_id,"error":str(e)[:200]})
            del env
        except Exception as e:failures.append({"source":rel,"error":str(e)[:200]})
    textures=[]
    # Resolve exact referenced texture IDs, including image-only UI bundles.
    if wanted:
        data=game/"ddv_Data";aa=data/"StreamingAssets"/"aa"
        candidates=set(paths)|{p for p in aa.rglob("*.bundle") if p.name.startswith(("ui-images","ui-atlas","ui-4k"))}
        for path in sorted(candidates):
            try:
                env=UnityPy.load(str(path))
                for obj in env.objects:
                    if obj.type.name!="Texture2D" or (asset_name(obj),obj.path_id) not in wanted:continue
                    t=obj.read()
                    textures.append({"source":path.relative_to(game).as_posix(),"assetFile":asset_name(obj),"pathId":obj.path_id,
                                     "name":get(t,"m_Name"),"width":get(t,"m_Width"),"height":get(t,"m_Height"),
                                     "colorSpace":primitive(get(t,"m_ColorSpace")),"textureSettings":primitive(get(t,"m_TextureSettings")),
                                     "mipCount":get(t,"m_MipCount"),"format":primitive(get(t,"m_TextureFormat"))})
                del env
            except Exception as e:failures.append({"source":path.relative_to(game).as_posix(),"error":str(e)[:200]})
    return {"schema":"wand.media.private-puzzle-material@1","gameVersion":"1.26.2","privateOnly":True,
            "shaderSha256":TARGET_SHA,"shaderName":shader_props(shader)[0],"properties":props,"passes":passes,
            "materials":mats,"textures":textures,"failures":failures,"renderingVerified":False,"pieceBitMappingVerified":False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--game",type=Path,required=True);p.add_argument("--out",type=Path,required=True)
    a=p.parse_args();game=a.game.resolve();out=a.out.resolve()
    if not re.search(r"(?:^|-)v1\.26\.2(?:-|$)",(game/"FullVersion.txt").read_text(encoding="utf-8-sig").strip()):raise ValueError("Steam 1.26.2 required")
    if out.exists() or out.is_relative_to(game) or any((x/".git").exists() for x in out.parents):raise ValueError("New private output required")
    result=inspect(game)
    with out.open("x",encoding="utf-8") as f:json.dump(result,f,ensure_ascii=False,indent=2)
    print("Materials:",len(result["materials"]),"Textures:",len(result["textures"]),"Failures:",len(result["failures"]),flush=True)
    print("Private report:",out)
if __name__=="__main__":main()
