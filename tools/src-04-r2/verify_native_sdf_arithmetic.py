#!/usr/bin/env python3
"""Compare native SDF pixel instruction arithmetic with an independent reference.
Inputs to sampling and derivatives are supplied numerically; this is not GPU emulation.
Private local source only. No bytecode or original assets are written.
"""
import argparse
import random
import struct
from pathlib import Path
import numpy as np
import lz4.block
from inspect_native_map_shader import source, SHARED_SHA, SHADERS, inspect_shader

def interpret(words,red,dx,dy,vertex,dilate,softness,width,outline,point,cliprect):
    a=words
    regs={};cb={3:cliprect,4:[dilate,softness,0,0],5:outline,6:[width,0,0,0]}
    def arg(j):
        token=a[j];j+=1;mod=0
        if token>>31:
            ext=a[j];j+=1;mod=(ext>>6)&0xff
            if ext&63!=1 or mod not in (1,2,3):raise ValueError("Unsupported operand modifier")
        kind=(token>>12)&255;dim=(token>>20)&3;n=token&3
        idx=tuple(a[j:j+dim]);j+=dim
        if kind==4:
            k={1:1,2:4}[n]
            v=np.array([struct.unpack("<f",struct.pack("<I",x))[0] for x in a[j:j+k]],dtype=float);j+=k
            if k==1:v=np.repeat(v,4)
        else:v=None
        return (token,kind,idx,mod,v),j
    def read(o):
        token,kind,idx,mod,v=o
        if v is None:
            if kind==0:v=regs.get(idx[0],np.zeros(4))
            elif kind==1:v={1:vertex,2:[.5,.5,0,0],3:[*point,0,0]}[idx[0]]
            elif kind==8:v=cb[idx[1]]
            else:raise ValueError(kind)
            v=np.array(v,dtype=float);mode=token>>2&3
            if mode==1:v=v[[(token>>(4+2*k))&3 for k in range(4)]]
            elif mode==2:v=np.repeat(v[(token>>4)&3],4)
            else:raise ValueError(("source selection",hex(token)))
        if mod in (2,3):v=np.abs(v)
        if mod in (1,3):v=-v
        return v
    i=2;out=np.zeros(4)
    while i<len(a):
        token=a[i];op=token&2047;n=token>>24&127;end=i+n
        if op in (88,89,90,98,101,104):i=end;continue
        if op==62:return out,False
        if op==13:
            src,j=arg(i+1)
            if j!=end:raise ValueError("Discard instruction length")
            if bool(read(src)[0])==bool(token&(1<<18)):return out,True
            i=end;continue
        dest,j=arg(i+1);src=[]
        while j<end:
            o,j=arg(j);src.append(o)
        if j!=end:raise ValueError("Instruction length")
        if op==69:v=np.array([red,0,0,1])
        elif op==11:v=np.repeat(dx,4)
        elif op==12:v=np.repeat(dy,4)
        else:
            v=[read(x) for x in src]
            if op==0:v=v[0]+v[1]
            elif op==14:v=v[0]/v[1]
            elif op==50:v=v[0]*v[1]+v[2]
            elif op==52:v=np.maximum(v[0],v[1])
            elif op==56:v=v[0]*v[1]
            elif op==54:v=v[0]
            elif op==55:v=np.where(v[0]!=0,v[1],v[2])
            elif op==49:v=(v[0]<v[1]).astype(float)
            elif op==29:v=(v[0]>=v[1]).astype(float)
            elif op==1:v=np.logical_and(v[0]!=0,v[1]!=0).astype(float)
            else:raise ValueError(op)
        if token&0x2000:v=np.clip(v,0,1)
        mask=[k for k in range(4) if dest[0]&(1<<(4+k))]
        target=out if dest[1]==2 else regs.setdefault(dest[2][0],np.zeros(4));target[mask]=v[mask]
        i=end
    raise ValueError("Missing ret")

def smooth(lo,hi,v):
    x=max(0,min(1,(v-lo)/(hi-lo)));return x*x*(3-2*x)

def reference(red,dx,dy,vertex,dilate,softness,width,outline,point,rect,has_clip,alpha_clip):
    d=red+dilate;w=max(.75*(abs(dx)+abs(dy)),.0001)+softness
    alpha=smooth(.5-w,.5+w,d)*vertex[3]
    if has_clip:alpha*=float(rect[0]<=point[0]<=rect[2] and rect[1]<=point[1]<=rect[3])
    f=(1-smooth(.5+width-w,.5+width+w,d))*outline[3] if width>0 else 0
    rgb=[vertex[k]+(outline[k]-vertex[k])*f for k in range(3)]
    return np.array([*rgb,alpha]),alpha_clip and alpha<.001

def shader_words(raw,offset):
    _,length,count=struct.unpack_from("<III",raw,offset+20)
    for o in struct.unpack_from("<"+"I"*count,raw,offset+32):
        k=offset+o;size=struct.unpack_from("<I",raw,k+4)[0]
        if raw[k:k+4] in (b"SHDR",b"SHEX"):
            if size%4 or o+8+size>length:raise ValueError("Bad shader chunk")
            return struct.unpack_from("<"+"I"*(size//4),raw,k+8)
    raise ValueError("No shader instructions")

def verify(shared):
    _,_,objs=source(shared,SHARED_SHA);entry=SHADERS[0]
    inspect_shader(objs[entry[1]],entry)
    b=objs[entry[1]][1];p=entry[4];n=struct.unpack_from("<I",b,p)[0];size=struct.unpack_from("<I",b,p-4)[0]
    raw=lz4.block.decompress(b[p+4:p+4+n],uncompressed_size=size)
    rng=random.Random(1262);count=0;maxdiff=0
    for off,has_clip,alpha_clip in [(4334,False,False),(5794,False,True),(7350,True,False),(9066,True,True)]:
        words=shader_words(raw,off)
        for _ in range(300):
            args=(rng.random(),rng.uniform(-.5,.5),rng.uniform(-.5,.5),[rng.random() for _ in range(4)],rng.uniform(-.25,.25),rng.uniform(0,.25),rng.choice([0,rng.random()*.5]),[rng.random() for _ in range(4)],[rng.uniform(-1,2),rng.uniform(-1,2)],[0,0,1,1])
            actual,discard=interpret(words,*args);expected,exp_discard=reference(*args,has_clip,alpha_clip)
            if discard!=exp_discard:raise ValueError(("Discard mismatch",off,count))
            if not discard:
                err=float(np.max(np.abs(actual-expected)));maxdiff=max(maxdiff,err)
                if err>1e-6:raise ValueError(("Numeric mismatch",off,count,err))
            count+=1
    return count,maxdiff

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--shared",required=True,type=Path);a=p.parse_args()
    count,err=verify(a.shared);print(count,"cases; max double precision error",err)
