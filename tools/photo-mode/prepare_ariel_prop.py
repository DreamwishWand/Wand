"""Add the exact source Ariel rock to both existing mermaid motion previews."""
import io,json,urllib.request,zipfile
from prepare_release_preview import BODY_TYPES,entry,digest,metadata,require
from prepare_actor_delta import duration

NAME="Dreamwish-Wand-ariel-prop-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=344073
SHA="53c292b83cb7b7ab99419d96b7731435328df408123d4acb77ac5aa4487883ad"
ITEM="70200029"
SOURCES={"male":"864abfce26a9d27ff312128637c2aa9bbf194b934369e70f43ed2ea9d51e7a61","female":"d2f5b6633c35932c1ebfba8e609290ff0750d77c13fbb636d1a7921cf65a69ac"}
PROPS={"male":"b2a1dd7a7a563d001bc0e78ec13d3461806e75585a7868d3798871000a64780a","female":"33f2b5161b05a975acffff4f725a1e85d512458585723d54a71c792ec5837cb2"}
DURATION=7.900001525878906

def download_ariel():
    r=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(r,timeout=90) as f:return f.read(SIZE+1)

def apply_ariel(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"Ariel archive integrity")
    path=dest/"index.json";public=json.loads(path.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False,"Ariel base identity")
    row=public["items"][ITEM];assets={};updates={}
    def read_published(v,ext):
        e=entry(v);data=(dest/(e["sha256"]+ext)).read_bytes()
        require(len(data)==e["bytes"] and digest(data)==e["sha256"],"Ariel published asset integrity")
        return metadata(data,ext==".wpa")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==3 and set(z.namelist())=={"ariel-prop.json",*(v+".glb" for v in PROPS.values())},"Ariel archive coverage")
        m=json.loads(z.read("ariel-prop.json"))
        require(m["schema"]=="wand.photo-mode.ariel-prop@1" and m["gameVersion"]==public["gameVersion"] and m["itemId"]==int(ITEM) and m["sourcePrefabSha256"]=="9eb773edc4a9186f045bb85f982667a8a384baa2d7b92f5bede05b82f80c3ce1" and m["sourcePrefabGuid"]=="65f95d83dc42c03498efdafb9f3150f1" and set(m["items"])==set(BODY_TYPES),"Ariel source identity")
        for b in BODY_TYPES:
            old=row[b];src=m["items"][b];e=entry(src["asset"]);name=e["sha256"]+".glb"
            require(old["kind"]=="mermaid" and old["neutralMaterialProjection"] is True and not old.get("accessoryIncluded") and old["sourceSha256"]==old["clip"]["sourceSha256"]==src["sourceSha256"]==SOURCES[b] and e["sha256"]==PROPS[b] and abs(src["duration"]-DURATION)<1e-5,"Ariel pose identity")
            player=read_published(old["model"],".glb");clip=read_published(old["clip"],".wpa");a=clip["animation"]
            require(clip["modelSha256"]==old["model"]["sha256"] and a["extras"]["sourceSha256"]==SOURCES[b] and abs(duration(clip,a)-DURATION)<1e-5,"Ariel player clip identity")
            ids=[i for i,n in enumerate(player["nodes"]) if n["name"]=="root"];require(len(ids)==1,"Ariel attachment root")
            data=z.read(name);require(len(data)==e["bytes"] and digest(data)==e["sha256"],"Ariel prop integrity");d=metadata(data);x=d["asset"]["extras"];a=d["animations"][0]
            require(x["privateOnly"] is True and x["fullPoseVerified"] is False and x["propActorDiagnostic"] is True and x["shaderParityVerified"] is False and x["effectParityVerified"] is False and x["grassMaskOmitted"] is True and len(d["animations"])==1 and a["extras"]["sourceSha256"]==SOURCES[b] and a["extras"]["fullPoseVerified"] is False and abs(duration(d,a)-DURATION)<1e-5,"Ariel prop clip")
            require([n["name"] for n in d["nodes"]]==["root/bn_emote_pose","Rock","Rock (1)"] and all(n["extras"]["actorId"]=="prop" for n in d["nodes"]) and d["nodes"][0]["children"]==[1,2] and d["scenes"][d["scene"]]["nodes"]==[0] and len(d["meshes"])==1 and len(d["skins"])==2 and [n["mesh"] for n in d["nodes"][1:]]==[0,0] and [s["joints"] for s in d["skins"]]==[[1],[2]] and len(d["images"])==1 and d["images"][0]["mimeType"]=="image/png","Ariel prop geometry")
            require(len(a["channels"])==2 and {ch["target"]["path"] for ch in a["channels"]}=={"translation","rotation"} and all(ch["target"]["node"]==0 for ch in a["channels"]),"Ariel source tracks")
            assets[name]=data;updates[b]={**old,"accessoryIncluded":True,"prop":{**e,"sourceSha256":SOURCES[b]},"anchor":{"node":ids[0],"path":"root"}}
    for name,data in assets.items():
        target=dest/name
        if target.exists():require(target.read_bytes()==data,"Ariel asset conflict")
        target.write_bytes(data)
    public["items"][ITEM]=updates;path.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Ariel prop: both native body clips, two original rock meshes sharing geometry")
