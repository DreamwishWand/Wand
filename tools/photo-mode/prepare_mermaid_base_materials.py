"""Publish source-derived garment base textures without duplicating animated geometry."""
import io,json,struct,urllib.request,zipfile
from prepare_release_preview import BODY_TYPES,entry,digest,metadata,require,valid_hash
from prepare_mermaid_preview import ITEMS
NAME="Dreamwish-Wand-mermaid-base-materials-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=4114622
SHA="dd5ee55e22af605e48d3e06c3cb0e201b31c22c1eb37d3c6991451c57d775d52"
def download_materials():
    r=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(r,timeout=90) as f:return f.read(SIZE+1)
def apply_materials(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"mermaid material archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False,"mermaid material base identity")
    assets={};updates={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==7 and len(set(z.namelist()))==7,"mermaid material archive coverage")
        info=z.getinfo("mermaid-base-materials.json");require(info.file_size<65536,"material manifest size")
        m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.mermaid-base-materials@1" and m["gameVersion"]==public["gameVersion"] and m["neutralTailPattern"] is True and m["fullPoseVerified"] is False and m["shaderSha256"]=="f0cf5b816a1b05d4d4b16e02d84ffb7d52870dcaa5eb4aa59c76618e6fdb28e6" and m["programSha256"]=="17adc50480e28c908f4ef5ece8a964887c325feabef403424223eede9c23c489" and set(m["items"])==set(BODY_TYPES),"mermaid material identity")
        for body in BODY_TYPES:
            rows=m["items"][body];require(len(rows)==4 and sorted(r["kind"] for r in rows)==["diffuse","palette","palette","palette"],"garment material coverage")
            opts=[public["items"][i][body] for i in sorted(ITEMS)]
            model=entry(opts[0]["model"]);require(all(o["kind"]=="mermaid" and o["model"]==model and o["neutralMaterialProjection"] is True for o in opts),"mermaid shared model identity")
            data=(dest/(model["sha256"]+".glb")).read_bytes();require(len(data)==model["bytes"] and digest(data)==model["sha256"],"mermaid model integrity")
            d=metadata(data);start=28+struct.unpack_from("<I",data,12)[0]
            def acc(i,kind,components,dim):
                a=d["accessors"][i];v=d["bufferViews"][a["bufferView"]];c=a["componentType"];sz=2 if c==5123 else 4
                require(a["type"]==kind and c in components and v["buffer"]==0 and "byteStride" not in v and a.get("byteOffset",0)==0 and v["byteLength"]==a["count"]*dim*sz,"garment accessor layout")
                begin=start+v.get("byteOffset",0);end=begin+v["byteLength"];require(start<=begin<end<=len(data),"garment accessor bounds")
                b=data[begin:end]
                if kind=="SCALAR" and c==5125:
                    vals=struct.unpack("<"+"I"*a["count"],b)
                    if max(vals)<65536:b=struct.pack("<"+"H"*len(vals),*vals)
                return digest(b)
            candidates=[]
            for mi,mesh in enumerate(d["meshes"]):
                for pi,p in enumerate(mesh["primitives"]):
                    a=p["attributes"]
                    if "TEXCOORD_0" not in a:continue
                    candidates.append((mi,pi,acc(a["POSITION"],"VEC3",(5126,),3),acc(p["indices"],"SCALAR",(5123,5125),1),acc(a["TEXCOORD_0"],"VEC2",(5126,),2)))
            slots=[];seen=set()
            for r in rows:
                require(all(valid_hash(r[k]) for k in ("materialSha256","textureSourceSha256","meshSha256","positionSha256","indexSha256","uvSha256","flippedUvSha256")),"source garment identity")
                hits=[(mi,pi,uv) for mi,pi,pos,idx,uv in candidates if pos==r["positionSha256"] and idx==r["indexSha256"] and uv in (r["uvSha256"],r["flippedUvSha256"])]
                require(len(hits)==1,"missing or ambiguous source garment primitive: "+body+" "+r["mesh"])
                mi,pi,uv=hits[0];require((mi,pi) not in seen,"duplicate material slot");seen.add((mi,pi))
                e=entry(r["texture"]);name=e["sha256"]+".png";info=z.getinfo(name)
                require(info.file_size==e["bytes"]<=16*1024*1024,"texture size")
                if name not in assets:
                    b=z.read(info);require(digest(b)==e["sha256"] and b[:8]==b"\x89PNG\r\n\x1a\n" and b[12:16]==b"IHDR" and struct.unpack_from(">2I",b,16)==(r["width"],r["height"]) and max(r["width"],r["height"])<=4096,"texture identity");assets[name]=b
                slots.append({"mesh":mi,"primitive":pi,"flipV":uv==r["uvSha256"],"texture":e})
            updates[body]=slots
        require(len(assets)==6 and set(z.namelist())=={"mermaid-base-materials.json",*assets},"texture archive coverage")
    for name,b in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==b,"texture conflict")
        else:p.write_bytes(b)
    for i in ITEMS:
        for body in BODY_TYPES:public["items"][i][body]["baseMaterials"]=updates[body]
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Mermaid base materials: 8 source garment slots, 6 shared textures, 16 poses")
