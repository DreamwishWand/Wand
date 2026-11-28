"""Publish exact saved skin-index material mapping, sharing body assets with mermaids."""
import io,json,urllib.request,zipfile
from prepare_release_preview import BODY_TYPES,entry,digest,require,valid_hash
NAME="Dreamwish-Wand-avatar-skin-palette-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=153614162
SHA="f4a7ec5d2741ba361db5c920bad7cf7130e44bbf56dcffb591259fb9a706ae17"
CONFIG="18923c6262b91d46aeb5c40dd553bf10b89513b955fc13519cc2376c32170420"

def download_skin_palette():
    r=urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"})
    with urllib.request.urlopen(r,timeout=180) as f:return f.read(SIZE+1)

def apply_skin_palette(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"skin archive integrity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("avatarMaterials"),"skin base identity")
    rows=[];used=set();source_materials=set();existing=set()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==117 and len(set(z.namelist()))==117,"skin archive coverage")
        mi=z.getinfo("avatar-skin-palette.json");require(mi.file_size<256*1024,"skin manifest size")
        m=json.loads(z.read(mi))
        require(m["schema"]=="wand.photo-mode.avatar-skin-palette@1" and m["gameVersion"]==public["gameVersion"] and m["configSha256"]==CONFIG and m["fullPoseVerified"] is False and len(m["rows"])==30,"skin config identity")
        for i,row in enumerate(m["rows"]):
            require(row["index"]==i and row["category"]==(0 if i<17 else 1),"skin native index")
            out={}
            for b in BODY_TYPES:
                slots={}
                for role in ("body","face"):
                    v=row[b][role];guid=v["guid"];require(isinstance(guid,str) and len(guid)==32 and all(c in "0123456789abcdef" for c in guid) and guid not in source_materials and valid_hash(v["materialSha256"]) and valid_hash(v["textureSourceSha256"]) and v["width"]==v["height"]==2048,"skin source identity")
                    source_materials.add(guid);e=entry(v["texture"]);ext=v["format"]
                    require(ext==("png" if i==1 else "webp"),"skin asset format")
                    name=e["sha256"]+"."+ext
                    if ext=="png":
                        expected={s["texture"]["sha256"] for s in public["avatarMaterials"][public["models"][b]["sha256"]] if s["role"]==role}
                        require(expected=={e["sha256"]},"existing skin A identity")
                        data=(dest/name).read_bytes();require(len(data)==e["bytes"] and digest(data)==e["sha256"],"existing skin texture");existing.add(name)
                    else:
                        require(name not in used,"unexpected skin texture duplicate");info=z.getinfo(name);require(info.file_size==e["bytes"]<=16*1024*1024,"skin asset size")
                        data=z.read(info);require(len(data)==e["bytes"] and digest(data)==e["sha256"] and data[:4]==b"RIFF" and data[8:12]==b"WEBP" and data[12:16]==b"VP8L" and int.from_bytes(data[4:8],"little")+8==len(data),"lossless skin texture")
                        header=int.from_bytes(data[21:25],"little");require(data[20]==0x2f and (header&0x3fff)+1==2048 and ((header>>14)&0x3fff)+1==2048,"skin texture dimensions")
                        target=dest/name
                        if target.exists():require(target.read_bytes()==data,"skin asset conflict")
                        else:target.write_bytes(data)
                        used.add(name)
                    slots[role]={"texture":e,"format":ext}
                out[b]=slots
            rows.append(out)
        require(len(source_materials)==120 and len(existing)==4 and len(used)==116 and set(z.namelist())=={"avatar-skin-palette.json",*used},"skin full coverage")
    public["skinPalette"]=rows
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Saved skin palette: 30 native indices, both body types, 120 face/body textures; 4 reused PNGs, 116 lossless WebPs")
