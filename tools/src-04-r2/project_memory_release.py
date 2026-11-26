#!/usr/bin/env python3
"""Project a receipt-verified native memory index to a compact public JSON.
No R2 calls, new image generation, private source paths or saved piece states.
"""
import argparse
import json
import re
from pathlib import Path

SHA=re.compile(r"[0-9a-f]{64}")
GUID=re.compile(r"[0-9a-f]{32}")
BUCKET="dreamwishwand-media"


def require(ok,message):
    if not ok:
        raise ValueError(message)


def project(index,receipt,version="1.26.2"):
    require(index.get("schema")=="wand.media.memory-index@2" and index.get("gameVersion")==version
            and index.get("thumbnailPolicy")=="lossless-webp-lanczos-512-v1"
            and index.get("maxThumbnailLongEdge")==512 and index.get("pieceBitMappingVerified") is False,
            "Unexpected candidate identity")
    require(receipt.get("schema")=="wand.media.memory-publication-receipt@1" and receipt.get("bucket")==BUCKET
            and receipt.get("canonicalMetadataVerified") is True,"Verified public R2 receipt required")
    images=index["images"]; refs=index["references"]; rows=index["items"]
    require(isinstance(images,dict) and isinstance(refs,dict) and isinstance(rows,dict) and rows,"Empty candidate")
    expected={}
    for sha,v in images.items():
        require(SHA.fullmatch(sha) and v["sha256"]==sha and
                all(type(v[k]) is int and v[k]>0 for k in ("width","height","bytes"))
                and max(v["width"],v["height"])<=16384,"Invalid image")
        expected["images/"+sha+".webp"]=v["bytes"]
    require(receipt["objects"]==expected,"Receipt/index mismatch")
    if version=="1.26.2":
        require(len(rows)==472 and len(refs)==291,"Reviewed native coverage mismatch")
    used=set(); used_refs=set(); result={}
    for item,row in rows.items():
        require(str(int(item))==item and 0<int(item)<=2**53-1 and isinstance(row,list) and len(row)==3,"Invalid Item ID")
        image,mask,n=row
        require(GUID.fullmatch(image) and GUID.fullmatch(mask) and image!=mask and type(n) is int and n>0,"Invalid memory refs")
        require(set(refs[image])=={"Image","Thumbnail"} and set(refs[mask])=={"Mask","Outline"},"Invalid memory roles")
        original,thumb,mask_sha,outline=(refs[image]["Image"],refs[image]["Thumbnail"],refs[mask]["Mask"],refs[mask]["Outline"])
        used_refs.update((image,mask));used.update((original,thumb,mask_sha,outline))
        o,t=images[original],images[thumb]
        require(t["width"]<=o["width"] and t["height"]<=o["height"] and max(t["width"],t["height"])<=512
                and (thumb==original if max(o["width"],o["height"])<=512 else max(t["width"],t["height"])==512),
                "Thumbnail policy mismatch")
        require(mask_sha in images and outline in images,"Missing mask/outline")
        result[item]=[original,thumb,mask_sha,outline,n]
    require(used==set(images) and used_refs==set(refs),"Unreferenced candidate assets")
    return {"schema":"wand.media.memory-release@1","state":"published","gameVersion":version,
            "canonicalMetadataVerified":True,"pieceBitMappingVerified":False,"items":result,
            "images":{sha:{k:v[k] for k in ("bytes","width","height")} for sha,v in images.items()}}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--version",default="1.26.2")
    a=p.parse_args()
    require(not a.out.exists(),"Output must not exist")
    result=project(json.loads((a.root/"memory-index-candidate.json").read_bytes()),
                   json.loads((a.root/"memory-publication-receipt.json").read_bytes()),a.version)
    a.out.write_text(json.dumps(result,sort_keys=True,separators=(",",":"))+"\n",encoding="utf-8")
    print(f"Verified {len(result['items'])} native Memory IDs and {len(result['images'])} images.")
if __name__=="__main__":
    main()
