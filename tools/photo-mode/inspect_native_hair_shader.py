"""Verify pinned native PBR/PBR Hair surface arithmetic; no shader bytes published."""
import argparse, collections, json, struct
from pathlib import Path
import lz4.block
from resolve_animation_bundle import digest, unityfs, serialized_objects
from pose_curves import require

BUNDLE_SHA='c097e7a03a0532bdd7dfbed5d93a24c42508a09e3d3113f51f6bbe5647926e1a'
CAB='CAB-d79bfb1b074ecaf0c1e3e4fd94de319e'
PID=7527358103810511856
OBJECT_SHA='956e8d032fa32c378ad3feedfd405ce2e73d6b31845290c55b4ba6fa2aca9ba4'
PACK_SHA='ee59a4720a0d5b221675077f87f0437314f34f0c515c53a8c6dc459d7f507d61'
PROGRAM_SHA='d1fc89522b38173ae2370b97a913fde10aef5b9ec928d7d6c6297ddea6767ac6'
SURFACE_SHA='0b43e3d7fb9d093f66ef8543a4872d666fe3057ba5312b8f0681d77c260acd18'


def inspect(path):
    raw=path.read_bytes()
    require(digest(raw)==BUNDLE_SHA,'shader bundle identity')
    v,files=unityfs(raw)
    require(v=='6000.0.62f1' and set(files)=={CAB},'shader CAB identity')
    v,objects=serialized_objects(files[CAB])
    require(v=='6000.0.62f1','shader revision')
    c,o,n=objects[PID]
    b=files[CAB][o:o+n]
    require(c==48 and digest(b)==OBJECT_SHA and b'PBR/PBR Hair' in b,'shader object identity')
    u,n=struct.unpack_from('<II',b,14380)
    require((u,n)==(388200,19241),'compiled pack size')
    d=lz4.block.decompress(b[14388:14388+n],uncompressed_size=u)
    require(digest(d)==PACK_SHA,'compiled pack identity')
    bindings={}
    for pos,name,slot in [(13032,'_MaskMap',1),(13060,'_BumpMap',2),(13088,'_MapsTex',3)]:
        require(d[pos:pos+8]==name.encode() and struct.unpack_from('<4i',d,pos+8)==(0,slot,slot,4),'texture binding')
        bindings[name]=slot
    require(d[13116:13132]==b'UnityPerMaterial' and struct.unpack_from('<3i',d,13132)==(1,3,0),'material cbuffer binding')
    constants={}
    for pos,name,index,offset in [(1212,'_BaseColor',27,0),(1232,'_ColorOne',28,16),(1272,'_ColorTwo',29,32),(1252,'_ColorThree',30,48),(1396,'_dst',31,68)]:
        name_bytes=name.encode()
        require(b[pos:pos+len(name_bytes)]==name_bytes and struct.unpack_from('<i',b,pos+((len(name_bytes)+3)//4)*4)[0]==index,'constant name index')
        require(struct.unpack_from('<2i',b,5296+(index-27)*16)==(index,offset),'constant offset')
        constants[name]=offset
    rows=[];p=0;surface=False
    while (i:=d.find(b'DXBC',p))>=0:
        _,n,k=struct.unpack_from('<III',d,i+20)
        require(0<k<=32 and 32+4*k<=n<=len(d)-i,'DXBC bounds')
        for off in struct.unpack_from('<'+'I'*k,d,i+32):
            require(32+4*k<=off<=n-8,'DXBC chunk offset')
            size=struct.unpack_from('<I',d,i+off+4)[0]
            require(off+8+size<=n,'DXBC chunk bounds')
            if d[i+off:i+off+4] not in (b'SHDR',b'SHEX'):continue
            t=d[i+off+8:i+off+8+size]
            require(size%4==0,'instruction alignment')
            w=struct.unpack('<'+'I'*(size//4),t)
            require(w[1]==len(w),'instruction words')
            j=2;ops=[];starts=[]
            while j<len(w):
                op=w[j]&2047;length=w[j+1] if op==53 else (w[j]>>24)&127
                require(length>0 and j+length<=len(w),'instruction bounds')
                starts.append(j);ops.append(op);j+=length
            h=digest(t)
            rows.append(dict(offset=i,stage=w[0]>>16,tokenSha256=h,instructions=len(ops)))
            if i==107402:
                require(h==PROGRAM_SHA and len(ops)==176,'forward program identity')
                require(digest(t[starts[59]*4:starts[79]*4])==SURFACE_SHA,'surface instruction identity')
                surface=True
        p=i+n
    require(surface and collections.Counter(r['stage'] for r in rows)=={0:33,1:4},'shader program coverage')
    return dict(schema='wand.photo-mode.private-native-hair-shader@1',gameVersion='1.26.2',publicationAuthorized=False,sourceSha256=BUNDLE_SHA,shaderSha256=OBJECT_SHA,programs=rows,surfaceProgramSha256=PROGRAM_SHA,surfaceInstructions=[59,78],textureBindings=bindings,materialConstantByteOffsets=constants,shaderParityVerified=False)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bundle',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();out=a.out.resolve()
    require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only')
    report=inspect(a.bundle)
    with out.open('x',encoding='utf-8') as f:json.dump(report,f,indent=2)
    print('Original hair surface program, texture bindings and uniform offsets verified.')
