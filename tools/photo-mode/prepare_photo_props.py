"""Apply the two source-bound emote accessory scenes and corrected Euler player clips."""
import io
import json
import urllib.request
import zipfile
from prepare_release_preview import BODY_TYPES, RELEASE_SHA, entry, digest, metadata, require
from prepare_actor_delta import duration

PROPS_NAME="Dreamwish-Wand-photo-props-20261127.zip"
PROPS_URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+PROPS_NAME
PROPS_SHA="f9be79452c306087b03ecb2f5056da32db98676b8f4c06f223d3debe614debe0"
PROPS_BYTES=2463709

def download_props():
    req=urllib.request.Request(PROPS_URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(PROPS_BYTES+1)

def apply_props(raw,dest):
    require(len(raw)==PROPS_BYTES and digest(raw)==PROPS_SHA,"prop archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes());models=public["models"];nodes={}
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True
            and public["testOnly"] is True and public["fullPoseVerified"] is False,"unexpected prop base")
    for b in BODY_TYPES:
        e=entry(models[b]);data=(dest/(e["sha256"]+".glb")).read_bytes()
        require(len(data)==e["bytes"] and digest(data)==e["sha256"],"prop base model integrity")
        nodes[b]=metadata(data)["nodes"]
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files={}
        for info in z.infolist():
            require(not info.is_dir() and info.filename not in files,"invalid prop archive member")
            files[info.filename]=info
        mi=files.get("photo-props.json");require(mi is not None and mi.file_size<1024*1024,"prop manifest missing")
        m=json.loads(z.read(mi));require(m["schema"]=="wand.photo-mode.prop-delta@1"
            and m["gameVersion"]==public["gameVersion"] and m["baseReleaseSha256"]==RELEASE_SHA
            and m["models"]==models and set(m["items"])=={"70200018","70200020"},"prop base mismatch")
        assets={};updates={}
        def store(e,ext):
            e=entry(e);name=e["sha256"]+ext;info=files.get(name)
            require(info is not None and info.file_size==e["bytes"],"missing prop asset")
            data=z.read(info);require(len(data)==e["bytes"] and digest(data)==e["sha256"],"prop asset integrity")
            assets[name]=data;return e,data
        for item,row in m["items"].items():
            require(set(row)==set(BODY_TYPES),"prop body coverage");options={}
            for b in BODY_TYPES:
                p=row[b];old=public["items"][item][b];source=old["sourceSha256"];a=p["anchor"]
                require(old["kind"]=="player" and old["accessoryIncluded"] is False and old.get("companionIncluded") is None
                        and p["sourceSha256"]==p["clip"]["sourceSha256"]==p["prop"]["sourceSha256"]==source
                        and type(a["node"]) is int and 0<=a["node"]<len(nodes[b])
                        and a["path"]==nodes[b][a["node"]]["name"]=="root","prop source or attachment mismatch")
                c,clip=store(p["clip"],".wpa");e,actor=store(p["prop"],".glb");cd=metadata(clip,True);pd=metadata(actor);x=pd["asset"]["extras"];ca=cd["animation"];pa=pd["animations"][0]
                require(cd["schema"]=="wand.private-pose-clip@1" and cd["privateOnly"] is True and cd["publicationAuthorized"] is False
                        and cd["modelSha256"]==models[b]["sha256"] and ca["name"]==p["clip"]["name"]
                        and ca["extras"]["sourceSha256"]==source and ca["extras"]["fullPoseVerified"] is False
                        and ca["channels"] and all(0<=ch["target"]["node"]<len(nodes[b]) and ch["target"]["path"] in ("translation","rotation","scale") for ch in ca["channels"]),"prop player clip mismatch")
                require(x["privateOnly"] is True and x["fullPoseVerified"] is False and x["propActorDiagnostic"] is True
                        and x["shaderParityVerified"] is False and x["effectParityVerified"] is False
                        and len(pd["animations"])==1 and pa["extras"]["sourceSha256"]==source
                        and pa["extras"]["fullPoseVerified"] is False and pd["scenes"][pd["scene"]]["nodes"]==[0]
                        and pd["nodes"][0]["name"]=="root/bn_emote_pose"
                        and all(n.get("extras",{}).get("actorId")=="prop" for n in pd["nodes"])
                        and pd["skins"] and pd["meshes"] and pd["images"] and all(im["mimeType"]=="image/png" for im in pd["images"])
                        and len(pa["channels"])==3 and {ch["target"]["path"] for ch in pa["channels"]}=={"translation","rotation","scale"}
                        and all(ch["target"]["node"]==0 for ch in pa["channels"])
                        and abs(duration(cd,ca)-duration(pd,pa))<1e-5,"prop animation identity")
                options[b]={**old,"clip":{**c,"sourceSha256":source,"name":p["clip"]["name"]},"accessoryIncluded":True,
                            "prop":{**e,"sourceSha256":source},"anchor":a}
            updates[item]=options
        require(len(assets)==8 and set(files)=={"photo-props.json",*assets},"prop archive coverage")
        for name,data in assets.items():
            path=dest/name
            if path.exists():require(path.read_bytes()==data,"prop asset conflict")
        for name,data in assets.items():(dest/name).write_bytes(data)
        public["items"].update(updates);index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
        print("Native emote props:",len(updates),"items; corrected Euler clips and four actor scenes")
