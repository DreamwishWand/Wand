"""Validate the pinned converted makeup archive before exposing derived assets."""
import io,json,math,re,urllib.request,zipfile,zlib
from collections import Counter
from prepare_release_preview import entry,digest,require,valid_hash
NAME="Dreamwish-Wand-avatar-makeup-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=9205104
SHA="cbb0e1b1e80db4276eaabc8f3a828c04a8e1ebc144c004a7c76fe861c361de4f"
PINS={"items":"ce83251a6ac082690c7a93698fee7526cf465b13a09d9e117d2e158500effe22","bundle":"6228c50a9c862b34f507fe3ee2ad91f433dd217a1e4f876570cf7f27ce2834c3","resources":"6085ded9a4449db200f64c5096960c0dae17f0891abc6fc4f6f7225d4ea126af"}
def download_makeup():
    with urllib.request.urlopen(urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"}),timeout=120) as f:return f.read(SIZE+1)
def apply_makeup(raw,dest):
    require(len(raw)==SIZE and digest(raw)==SHA,"makeup archive identity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("avatarMaterials"),"makeup base identity")
    assets={};textures={};items={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==129 and len(set(z.namelist()))==129,"makeup archive coverage")
        info=z.getinfo("avatar-makeup.json");require(info.file_size<=256*1024,"makeup manifest size");m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.avatar-makeup@1" and m["gameVersion"]=="1.26.2" and m["sourcePins"]==PINS and m["paletteSourceSha256"]=="39f0be39b2e988ce6772be227e2cea27e30675dd30502c90b6eddeaa13ba4e17" and m["encoding"]=="deflate-rgba8-mip-chain" and m["coordinateSpace"]=="UnityTextureRows" and m["paletteEncoding"]=="Color32RGBA" and m["shaderParityVerified"] is False,"makeup source identity")
        palette=m["palette"];require(len(palette)==75 and all(len(c)==4 and all(type(v) is int and 0<=v<=255 for v in c) for c in palette),"makeup palette")
        for id,r in m["items"].items():
            require(re.fullmatch(r"14[0-9]{7}",id) and r["subtype"]==int(id)//100000%100 and set(r["masks"])=={"male","female"} and all(re.fullmatch(r"[0-9a-f]{32}",g) for g in r["masks"].values()),"makeup item identity")
            require(len(r["defaultColorIndices"])==3 and all(type(i) is int and -1<=i<75 for i in r["defaultColorIndices"]) and all(type(r[k]) in (float,int) and math.isfinite(r[k]) and 0<=r[k]<=1 for k in ("defaultOpacity","defaultGloss")),"makeup defaults")
            items[id]=r
        require(len(items)==69 and Counter(r["subtype"] for r in items.values())=={1:14,2:3,3:10,4:3,5:26,6:6,7:4,10:3},"makeup item coverage")
        require(sum(i==-1 for r in items.values() for i in r["defaultColorIndices"])==77,"signed color coverage")
        targets={g for r in items.values() for g in r["masks"].values()};require(len(targets)==128 and targets==set(m["textures"]),"makeup reference coverage")
        layouts=Counter()
        for guid,r in m["textures"].items():
            w,h,fmt,n,c=(r[k] for k in ("width","height","format","mips","colorSpace"))
            require(w==h and w in (1024,2048) and fmt in (10,25,26) and n in (1,11) and c in (0,1) and all(valid_hash(r[k]) for k in ("sourceSha256","payloadSha256","rgbaSha256")),"makeup texture layout")
            layouts[(w,h,fmt,n,c)]+=1
            lengths=[4*max(1,w>>i)*max(1,h>>i) for i in range(n)];require(r["mipByteLengths"]==lengths,"makeup mip layout")
            e=entry(r["asset"]);name=e["sha256"]+".wmp";require(name not in assets and z.getinfo(name).file_size==e["bytes"]<=512*1024,"makeup asset size")
            data=z.read(name);require(digest(data)==e["sha256"],"makeup compressed identity")
            dec=zlib.decompressobj();pixels=dec.decompress(data,sum(lengths)+1);require(len(pixels)==sum(lengths) and dec.eof and not dec.unused_data and not dec.unconsumed_tail and digest(pixels)==r["rgbaSha256"],"makeup RGBA identity")
            if fmt==26:require(all(v==0 for v in pixels[1::4]) and all(v==0 for v in pixels[2::4]) and all(v==255 for v in pixels[3::4]),"BC4 native channels")
            assets[name]=data;textures[guid]={k:r[k] for k in ("width","height","mips","colorSpace","rgbaSha256","mipByteLengths","asset")}
        require(layouts=={(1024,1024,10,1,0):109,(1024,1024,26,1,0):12,(1024,1024,25,1,0):1,(2048,2048,10,1,0):2,(1024,1024,10,11,1):4},"makeup texture coverage")
        require(set(z.namelist())=={"avatar-makeup.json",*assets},"makeup archive members")
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"makeup asset conflict")
        else:p.write_bytes(data)
    public["avatarMakeup"]={"palette":palette,"items":items,"textures":textures,"shaderParityVerified":False}
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Avatar makeup: 69 source items, 128 masks, 75 native colors")
