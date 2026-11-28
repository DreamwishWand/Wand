"""Publish only the source-identified, converted studio reflection and LUT."""
import io,json,math,struct,urllib.request,zipfile
from prepare_release_preview import digest,require
NAME="Dreamwish-Wand-avatar-studio-assets-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=287540
SHA="8a375e302d8dca28410fcb5b539a0a957c793d9ca25be1baa83888adc1a201ab"
MANIFEST={"schema":"wand.photo-mode.studio-assets@1","gameVersion":"1.26.2","sourceSha256":"0049964b508ce27a8b75cf123d614af1ef9ebfc80dce00e4ac4485465829ee5f","reflection":{"objectSha256":"528ad8833e48fac93e1a4b48734173e372c40ce1fec42c9b65d37c7eed687c70","payloadSha256":"1a818e0762b1c5b772a11c7b0520943ff5f051ac7326a021aca463127463fd71","format":"rgb16f-le","width":128,"mips":8,"faces":["+X","-X","+Y","-Y","+Z","-Z"],"asset":{"sha256":"8c77ed0eddb2a7ee856d6480eaf293a735df7600c2c3be540f3378c8a85feec2","bytes":786420}},"lut":{"objectSha256":"370b90af0a94f2c7640bab201ff41220f0d078d88749f02c3e80c87e2fabd13a","payloadSha256":"63becd39f68846f7d4f9b3ac570bfb909b07628534ebd42f36d38e1fe8cd0dc8","format":"rgb8-linear","width":1024,"height":32,"asset":{"sha256":"63becd39f68846f7d4f9b3ac570bfb909b07628534ebd42f36d38e1fe8cd0dc8","bytes":98304}}}
def download_studio_assets():
    with urllib.request.urlopen(urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"}),timeout=90) as f:return f.read(SIZE+1)
def apply_studio_assets(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"studio archive identity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public["gameVersion"]=="1.26.2","studio base identity")
    assets={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==3 and z.getinfo("studio-assets.json").file_size<=4096,"studio archive members")
        m=json.loads(z.read("studio-assets.json"));require(m==MANIFEST,"studio source identity")
        for k,ext in (("reflection",".wlc"),("lut",".wlt")):
            e=m[k]["asset"];name=e["sha256"]+ext;require(z.getinfo(name).file_size==e["bytes"],"studio asset size")
            data=z.read(name);require(digest(data)==e["sha256"],"studio pixels identity");assets[name]=data
            if k=="reflection":require(len(data)==6*sum(6*max(1,128>>i)**2 for i in range(8)) and all(math.isfinite(v) and v>=0 for (v,) in struct.iter_unpack("<e",data)),"studio HDR pixels")
        require(set(z.namelist())=={"studio-assets.json",*assets},"studio asset coverage")
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"studio asset conflict")
        else:p.write_bytes(data)
    public["studioAssets"]={"reflection":m["reflection"]["asset"],"lut":m["lut"]["asset"],"lightingParityVerified":False}
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Native studio: 6 faces x 8 HDR levels and original 32-cube LUT")
