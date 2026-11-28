"""Generate the native eye and mouth material archive from Steam 1.26.2 originals.

No raw Unity bundle, private save or shader bytecode is exported.
"""
import argparse,json,re,struct,zipfile,zlib
from pathlib import Path
from resolve_animation_bundle import Reader,digest,unityfs,serialized_objects
from pose_material import decode_material,externals,read_streamed_texture
from convert_native_makeup import decode_mip,source_color_space
from pose_curves import require
from prepare_eye_mouth_materials import PINS,SHADERS,PARAMS,TEETH

def read(raw):
    v,files=unityfs(raw,include_resources=True);cabs=[n for n in files if not n.endswith(".resS")]
    require(v=="6000.0.62f1" and len(cabs)==1,"source bundle layout")
    cab=cabs[0];v,objects=serialized_objects(files[cab]);require(v=="6000.0.62f1","serialized version")
    return {p:(c,files[cab][o:o+n]) for p,(c,o,n) in objects.items()},externals(files[cab]),files

def build(raw,out):
    import lz4.block
    pins={k:digest(v) for k,v in raw.items()};require(pins==PINS,"source pins")
    blobs={};maps={};eyes={}
    def texture(pid,obs,files):
        cls,b=obs[int(pid)];require(cls==28,"native texture class")
        info,payload,lengths=read_streamed_texture(b,files);color=source_color_space(b)
        # All pinned eye and teeth textures use the same native sampler.
        r=Reader(b);r.string();r.take(32);group=r.string();r.take(16)
        require(group in ('PBR Diffuse','PBR Normal Map','PBR Maps') and r.unpack('IIfIII')==(1,1,0.,0,0,0),'native repeat/bilinear sampler')
        w,h,mips,fmt=info["width"],info["height"],info["mips"],info["format"]
        require((w,h,mips)==(512,512,10) and fmt in (10,12,25),"native map layout")
        pixels=[];off=0
        for i,n in enumerate(lengths):
            pixels.append(decode_mip(payload[off:off+n],max(1,w>>i),max(1,h>>i),fmt));off+=n
        require(off==len(payload),"mip coverage")
        data=b"".join(pixels);packed=zlib.compress(data,6);key=digest(packed)
        require(key not in blobs or blobs[key]==packed,"asset identity");blobs[key]=packed
        r={k:info[k] for k in ("name","sourceSha256","payloadSha256","width","height","mips","format")}
        r.update(colorSpace=color,rgbaSha256=digest(data),mipByteLengths=list(map(len,pixels)),asset={"sha256":key,"bytes":len(packed)})
        maps[r["sourceSha256"]]=r;return r["sourceSha256"]
    obs,ext,files=read(raw["visual"])
    for pid,(c,b) in obs.items():
        if c!=21:continue
        m=decode_material(b)
        if not re.fullmatch(r"Avatar_Eyes_[0-9]{2}",m["name"]):continue
        f,p=m["shader"];require(p=="-725630705739041979" and ext[f-1].rsplit("/",1)[-1]=="CAB-d79bfb1b074ecaf0c1e3e4fd94de319e" and m["floats"]==PARAMS,"eye shader and parameters")
        t=m["textures"];require((t["_BumpMap"]["fileId"],t["_BumpMap"]["pathId"])==(0,"0") and t["_MainTex"]["fileId"]==0,"eye texture reference")
        k=texture(t["_MainTex"]["pathId"],obs,files);require(maps[k]["colorSpace"]==1 and maps[k]["format"]==25,"eye color space")
        eyes[m["sourceSha256"]]={"name":m["name"],"textureSourceSha256":k,"params":m["floats"]}
    require(len(eyes)==12,"eye material coverage")
    obs,ext,files=read(raw["characterbase"]);m=decode_material(obs[-2540554907278046581][1])
    require(m["name"]=="mat_Teeth" and m["shader"][1]=="-8600332103802174571" and all(r["fileId"]==0 for r in m["textures"].values()),"teeth material reference")
    teeth={"sourceSha256":m["sourceSha256"],"textures":{k:texture(r["pathId"],obs,files) for k,r in m["textures"].items()},"floats":m["floats"],"colors":m["colors"]}
    require(teeth["textures"]==TEETH,"teeth map source")
    obs,ext,files=read(raw["avatar"]);m=decode_material(obs[7917100450099218487][1])
    require(m["name"]=="AvatarEyelash" and m["shader"][1]=="-8600332103802174571","eyelash material reference")
    refs=[];needle=struct.pack("<iqiq",0,7917100450099218487,8,-2540554907278046581)
    for pid,(c,b) in obs.items():
        if c!=114:continue
        for j in range(0,len(b)-24,4):
            if b[j:j+24]==needle:refs.append({"pathId":str(pid),"offset":j,"sourceSha256":digest(b)})
    require(len(refs)==4 and ext[7].rsplit("/",1)[-1]=="CAB-79a03684e992f97a7cb9d1b6d5274c2f","prefab material references")
    eyelash={"sourceSha256":m["sourceSha256"],"floats":m["floats"],"colors":m["colors"]}
    require(len(maps)==len(blobs)==15,"material texture coverage")
    obs,_,_=read(raw["shaders"]);shader=obs[-725630705739041979][1];generic=obs[-8600332103802174571][1]
    require(digest(shader)==SHADERS["eyeSha256"] and digest(generic)==SHADERS["genericSha256"] and b"PBR/PBR Eyes" in shader,"shader identities")
    pack=lz4.block.decompress(shader[15682:38176],uncompressed_size=514568);i=99550
    require(pack[i:i+4]==b"DXBC","eye DXBC identity")
    n,k=struct.unpack_from("<II",pack,i+24);tokens=None
    for o in struct.unpack_from("<"+"I"*k,pack,i+32):
        p=i+o
        if pack[p:p+4] in (b"SHDR",b"SHEX"):
            size,=struct.unpack_from("<I",pack,p+4);tokens=pack[p+8:p+8+size]
    require(tokens is not None and digest(tokens)==SHADERS["surfaceTokensSha256"],"eye surface program identity")
    w=struct.unpack("<"+"I"*(len(tokens)//4),tokens);j=2;ops=[]
    while j<len(w):
        op=w[j]&2047;n=w[j+1] if op==53 else (w[j]>>24)&127
        require(n>0 and j+n<=len(w),"instruction bounds");ops.append(op);j+=n
    require(len(ops)==192 and ops[64:71]==[56,50,50,0,50,0,50],"eye color arithmetic")
    manifest={"schema":"wand.photo-mode.eye-mouth-materials@1","gameVersion":"1.26.2","sourcePins":pins,"coordinateSpace":"UnityTextureRows","encoding":"deflate-rgba8-mip-chain","lightingParityVerified":False,"eyes":eyes,"teeth":teeth,"eyelash":eyelash,"textures":maps,"prefabRefs":refs,"shader":SHADERS}
    with zipfile.ZipFile(out,"x",compression=zipfile.ZIP_STORED) as z:
        def write(name,data):z.writestr(zipfile.ZipInfo(name,date_time=(2026,11,28,0,0,0)),data)
        write("eye-mouth-materials.json",json.dumps(manifest,sort_keys=True,separators=(",",":"),allow_nan=False).encode())
        for k,data in sorted(blobs.items()):write(k+".wem2",data)
    with zipfile.ZipFile(out) as z:
        require(z.testzip() is None and len(z.namelist())==16,"archive coverage")
        for r in maps.values():
            a=r["asset"];data=z.read(a["sha256"]+".wem2");pixels=zlib.decompress(data)
            require(len(data)==a["bytes"] and digest(data)==a["sha256"] and len(pixels)==sum(r["mipByteLengths"]) and digest(pixels)==r["rgbaSha256"],"archive texture identity")
    print(json.dumps({"bytes":out.stat().st_size,"sha256":digest(out.read_bytes()),"eyes":len(eyes),"textures":len(maps)}))
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for k in (*PINS,"out"):p.add_argument("--"+k,type=Path,required=True)
    a=p.parse_args();out=a.out.resolve();require(not any((x/".git").exists() for x in (out,*out.parents)),"output outside Git")
    build({k:getattr(a,k).read_bytes() for k in PINS},out)
