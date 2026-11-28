"""Export derived native skin material inputs, not the unverified lighting stage.

Use all 60 skin color bundles, both common bundles, both avatar geometry bundles
and the characterbase bundle. Reuse the already exported face-normal assets.
"""
import argparse,json,re,zipfile,zlib
from collections import Counter
from pathlib import Path
from resolve_animation_bundle import digest,unityfs,serialized_objects,container_entries
from pose_material import decode_material,externals,read_streamed_texture
from convert_native_makeup import decode_mip,source_color_space
from pose_curves import require

MATERIAL_CAB="CAB-d79bfb1b074ecaf0c1e3e4fd94de319e"
MATERIAL_SHADER="2661675670503229062"
MAPS=("_AvatarSpecTex","_AvatarNormalTex","_ShadowTerminatorGradient")
SKINS=re.compile(r"(?:male[a-q]|female[a-q]|monster[a-z]+|common)_[a-f0-9]+\.bundle(?:\.bin)?")
ASSETS=re.compile(r"(?:avatarfemale|avatarmale|characterbase_assets_all)_[a-f0-9]+\.bundle(?:\.bin)?")
def read(path):
    raw=path.read_bytes();version,files=unityfs(raw,include_resources=True)
    cabs=[k for k in files if not k.endswith(".resS")]
    require(version=="6000.0.62f1" and len(cabs)==1,"source bundle layout")
    cab=cabs[0];v,rows=serialized_objects(files[cab]);require(v==version,"serialized version")
    obs={p:(c,files[cab][o:o+n]) for p,(c,o,n) in rows.items()}
    return cab,obs,files,externals(files[cab]),{"file":path.name.removesuffix(".bin"),"sha256":digest(raw)}

def build(paths,out):
    material_pins={};texture_pins={};materials={};guids=set();sources={}
    for path in sorted(paths):
        if not (SKINS.fullmatch(path.name) or ASSETS.fullmatch(path.name)):continue
        cab,obs,files,ext,pin=read(path)
        if SKINS.fullmatch(path.name):
            require(cab not in material_pins,"duplicate skin bundle")
            material_pins[cab]={"name":pin["file"],"sha256":pin["sha256"]}
            address={}
            for cls,raw in obs.values():
                if cls==142:
                    for g,(f,p) in container_entries(raw).items():
                        if f==0 and obs.get(p,(None,None))[0]==21:require(p not in address,"duplicate local material address");address[p]=g
            def target(ref):
                f,p=ref["fileId"],ref["pathId"];require(0<=f<=len(ext) and p!="0","material reference")
                return (cab if f==0 else ext[f-1].rsplit("/",1)[-1])+"/"+p
            for pid,(cls,raw) in obs.items():
                if cls!=21:continue
                mat=decode_material(raw);t=mat["textures"]
                if "_AvatarSkinTex" not in t:continue
                fid,shader=mat["shader"];require(shader==MATERIAL_SHADER and 0<fid<=len(ext) and ext[fid-1].rsplit("/",1)[-1]==MATERIAL_CAB,"skin shader")
                require(set(MAPS)<=t.keys() and all(v["scale"]==(1.,1.) and v["offset"]==(0.,0.) for v in t.values()),"native material UV")
                name=mat["name"];parts=name.split("_");body=parts[1].lower();role="body" if name.endswith("_Body") else "face"
                require(body in ("male","female") and name.endswith(("_Body","_Face","_Head")) and pid in address,"material role")
                g=address[pid];key=digest(raw);require(re.fullmatch("[a-f0-9]{32}",g) and g not in guids and key not in materials,"material identity");guids.add(g)
                fl=mat["floats"];require(fl["_FACE"] in (0.,1.) and fl["_SkinGlossMultiplier"]==0.800000011920929,"skin material values")
                materials[key]={"guid":g,"body":body,"role":role,"name":name,"spec":target(t[MAPS[0]]),"normal":target(t[MAPS[1]]),"shadow":target(t[MAPS[2]]),"faceFlag":fl["_FACE"],"glossMultiplier":fl["_SkinGlossMultiplier"],"shadowTerminatorIntensity":fl["_ShadowTerminatorIntensity"]}
        if path.name.startswith("common_") or ASSETS.fullmatch(path.name):
            require(cab not in texture_pins,"duplicate texture bundle")
            texture_pins[cab]=pin;sources[cab]=(obs,files)
    require(len(material_pins)==62 and len(texture_pins)==5 and len(materials)==len(guids)==120,"skin source coverage")
    require(Counter((v["body"],v["role"]) for v in materials.values())=={(b,r):30 for b in ("male","female") for r in ("face","body")},"material coverage")
    need={v[k] for v in materials.values() for k in ("spec","normal","shadow")};require(len(need)==12,"texture source coverage")
    textures={};blobs={}
    for key in sorted(need):
        cab,pid=key.split("/");obs,files=sources[cab];cls,raw=obs[int(pid)];require(cls==28,"native texture class")
        info,payload,lengths=read_streamed_texture(raw,files);name=info["name"]
        color=source_color_space(raw);require(color==0 and info["format"] in (10,12),"native linear map")
        row={k:info[k] for k in ("name","sourceSha256","width","height","format","mips")};row["colorSpace"]=color
        if re.fullmatch(r"avatar_(?:male|female)_head_[a-hA-H]_nm",name):
            row["reuse"]="nativeFaceNormals"
        else:
            w,h,fmt=info["width"],info["height"],info["format"];rgba=[];offset=0
            for i,n in enumerate(lengths):
                rgba.append(decode_mip(payload[offset:offset+n],max(1,w>>i),max(1,h>>i),fmt));offset+=n
            require(offset==len(payload),"native mip coverage")
            pixels=b"".join(rgba);data=zlib.compress(pixels,6);sha=digest(data)
            require(sha not in blobs or blobs[sha]==data,"content hash conflict");blobs[sha]=data
            row.update({"payloadSha256":digest(payload),"mipByteLengths":[len(x) for x in rgba],"rgbaSha256":digest(pixels),"asset":{"sha256":sha,"bytes":len(data)}})
        textures[key]=row
    require(len(blobs)==6 and sum("reuse" in r for r in textures.values())==5,"deduplicated texture coverage")
    manifest={"schema":"wand.photo-mode.native-skin-inputs@1","gameVersion":"1.26.2","encoding":"deflate-rgba8-mip-chain","coordinateSpace":"UnityTextureRows","lightingParityVerified":False,"materialSourcePins":material_pins,"textureSourcePins":texture_pins,"materials":materials,"textures":textures}
    with zipfile.ZipFile(out,"x",compression=zipfile.ZIP_STORED) as z:
        z.writestr("avatar-skin-inputs.json",json.dumps(manifest,separators=(",",":"),sort_keys=True,allow_nan=False))
        for key,data in sorted(blobs.items()):z.writestr(key+".wsi",data)
    with zipfile.ZipFile(out) as z:
        require(z.testzip() is None and len(z.namelist())==7,"archive coverage")
        for row in textures.values():
            if "reuse" in row:continue
            a=row["asset"];data=z.read(a["sha256"]+".wsi");pixels=zlib.decompress(data)
            require(len(data)==a["bytes"] and digest(data)==a["sha256"] and len(pixels)==sum(row["mipByteLengths"]) and digest(pixels)==row["rgbaSha256"],"archive asset identity")
    print(json.dumps({"materials":len(materials),"textureReferences":len(textures),"uniqueAssets":len(blobs),"bytes":out.stat().st_size,"sha256":digest(out.read_bytes())}))
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--source",type=Path,required=True,action="append");p.add_argument("--out",type=Path,required=True);a=p.parse_args()
    paths={q.resolve() for path in a.source for q in (path.rglob("*.bundle*") if path.is_dir() else [path])}
    out=a.out.resolve();require(not any((x/".git").exists() for x in (out,*out.parents)),"private generation outside Git")
    build(paths,out)
