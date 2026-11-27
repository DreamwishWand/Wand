#!/usr/bin/env python3
"""Steam 1.26.2 native shader/texture inspection, private report only.
Source hashes intentionally gate the version-specific serialized offsets.
Does not publish game assets, generate public images or activate rendering.
"""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path

import lz4.block
from PIL import Image
from inspect_native_map_layout import Reader, check, unityfs, serialized

SHARED_SHA="04c0df2fb4c2664a2aaf88f917d14d73e92a7dbee84ba1604b638e973e62945d"
LOW_SHA="ef996d338d74f4396e53ca80b8e5a3d81b7a6d4ab9f9eaef3c865a14fe6af95f"
SHADERS=(
    ("UI/MapSDFFill",-7158045598089910108,"b23a05ca7bbd41544818fd0edc68202838ba18dbcf15c58c5c412be674c74742",0x4bc,0x1170,8),
    ("Hidden/UI Default (Soft Masked)",-4894574590336443299,"468c2bbddcdb0eb0b5260b3bda2b66e798614d39f4da97d32a83ab123dd08361",0x3d0,0x1348,32),
    ("Hidden/UI Default ETC1 (Soft Masked)",6971627220249761526,"9f5aca8815e37059e4e3203b9861d8177861a8dddd8b20818d74bd38092ab816",0x424,0x13a0,32),
)
SDF_IDS={-8731638792796864080,-8190438610499086586,-4508318780900619667,2705895544864415159,5070361888584598475,5776831519544109147,7347358730612889763}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def source(path,digest):
    check(sha(path.read_bytes())==digest,"Source changed; revalidate layout")
    nodes=unityfs(path)
    cabs=[n for n in nodes if n.startswith("CAB-") and "." not in n]
    check(len(cabs)==1,"Unexpected serialized CAB count")
    cab=cabs[0]
    objs,_,unity=serialized(nodes[cab])
    check(unity=="6000.0.62f1","Unexpected Unity version")
    return nodes,cab,objs

def inspect_shader(obj,entry):
    name,pid,digest,state_pos,blob_pos,count=entry
    cl,b=obj
    check(cl==48 and sha(b)==digest,"Shader identity mismatch")
    check(name.encode() in b,"Shader name mismatch")
    r=Reader(b);r.pos=state_pos
    check(r.aligned_string()=="Default","Unexpected shader state")
    blend=[(r.number("f"),r.aligned_string()) for _ in range(7)]
    check(blend[:6]==[(5.0,"<noninit>"),(10.0,"<noninit>")]*2+[(0.0,"<noninit>")]*2 and blend[6][1]=="_ColorMask","Blend state changed")
    size=struct.unpack_from("<I",b,blob_pos)[0]
    decoded=struct.unpack_from("<I",b,blob_pos-4)[0]
    check(0<size<=len(b)-blob_pos-4 and 0<decoded<1024*1024,"Invalid shader segment")
    raw=lz4.block.decompress(b[blob_pos+4:blob_pos+4+size],uncompressed_size=decoded)
    programs=[]
    pos=0
    while True:
        i=raw.find(b"DXBC",pos)
        if i<0:break
        pos=i+4
        if i+32>len(raw):continue
        _,length,n=struct.unpack_from("<III",raw,i+20)
        if not(0<n<=256 and 32+4*n<=length<=len(raw)-i):continue
        offsets=struct.unpack_from("<"+"I"*n,raw,i+32)
        if any(o<32+4*n or o+8>length for o in offsets):continue
        for o in offsets:
            kind=raw[i+o:i+o+4];size=struct.unpack_from("<I",raw,i+o+4)[0]
            if kind not in (b"SHDR",b"SHEX"):continue
            check(size%4==0 and o+8+size<=length,"Invalid instruction chunk")
            tokens=raw[i+o+8:i+o+8+size]
            words=struct.unpack("<"+"I"*(size//4),tokens)
            check(len(words)==words[1],"Instruction count mismatch")
            ops=[];j=2
            while j<len(words):
                step=(words[j]>>24)&127
                check(step and j+step<=len(words),"Invalid instruction length")
                ops.append(words[j]&2047);j+=step
            programs.append({"offset":i,"stage":words[0]>>16,"tokenSha256":sha(tokens),"instructions":len(ops),"samples":ops.count(69),"dot4":ops.count(17),"discard":ops.count(13)})
        pos=i+length
    check(len(programs)==count,"Shader program count mismatch")
    return {"name":name,"pathID":str(pid),"objectSha256":digest,"blend":{"rgbSrc":"SrcAlpha","rgbDst":"OneMinusSrcAlpha","alphaSrc":"SrcAlpha","alphaDst":"OneMinusSrcAlpha","op":"Add","colorMaskProperty":"_ColorMask"},"programs":programs}

def inspect_sdf(nodes,cab,objs):
    rows=[]
    for pid in sorted(SDF_IDS):
        cl,b=objs[pid]
        check(cl==28,"Expected Texture2D")
        r=Reader(b);name=r.aligned_string();o=r.pos
        check(name.endswith("_sdf"),"Unexpected SDF name")
        w,h,total=struct.unpack_from("<iii",b,o+4)
        fmt,mips=struct.unpack_from("<ii",b,o+20)
        filter_mode,aniso,bias,u,v,z,lightmap,color=struct.unpack_from("<iifiiiii",b,o+52)
        offset,n=struct.unpack_from("<QI",b,o+92)
        r.pos=o+104;resource=r.aligned_string().split("/")[-1]
        check(0<w<=4096 and 0<h<=4096 and total==n==w*h and fmt==63 and mips==1,"Unexpected R8 texture size/format")
        check((filter_mode,aniso,bias,u,v,z,color)==(1,1,0,1,1,1,0),"Texture sampler/color settings changed")
        check(resource==cab+".resS" and 0<=offset<=len(nodes[resource])-n,"Invalid streaming reference")
        raw=nodes[resource][offset:offset+n]
        im=Image.frombytes("L",(w,h),raw).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        buf=io.BytesIO();im.save(buf,format="WEBP",lossless=True,quality=100,method=6,exact=True)
        encoded=buf.getvalue()
        with Image.open(io.BytesIO(encoded)) as decoded:
            check(decoded.size==im.size and decoded.convert("RGB").getchannel("R").tobytes()==im.tobytes(),"Lossless R8 roundtrip failed")
        rows.append({"name":name,"pathID":str(pid),"width":w,"height":h,"format":"R8","mipCount":1,"filter":"Bilinear","wrap":"Clamp","textureColorSpace":"Linear","nativeBytes":n,"nativeBottomUpSha256":sha(raw),"topDownRedSha256":sha(im.tobytes()),"localWebpBytes":len(encoded),"localWebpSha256":sha(encoded),"redRoundtripExact":True})
    return rows

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--shared",type=Path,required=True);p.add_argument("--lowres",type=Path,required=True);p.add_argument("--out",type=Path,required=True)
    a=p.parse_args();out=a.out.resolve()
    check(not out.exists() and not any((x/".git").exists() for x in out.parents),"Private output must be outside Git")
    _,cab,objs=source(a.shared,SHARED_SHA)
    check(cab=="CAB-c7b82ed621198ccecdfd17cfe219a777","Unexpected shared CAB")
    shaders=[inspect_shader(objs[e[1]],e) for e in SHADERS]
    nodes,low_cab,low_objs=source(a.lowres,LOW_SHA)
    check(low_cab=="CAB-45107569d66b052caf651872fac2e3bf","Unexpected lowres CAB")
    textures=inspect_sdf(nodes,low_cab,low_objs)
    doc={"schema":"wand.src04.native-map-shader-evidence@1","privateOnly":True,"gameVersion":"1.26.2","sharedSha256":SHARED_SHA,"lowresSha256":LOW_SHA,"shaders":shaders,"textures":textures,"runtimeVariantVerified":False,"framebufferColorSpaceVerified":False,"renderingVerified":False,"publicationAuthorized":False}
    with out.open("x",encoding="utf-8") as f:json.dump(doc,f,indent=2);f.write("\n")
    print("Shader programs:",sum(len(s["programs"]) for s in shaders),"R8 pixels verified:",sum(t["nativeBytes"] for t in textures))

if __name__=="__main__":main()
