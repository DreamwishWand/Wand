"""Publish source-weighted face morphs only for exact existing skull meshes."""
import io,json,math,struct,urllib.request,zipfile
from prepare_release_preview import entry,digest,require,valid_hash,BODY_TYPES
NAME="Dreamwish-Wand-avatar-face-morphs-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=1409120
SHA="af5ea990519ba8df344aa0a9a45aa6a2d8d87f8979cb023dfaeeb45a4219fbaf"
PINS={"configResources":"6085ded9a4449db200f64c5096960c0dae17f0891abc6fc4f6f7225d4ea126af","maleConfig":"d6df5db9929fa45e157caef481157865ad860e5a3e6a23ab4aa0e0125eae3b04","maleBundle":"7712b04502a06254e04e5b0fe25aba2b9b9d56dc15a2fcfdc26b6f1b5e327960","femaleConfig":"bd8e41caae0e93f76bbb2f17b7a444de7eb1c566316213b6c815904881d74ec7","femaleBundle":"38f2069245537e4b0849bd78f550d05c5b0d5d868469b1e8b2bcea38a69a55f8"}
def download_face_morphs():
    request=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request,timeout=90) as f:return f.read(SIZE+1)

def verify_morph(data,vertices):
    require(len(data)>=8 and struct.unpack_from("<4sI",data)==(b"WFM1",vertices),"face morph header")
    pos=8
    for _ in range(21):
        require(pos+4<=len(data),"face morph frame header")
        n,=struct.unpack_from("<I",data,pos);pos+=4
        require(n<=vertices and pos+16*n<=len(data),"face morph frame bounds")
        seen=set()
        for i,x,y,z in struct.iter_unpack("<I3f",data[pos:pos+16*n]):
            require(i<vertices and i not in seen and all(math.isfinite(a) for a in (x,y,z)),"face morph vertex")
            seen.add(i)
        pos+=16*n
    require(pos==len(data),"face morph trailing data")

def apply_face_morphs(raw,dest,base_source):
    require(len(raw)==SIZE and digest(raw)==SHA,"face archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("avatarMaterials"),"face base identity")
    require(base_source["schema"]=="wand.photo-mode.avatar-base-materials@1" and base_source["gameVersion"]==public["gameVersion"],"face base source")
    result={};used=set()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==17 and len(set(z.namelist()))==17,"face archive coverage")
        mi=z.getinfo("face-morphs.json");require(mi.file_size<65536,"face manifest bounds");m=json.loads(z.read(mi))
        require(m["schema"]=="wand.photo-mode.face-morphs@1" and m["gameVersion"]==public["gameVersion"] and m["sourcePins"]==PINS and m["fullPoseVerified"] is False and set(m["items"])==set(BODY_TYPES),"face source identity")
        for body in BODY_TYPES:
            rows=m["items"][body];require(len(rows)==8,"face mesh coverage")
            refs=[s for s in base_source["items"][body] if s["role"]=="face"];require(len(refs)==1,"base skull source")
            source=refs[0];require(source["meshSha256"] in rows,"base skull not in original morph set")
            for mesh,v in rows.items():
                require(valid_hash(mesh) and type(v["vertices"]) is int and 0<v["vertices"]<=100000,"face mesh identity")
                e=entry(v["asset"]);name=e["sha256"]+".wfm";require(name not in used,"duplicate face morph");used.add(name)
                info=z.getinfo(name);require(info.file_size==e["bytes"]<=2*1024*1024,"face morph size")
                data=z.read(info);require(digest(data)==e["sha256"],"face morph digest");verify_morph(data,v["vertices"])
                if mesh==source["meshSha256"]:
                    require(v["vertices"]==source["vertices"],"base skull vertices")
                    path=dest/name
                    if path.exists():require(path.read_bytes()==data,"face morph conflict")
                    else:path.write_bytes(data)
                    result[body]={"vertices":v["vertices"],"asset":e}
        require(len(used)==16 and set(z.namelist())=={"face-morphs.json",*used} and set(result)==set(BODY_TYPES),"face full coverage")
    public["faceMorphs"]=result
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Face morphs: 16 native skull meshes verified; 2 exact current skulls published; 21 configured position frames each")
