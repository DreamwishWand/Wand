#!/usr/bin/env python3
"""Targeted private native map ocean evidence; no image or shader publication."""
import argparse
import hashlib
import json
from pathlib import Path
from bundle_thumbnails import image_info, write_json
from inspect_memory_rendering import asset_name, get, material_info, compressed_segments, dxbc_chunks, disassemble
from extract_memory_sources import verify_game_version

def check(ok, message):
    if not ok:
        raise ValueError(message)

def find(env, row, kind):
    hits=[o for o in env.objects if o.type.name==kind and asset_name(o)==row["cab"] and o.path_id==int(row["pathId"])]
    check(len(hits)==1,"Missing or ambiguous native "+kind+": "+row["name"])
    return hits[0]

def histogram(image):
    result={}
    for name,channel in zip(image.getbands(),image.split()):
        h=channel.histogram()
        result[name]={"min":next(i for i,v in enumerate(h) if v),
                      "max":next(i for i,v in reversed(list(enumerate(h))) if v),
                      "histogram":h}
    return result

def inspect(aa, source):
    import UnityPy
    check(source["schema"]=="wand.media.ocean-source-candidate@1" and source["gameVersion"]=="1.26.2" and
          source["publicationAuthorized"] is False and source["shaderExact"] is False,"Unexpected source")
    shader_ref=source["shader"]
    check(shader_ref["bundle"]=="win/menu-shared_assets_all.bundle" and len(source["textures"])==7,"Unexpected source targets")
    env=UnityPy.load(str(aa/shader_ref["bundle"]))
    obj=find(env,shader_ref,"Shader")
    shader=obj.read()
    name=get(get(shader,"m_ParsedForm"),"m_Name")
    check(name==shader_ref["name"],"Shader name mismatch")
    mat_obj=find(env,source["material"],"Material")
    mat=material_info(mat_obj,mat_obj.read())
    check(mat["name"]==source["material"]["name"] and mat["shaderPointer"]==(shader_ref["cab"],int(shader_ref["pathId"])),
          "Material shader pointer mismatch")
    check(mat["floatProperties"]==source["material"]["floats"],"Material parameters changed")
    programs={}
    for segment,raw in compressed_segments(shader):
        for chunk in dxbc_chunks(raw):
            digest=hashlib.sha256(chunk).hexdigest()
            if digest in programs:
                programs[digest]["segments"].append(segment)
                continue
            check(len(programs)<64,"Shader variant budget exceeded")
            text=disassemble(chunk)
            check(len(text.encode("utf8"))<=2*1024*1024,"Shader listing budget exceeded")
            programs[digest]={"segments":[segment],"bytes":len(chunk),"text":text}
    check(programs,"No D3D bytecode located")
    shader_result={"name":name,"rawObjectSha256":hashlib.sha256(obj.get_raw_data()).hexdigest(),
                   "programs":programs,"material":mat}
    del env
    env=UnityPy.load(str(aa/"win/ui-images-menu-map-lowres_assets_all.bundle"))
    textures=[]
    for t in source["textures"]:
        check(t["bundle"]=="win/ui-images-menu-map-lowres_assets_all.bundle","Unexpected texture bundle")
        obj=find(env,t,"Texture2D")
        texture=obj.read()
        check(texture.m_Name==t["name"] and texture.m_Width==t["width"] and texture.m_Height==t["height"] and
              int(texture.m_TextureFormat)==t["format"],"Native texture mismatch: "+t["name"])
        image=texture.image
        check(image.size==(t["width"],t["height"]),"Decoded dimensions mismatch")
        rgba=image.convert("RGBA")
        textures.append({"name":t["name"],"expectedOriginalSha256":t["sha256"],"nativeMode":image.mode,
                         "width":image.width,"height":image.height,
                         "decodedRgbaSha256":hashlib.sha256(rgba.tobytes()).hexdigest(),
                         "channels":histogram(rgba),"colorSpace":str(get(texture,"m_ColorSpace","")),
                         "format":int(texture.m_TextureFormat)})
    return {"schema":"wand.media.private-map-ocean-shader-evidence@1","gameVersion":"1.26.2",
            "privateOnly":True,"shaderExact":False,"renderingVerified":False,"publicationAuthorized":False,
            "shader":shader_result,"textures":textures}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--aa",type=Path,required=True)
    p.add_argument("--source",type=Path,default=Path(__file__).with_name("world-map-ocean-source-steam-1.26.2.json"))
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    aa=a.aa.resolve()
    out=a.out.resolve()
    check(not out.is_relative_to(aa.parents[2]) and not any((d/".git").exists() for d in [out,*out.parents]),
          "Private output outside Git and game required")
    verify_game_version(aa,"1.26.2")
    result=inspect(aa,json.loads(a.source.read_bytes()))
    write_json(out,result)
    print("Ocean evidence:",len(result["shader"]["programs"]),"DXBC programs,",len(result["textures"]),"native textures")
    print("Private report:",out)

if __name__=="__main__":
    main()
