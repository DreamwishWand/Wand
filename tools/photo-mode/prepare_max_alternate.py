"""Add the second Max photo pose using the source attachment override and resolved controller clip."""
import io
import json
import struct
import urllib.request
import zipfile
from prepare_release_preview import BODY_TYPES, RELEASE_SHA, entry, digest, metadata, require
from prepare_actor_bind import BIND_SHA
from prepare_actor_delta import duration

NAME="Dreamwish-Wand-photo-max-alternate-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SHA="c04533fc2689a299376467f74b8a0f657ba33c2748afeaf67889d1faf76a198e"
SIZE=2133145
ITEM="120000152"
SOURCES={"male":"afcac755721a4df1ffad8bf817911bf1a5808b6b9b0070b4bf5a2ed9140462a9",
         "female":"81403e1bdfccebafa5414a7e102ae11aaa6c4a4cdd8eb4094f07e495c72a0812"}
ACTOR_SOURCE="0940a9d0847033bf979bef348461aaa9b670362346abbaa72c5d84bb2ba9a32f"

def download_max():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:return response.read(SIZE+1)

def apply_max(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"Max archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True
            and public["testOnly"] is True and public["fullPoseVerified"] is False
            and len(public["items"])==263 and ITEM in public["items"] and ITEM not in public.get("variants",{}),
            "unexpected Max base")
    models=public["models"];nodes={}
    for body in BODY_TYPES:
        e=entry(models[body]);data=(dest/(e["sha256"]+".glb")).read_bytes()
        require(len(data)==e["bytes"] and digest(data)==e["sha256"],"Max base model integrity")
        nodes[body]=metadata(data)["nodes"]
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files={}
        for info in z.infolist():
            require(not info.is_dir() and info.filename not in files,"invalid Max member");files[info.filename]=info
        mi=files.get("photo-max-alternate.json");require(mi is not None and mi.file_size<1024*1024,"Max manifest")
        m=json.loads(z.read(mi));require(m["schema"]=="wand.photo-mode.max-alternate@1"
            and m["gameVersion"]==public["gameVersion"] and m["baseReleaseSha256"]==RELEASE_SHA
            and m["baseActorBindSha256"]==BIND_SHA and m["models"]==models and m["itemId"]==ITEM
            and m["sourceTrigger"]=="PhotoMode_Pose_02" and m["fullPoseVerified"] is False
            and set(m["options"])==set(BODY_TYPES),"Max archive identity")
        assets={};options={}
        def store(value,ext):
            e=entry(value);name=e["sha256"]+ext;info=files.get(name)
            require(info is not None and info.file_size==e["bytes"],"missing Max asset")
            data=z.read(info);require(len(data)==e["bytes"] and digest(data)==e["sha256"],"Max asset integrity")
            assets[name]=data;return e,data
        for body in BODY_TYPES:
            o=m["options"][body];source=SOURCES[body];old=public["items"][ITEM][body]
            require(old["kind"]=="player" and old["companionIncluded"] is True and old["sourceSha256"]!=source
                    and o["kind"]=="player" and o["sourceSha256"]==source and o["accessoryIncluded"] is False
                    and o["companionIncluded"] is (body=="female") and o["clip"]["sourceSha256"]==source,"Max pose identity")
            e,data=store(o["clip"],".wpa");cd=metadata(data,True);a=cd["animation"]
            require(cd["schema"]=="wand.private-pose-clip@1" and cd["privateOnly"] is True
                    and cd["publicationAuthorized"] is False and cd["modelSha256"]==models[body]["sha256"]
                    and a["extras"]["sourceSha256"]==source and a["extras"]["fullPoseVerified"] is False
                    and a["name"]==o["clip"]["name"]=="photomode_body_max_02"
                    and len(a["channels"])==({"male":230,"female":256}[body])
                    and all(0<=c["target"]["node"]<len(nodes[body]) and c["target"]["path"] in ("translation","rotation","scale") for c in a["channels"])
                    and abs(duration(cd,a)-6.566667079925537)<1e-5,"Max player clip")
            row={"kind":"player","sourceSha256":source,"clip":{**e,"sourceSha256":source,"name":a["name"]},
                 "accessoryIncluded":False,"companionIncluded":False}
            if body=="female":
                e,data=store(o["actor"],".glb");d=metadata(data);x=d["asset"]["extras"];a2=d["animations"][0];anchor=o["anchor"]
                require(anchor=={"node":6,"path":"root/Bip001"} and nodes[body][6]["name"]==anchor["path"]
                        and o["actor"]["sourceSha256"]==ACTOR_SOURCE and a2["extras"]["sourceSha256"]==ACTOR_SOURCE
                        and a2["extras"]["fullPoseVerified"] is False and x["privateOnly"] is True
                        and x["fullPoseVerified"] is False and x["companionActorDiagnostic"] is True
                        and x["shaderParityVerified"] is False and x["bodySpecificAttachmentVerified"] is True
                        and d["scenes"][d["scene"]]["nodes"]==[0] and len(d["animations"])==1 and len(a2["channels"])==306
                        and all(n.get("extras",{}).get("actorId")=="companion" for n in d["nodes"])
                        and abs(duration(d,a2)-duration(cd,a))<1e-5,"Max actor identity")
                old_e=entry(old["actor"]);oldraw=(dest/(old_e["sha256"]+".glb")).read_bytes()
                require(len(oldraw)==old_e["bytes"] and digest(oldraw)==old_e["sha256"],"Max prior actor integrity")
                od=metadata(oldraw)
                require(d["nodes"][1:]==od["nodes"][1:] and all(d[k]==od[k] for k in ("skins","meshes","materials","images","textures")),"Max actor geometry changed")
                bo=28+struct.unpack_from("<I",oldraw,12)[0];bn=28+struct.unpack_from("<I",data,12)[0]
                require(data[bn:].startswith(oldraw[bo:]),"Max geometry binary changed")
                row.update(companionIncluded=True,actor={**e,"sourceSha256":ACTOR_SOURCE},anchor=anchor)
            else:require("actor" not in o and "anchor" not in o,"unverified male actor")
            options[body]=row
        require(len(assets)==3 and set(files)=={"photo-max-alternate.json",*assets},"Max archive coverage")
        for name,data in assets.items():
            path=dest/name
            if path.exists():require(path.read_bytes()==data,"Max asset conflict")
        for name,data in assets.items():(dest/name).write_bytes(data)
        public.setdefault("variants",{})[ITEM]=[options]
        index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
        print("Max alternate pose: two player clips; one source-controller companion actor")
