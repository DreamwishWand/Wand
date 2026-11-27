#!/usr/bin/env python3
"""Inspect native high-resolution GUID -> Texture2D/Sprite references without decoding image data."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
from inspect_native_map_layout import Reader, check, serialized

LIMIT=64*1024*1024

def read_cab(path):
    import lz4.block
    raw=path.read_bytes()
    r=Reader(raw,">")
    check(r.string()=="UnityFS" and r.number("I")>=7,"Unsupported bundle")
    r.string();r.string()
    check(r.number("Q")==len(raw),"Bundle size mismatch")
    c,u,flags=[r.number("I") for _ in range(3)]
    check(not flags&128,"End-of-file block information unsupported")
    r.align(16)
    def decode(data,size,compression):
        check(0<=size<=LIMIT,"Oversized block")
        mode=compression&63
        if mode==0:
            check(len(data)==size,"Block size mismatch")
            return data
        check(mode in (2,3),"Unsupported compression")
        return lz4.block.decompress(data,uncompressed_size=size)
    info=Reader(decode(r.read(c),u,flags),">")
    info.read(16)
    blocks=[(info.number("I"),info.number("I"),info.number("H")) for _ in range(info.count())]
    nodes=[(info.number("Q"),info.number("Q"),info.number("I"),info.string()) for _ in range(info.count())]
    total=sum(n[0] for n in blocks)
    cabs=[(start,size,name) for start,size,_,name in nodes if re.fullmatch(r"CAB-[a-f0-9]{32}",name,re.I)]
    check(len(cabs)==1,"Expected exactly one serialized CAB")
    start,size,cab=cabs[0];end=start+size
    check(0<size<=LIMIT and end<=total,"Invalid CAB bounds")
    if flags&512:r.align(16)
    data=bytearray();offset=0
    for u,c,f in blocks:
        lo=max(start,offset);hi=min(end,offset+u)
        if lo<hi:
            data.extend(decode(r.read(c),u,f)[lo-offset:hi-offset])
        else:
            check(r.pos+c<=len(raw),"Truncated skipped block")
            r.pos+=c
        offset+=u
    check(len(data)==size,"Incomplete serialized CAB")
    return cab,bytes(data),hashlib.sha256(raw).hexdigest()

def inspect(path):
    cab,raw,digest=read_cab(path)
    objs,_,unity=serialized(raw)
    bundles=[b for cl,b in objs.values() if cl==142]
    check(len(bundles)==1,"Expected one AssetBundle object")
    r=Reader(bundles[0]);r.aligned_string()
    preload=[r.ptr() for _ in range(r.count())]
    rows={}
    for _ in range(r.count()):
        guid=r.aligned_string();start,count=r.number("i"),r.number("i");file_id,pid=r.ptr()
        check(re.fullmatch(r"[a-f0-9]{32}",guid) and file_id==0 and pid in objs,"Unexpected container entry")
        check(0<=start<=len(preload) and 0<=count<=len(preload)-start and (file_id,pid) in preload[start:start+count],"Invalid preload range")
        cl,b=objs[pid];rr=Reader(b);name=rr.aligned_string()
        group=rows.setdefault(guid,{})
        check(cl in (28,213) and str(cl) not in group,"Unsupported or ambiguous container class")
        if cl==28:
            rr.read(4);width,height=rr.number("i"),rr.number("i")
            check(0<width<=65536 and 0<height<=65536,"Invalid texture dimensions")
            group["28"]={"pathID":str(pid),"name":name,"width":width,"height":height}
        else:
            # Steam 1.26.2 Sprite header: m_Rect, m_Offset, then verified render-data Texture PPtr at +100.
            pos=rr.pos;rect=list(struct.unpack_from("<4f",b,pos));offset=list(struct.unpack_from("<2f",b,pos+16))
            tf,tp=struct.unpack_from("<iq",b,pos+100)
            check(tf==0 and tp in objs and objs[tp][0]==28,"Sprite Texture PPtr not resolved")
            group["213"]={"pathID":str(pid),"name":name,"rect":rect,"offset":offset,"texturePathID":str(tp)}
    pairs=0
    for guid,group in rows.items():
        check("28" in group,"Missing Texture2D entry")
        t=group["28"];s=group.get("213")
        if s:
            check(s["texturePathID"]==t["pathID"] and s["name"]==t["name"],"GUID pair identity mismatch")
            pairs+=1
    return {"schema":"wand.src04.native-map-texture-refs@1","bundleSha256":digest,"cab":cab,"unityVersion":unity,"guidCount":len(rows),"spriteTexturePairs":pairs,"assets":rows}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--hires",type=Path,required=True);p.add_argument("--out",type=Path,required=True);a=p.parse_args()
    doc=inspect(a.hires)
    with a.out.open("x",encoding="utf-8") as f:json.dump(doc,f,indent=2);f.write("\n")
    print("GUIDs",doc["guidCount"],"paired Sprites",doc["spriteTexturePairs"])

if __name__=="__main__":main()
