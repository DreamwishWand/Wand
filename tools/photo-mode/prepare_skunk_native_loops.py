"""Reuse source-verified skunk actor assets with independent native loop periods.
No actor, player clip, or texture bytes are changed. Both source PetAttachmentPoints
maps use the same right-hand anchor path; node indices differ across body rigs.
"""
import json
from prepare_release_preview import entry, digest, metadata, require
from prepare_actor_delta import duration

ITEMS=("120000177","120000179","120000180","120000181","120000192","120000201")
PLAYER={"male":"42894d81ebf350aa7f014065b59ad81f5592623c393f0aac6731c2f7ea1d8b91",
        "female":"5937efa294639250139240d0e4526fa4c46fa9675bbcc1c640256903c00d5db8"}
ACTOR="9d15cad41a7e2064bbfdb29cd4fb434e0bd90f007025b560461da12bbcdc2e7c"
PERIOD={"male":17.80000114440918,"female":12.333333969116211}
ANCHOR_PATH="root/Bip001/Bip001 Pelvis/Bip001 Spine/Bip001 Spine1/Bip001 R Clavicle/Bip001 R UpperArm/Bip001 R Forearm/Bip001 R Hand/item_anc_R_01"
ANCHORS={b:{"node":i,"path":ANCHOR_PATH} for b,i in (("male",87),("female",93))}

def verified(dest,value,ext):
    e=entry(value);raw=(dest/(e["sha256"]+ext)).read_bytes()
    require(len(raw)==e["bytes"] and digest(raw)==e["sha256"],"skunk asset integrity")
    return metadata(raw,ext==".wpa")

def apply_skunk_native_loops(dest):
    path=dest/"index.json";public=json.loads(path.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2"
            and public["publicationAuthorized"] is True and public["testOnly"] is True
            and public["fullPoseVerified"] is False,"unexpected skunk base")
    for body,a in ANCHORS.items():
        d=verified(dest,public["models"][body],".glb")
        require(d["nodes"][a["node"]]["name"]==a["path"],"skunk anchor identity")
    updates={}
    for item in ITEMS:
        row=public["items"][item];male=row["male"];female=row["female"]
        require(male["companionIncluded"] is False and female["companionIncluded"] is True
                and all(row[b]["kind"]=="player" and row[b]["accessoryIncluded"] is False
                        and row[b]["sourceSha256"]==PLAYER[b] and row[b]["clip"]["sourceSha256"]==PLAYER[b] for b in PLAYER)
                and female["anchor"]==ANCHORS["female"] and female["actor"]["sourceSha256"]==ACTOR
                and not female.get("nativeLoops"),"skunk pose identity")
        for b in PLAYER:
            d=verified(dest,row[b]["clip"],".wpa")
            require(d["modelSha256"]==public["models"][b]["sha256"]
                    and d["animation"]["extras"]["sourceSha256"]==PLAYER[b]
                    and abs(duration(d,d["animation"])-PERIOD[b])<1e-5,"skunk player timing")
        d=verified(dest,female["actor"],".glb")
        require(d["asset"]["extras"]["companionActorDiagnostic"] is True
                and d["asset"]["extras"]["fullPoseVerified"] is False
                and len(d["animations"])==1 and d["animations"][0]["extras"]["sourceSha256"]==ACTOR
                and abs(duration(d,d["animations"][0])-PERIOD["female"])<1e-5,"skunk actor timing")
        updated={**male,"companionIncluded":True,"actor":female["actor"],"anchor":ANCHORS["male"],
                 "nativeLoops":{"player":PERIOD["male"],"companion":PERIOD["female"]}}
        for flag in ("secondaryPassOmitted","limboGeometryDiagnostic"):
            if female.get(flag) is True:updated[flag]=True
        updates[item]={**row,"male":updated}
    public["items"].update(updates)
    path.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Skunk native loops: six additional body options; zero new assets")
