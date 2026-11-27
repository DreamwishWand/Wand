#!/usr/bin/env python3
"""Read native map RectTransforms and AsyncRawImage identities; never generate an image.
Supported format: Steam 1.26.2 stripped-type-tree UnityFS (LZ4/uncompressed).
Coordinates are prefab root-local UI units, not runtime map or Grid coordinates.
"""
import argparse
import hashlib
import json
import math
import re
import statistics
import struct
from pathlib import Path

class Reader:
    def __init__(self, data, endian="<"):
        self.data, self.endian, self.pos = data, endian, 0
    def read(self, n):
        if n < 0 or self.pos+n > len(self.data):
            raise ValueError("Truncated binary")
        result = self.data[self.pos:self.pos+n]
        self.pos += n
        return result
    def number(self, fmt):
        return struct.unpack(self.endian+fmt,self.read(struct.calcsize(fmt)))[0]
    def align(self, n=4):
        self.read((-self.pos)%n)
    def string(self):
        end=self.data.index(b"\0",self.pos)
        result=self.read(end-self.pos).decode()
        self.read(1)
        return result
    def aligned_string(self):
        result=self.read(self.number("i")).decode()
        self.align()
        return result
    def ptr(self):
        return self.number("i"),self.number("q")
    def floats(self,n):
        result=[self.number("f") for _ in range(n)]
        if not all(map(math.isfinite,result)):
            raise ValueError("Nonfinite transform")
        return result
    def count(self,limit=2_000_000):
        n=self.number("i")
        if not 0<=n<=limit:
            raise ValueError("Invalid array count")
        return n

def check(condition,message):
    if not condition:
        raise ValueError(message)

def unityfs(path):
    import lz4.block
    raw=path.read_bytes()
    r=Reader(raw,">")
    check(r.string()=="UnityFS","Unsupported bundle")
    fmt=r.number("I")
    check(fmt>=7,"Unsupported UnityFS version")
    r.string();r.string()
    check(r.number("Q")==len(raw),"Bundle size mismatch")
    c,u,flags=[r.number("I") for _ in range(3)]
    check(not flags&128,"End-of-file block info not supported")
    r.align(16)
    def decompress(data,size,compression):
        check(size<=512*1024*1024,"Block exceeds limit")
        mode=compression&63
        if mode==0:
            check(len(data)==size,"Block size mismatch")
            return data
        check(mode in (2,3),"Unsupported compression")
        return lz4.block.decompress(data,uncompressed_size=size)
    info=Reader(decompress(r.read(c),u,flags),">")
    info.read(16)
    blocks=[(info.number("I"),info.number("I"),info.number("H")) for _ in range(info.count())]
    nodes=[(info.number("Q"),info.number("Q"),info.number("I"),info.string()) for _ in range(info.count())]
    check(sum(x[0] for x in blocks)<=512*1024*1024,"Bundle exceeds decompression limit")
    if flags&512:r.align(16)
    expanded=b"".join(decompress(r.read(c),u,f) for u,c,f in blocks)
    result={}
    for start,size,_,name in nodes:
        check(start+size<=len(expanded) and name not in result,"Invalid directory entry")
        result[name]=expanded[start:start+size]
    return result

def serialized(raw):
    r=Reader(raw,">")
    meta,size,version,offset=[r.number("I") for _ in range(4)]
    endian=r.number("B");r.read(3)
    check(version>=22 and endian==0,"Unsupported serialized format")
    meta=r.number("I");size=r.number("Q");offset=r.number("Q");r.number("Q")
    check(size==len(raw) and offset<=size,"Serialized size mismatch")
    r.endian="<";unity=r.string();r.number("i")
    check(r.number("B")==0,"Type trees present; use a typed reader")
    types=[]
    for _ in range(r.count()):
        cl=r.number("i");r.number("B");r.number("h")
        if cl==114:r.read(16)
        r.read(16);types.append(cl)
    objs={}
    for _ in range(r.count()):
        r.align();pid=r.number("q");start=r.number("Q");n=r.number("I");tid=r.number("i")
        check(0<=tid<len(types) and pid not in objs and offset+start+n<=len(raw),"Invalid object table")
        objs[pid]=(types[tid],raw[offset+start:offset+start+n])
    for _ in range(r.count()):
        r.number("i");r.align();r.number("q")
    extern=[]
    for _ in range(r.count()):
        r.string();r.read(16);r.number("i");extern.append(r.string().split("/")[-1])
    return objs,extern,unity

def load_bundle(path):
    nodes=unityfs(path)
    cabs=[n for n in nodes if n.startswith("CAB-") and "." not in n]
    check(len(cabs)==1,"Expected one serialized CAB")
    cab=cabs[0]
    return cab,serialized(nodes[cab])

def script_ids(path):
    cab,(objs,_,_)=load_bundle(path)
    names={}
    for pid,(cl,b) in objs.items():
        if cl==115:
            r=Reader(b);r.aligned_string();r.read(20)
            name,ns,asm=r.aligned_string(),r.aligned_string(),r.aligned_string()
            names[pid]=(ns+"."+name,asm)
    return cab,names

def mul(a,b):
    ax,ay,bx,by,x,y=a
    cx,cy,dx,dy,u,v=b
    return [ax*cx+bx*cy,ay*cx+by*cy,ax*dx+bx*dy,ay*dx+by*dy,ax*u+bx*v+x,ay*u+by*v+y]

def point(m,x,y):
    a,b,c,d,e,f=m
    return [a*x+c*y+e,b*x+d*y+f]

def child_geometry(parent_size,parent_pivot,rect):
    amin,amax,anchor,delta,pivot=[rect["rect"][i:i+2] for i in range(0,10,2)]
    size=[parent_size[i]*(amax[i]-amin[i])+delta[i] for i in range(2)]
    origin=[parent_size[i]*(amin[i]+(amax[i]-amin[i])*pivot[i]-parent_pivot[i])+anchor[i] for i in range(2)]
    qx,qy,qz,qw=rect["rotation"]
    check(abs(qx)<1e-6 and abs(qy)<1e-6 and qz*qz+qw*qw>0,"Nonplanar RectTransform")
    norm=math.hypot(qz,qw);qz/=norm;qw/=norm
    c=1-2*qz*qz;s=2*qz*qw
    sx,sy,_=rect["scale"]
    return size,pivot,[c*sx,s*sx,-s*sy,c*sy,*origin]

def extract(prefab,monoscripts):
    script_cab,scripts=script_ids(monoscripts)
    cab,(objs,extern,unity)=load_bundle(prefab)
    gos={};rects={};monos={}
    for pid,(cl,b) in objs.items():
        r=Reader(b)
        if cl==1:
            components=[r.ptr() for _ in range(r.count())]
            r.number("i");name=r.aligned_string();r.number("H");active=r.number("B")
            check(r.pos==len(b) and all(f==0 for f,_ in components),"Unsupported GameObject")
            gos[pid]=(name,bool(active),[p for _,p in components])
        elif cl==224:
            f,go=r.ptr();check(f==0,"External GameObject")
            q,pos,scale=r.floats(4),r.floats(3),r.floats(3)
            kids=[r.ptr() for _ in range(r.count())]
            pf,parent=r.ptr();v=r.floats(10)
            check(r.pos==len(b) and pf==0 and all(f==0 for f,_ in kids),"External or truncated RectTransform")
            rects[pid]={"go":go,"children":[p for _,p in kids],"parent":parent,"rotation":q,"position":pos,"scale":scale,"rect":v}
        elif cl==114:
            f,go=r.ptr();enabled=r.number("B");r.align();sf,sp=r.ptr();r.aligned_string()
            check(f==0,"External MonoBehaviour owner")
            identity=scripts.get(sp) if 0<sf<=len(extern) and extern[sf-1]==script_cab else None
            monos[pid]=(go,bool(enabled),identity,b[r.pos:])
    worlds=[];visited=set()
    for root,root_rect in rects.items():
        if root_rect["parent"]:continue
        root_name=gos[root_rect["go"]][0]
        rows=[]
        def walk(pid, parent_size=None,parent_pivot=None,parent_matrix=None,ancestors=(),active=True):
            check(pid not in visited,"Repeated transform or cycle")
            visited.add(pid)
            rect=rects[pid];name,self_active,components=gos[rect["go"]]
            path="/".join((*ancestors,name))
            active=active and self_active
            if parent_size is None:
                size,pivot=rect["rect"][6:8],rect["rect"][8:10]
                matrix=[1,0,0,1,0,0]
            else:
                size,pivot,local=child_geometry(parent_size,parent_pivot,rect)
                matrix=mul(parent_matrix,local)
            corners=[point(matrix,x,y) for x,y in [(-pivot[0]*size[0],(1-pivot[1])*size[1]),((1-pivot[0])*size[0],(1-pivot[1])*size[1]),(-pivot[0]*size[0],-pivot[1]*size[1])]]
            for component in components:
                m=monos.get(component)
                if not m or not m[2] or m[2][0]!="Gameloft.UI.AsyncRawImage":continue
                check(m[0]==rect["go"],"Component owner mismatch")
                guid=Reader(m[3]).aligned_string()
                check(re.fullmatch("[0-9a-f]{32}",guid) is not None,"Invalid asset GUID")
                rows.append({"hierarchy":path,"guid":guid,"component":str(component),"rectTransform":str(pid),"enabled":m[1],"activeInPrefab":active,"rootLocalCorners":corners,"rootLocalMatrix":matrix})
            for kid in rect["children"]:
                check(rects[kid]["parent"]==pid,"Inconsistent parent")
                walk(kid,size,pivot,matrix,(*ancestors,name),active)
        walk(root)
        worlds.append({"prefab":root_name,"rootRectTransform":str(root),"rootRect":root_rect["rect"],"parts":rows})
    check(len(visited)==len(rects),"Unreachable RectTransforms")
    return {"schema":"wand.src04.native-map-layout@1","unityVersion":unity,"prefabCab":cab,"prefabSha256":hashlib.sha256(prefab.read_bytes()).hexdigest(),"monoScriptCab":script_cab,"monoScriptSha256":hashlib.sha256(monoscripts.read_bytes()).hexdigest(),"coordinateSpace":"prefab-root-local-ui-y-up","worldPlacementVerified":False,"worlds":worlds}

def compare(native,report):
    check(report.get("schema")=="wand.src04.world-map-repair@3","Expected original repair@3 report")
    maps={w["prefab"]:w for w in native["worlds"]}
    result=[]
    for w in report["worlds"]:
        root=w["prefab"];scale=w["pixelsPerLayoutUnit"]
        check(math.isfinite(scale) and scale>0,"Invalid scale")
        by_guid={}
        for part in maps[root]["parts"]:
            by_guid.setdefault(part["guid"],[]).append(part)
        offsets=[]
        for part in w["parts"]:
            e=part["layoutEvidence"];guid=e["guid"]
            matches=[p for p in by_guid.get(guid,[]) if p["hierarchy"]==e["hierarchy"]]
            check(len(matches)==1,"Missing/ambiguous native component: "+guid)
            m=matches[0];x,y=m["rootLocalCorners"][0];a,b=part["imageToCanvas"][4:6]
            offsets.append((guid,a-scale*x,b+scale*y))
        tx=statistics.median(x for _,x,y in offsets);ty=statistics.median(y for _,x,y in offsets)
        deviations=[{"guid":g,"dx":x-tx,"dy":y-ty} for g,x,y in offsets]
        result.append({"prefab":root,"count":len(offsets),"pixelsPerLayoutUnit":scale,"medianTranslation":[tx,ty],"maxCoordinateDeviation":max(max(abs(p["dx"]),abs(p["dy"])) for p in deviations),"deviations":deviations})
    return {"method":"old imageToCanvas origin minus scaled native top-left; median per map; not pixel comparison or runtime calibration","maps":result}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prefab",type=Path,required=True)
    parser.add_argument("--monoscripts",type=Path,required=True)
    parser.add_argument("--report",type=Path)
    parser.add_argument("--out",type=Path,required=True)
    a=parser.parse_args()
    native=extract(a.prefab,a.monoscripts)
    if a.report:
        native["oldReportComparison"]=compare(native,json.loads(a.report.read_text(encoding="utf-8")))
    with a.out.open("x",encoding="utf-8") as f:
        json.dump(native,f,ensure_ascii=False,indent=2)
        f.write("\n")
    print("Prefab roots:",len(native["worlds"]),"AsyncRawImage components:",sum(len(w["parts"]) for w in native["worlds"]))

if __name__=="__main__":main()
