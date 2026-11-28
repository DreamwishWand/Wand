"""Publish only the pinned, derived face normal maps and skull material attributes."""
import io,json,math,struct,urllib.request,zipfile,zlib
from prepare_release_preview import entry,digest,require,valid_hash
NAME="Dreamwish-Wand-avatar-native-materials-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=33696387
SHA="5acf9b7f51f6e00bd3ca8d5bef2222914e7bfd1c5b177782cc0a553d94776f66"
def download_native_materials():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=120) as f:return f.read(SIZE+1)
def apply_native_materials(raw,dest,head_source,base_source=None):
    require(len(raw)==SIZE and digest(raw)==SHA,"native materials archive identity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("headGeometry"),"native material base identity")
    assets={};used=set();geometry={};bodies={};body_geometry={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==75 and len(set(z.namelist()))==75,"native materials coverage")
        def manifest(name):
            i=z.getinfo(name);require(i.file_size<=512*1024,"manifest size");used.add(name);return json.loads(z.read(i))
        n=manifest("face-normal.json");g=manifest("surface-geometry.json")
        require(n["schema"]=="wand.photo-mode.native-face-normal@1" and n["gameVersion"]=="1.26.2" and n["encoding"]=="deflate-rgba8" and n["coordinateSpace"]=="UnityTextureRows" and n["runtimeMipVerified"] is True and n["fullPoseVerified"] is False,"normal manifest")
        require(g["schema"]=="wand.photo-mode.native-surface-geometry@1" and g["gameVersion"]=="1.26.2" and g["coordinateSpace"]=="UnityNative" and g["fullPoseVerified"] is False and len(g["items"])==72,"surface manifest")
        require(g["sourcePins"]=={b+"Bundle":head_source["sourcePins"][b+"Bundle"] for b in ("male","female")} and n["sourcePins"]=={"male":g["sourcePins"]["maleBundle"],"female":g["sourcePins"]["femaleBundle"],"material":"854a3981667162d3a10b29b04b3755dfc89311dcf402540671fc0567413e2ccf"},"source pins")
        def asset(r,ext,limit):
            e=entry(r["asset"]);name=e["sha256"]+ext;i=z.getinfo(name);require(i.file_size==e["bytes"]<=limit,"asset length");d=z.read(i);require(digest(d)==e["sha256"],"asset identity");used.add(name);return e,name,d
        def normal(r,size):
            require(r["width"]==r["height"]==size and r["mip"]==0 and all(valid_hash(r[k]) for k in ("objectSha256","sourcePayloadSha256","rgbaSha256")),"normal source")
            e,name,data=asset(r,".wnt",4*1024*1024);dec=zlib.decompressobj();pixels=dec.decompress(data,size*size*4+1)
            require(len(pixels)==size*size*4 and dec.eof and not dec.unused_data and not dec.unconsumed_tail and digest(pixels)==r["rgbaSha256"],"normal RGBA")
            assets[name]=data;return {"asset":e,"rgbaSha256":r["rgbaSha256"],"width":size,"height":size}
        require(set(n["bodies"])=={"male","female"},"normal bodies")
        for b in ("male","female"):
            rows=n["bodies"][b];require(len(rows)==8 and len({r["guid"] for r in rows})==8,"face normal options")
            require(all(r["name"]=="avatar_"+b+"_head_"+chr((97 if b=="male" else 65)+i)+"_nm" for i,r in enumerate(rows)),"face normal order: "+b+" "+repr([r["name"] for r in rows]));bodies[b]=[normal(r,2048) for r in rows]
        require(n["mask"]["name"]=="avatar_female_head_masks" and n["mask"]["pathId"]=="-847087465259873375","mask identity");mask=normal(n["mask"],1024)
        head_parts={p["meshSha256"]:(b,role,p) for b in ("male","female") for row in head_source["items"][b] for role,p in row["parts"].items()}
        require(len(head_parts)==70,"head source count")
        for key,r in g["items"].items():
            require(valid_hash(key) and r["body"] in ("male","female") and all(valid_hash(r[k]) for k in ("positionSha256","uv0Sha256")),"surface source")
            v=r["vertices"];flags=r["channels"];require(type(v) is int and 0<v<=100000 and type(flags) is int and flags&4 and not flags&~108,"surface dimensions")
            e,name,data=asset(r,".wsg",4*1024*1024);require(len(data)==12+4*v*sum(d for i,d in ((2,4),(3,4),(5,2),(6,2)) if flags&(1<<i)) and struct.unpack_from("<4sII",data)==(b"WSG1",v,flags),"surface layout")
            require(all(math.isfinite(x[0]) for x in struct.iter_unpack("<f",data[12:])) and all(t[3] in (-1,0,1) for t in struct.iter_unpack("<4f",data[12:12+16*v])),"surface values")
            if key not in head_parts:
                require(r["role"]=="body" and r["headGeometrySha256"] is None,"non-head mesh")
                if base_source is not None:
                    rows=[x for x in base_source["items"][r["body"]] if x["role"]=="body"];require(len(rows)==1 and rows[0]["meshSha256"]==key and rows[0]["positionSha256"]==r["positionSha256"] and rows[0]["vertices"]==v,"native body source identity")
                    body_geometry[r["body"]]={k:r[k] for k in ("vertices","channels","positionSha256","uv0Sha256")}|{"asset":e};assets[name]=data
                continue
            b,role,p=head_parts[key];require((r["body"],r["role"],v,r["headGeometrySha256"],r["positionSha256"])==(b,role,p["vertices"],p["asset"]["sha256"],p["positionSha256"]),"surface head identity")
            if role=="skull":
                whg=(dest/(p["asset"]["sha256"]+".whg")).read_bytes();require(digest(whg[16+24*v:16+32*v])==r["uv0Sha256"],"surface UV identity")
                geometry[p["asset"]["sha256"]]={k:r[k] for k in ("vertices","channels","positionSha256","uv0Sha256")}|{"asset":e};assets[name]=data
        require(len(geometry)==16 and set(used)==set(z.namelist()) and set(head_parts)<=set(g["items"]),"native surface coverage")
    if base_source is not None:require(set(body_geometry)=={"male","female"},"body surface coverage")
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"native material conflict")
        else:p.write_bytes(data)
    public["nativeFaceNormals"]={"bodies":bodies,"mask":mask,"geometry":geometry}
    if body_geometry:public["nativeBodyGeometry"]=body_geometry
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Native face normals: 17 exact LOD-zero maps, 16 skull tangent bindings")
