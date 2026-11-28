"""Apply verified source avatar skin, face and eye textures without rebuilding geometry."""
import io,json,math,struct,urllib.request,zipfile
from prepare_release_preview import BODY_TYPES,entry,digest,metadata,require,valid_hash

NAME="Dreamwish-Wand-avatar-base-materials-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=10452618
SHA="036012cd3b2f6944a03f7cd0686825ebaa18f273fb85f8b83540f12f83736e89"

def download_avatar_materials():
    r=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(r,timeout=90) as f:return f.read(SIZE+1)

def apply_avatar_materials(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"avatar material archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False,"avatar base identity")
    assets={};result={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==14 and len(set(z.namelist()))==14,"avatar archive coverage")
        info=z.getinfo("avatar-base-materials.json");require(info.file_size<65536,"avatar manifest size")
        source=json.loads(z.read(info))
        require(source["schema"]=="wand.photo-mode.avatar-base-materials@1" and source["gameVersion"]==public["gameVersion"] and source["skinVariant"]=="A" and source["eyeVariant"]=="01" and source["fullPoseVerified"] is False and set(source["items"])==set(BODY_TYPES),"avatar material identity")
        def store(e,ext):
            e=entry(e);name=e["sha256"]+ext;info=z.getinfo(name)
            require(info.file_size==e["bytes"] and 0<e["bytes"]<=16*1024*1024,"avatar asset size")
            if name not in assets:
                data=z.read(info);require(digest(data)==e["sha256"],"avatar asset integrity");assets[name]=data
            return e,assets[name]
        for body in BODY_TYPES:
            rows=source["items"][body]
            require(len(rows)==4 and {r["role"] for r in rows}=={"body","mermaidBody","face","eyes"},"avatar source coverage")
            for r in rows:
                require(all(valid_hash(r[k]) for k in ("meshSha256","positionSha256","textureSourceSha256","materialSha256")) and r["indicesSha256"] and all(valid_hash(k) for k in r["indicesSha256"]) and len(set(r["indicesSha256"]))==len(r["indicesSha256"]) and type(r["vertices"]) is int and 0<r["vertices"]<=100000,"avatar geometry identity")
                e,png=store(r["texture"],".png");u,uv=store(r["uv"],".uv")
                require(png[:8]==b"\x89PNG\r\n\x1a\n" and png[12:16]==b"IHDR" and struct.unpack_from(">2I",png,16)==(r["width"],r["height"]) and 0<r["width"]<=4096 and 0<r["height"]<=4096,"avatar texture format")
                require(len(uv)==8*r["vertices"] and all(math.isfinite(x[0]) for x in struct.iter_unpack("<f",uv)),"avatar UV layout")
            targets={}
            def add(e,form):
                e=entry(e);key=e["sha256"];require(key not in targets or targets[key]==(e,form),"avatar model conflict");targets[key]=(e,form)
            add(public["models"][body],"body")
            for row in [*public["items"].values(),*(r for vs in public.get("variants",{}).values() for r in vs)]:
                o=row.get(body)
                if not o:continue
                if o["kind"]=="pair":add(o["asset"],"body")
                elif o["kind"]=="mermaid":add(o["model"],"mermaidBody")
            for key,(e,form) in targets.items():
                data=(dest/(key+".glb")).read_bytes();require(len(data)==e["bytes"] and digest(data)==key,"avatar model integrity")
                d=metadata(data);start=28+struct.unpack_from("<I",data,12)[0]
                def acc(i,kind,comps,dim):
                    a=d["accessors"][i];v=d["bufferViews"][a["bufferView"]];c=a["componentType"];size=2 if c==5123 else 4
                    require(a["type"]==kind and c in comps and v["buffer"]==0 and a.get("byteOffset",0)==0 and "byteStride" not in v and v["byteLength"]==a["count"]*dim*size,"avatar accessor layout")
                    begin=start+v.get("byteOffset",0);end=begin+v["byteLength"];require(start<=begin<end<=len(data),"avatar accessor bounds")
                    b=data[begin:end]
                    if kind=="SCALAR" and c==5125:
                        vals=struct.unpack("<"+"I"*a["count"],b)
                        if max(vals)<65536:b=struct.pack("<"+"H"*len(vals),*vals)
                    return digest(b),a["count"]
                slots=[];seen=set();roles=set()
                for n in d["nodes"]:
                    if "mesh" not in n or n.get("extras",{}).get("actorId") in ("companion","prop"):continue
                    mi=n["mesh"]
                    for pi,p in enumerate(d["meshes"][mi]["primitives"]):
                        pos,count=acc(p["attributes"]["POSITION"],"VEC3",(5126,),3);ix,_=acc(p["indices"],"SCALAR",(5123,5125),1)
                        hits=[r for r in rows if r["role"] in (form,"face","eyes") and r["positionSha256"]==pos and ix in r["indicesSha256"] and count==r["vertices"]]
                        require(len(hits)<=1,"ambiguous source avatar primitive")
                        if hits:
                            r=hits[0];require((mi,pi) not in seen,"duplicate source avatar primitive");seen.add((mi,pi));roles.add(r["role"])
                            slots.append({"mesh":mi,"primitive":pi,"role":r["role"],"vertices":count,"texture":entry(r["texture"]),"uv":entry(r["uv"])})
                require(roles=={form,"face","eyes"},"missing source avatar primitives: "+body+" "+key+" "+str(roles))
                require(key not in result,"ambiguous avatar body asset");result[key]=slots
        require(len([k for k in assets if k.endswith(".png")])==5 and len(assets)==13 and set(z.namelist())=={"avatar-base-materials.json",*assets},"avatar asset coverage")
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"avatar asset conflict")
        else:p.write_bytes(data)
    public["avatarMaterials"]=result
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Shared avatar base appearance:",len(result),"model/paired assets;",sum(map(len,result.values())),"matched primitives; 5 PNGs and 8 UV arrays")
    return source
