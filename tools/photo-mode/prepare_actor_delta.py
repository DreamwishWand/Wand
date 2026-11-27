"""Append approved independent, source-textured companion models to player-only Pages scenes."""
import io
import json
import re
import urllib.request
import zipfile
from prepare_release_preview import BODY_TYPES, RELEASE_SHA, entry, digest, metadata, require, valid_hash
from prepare_companion_delta import DELTA_SHA

ACTOR_NAME = "Dreamwish-Wand-companion-actor-delta-20261127.zip"
ACTOR_URL = "https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/" + ACTOR_NAME
ACTOR_SHA = "afa94f3dfee895a5df8199494e2e4c196f392ae543f3c01f10734b708d99352a"
ACTOR_BYTES = 48562740

def download_actors():
    request = urllib.request.Request(ACTOR_URL, headers={"User-Agent": "Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read(ACTOR_BYTES+1)

def duration(doc, animation):
    return max(doc["accessors"][s["input"]]["max"][0] for s in animation["samplers"])

def apply_actors(raw, dest):
    require(len(raw)==ACTOR_BYTES and digest(raw)==ACTOR_SHA, "actor release integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True
            and public["testOnly"] is True and public["fullPoseVerified"] is False and len(public["items"])==107,
            "unexpected base manifest")
    models=public["models"];nodes={}
    for b in BODY_TYPES:
        e=entry(models[b]);data=(dest/(e["sha256"]+".glb")).read_bytes()
        require(len(data)==e["bytes"] and digest(data)==e["sha256"],"model integrity")
        nodes[b]=metadata(data)["nodes"]
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        files={}
        for i in archive.infolist():
            require(not i.is_dir() and i.filename not in files,"invalid archive entry")
            files[i.filename]=i
        mi=files.get("companion-actor-delta.json")
        require(mi is not None and mi.file_size<1024*1024,"missing manifest")
        m=json.loads(archive.read(mi))
        require(m["schema"]=="wand.photo-mode.companion-actor-delta@1" and m["gameVersion"]==public["gameVersion"]
                and m["baseReleaseSha256"]==RELEASE_SHA and m["baseCompanionDeltaSha256"]==DELTA_SHA
                and m["models"]==models and len(m["items"])==36,"actor release identity")
        assets={};updates={}
        for item,row in m["items"].items():
            require(re.fullmatch(r"12[0-9]{7}",item) is not None and item in public["items"],"unknown companion")
            e=entry(row["asset"]);source=row["sourceSha256"];name=e["sha256"]+".glb"
            require(valid_hash(source) and set(row["anchors"])==set(BODY_TYPES),"actor identity")
            if name not in assets:
                info=files.get(name);require(info is not None and info.file_size==e["bytes"],"missing actor")
                data=archive.read(info);require(len(data)==e["bytes"] and digest(data)==e["sha256"],"actor integrity")
                assets[name]=data
            d=metadata(assets[name]);x=d["asset"]["extras"]
            require(x["privateOnly"] is True and x["fullPoseVerified"] is False and x["companionActorDiagnostic"] is True
                    and x["shaderParityVerified"] is False and len(d["animations"])==1
                    and d["animations"][0]["extras"]["sourceSha256"]==source
                    and d["animations"][0]["extras"]["fullPoseVerified"] is False
                    and d["scenes"][d["scene"]]["nodes"]==[0] and d["nodes"] and d["skins"] and d["meshes"]
                    and d["images"] and all(im["mimeType"]=="image/png" for im in d["images"])
                    and all(n.get("extras",{}).get("actorId")=="companion" for n in d["nodes"]), "invalid actor scene")
            dur=duration(d,d["animations"][0]);options={}
            for b in BODY_TYPES:
                o=public["items"][item][b];a=row["anchors"][b]
                require(o["kind"]=="player" and o["companionIncluded"] is False
                        and type(a["node"]) is int and 0<=a["node"]<len(nodes[b])
                        and nodes[b][a["node"]]["name"]==a["path"],"actor attachment identity")
                c=entry(o["clip"]);wpa=(dest/(c["sha256"]+".wpa")).read_bytes()
                require(len(wpa)==c["bytes"] and digest(wpa)==c["sha256"],"player animation integrity")
                pd=metadata(wpa,True);require(abs(duration(pd,pd["animation"])-dur)<1e-5,"actor timing mismatch")
                options[b]={**o,"companionIncluded":True,"actor":{**e,"sourceSha256":source},"anchor":a}
            updates[item]=options
        require(len(assets)==36 and set(files)=={"companion-actor-delta.json",*assets},"unexpected actor assets")
        for name,data in assets.items():
            path=dest/name
            if path.exists():require(path.read_bytes()==data,"actor asset conflict")
        for name,data in assets.items():(dest/name).write_bytes(data)
        public["items"].update(updates);index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
        print("Independent textured companion actors:",len(updates),"items;",len(assets),"shared actor assets;",sum(map(len,assets.values())),"bytes")
