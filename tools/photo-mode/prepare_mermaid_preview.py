"""Project pinned mermaid geometry/motion diagnostics without claiming runtime appearance parity."""
import io
import json
import math
import urllib.request
import zipfile
from prepare_release_preview import BODY_TYPES, RELEASE_SHA, entry, digest, metadata, require, valid_hash

NAME="Dreamwish-Wand-mermaid-diagnostic-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SHA="b6e65291f8d3d019cd1cb6ddb2eb838e70507e69eb8d2485ea55bf0f34ff74e4"
SIZE=3165375
ITEMS={"70200021","70200023","70200024","70200025","70200026","70200027","70200028","70200029"}

def download_mermaid():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(SIZE+1)

def apply_mermaid(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"mermaid archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True
            and public["testOnly"] is True and public["fullPoseVerified"] is False and len(public["items"])==255
            and not ITEMS.intersection(public["items"]),"unexpected mermaid base")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        files={}
        for info in z.infolist():
            require(not info.is_dir() and info.filename not in files,"invalid mermaid archive member")
            files[info.filename]=info
        mi=files.get("mermaid-diagnostic.json");require(mi is not None and mi.file_size<1024*1024,"mermaid manifest missing")
        m=json.loads(z.read(mi));require(m["schema"]=="wand.photo-mode.mermaid-diagnostic@1"
            and m["gameVersion"]==public["gameVersion"] and m["baseReleaseSha256"]==RELEASE_SHA
            and m["neutralMaterialProjection"] is True and m["fullPoseVerified"] is False
            and set(m["models"])==set(BODY_TYPES) and set(m["items"])==ITEMS,"mermaid manifest identity")
        assets={};models={};node_counts={};updates={};mapped=unresolved=0
        def store(value,ext):
            e=entry(value);name=e["sha256"]+ext;info=files.get(name)
            require(info is not None and info.file_size==e["bytes"],"missing mermaid asset")
            data=z.read(info);require(len(data)==e["bytes"] and digest(data)==e["sha256"],"mermaid asset integrity")
            assets[name]=data;return e,data
        for body in BODY_TYPES:
            e,raw_model=store(m["models"][body],".glb");d=metadata(raw_model);x=d["asset"]["extras"];nodes=d["nodes"]
            require(x["privateOnly"] is True and x["fullPoseVerified"] is False and x["splitDiagnostic"] is True
                    and x["mermaidDiagnostic"] is True and x["neutralMaterialProjection"] is True
                    and x["shaderParityVerified"] is False and x["clothPhysicsVerified"] is False
                    and x["mergedApparelRigDiagnostic"] is True and not d.get("animations")
                    and len(nodes)==131 and len(d["skins"])==len(d["meshes"])==10
                    and d["scenes"][d["scene"]]["nodes"]==[0],"invalid mermaid model")
            parents=set()
            for i,node in enumerate(nodes):
                for child in node.get("children",[]):
                    require(type(child) is int and i<child<len(nodes) and child not in parents,"invalid mermaid hierarchy")
                    parents.add(child)
            require(len(parents)==len(nodes)-1,"disconnected mermaid rig")
            for skin in d["skins"]:
                require(skin["joints"] and all(type(j) is int and 0<=j<len(nodes) for j in skin["joints"]),"invalid mermaid joints")
            require({"MermaidBody","DefaultTail"}.issubset({n["name"] for n in nodes})
                    and any(n["name"].startswith("MermaidFinsBasicMermaidHor01") for n in nodes),"missing mermaid components")
            models[body]=e;node_counts[body]=len(nodes)
        for item,row in m["items"].items():
            require(set(row)==set(BODY_TYPES),"mermaid body coverage");options={}
            for body in BODY_TYPES:
                o=row[body];source=o["sourceSha256"];e,data=store(o["clip"],".wpa");d=metadata(data,True);a=d["animation"];camera=o["camera"]
                require(valid_hash(source) and source==o["clip"]["sourceSha256"]==a["extras"]["sourceSha256"]
                        and d["schema"]=="wand.private-pose-clip@1" and d["privateOnly"] is True
                        and d["publicationAuthorized"] is False and d["modelSha256"]==models[body]["sha256"]
                        and a["extras"]["fullPoseVerified"] is False and a["name"]==o["clip"]["name"]
                        and len(a["channels"])==o["mapped"] and o["mapped"]>0
                        and type(o["unresolvedTransform"]) is int and o["unresolvedTransform"]>=0
                        and type(o["nonTransform"]) is int and o["nonTransform"]>=0,"invalid mermaid clip")
                tracks=set()
                for ch in a["channels"]:
                    t=ch["target"];key=(t["node"],t["path"])
                    require(0<=t["node"]<node_counts[body] and t["path"] in ("translation","rotation","scale") and key not in tracks,"invalid mermaid track")
                    tracks.add(key)
                duration=max(d["accessors"][s["input"]]["max"][0] for s in a["samplers"])
                require(abs(duration-o["duration"])<1e-5 and 0<duration<60
                        and len(camera["center"])==3 and all(math.isfinite(v) and abs(v)<10 for v in camera["center"])
                        and math.isfinite(camera["radius"]) and 0<camera["radius"]<=10,"invalid mermaid bounds or duration")
                mapped+=o["mapped"];unresolved+=o["unresolvedTransform"]
                options[body]={"kind":"mermaid","sourceSha256":source,"model":models[body],
                    "clip":{**e,"sourceSha256":source,"name":a["name"]},"camera":camera,
                    "neutralMaterialProjection":True,"unresolvedTransform":o["unresolvedTransform"],"nonTransform":o["nonTransform"]}
            updates[item]=options
        require(len(assets)==18 and set(files)=={"mermaid-diagnostic.json",*assets}
                and mapped==4253 and unresolved==984,"mermaid archive coverage")
        for name,data in assets.items():
            path=dest/name
            if path.exists():require(path.read_bytes()==data,"mermaid asset conflict")
        for name,data in assets.items():(dest/name).write_bytes(data)
        public["items"].update(updates);index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
        print("Mermaid geometry and motion diagnostics:",len(updates),"items; 16 clips; unresolved bindings:",unresolved)
