"""Publish source-identified facial morphs and curves for actual player clips."""
import io,json,math,struct,urllib.request,zipfile
from prepare_release_preview import entry,digest,require,valid_hash
NAME="Dreamwish-Wand-avatar-expression-weights-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=947255
SHA="2fd9b6ee0cc68744ff0834c0f06834cd0943196cfd322ef545a3a300002560ac"
PINS={"femaleRig":"38f2069245537e4b0849bd78f550d05c5b0d5d868469b1e8b2bcea38a69a55f8","femaleClips":"08f717620f43a0c99753b0ebab30981659e1e9c1f273cd09f6133fc1c5893ac1"}
PARAMS=("smile_small","smile_medium","smile_big","wink_left","wink_right")
SHAPES=("Smile_01","Smile_02","Smile_03","Wink_Left","Wink_Right")
ROLES=("skull","eyelash","teeth_lower","teeth_upper","shadow")
def download_expressions():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as f:return f.read(SIZE+1)

def finite(v):return type(v) in (int,float) and math.isfinite(v)
def verify_curve(c):
    k=c["kind"]
    if k=="constant":require(set(c)=={"kind","value"} and finite(c["value"]),"constant")
    elif k=="dense":require(set(c)=={"kind","begin","rate","values"} and finite(c["begin"]) and finite(c["rate"]) and c["rate"]>0 and 0<len(c["values"])<=10000 and all(map(finite,c["values"])),"dense curve")
    else:
        require(k=="stream" and set(c)=={"kind","keys"} and 0<len(c["keys"])<=10000,"stream curve")
        prev=-math.inf
        for t,coeff in c["keys"]:
            require(finite(t) and t>prev and len(coeff)==4 and all(map(finite,coeff)),"stream key");prev=t

def apply_expressions(raw,dest,head_source):
    require(len(raw)==SIZE and digest(raw)==SHA,"expression archive identity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("headGeometry"),"expression base identity")
    used=set();blobs={};meshes={};clips={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==27 and len(set(z.namelist()))==27,"expression archive coverage")
        info=z.getinfo("expression-weights.json");require(info.file_size<2*1024*1024,"expression manifest size");m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.expression-weights@1" and m["gameVersion"]==public["gameVersion"] and m["sourcePins"]==PINS and m["fullPoseVerified"] is False and tuple(m["parameters"])==PARAMS and tuple(m["shapeNames"])==SHAPES and m["candidates"]==181 and not m["unsupported"] and len(m["clips"])==170 and len(m["meshes"])==32,"expression manifest identity")
        # All original source meshes must match the previously verified head geometry.
        expected={p["meshSha256"] for h in head_source["items"]["female"] for role,p in h["parts"].items() if role in ROLES}
        require(set(m["meshes"])==expected,"expression head source coverage")
        for h in head_source["items"]["female"]:
            for role,p in h["parts"].items():
                if role not in ROLES:continue
                mesh=m["meshes"][p["meshSha256"]];n=p["vertices"];e=entry(mesh["asset"]);name=e["sha256"]+".wem"
                require(mesh["vertices"]==n and mesh["name"]=="female_head_"+("eyelashes" if role=="eyelash" else role),"expression mesh identity")
                info=z.getinfo(name);require(info.file_size==e["bytes"]<=2*1024*1024,"expression mesh size");data=z.read(info)
                require(digest(data)==e["sha256"] and len(data)>=28 and struct.unpack_from("<4sI",data)==(b"WEM1",n),"expression delta identity")
                pos=8;counts=[]
                for _ in PARAMS:
                    require(pos+4<=len(data),"expression frame header");count,=struct.unpack_from("<I",data,pos);pos+=4
                    require(count<=n and pos+16*count<=len(data),"expression frame bounds");counts.append(count);seen=set()
                    for i,x,y,zv in struct.iter_unpack("<I3f",data[pos:pos+16*count]):
                        require(i<n and i not in seen and all(map(finite,(x,y,zv))),"expression delta");seen.add(i)
                    pos+=16*count
                require(pos==len(data) and counts==mesh["frameCounts"],"expression frame coverage");used.add(name)
                if role!="shadow":
                    geo=p["asset"]["sha256"];v={"vertices":n,"asset":e};require(geo not in meshes or meshes[geo]==v,"expression geometry conflict");meshes[geo]=v;blobs[name]=data
        require(len(used)==26 and set(z.namelist())=={"expression-weights.json",*used},"expression archive members")
        active=set()
        for row in [*public["items"].values(),*(r for vs in public.get("variants",{}).values() for r in vs)]:
            o=row.get("female")
            if o and o["kind"]!="mermaid":active.add(o["sourceSha256"])
        for sha,c in m["clips"].items():
            require(valid_hash(sha) and isinstance(c["name"],str) and finite(c["start"]) and finite(c["end"]) and 0<=c["start"]<c["end"]<=600 and type(c["loop"]) is bool and 0<len(c["parameters"])<=5 and set(c["parameters"])<=set(PARAMS),"expression clip")
            for curve in c["parameters"].values():verify_curve(curve)
            if sha not in active:continue
            data=json.dumps(c,separators=(",",":"),allow_nan=False).encode();key=digest(data);blobs[key+".wec"]=data;clips[sha]={"sha256":key,"bytes":len(data)}
    require(clips,"no matching player expression clips")
    for name,data in blobs.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"expression blob conflict")
        else:p.write_bytes(data)
    public["expressionWeights"]={"meshes":meshes,"clips":clips}
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Native facial weights:",len(clips),"current player clips;",len(meshes),"visible mesh identities; exact scalar curves")
