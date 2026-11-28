"""Convert the private, pinned export_photo_expressions output into normal-mask assets."""
import argparse,json,zipfile
from pathlib import Path
from resolve_animation_bundle import digest
from pose_curves import require
from export_photo_expressions import PINS,NAMES
from export_expression_weights import PARAMS,scalar
from zlib import crc32
def encode(x):return json.dumps(x,separators=(",",":"),sort_keys=True,allow_nan=False).encode()
def build(source,out):
    require(source["schema"]=="wand.photo-mode.private-native-expressions@1" and source["gameVersion"]=="1.26.2" and source["sourcePins"]==PINS and source["publicationAuthorized"] is False,"private source identity")
    m={"schema":"wand.photo-mode.face-layers@1","gameVersion":"1.26.2","fullPoseVerified":False,"mask":"Avatar_Face_Mask","sourcePins":PINS,"bodies":{}};blobs={}
    for b in ("male","female"):
        rows=[]
        for i,n in enumerate(NAMES[:7]):
            require(source["states"][str(i)]["clipName"]==n,"native state identity")
            row=source["bodies"][b]["clips"][n];c=row["source"];tracks=[]
            for t in row["mappedFaceBindings"]:
                if t["normalWeight"]!=1:continue
                tracks.append({"path":t["path"],"attribute":t["attribute"],"curves":[scalar(c,t["offset"]+k) for k in range(t["dimensions"])]})
            require(len(tracks)==(115 if b=="female" else 96),"mapped face count")
            params={}
            if b=="female":
                hashes={crc32(x.encode()):x for x in PARAMS}
                for t in c["bindings"]:
                    if t["classId"]==95 and t["customType"]==0 and t["pathHash"]==0 and t["attribute"] in hashes:
                        k=hashes[t["attribute"]];require(k not in params and t["dimensions"]==1 and t["pointer"]==t["integer"]==0,"parameter layout");params[k]=scalar(c,t["offset"])
                require(set(params)==set(PARAMS),"parameter coverage")
            v={"body":b,"number":i,"name":n,"sourceSha256":c["sha256"],"start":c["start"],"duration":c["end"]-c["start"],"loop":c["loop"],"tracks":tracks,"parameters":params}
            data=encode(v);key=digest(data);blobs[key+".wfl"]=data;rows.append({"sourceSha256":c["sha256"],"asset":{"sha256":key,"bytes":len(data)}})
        m["bodies"][b]=rows
    out=out.resolve();require(not any((p/".git").exists() for p in (out,*out.parents)),"derived output outside Git")
    with zipfile.ZipFile(out,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        z.writestr("face-layers.json",encode(m))
        for name,data in sorted(blobs.items()):z.writestr(name,data)
    with zipfile.ZipFile(out) as z:require(z.testzip() is None,"archive CRC")
    print(out.stat().st_size,digest(out.read_bytes()))
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--source",type=Path,required=True);p.add_argument("--out",type=Path,required=True);a=p.parse_args();build(json.loads(a.source.read_bytes()),a.out)
