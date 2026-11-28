"""Publish source body position morphs only for the exact native land mesh."""
import io,json,math,struct,urllib.request,zipfile
from prepare_release_preview import entry,digest,require,BODY_TYPES
from prepare_face_morphs import PINS
NAME="Dreamwish-Wand-avatar-body-morphs-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=82346
SHA="45a2cfc32dd785ba9b3ddf49e96c33f339623709c5bc4f33a81fea1cf7213018"
CHANNELS={"male":["isMaleStandard","isMaleBurly","isMaleShaped","isMaleRegular","isMaleSlender","isMaleLavish"],"female":["","isFemaleBulky","isFemaleFit","isFemaleCasual","isFemaleLanky","isFemaleGenerous"]}

def download_body_morphs():
    request=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request,timeout=90) as f:return f.read(SIZE+1)

def apply_body_morphs(raw,dest,base_source):
    require(len(raw)==SIZE and digest(raw)==SHA,"body archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("avatarMaterials"),"body base identity")
    require(base_source["schema"]=="wand.photo-mode.avatar-base-materials@1" and base_source["gameVersion"]==public["gameVersion"],"body source identity")
    result={};assets={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==3 and len(set(z.namelist()))==3,"body archive members")
        info=z.getinfo("body-morphs.json");require(info.file_size<16384,"body manifest bounds");m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.body-morphs@1" and m["gameVersion"]==public["gameVersion"] and m["sourcePins"]==PINS and m["fullPoseVerified"] is False and set(m["items"])==set(BODY_TYPES),"body native source")
        for b in BODY_TYPES:
            row=m["items"][b];refs=[s for s in base_source["items"][b] if s["role"]=="body"];require(len(refs)==1,"body source role")
            src=refs[0];n=row["vertices"];require(row["meshSha256"]==src["meshSha256"] and n==src["vertices"] and type(n) is int and 0<n<=100000,"body mesh identity")
            choices=row["choices"];require(len(choices)==6 and [c["index"] for c in choices]==list(range(6)) and [c["channel"] for c in choices]==CHANNELS[b] and all(c["weight"]==100 for c in choices),"body options")
            e=entry(row["asset"]);name=e["sha256"]+".wbm";info=z.getinfo(name);require(info.file_size==e["bytes"]<=2*1024*1024 and name not in assets,"body asset size");data=z.read(info)
            require(digest(data)==e["sha256"] and struct.unpack_from("<4sI",data)==(b"WBM1",n),"body asset identity")
            pos=8;counts=[]
            for _ in range(5):
                require(pos+4<=len(data),"body frame header");count,=struct.unpack_from("<I",data,pos);pos+=4
                require(0<count<=n and pos+16*count<=len(data),"body frame bounds");seen=set();counts.append(count)
                for i,x,y,zv in struct.iter_unpack("<I3f",data[pos:pos+16*count]):
                    require(i<n and i not in seen and all(math.isfinite(v) for v in (x,y,zv)),"body vertex");seen.add(i)
                pos+=16*count
            require(pos==len(data) and counts==row["frameCounts"],"body frame coverage")
            assets[name]=data;result[b]={"vertices":n,"asset":e}
        require(set(z.namelist())=={"body-morphs.json",*assets},"body archive coverage")
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"body asset conflict")
        else:p.write_bytes(data)
    public["bodyMorphs"]=result
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Native body morphs: six land body choices per sex; two exact meshes; ten position frames")
