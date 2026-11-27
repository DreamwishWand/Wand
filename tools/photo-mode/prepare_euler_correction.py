"""Replace only affected native player clips, retaining every existing animation channel."""
import io
import json
import struct
import urllib.request
import zipfile
from prepare_release_preview import BODY_TYPES, RELEASE_SHA, entry, digest, metadata, require, valid_hash

EULER_NAME="Dreamwish-Wand-photo-euler-correction-20261127.zip"
EULER_URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+EULER_NAME
EULER_SHA="4cc8e172fd9ff618243f6e14b413c2c9eb6c010afa7e0e269c95535e754cb57a"
EULER_BYTES=7714993

def download_euler():
    req=urllib.request.Request(EULER_URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(EULER_BYTES+1)

def channels(raw,clip):
    d=metadata(raw,clip)
    offset=(12+struct.unpack_from("<I",raw,4)[0] if clip else 28+struct.unpack_from("<I",raw,12)[0])
    animation=d["animation"] if clip else d["animations"][0]
    def accessor(i):
        a=d["accessors"][i];v=d["bufferViews"][a["bufferView"]]
        dim={"SCALAR":1,"VEC3":3,"VEC4":4}[a["type"]]
        require(a["componentType"]==5126 and a["count"]>0 and v["buffer"]==0 and "byteStride" not in v,"invalid rotation accessor")
        start=v.get("byteOffset",0)+a.get("byteOffset",0);size=a["count"]*dim*4
        require(start>=0 and start+size<=len(raw)-offset and size<=v["byteLength"],"invalid accessor bounds")
        return (a["type"],a["count"],raw[offset+start:offset+start+size])
    tracks={}
    for c in animation["channels"]:
        k=(c["target"]["node"],c["target"]["path"]);s=animation["samplers"][c["sampler"]]
        require(k not in tracks and s["interpolation"]=="LINEAR","invalid animation track")
        tracks[k]=(accessor(s["input"]),accessor(s["output"]))
    return d,animation,tracks,raw[offset:]

def check_change(old,new,clip,source,node_count):
    od,oa,ot,ob=channels(old,clip);nd,na,nt,nb=channels(new,clip)
    require(na["extras"]==oa["extras"] and na["extras"]["sourceSha256"]==source and na["extras"]["fullPoseVerified"] is False,"source identity changed")
    require(ot.keys()<=nt.keys() and all(nt[k]==v for k,v in ot.items()),"existing tracks changed")
    added=nt.keys()-ot.keys()
    require(len(added) in (76,78,85) and all(0<=n<node_count and path=="rotation" and nt[(n,path)][1][0]=="VEC4" for n,path in added),"unexpected Euler track coverage")
    if clip:
        require(od["modelSha256"]==nd["modelSha256"] and od["schema"]==nd["schema"] and nd["privateOnly"] is True and nd["publicationAuthorized"] is False,"clip model changed")
    else:
        require(nd["nodes"]==od["nodes"] and nd["skins"]==od["skins"] and nd["meshes"]==od["meshes"] and nd["materials"]==od["materials"] and nd.get("images")==od.get("images") and nb.startswith(ob),"paired scene geometry changed")
    return len(added)

def apply_euler(raw,dest):
    require(len(raw)==EULER_BYTES and digest(raw)==EULER_SHA,"Euler archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and len(public["items"])==255,"unexpected Euler base")
    models=public["models"];node_counts={}
    for body in BODY_TYPES:
        e=entry(models[body]);data=(dest/(e["sha256"]+".glb")).read_bytes()
        require(len(data)==e["bytes"] and digest(data)==e["sha256"],"Euler base model integrity")
        node_counts[body]=len(metadata(data)["nodes"])
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files={}
        for info in z.infolist():
            require(not info.is_dir() and info.filename not in files,"invalid Euler archive entry");files[info.filename]=info
        mi=files.get("photo-euler-correction.json");require(mi is not None and mi.file_size<1024*1024,"missing Euler manifest")
        m=json.loads(z.read(mi))
        require(m["schema"]=="wand.photo-mode.player-euler-correction@1" and m["gameVersion"]==public["gameVersion"] and m["baseReleaseSha256"]==RELEASE_SHA and m["models"]==models and set(m["clips"])==set(BODY_TYPES) and sum(map(len,m["clips"].values()))==16 and set(m["pairs"])=={"120000001"} and set(m["pairs"]["120000001"])=={"male"},"unexpected Euler coverage")
        assets={};updates={};additions=0
        def store(e,ext):
            e=entry(e);name=e["sha256"]+ext;info=files.get(name)
            require(info is not None and info.file_size==e["bytes"],"missing Euler asset")
            data=z.read(info);require(len(data)==e["bytes"] and digest(data)==e["sha256"],"Euler asset integrity");assets[name]=data
            return e,data
        for body,clips in m["clips"].items():
            for source,row in clips.items():
                require(valid_hash(source) and valid_hash(row["previous"]) and row["clip"]["sourceSha256"]==source,"Euler source mismatch")
                old=(dest/(row["previous"]+".wpa")).read_bytes();require(digest(old)==row["previous"],"previous clip integrity")
                e,data=store(row["clip"],".wpa");d=metadata(data,True)
                require(d["modelSha256"]==models[body]["sha256"] and d["animation"]["name"]==row["clip"]["name"],"corrected clip identity")
                additions+=check_change(old,data,True,source,node_counts[body])
                updates[(body,source)]=(row["previous"],{**e,"sourceSha256":source,"name":row["clip"]["name"]})
        count=0;used=set()
        for item,first in public["items"].items():
            for options in [first,*public.get("variants",{}).get(item,[])]:
                for body,o in options.items():
                    key=(body,o["sourceSha256"])
                    if o["kind"]=="player" and key in updates:
                        previous,corrected=updates[key];require(o["clip"]["sha256"]==previous,"unexpected prior player clip")
                        o["clip"]=corrected;o["eulerRotationCorrected"]=True;used.add(key);count+=1
        require(count==51 and len(used)==16 and additions==1281,"unexpected corrected player options")
        for item,options in m["pairs"].items():
            for body,row in options.items():
                o=public["items"][item][body];require(o["kind"]=="pair" and o["sourceSha256"]==row["sourceSha256"] and o["asset"]==row["previous"],"prior paired clip identity")
                prev=entry(o["asset"]);old=(dest/(prev["sha256"]+".glb")).read_bytes();require(len(old)==prev["bytes"] and digest(old)==prev["sha256"],"paired asset integrity")
                e,data=store(row["asset"],".glb");require(check_change(old,data,False,o["sourceSha256"],node_counts[body])==78,"paired Euler coverage")
                o["asset"]=e;o["eulerRotationCorrected"]=True
        require(len(assets)==17 and set(files)=={"photo-euler-correction.json",*assets},"unexpected Euler assets")
        for name,data in assets.items():
            path=dest/name
            if path.exists():require(path.read_bytes()==data,"Euler asset conflict")
        for name,data in assets.items():(dest/name).write_bytes(data)
        index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
        print("Euler rotation correction:",count+1,"body options; 17 assets; existing channels preserved")
