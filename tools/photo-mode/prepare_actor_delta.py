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
    return apply_actor_archive(raw, dest, size=ACTOR_BYTES, sha=ACTOR_SHA, base_count=107, item_count=36,
                               schema="wand.photo-mode.companion-actor-delta@1",
                               manifest="companion-actor-delta.json")

def apply_actor_archive(raw, dest, *, size, sha, base_count, item_count, schema, manifest, prior=None, variant_count=0):
    require(len(raw)==size and digest(raw)==sha, "actor release integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True
            and public["testOnly"] is True and public["fullPoseVerified"] is False and len(public["items"])==base_count,
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
        mi=files.get(manifest)
        require(mi is not None and mi.file_size<1024*1024,"missing manifest")
        m=json.loads(archive.read(mi))
        require(m["schema"]==schema and m["gameVersion"]==public["gameVersion"]
                and m["baseReleaseSha256"]==RELEASE_SHA and m["baseCompanionDeltaSha256"]==DELTA_SHA
                and m["models"]==models and len(m["items"])==item_count,"actor release identity")
        if prior is not None:
            require(all(m.get(k)==v for k,v in prior.items()),"actor expansion base identity")
        variants=m.get("variants",{})
        require(isinstance(variants,dict) and set(variants)<=set(m["items"])
                and all(isinstance(v,dict) for v in variants.values())
                and sum(len(v) for v in variants.values())==variant_count,"actor variant coverage")
        assets={};updates={};alternate_updates={}
        def validate_actor(row,player):
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
                o=player[b];a=row["anchors"][b]
                require(o["kind"]=="player" and o["companionIncluded"] is False
                        and (prior is None or row["playerSourceSha256"][b]==o["sourceSha256"])
                        and type(a["node"]) is int and 0<=a["node"]<len(nodes[b])
                        and nodes[b][a["node"]]["name"]==a["path"],"actor attachment identity")
                c=entry(o["clip"]);wpa=(dest/(c["sha256"]+".wpa")).read_bytes()
                require(len(wpa)==c["bytes"] and digest(wpa)==c["sha256"],"player animation integrity")
                pd=metadata(wpa,True);require(abs(duration(pd,pd["animation"])-dur)<1e-5,"actor timing mismatch")
                options[b]={**o,"companionIncluded":True,"actor":{**e,"sourceSha256":source},"anchor":a}
            return options
        for item,row in m["items"].items():
            require(re.fullmatch(r"12[0-9]{7}",item) is not None and item in public["items"],"unknown companion")
            updates[item]=validate_actor(row,public["items"][item])
        for item,rows in variants.items():
            require(item in public.get("variants",{}),"unknown alternate actor")
            updated=list(public["variants"][item])
            for key,row in rows.items():
                require(isinstance(key,str) and re.fullmatch(r"[1-9][0-9]*",key) is not None,"invalid alternate index")
                i=int(key)-1;require(i<len(updated),"unknown alternate index")
                updated[i]=validate_actor(row,updated[i])
            alternate_updates[item]=updated
        require(len(assets)==item_count+variant_count and set(files)=={manifest,*assets},"unexpected actor assets")
        for name,data in assets.items():
            path=dest/name
            if path.exists():require(path.read_bytes()==data,"actor asset conflict")
        for name,data in assets.items():(dest/name).write_bytes(data)
        public["items"].update(updates)
        if alternate_updates:public["variants"].update(alternate_updates)
        index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
        print("Independent textured companion actors:",len(updates),"items;",len(assets),"shared actor assets;",sum(map(len,assets.values())),"bytes")
