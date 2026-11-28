"""Validate and publish the exact native eye mask and color table; not shader parity."""
import io,json,math,struct,urllib.request,zipfile
from prepare_release_preview import entry,digest,require,valid_hash
NAME="Dreamwish-Wand-avatar-eyes-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=1234497
SHA="638f4275331e1725f3194c208d6cbb5924b9138ea5d1a8347e1f0fb0bcc75728"
PINS={"features":"228b6c85e2d92d5de98b9ee64d236e613e7d1efd2bc690dd784f7dfca99d2b73","visualBundle":"db3faaaa68cddd76d4e5ebfc83eb484a49faf34fc972c23886393397299745ec","colorConfig":"0ade4229ca471081576d61a92e9103f2d5aca58f59b64fce359e1441b223eed9"}
def download_eyes():
    request=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(request,timeout=90) as f:return f.read(SIZE+1)

def apply_eyes(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"eye archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["gameVersion"]=="1.26.2" and public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("avatarMaterials"),"eye base identity")
    rows={};assets={};guids=set()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==13 and len(set(z.namelist()))==13,"eye archive coverage")
        info=z.getinfo("avatar-eyes.json");require(info.file_size<65536,"eye manifest size")
        m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.avatar-eyes@1" and m["gameVersion"]==public["gameVersion"] and m["sourcePins"]==PINS and m["shaderParityVerified"] is False,"eye source identity")
        palette=m["palette"];require(len(palette)==75 and all(len(c)==4 and c[3]==1 and all(type(x) in (float,int) and math.isfinite(x) and 0<=x<=1 for x in c) for c in palette),"eye native palette")
        require(set(m["items"])=={str(i) for i in range(70000001,70000013)},"eye native item coverage")
        for key,v in m["items"].items():
            guid=v["guid"];require(len(guid)==32 and all(c in "0123456789abcdef" for c in guid) and guid not in guids and valid_hash(v["materialSha256"]) and valid_hash(v["textureSourceSha256"]),"eye material identity");guids.add(guid)
            defaults=v["defaultColorIndices"];require(len(defaults)==3 and all(type(i) is int and 0<=i<75 for i in defaults),"eye item defaults")
            e=entry(v["texture"]);name=e["sha256"]+".png";require(name not in assets,"duplicate eye mask")
            info=z.getinfo(name);require(info.file_size==e["bytes"]<=2*1024*1024,"eye asset size")
            data=z.read(info);require(digest(data)==e["sha256"] and data[:8]==bytes.fromhex("89504e470d0a1a0a") and data[12:16]==b"IHDR" and struct.unpack_from(">IIBB",data,16)==(512,512,8,2),"eye mask identity")
            assets[name]=data;rows[key]={"texture":e,"defaults":defaults}
        require(set(z.namelist())=={"avatar-eyes.json",*assets},"eye archive members")
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"eye asset conflict")
        else:p.write_bytes(data)
    public["eyePalette"]={"colors":palette,"items":rows,"shaderParityVerified":False}
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Avatar eyes: 12 source masks, 75 native colors; shader parity unverified")
    return m
