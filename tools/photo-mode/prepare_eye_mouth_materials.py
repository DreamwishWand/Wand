"""Bind native eye and mouth inputs to verified original material and texture identities."""
import io,json,math,re,urllib.request,zipfile,zlib
from prepare_release_preview import digest,entry,require,valid_hash

NAME="Dreamwish-Wand-avatar-eye-mouth-materials-20261128.zip"
SIZE=3758770
SHA="aadc4db110b45fc25c45a2f3f38154b23ec3c913951fcea8e07e16237e62c195"
URL="https://github.com/DreamwishWand/Wand/releases/download/photo-mode-assets-20261127/"+NAME
PINS={"visual":"db3faaaa68cddd76d4e5ebfc83eb484a49faf34fc972c23886393397299745ec","avatar":"854a3981667162d3a10b29b04b3755dfc89311dcf402540671fc0567413e2ccf","characterbase":"04ae1ecbfe5ad6069e895f22639ef438fe592527a853fa973958fb65e1177999","shaders":"c097e7a03a0532bdd7dfbed5d93a24c42508a09e3d3113f51f6bbe5647926e1a"}
SHADERS={"eyeSha256":"0571062679bae71f12621b7068a847463e28765ed02ff680bb00c0b55d6a01b1","surfaceTokensSha256":"67b255427dfa5120ffe6d24ca23e29f168daeb08f4b462ea9e326a49652b8429","genericSha256":"9982b8e01c8a7a1a4759d3108bb688375758b76d770dd06f6443273add31"}
PARAMS={"VERTEX_COLORS":0.0,"_MaxHorizontalAngle":0.800000011920929,"_ReflectionStrength":0.12999999523162842,"_SpecFalloff":200.0,"_SpecSize":0.004999999888241291,"_VerticalShift":0.20000000298023224}
TEETH={"_BumpMap":"e78870082f84bf229bcb8e04d82ff67422d8af9caee11b846a34b70f1378964f","_MainTex":"2debb1ed2dd4204d25c59416bb8c5289ee13cf3de2a86e4fca7e67f19e85bdcf","_MapsTex":"e059febc1edd2bf146935de7580a147f6f511997014c9ac6af02e958ccbb314b"}
def download_eye_mouth():
    with urllib.request.urlopen(urllib.request.Request(URL,headers={"User-Agent":"Dreamwish-Wand-Pages"}),timeout=90) as f:return f.read(SIZE+1)

def apply_eye_mouth(raw,dest,eye_source):
    require(len(raw)==SIZE and digest(raw)==SHA,"eye mouth archive identity")
    index=dest/"index.json";public=json.loads(index.read_bytes())
    require(public["schema"]=="wand.photo-mode.pages-test@2" and public["gameVersion"]=="1.26.2" and public["publicationAuthorized"] is True and public["testOnly"] is True and public["fullPoseVerified"] is False and public.get("headGeometry") and public.get("eyePalette"),"eye mouth base identity")
    assets={};maps={};eyes={}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        require(len(z.infolist())==16 and len(set(z.namelist()))==16,"eye mouth archive members")
        info=z.getinfo("eye-mouth-materials.json");require(info.file_size<65536,"eye mouth manifest bounds")
        m=json.loads(z.read(info))
        require(m["schema"]=="wand.photo-mode.eye-mouth-materials@1" and m["gameVersion"]=="1.26.2" and m["sourcePins"]==PINS and m["coordinateSpace"]=="UnityTextureRows" and m["encoding"]=="deflate-rgba8-mip-chain" and m["lightingParityVerified"] is False and m["shader"]==SHADERS,"eye mouth native identity")
        require(len(m["eyes"])==12 and len(m["textures"])==15 and len(m["prefabRefs"])==4 and len({r["pathId"] for r in m["prefabRefs"]})==4 and all(valid_hash(r["sourceSha256"]) for r in m["prefabRefs"]),"eye mouth source coverage")
        for k,r in m["textures"].items():
            require(valid_hash(k) and k==r["sourceSha256"] and valid_hash(r["payloadSha256"]) and valid_hash(r["rgbaSha256"]) and (r["width"],r["height"],r["mips"])==(512,512,10) and r["format"] in (10,12,25) and r["colorSpace"] in (0,1),"eye mouth texture identity")
            lengths=[4*max(1,512>>i)**2 for i in range(10)]
            require(r["mipByteLengths"]==lengths,"eye mouth mip layout")
            e=entry(r["asset"]);name=e["sha256"]+".wem2";require(name not in assets and z.getinfo(name).file_size==e["bytes"]<=2*1024*1024,"eye mouth asset size")
            d=z.read(name);dec=zlib.decompressobj();pixels=dec.decompress(d,sum(lengths)+1)
            require(digest(d)==e["sha256"] and len(pixels)==sum(lengths) and dec.eof and not dec.unused_data and not dec.unconsumed_tail and digest(pixels)==r["rgbaSha256"],"eye mouth pixels")
            assets[name]=d;maps[k]={q:r[q] for q in ("asset","width","height","mips","mipByteLengths","rgbaSha256","colorSpace")}
        used=set()
        for key,s in eye_source["items"].items():
            k=s["materialSha256"];r=m["eyes"][k];t=r["textureSourceSha256"];require(k not in used and t==s["textureSourceSha256"] and r["params"]==PARAMS and re.fullmatch(r"Avatar_Eyes_[0-9]{2}",r["name"]) and maps[t]["colorSpace"]==1 and m["textures"][t]["format"]==25,"native eye material binding")
            used.add(k);e=public["eyePalette"]["items"][key]["texture"];eyes[e["sha256"]]=maps[t]
        require(len(used)==len(eyes)==12 and len({v["asset"]["sha256"] for v in eyes.values()})==12,"eye mapping coverage")
        teeth=m["teeth"];lash=m["eyelash"]
        require(teeth["sourceSha256"]=="d519061adb8b2fa10a642ce3d75708a4f89066f80817f7757e4ca71554f6855f" and teeth["textures"]==TEETH and teeth["floats"]["_GlossMultiplier"]==1 and teeth["floats"]["_Metallic"]==0 and teeth["floats"]["_AlphaClip"]==0 and teeth["colors"]["_Tint"]==[1,1,1,0],"teeth source material")
        require(lash["sourceSha256"]=="3c5038e9314b812d5d3023480c2c6bf12f3e6cba32e4ec9916302af15f71459f" and lash["floats"]["_GlossMultiplier"]==0 and lash["floats"]["_AlphaClip"]==0 and lash["colors"]["_Tint"]==[0,0,0,0],"eyelash source material")
        require(set(z.namelist())=={"eye-mouth-materials.json",*assets},"eye mouth asset coverage")
    for name,d in assets.items():
        p=dest/name
        if p.exists():require(p.read_bytes()==d,"eye mouth asset conflict")
        else:p.write_bytes(d)
    public["eyeMouthMaterials"]={"eyes":eyes,"eyeParams":{"maxHorizontalAngle":PARAMS["_MaxHorizontalAngle"],"reflectionStrength":PARAMS["_ReflectionStrength"],"specFalloff":PARAMS["_SpecFalloff"],"specSize":PARAMS["_SpecSize"],"verticalShift":PARAMS["_VerticalShift"]},"teeth":{"normal":maps[TEETH["_BumpMap"]],"diffuse":maps[TEETH["_MainTex"]],"spec":maps[TEETH["_MapsTex"]]},"eyelashColor":[0,0,0,1],"lightingParityVerified":False}
    index.write_text(json.dumps(public,separators=(",",":")),encoding="utf-8")
    print("Native eye and mouth material inputs: 12 full eye masks, 3 tooth maps, 1 eyelash material")
