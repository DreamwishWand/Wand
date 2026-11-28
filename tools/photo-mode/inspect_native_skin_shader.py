"""Inspect pinned native PBR Skin compiled program, no raw shader publication."""
import argparse,collections,json,struct
from pathlib import Path
import lz4.block
from resolve_animation_bundle import digest,unityfs,serialized_objects
from pose_curves import require
BUNDLE_SHA="c097e7a03a0532bdd7dfbed5d93a24c42508a09e3d3113f51f6bbe5647926e1a"
CAB="CAB-d79bfb1b074ecaf0c1e3e4fd94de319e"
SHADER_PID=2661675670503229062
SHADER_SHA="d00122348fe1b77b855c040a54a0a8d3966e07f0048baefb0d67681aafe02066"
SURFACE_SHA="e4bdda23a07571fc5cd3036a4c0e17a2ae113875321d6deebbb74eb2ae22c6fd"
def program_data(path):
    raw=path.read_bytes();require(digest(raw)==BUNDLE_SHA,"shader bundle identity")
    v,files=unityfs(raw);require(v=="6000.0.62f1" and set(files)=={CAB},"shader CAB identity")
    v,objects=serialized_objects(files[CAB]);require(v=="6000.0.62f1","shader version")
    c,o,n=objects[SHADER_PID];b=files[CAB][o:o+n]
    require(c==48 and digest(b)==SHADER_SHA and b"PBR/PBR Skin" in b,"shader object identity")
    u,n=struct.unpack_from("<II",b,14008);require((u,n)==(429664,34062),"program pack size")
    d=lz4.block.decompress(b[14016:14016+n],uncompressed_size=u);require(len(d)==u,"program pack length")
    return d
def inspect(path):
    d=program_data(path);rows=[];p=0
    while (i:=d.find(b"DXBC",p))>=0:
        _,n,k=struct.unpack_from("<III",d,i+20)
        require(0<k<=32 and 32+4*k<=n<=len(d)-i,"DXBC bounds")
        for o in struct.unpack_from("<"+"I"*k,d,i+32):
            require(32+4*k<=o<=n-8,"DXBC chunk offset")
            size=struct.unpack_from("<I",d,i+o+4)[0];require(o+8+size<=n,"DXBC chunk bounds")
            if d[i+o:i+o+4] not in (b"SHDR",b"SHEX"):continue
            t=d[i+o+8:i+o+8+size];require(size%4==0,"instruction alignment")
            w=struct.unpack("<"+"I"*(size//4),t);require(w[1]==len(w),"instruction words")
            ops=[];j=2
            while j<len(w):
                op=w[j]&2047;length=w[j+1] if op==53 else (w[j]>>24)&127
                require(length>0 and j+length<=len(w),"instruction length");ops.append(op);j+=length
            rows.append({"offset":i,"stage":w[0]>>16,"tokenSha256":digest(t),"instructionCount":len(ops)})
            if i==109242:
                require(digest(t)==SURFACE_SHA and len(ops)==188 and ops[25:54]==[74,74,56,74,74,0,50,50,74,56,50,15,51,0,75,52,49,29,55,56,56,50,56,56,50,50,16,68,56],"surface instruction identity")
        p=i+n
    require(collections.Counter(r["stage"] for r in rows)=={0:38,1:8},"shader program coverage")
    bindings={}
    for a,name,slot in [(17996,"_AvatarSkinTex",1),(18032,"_AvatarNormalTex",2),(18068,"_AvatarSpecTex",3),(18104,"_MakeupTex",4),(18136,"_MakeupMapsTex",5),(18172,"_ShadowTerminatorGradient",6)]:
        b=name.encode();require(d[a:a+len(b)]==b and struct.unpack_from("<4i",d,a+((len(b)+3)//4)*4)==(0,slot,slot,4),"surface resource identity")
        bindings[name]=slot
    return {"schema":"wand.photo-mode.private-native-skin-shader@1","gameVersion":"1.26.2","publicationAuthorized":False,"fullPoseVerified":False,"sourceSha256":BUNDLE_SHA,"shaderSha256":SHADER_SHA,"programs":rows,"surfaceProgramSha256":SURFACE_SHA,"surfaceBindings":bindings,"surfaceInstructions":[25,53],"lightingParityVerified":False}
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--bundle",type=Path,required=True);p.add_argument("--out",type=Path,required=True);a=p.parse_args()
    out=a.out.resolve();require(not any((x/".git").exists() for x in out.parents),"private output outside Git")
    r=inspect(a.bundle)
    with out.open("x",encoding="utf-8") as f:json.dump(r,f,indent=2);f.write("\n")
    print("8 vertex and 38 pixel programs verified; native surface resource bindings confirmed")
