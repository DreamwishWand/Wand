"""Publish content-addressed original head geometry and bind it to exact player meshes."""
import io,json,math,struct,urllib.request,zipfile
from prepare_release_preview import entry,digest,require,valid_hash,metadata,BODY_TYPES
NAME="Dreamwish-Wand-avatar-head-geometry-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=1640202
SHA="6bc26ca6fec7b7e453cb98d0433b5fb5beaf223682f7428d505ac5e60a54b0d1"
ROLES=("skull","eyes","eyelash","teeth_lower","teeth_upper","shadow")
def download_heads():
    request=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request,timeout=90) as f:return f.read(SIZE+1)

def verify_geometry(data,row):
    n,ic,jc=row["vertices"],row["indices"],len(row["jointPaths"])
    require(type(n) is int and 0<n<=100000 and type(ic) is int and 0<ic<=600000 and ic%3==0 and 0<jc<=256 and len(data)==16+56*n+2*ic+64*jc,"head geometry dimensions")
    require(struct.unpack_from("<4sIII",data)==(b"WHG1",n,ic,jc),"head geometry header")
    require(digest(data[16:16+12*n])==row["positionSha256"] and digest(data[16+56*n:16+56*n+2*ic])==row["indicesSha256"],"head geometry source hashes")
    for start,end in ((16,16+32*n),(16+40*n,16+56*n),(16+56*n+2*ic,len(data))):
        require(all(math.isfinite(x[0]) for x in struct.iter_unpack("<f",data[start:end])),"nonfinite head geometry")
    require(all(x[0]<jc for x in struct.iter_unpack("<H",data[16+32*n:16+40*n])) and all(x[0]<n for x in struct.iter_unpack("<H",data[16+56*n:16+56*n+2*ic])),"head index bounds")
    require(all(min(w)>=0 and abs(sum(w)-1)<1e-5 for w in struct.iter_unpack("<4f",data[16+40*n:16+56*n])),"head skin weights")
    require(len(set(row["jointPaths"]))==jc and all(isinstance(p,str) and p.startswith("root/") and len(p)<=512 for p in row["jointPaths"]) and 0<=row["bindError"]<1e-4,"head rig identity")

def apply_heads(raw,dest,base_source,morph_source):
    require(len(raw)==SIZE and digest(raw)==SHA,"head archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("avatarMaterials"),"head base identity")
    used=set();assets={};heads={};targets={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==71 and len(set(z.namelist()))==71,"head archive coverage")
        info=z.getinfo("head-geometry.json");require(info.file_size<512*1024,"head manifest size");m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.head-geometry@1" and m["gameVersion"]==public["gameVersion"] and m["fullPoseVerified"] is False and m["sourcePins"]=={k:v for k,v in morph_source["sourcePins"].items() if k!="configResources"} and set(m["items"])==set(BODY_TYPES),"head source identity")
        for body in BODY_TYPES:
            rows=m["items"][body];require(len(rows)==8 and [r["index"] for r in rows]==list(range(8)) and len({r["guid"] for r in rows})==8,"head choices")
            require({r["parts"]["skull"]["meshSha256"] for r in rows}==set(morph_source["items"][body]),"head morph correspondence")
            heads[body]=[]
            for r in rows:
                require(len(r["guid"])==32 and all(c in "0123456789abcdef" for c in r["guid"]) and set(r["parts"])==set(ROLES),"head part coverage")
                parts={}
                for role,p in r["parts"].items():
                    require(all(valid_hash(p[k]) for k in ("meshSha256","positionSha256","indicesSha256")),"head source hashes")
                    e=entry(p["asset"]);name=e["sha256"]+".whg";info=z.getinfo(name);require(info.file_size==e["bytes"]<=4*1024*1024,"head asset size")
                    data=z.read(info);require(digest(data)==e["sha256"],"head asset digest");verify_geometry(data,p);used.add(name)
                    if role!="shadow":
                        assets[name]=data;parts[role]={"vertices":p["vertices"],"indices":p["indices"],"jointPaths":p["jointPaths"],"asset":e}
                morph=morph_source["items"][body][r["parts"]["skull"]["meshSha256"]];require(morph["vertices"]==parts["skull"]["vertices"],"head morph vertex identity")
                heads[body].append({"parts":parts,"morph":morph})
            source=next(s for s in base_source["items"][body] if s["role"]=="face")
            base_rows=[r for r in rows if r["parts"]["skull"]["meshSha256"]==source["meshSha256"]];require(len(base_rows)==1,"head base skull identity");base=base_rows[0]
            model_entries={}
            def add(e):e=entry(e);model_entries[e["sha256"]]=e
            add(public["models"][body])
            for row in [*public["items"].values(),*(r for vs in public.get("variants",{}).values() for r in vs)]:
                o=row.get(body)
                if o and o["kind"]=="pair":add(o["asset"])
                elif o and o["kind"]=="mermaid":add(o["model"])
            for key,e in model_entries.items():
                data=(dest/(key+".glb")).read_bytes();require(len(data)==e["bytes"] and digest(data)==key,"head target model digest");d=metadata(data);start=28+struct.unpack_from("<I",data,12)[0]
                def acc(i,kind):
                    a=d["accessors"][i];v=d["bufferViews"][a["bufferView"]];c=a["componentType"];dim=3 if kind=="VEC3" else 1;size=2 if c==5123 else 4
                    require(a["type"]==kind and (c==5126 if kind=="VEC3" else c in (5123,5125)) and v["buffer"]==0 and a.get("byteOffset",0)==0 and "byteStride" not in v and v["byteLength"]==a["count"]*dim*size,"head target accessor")
                    begin=start+v.get("byteOffset",0);end=begin+v["byteLength"];require(start<=begin<end<=len(data),"head target bounds");b=data[begin:end]
                    if kind=="SCALAR" and c==5125:
                        vals=struct.unpack("<"+"I"*a["count"],b)
                        if max(vals)<65536:b=struct.pack("<"+"H"*len(vals),*vals)
                    return digest(b)
                nodes=[n for n in d["nodes"] if n.get("extras",{}).get("actorId") not in ("companion","prop")]
                names=[n.get("name") for n in nodes]
                required={p for r in heads[body] for part in r["parts"].values() for p in part["jointPaths"]}
                require(all(names.count(p)==1 for p in required),"head target joint paths: "+key)
                slots={}
                for n in nodes:
                    if "mesh" not in n:continue
                    mi=n["mesh"]
                    for pi,p in enumerate(d["meshes"][mi]["primitives"]):
                        pos,ix=acc(p["attributes"]["POSITION"],"VEC3"),acc(p["indices"],"SCALAR")
                        for role in ROLES[:-1]:
                            ref=base["parts"][role]
                            if (pos,ix)==(ref["positionSha256"],ref["indicesSha256"]):
                                require(role not in slots,"duplicate head role");slots[role]={"mesh":mi,"primitive":pi}
                require(set(slots)==set(ROLES[:-1]),"head target mesh coverage: "+key+" "+str(slots))
                require(key not in targets,"duplicate head target");targets[key]={"body":body,"index":base["index"],"slots":slots}
        require(len(used)==70 and set(z.namelist())=={"head-geometry.json",*used},"head archive members")
    require(set(targets)==set(public["avatarMaterials"]),"head model coverage")
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"head asset conflict")
        else:p.write_bytes(data)
    public["headGeometry"]={"heads":heads,"targets":targets}
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Native head geometry:",sum(map(len,heads.values())),"head variants;",len(assets),"unique visible meshes;",len(targets),"model bindings")
