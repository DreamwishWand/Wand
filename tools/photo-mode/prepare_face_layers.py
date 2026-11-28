"""Publish only exact normal facial mask transforms and known native blend weights."""
import io,json,math,urllib.request,zipfile
from prepare_release_preview import entry,digest,require,valid_hash
from prepare_expression_weights import verify_curve,PARAMS
from export_photo_expressions import PINS,NAMES
NAME="Dreamwish-Wand-avatar-face-layers-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=1346219
SHA="e9e4d949be79674104bd2c5d874af003129824339b9135b46ab168ddc9359cd4"
def download_face_layers():
    req=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(req,timeout=90) as f:return f.read(SIZE+1)
def apply_face_layers(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"face layer archive identity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("expressionWeights"),"face layer base identity")
    blobs={};out={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==15 and len(set(z.namelist()))==15,"face layer archive coverage")
        info=z.getinfo("face-layers.json");require(info.file_size<16384,"face layer manifest size");m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.face-layers@1" and m["gameVersion"]==public["gameVersion"] and m["fullPoseVerified"] is False and m["mask"]=="Avatar_Face_Mask" and m["sourcePins"]==PINS and set(m["bodies"])=={"male","female"},"face layer manifest identity")
        for b in ("male","female"):
            rows=m["bodies"][b];require(len(rows)==7 and len({r["sourceSha256"] for r in rows})==7,"face layer count");out[b]=[]
            for i,r in enumerate(rows):
                e=entry(r["asset"]);name=e["sha256"]+".wfl";info=z.getinfo(name);require(info.file_size==e["bytes"]<=1024*1024 and name not in blobs and valid_hash(r["sourceSha256"]),"face layer bytes")
                data=z.read(info);require(digest(data)==e["sha256"],"face layer asset hash");c=json.loads(data)
                require(c["body"]==b and c["number"]==i and c["name"]==NAMES[i] and c["sourceSha256"]==r["sourceSha256"] and c["start"]==0 and 6<c["duration"]<7 and c["loop"] is True,"face layer clip identity")
                tracks=c["tracks"];require(len(tracks)==(115 if b=="female" else 96),"face track count");seen=set()
                for t in tracks:
                    path=t["path"];a=t["attribute"];key=(path,a)
                    require(isinstance(path,str) and path.startswith("root/") and len(path)<=512 and ("/Bip001 Head/" in path or b=="female" and path=="root/bn_shape_value") and a in (1,2,3) and key not in seen and len(t["curves"])==(4 if a==2 else 3),"face track")
                    seen.add(key)
                    for curve in t["curves"]:verify_curve(curve)
                p=c["parameters"];require(set(p)==(set(PARAMS) if b=="female" else set()),"face parameter coverage")
                for curve in p.values():verify_curve(curve)
                blobs[name]=data;out[b].append({"sourceSha256":r["sourceSha256"],"asset":e})
        require(set(z.namelist())=={"face-layers.json",*blobs},"face layer archive members")
    for name,data in blobs.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"face layer asset conflict")
        else:p.write_bytes(data)
    public["faceLayers"]=out;index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Native normal facial layers: 14 original clips, exact masked scalar curves")
