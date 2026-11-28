"""Extract source mesh material attributes, keyed by original mesh identity.
Keep private archive outside Git; no inferred UVs or reconstructed tangents.
"""
import argparse,json,struct,zipfile
from pathlib import Path
import numpy as np
from resolve_animation_bundle import digest,unityfs,serialized_objects
from pose_mesh import decode_mesh
from pose_curves import require

PINS={"maleBundle":"7712b04502a06254e04e5b0fe25aba2b9b9d56dc15a2fcfdc26b6f1b5e327960","femaleBundle":"38f2069245537e4b0849bd78f550d05c5b0d5d868469b1e8b2bcea38a69a55f8"}
HEAD_SHA="6bc26ca6fec7b7e453cb98d0433b5fb5beaf223682f7428d505ac5e60a54b0d1"
BODY_SHA="45a2cfc32dd785ba9b3ddf49e96c33f339623709c5bc4f33a81fea1cf7213018"
CHANNELS=((2,4),(3,4),(5,2),(6,2))
def encode(x):return json.dumps(x,separators=(",",":"),sort_keys=True,allow_nan=False).encode()
def f32(x):return np.ascontiguousarray(x,dtype="<f4").tobytes()
def mesh_index(raw):
    v,files=unityfs(raw);require(v=="6000.0.62f1" and len(files)==1,"avatar bundle layout")
    data=next(iter(files.values()));v,objects=serialized_objects(data);require(v=="6000.0.62f1","avatar serialized layout")
    result={}
    for cls,o,n in objects.values():
        if cls==43:
            b=data[o:o+n];k=digest(b);require(k not in result,"duplicate original mesh");result[k]=b
    return result
def build(bundles,head,body,out):
    require(digest(head.read_bytes())==HEAD_SHA and digest(body.read_bytes())==BODY_SHA,"existing release identities")
    rows={};blobs={};stats={str(i):0 for i,_ in CHANNELS}
    with zipfile.ZipFile(head) as hz,zipfile.ZipFile(body) as bz:
        hm=json.loads(hz.read("head-geometry.json"));bm=json.loads(bz.read("body-morphs.json"))
        require(hm["schema"]=="wand.photo-mode.head-geometry@1" and bm["schema"]=="wand.photo-mode.body-morphs@1" and hm["gameVersion"]==bm["gameVersion"]=="1.26.2","existing manifest identities")
        for sex in ("male","female"):
            raw=bundles[sex].read_bytes();pin=sex+"Bundle";require(digest(raw)==PINS[pin]==hm["sourcePins"][pin]==bm["sourcePins"][pin],"avatar source identity")
            meshes=mesh_index(raw);targets={}
            require(len(hm["items"][sex])==8,"head variants")
            for row in hm["items"][sex]:
                require(set(row["parts"])=={"eyes","skull","eyelash","shadow","teeth_upper","teeth_lower"},"head part coverage")
                for role,p in row["parts"].items():
                    k=p["meshSha256"];n=p["vertices"];asset=p["asset"];whg=hz.read(asset["sha256"]+".whg")
                    require(len(whg)==asset["bytes"] and digest(whg)==asset["sha256"] and struct.unpack_from("<4sI",whg)==(b"WHG1",n),"head geometry identity")
                    m=decode_mesh(meshes[k]);a=m["attrs"];pos=f32(a[0]*[-1,1,1]);uv=f32(a[4])
                    require(len(a[0])==n and whg[16:16+n*12]==pos and whg[16+n*24:16+n*32]==uv,"original vertex order or UV0 mismatch")
                    target=(role,n,asset["sha256"]);require(k not in targets or targets[k]==target,"conflicting head identity");targets[k]=target
            b=bm["items"][sex];targets[b["meshSha256"]]=("body",b["vertices"],None)
            for k,(role,n,head_hash) in targets.items():
                a=decode_mesh(meshes[k])["attrs"]
                require(a[0].shape==(n,3) and a[2].shape==(n,4) and a[4].shape==(n,2) and np.isin(a[2][:,3],[-1,0,1]).all(),"source vertex layout")
                mask=sum(1<<i for i,d in CHANNELS if i in a);data=bytearray(struct.pack("<4sII",b"WSG1",n,mask))
                for i,d in CHANNELS:
                    if i not in a:continue
                    require(a[i].shape==(n,d) and np.isfinite(a[i]).all(),"invalid native channel")
                    data+=f32(a[i]);stats[str(i)]+=1
                data=bytes(data);key=digest(data);blobs[key]=data
                require(k not in rows,"duplicate mesh source")
                rows[k]={"body":sex,"role":role,"vertices":n,"headGeometrySha256":head_hash,"positionSha256":digest(f32(a[0]*[-1,1,1])),"uv0Sha256":digest(f32(a[4])),"channels":mask,"asset":{"sha256":key,"bytes":len(data)}}
    require(len(rows)==72 and len(blobs)==56 and stats=={"2":72,"3":44,"5":50,"6":1} and sum(r["vertices"] for r in rows.values())==55675,"source coverage")
    manifest={"schema":"wand.photo-mode.native-surface-geometry@1","gameVersion":"1.26.2","fullPoseVerified":False,"coordinateSpace":"UnityNative","sourcePins":PINS,"items":rows}
    with zipfile.ZipFile(out,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        z.writestr("surface-geometry.json",encode(manifest))
        for k,data in sorted(blobs.items()):z.writestr(k+".wsg",data)
    with zipfile.ZipFile(out) as z:require(z.testzip() is None and len(z.namelist())==57,"archive integrity")
    print(json.dumps({"meshes":len(rows),"assets":len(blobs),"channels":stats,"bytes":out.stat().st_size,"sha256":digest(out.read_bytes())}))
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    for k in ("male","female","head","body","out"):p.add_argument("--"+k,type=Path,required=True)
    a=p.parse_args();out=a.out.resolve();require(not any((x/".git").exists() for x in (out,*out.parents)),"private output outside Git")
    build({"male":a.male,"female":a.female},a.head,a.body,out)
