"""Publish exact skin surface inputs, keyed through the existing verified skin palette."""
import io,json,math,re,urllib.request,zipfile,zlib
from collections import Counter
from prepare_release_preview import entry,digest,require,valid_hash
NAME="Dreamwish-Wand-avatar-skin-inputs-v2-20261128.zip"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
SIZE=13015759
SHA="038b01e041d91ab353799bedb78da5284a20d89f9d5b6023a84bf9d82d69cdc1"
def download_skin_inputs():
    with urllib.request.urlopen(urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"}),timeout=120) as f:return f.read(SIZE+1)
def apply_skin_inputs(raw,dest,palette_source,base_source):
    require(len(raw)==SIZE and digest(raw)==SHA,"skin inputs archive identity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["gameVersion"]=="1.26.2" and public["schema"]=="wand.photo-mode.pages-test@2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("nativeFaceNormals") and len(public.get("skinPalette",[]))==30,"skin inputs base identity")
    assets={};maps={};rows=[]
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==7 and len(set(z.namelist()))==7,"skin input archive members")
        info=z.getinfo("avatar-skin-inputs.json");require(info.file_size<256*1024,"skin manifest size")
        m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.native-skin-inputs@2" and m["gameVersion"]=="1.26.2" and m["coordinateSpace"]=="UnityTextureRows" and m["encoding"]=="deflate-rgba8-mip-chain" and m["lightingParityVerified"] is False,"skin input schema")
        require(len(m["materialSourcePins"])==62 and len(m["textureSourcePins"])==5 and len(m["textures"])==12 and len(m["materials"])==120,"skin source coverage")
        for key,r in m["textures"].items():
            require(re.fullmatch(r"CAB-[a-f0-9]{32}/-?[0-9]+",key) and valid_hash(r["sourceSha256"]) and r["colorSpace"]==0,"skin texture source")
            if "reuse" in r:
                require(r["reuse"]=="nativeFaceNormals" and re.fullmatch(r"avatar_(male|female)_head_[a-hA-H]_nm",r["name"]),"face normal reuse")
                continue
            w,h,n=r["width"],r["height"],r["mips"];require((w,h,n) in ((2048,2048,12),(1024,8,1)) and r["format"] in (10,12),"skin texture layout")
            lengths=[4*max(1,w>>i)*max(1,h>>i) for i in range(n)]
            require(lengths==r["mipByteLengths"] and valid_hash(r["rgbaSha256"]) and valid_hash(r["payloadSha256"]),"skin mip layout")
            e=entry(r["asset"]);name=e["sha256"]+".wsi"
            require(z.getinfo(name).file_size==e["bytes"]<=4*1024*1024,"skin input asset size")
            if name not in assets:
                data=z.read(name);dec=zlib.decompressobj();pixels=dec.decompress(data,sum(lengths)+1)
                require(digest(data)==e["sha256"] and len(pixels)==sum(lengths) and dec.eof and not dec.unused_data and not dec.unconsumed_tail and digest(pixels)==r["rgbaSha256"],"skin input pixels")
                assets[name]=data
            maps[key]={k:r[k] for k in ("width","height","mips","mipByteLengths","rgbaSha256","asset")}
        require(len(maps)==7 and len(assets)==6 and set(z.namelist())=={"avatar-skin-inputs.json",*assets},"skin input deduplication")
        used=set()
        for i,source in enumerate(palette_source["rows"]):
            require(source["index"]==i,"skin palette order")
            out={}
            for body in ("male","female"):
                pair={}
                for role in ("body","face"):
                    s=source[body][role];k=s["materialSha256"];r=m["materials"][k]
                    require(k not in used and r["guid"]==s["guid"] and r["body"]==body and r["role"]==role,"exact native skin material identity")
                    used.add(k)
                    require(r["faceFlag"] in (0,1) and r["glossMultiplier"]==0.800000011920929 and 0<=r["shadowTerminatorIntensity"]<=1,"skin material scalar")
                    require(all(len(r[c])==4 and all(type(v) in (int,float) and math.isfinite(v) and 0<=v<=1 for v in r[c]) for c in ("specularColor","ambientColor")),"skin material colors")
                    spec=maps[r["spec"]];shadow=maps[r["shadow"]]
                    require(spec["width"]==spec["height"]==2048 and (shadow["width"],shadow["height"])==(1024,8),"skin map roles")
                    normal=m["textures"][r["normal"]];require((role=="face")==("reuse" in normal),"skin normal role")
                    pair[role]={k:r[k] for k in ("faceFlag","glossMultiplier","shadowTerminatorIntensity","specularColor","ambientColor")}|{"spec":spec,"shadow":shadow}
                    if role=="body":pair[role]["normal"]=maps[r["normal"]]
                    else:
                        match=re.fullmatch(r"avatar_"+body+r"_head_([a-hA-H])_nm",normal["name"]);require(match is not None,"skin original face normal index")
                        pair[role]["normalIndex"]=ord(match[1].lower())-97
                    if i==1:
                        base=[v for v in base_source["items"][body] if v["role"]==role]
                        require(len(base)==1 and base[0]["materialSha256"]==s["materialSha256"],"default skin material identity")
                out[body]=pair
            rows.append(out)
        require(len(used)==120 and Counter(r["faceFlag"] for r in m["materials"].values())=={0:76,1:44},"skin material coverage")
    for name,data in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==data,"skin input conflict")
        else:p.write_bytes(data)
    public["nativeSkinInputs"]={"rows":rows,"lightingParityVerified":False}
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Native skin inputs: 120 exact materials, 6 shared derived textures")
