#!/usr/bin/env python3
"""Single-inventory original map publication. Reuse public, local, then native sources."""
import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from bundle_thumbnails import image_info, write_json
from publish_bundle_thumbnails import BUCKET, check, key, census, publish
from publish_world_map_parts import prepare, split, activate
from recover_world_map_parts import source_rows, recover_local, extract_missing
from recover_public_map_parts import recover_public, recover_ocean, ocean_rows

def client():
    account=os.getenv("R2_ACCOUNT_ID","")
    check(re.fullmatch(r"[a-f0-9]{32}",account) and os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"),"R2 credentials required")
    import boto3
    from botocore.config import Config
    s3=boto3.client("s3",region_name="auto",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        config=Config(retries={"total_max_attempts":1},connect_timeout=10,read_timeout=30,max_pool_connections=8))
    check("IfNoneMatch" in s3.meta.service_model.operation_model("PutObject").input_shape.members,"Conditional PUT required")
    return s3

def collect_ocean(rows,root):
    assets,paths={},{}
    for row in rows:
        t=row["texture"]
        p=(root/row["imagePath"]).resolve()
        check(p.is_relative_to(root) and p.is_file(),"Missing SDF original")
        meta=image_info(p.read_bytes(),t["sha256"])
        check(all(meta[k]==t[k] for k in ("bytes","width","height")),"SDF metadata mismatch")
        k=key(t["sha256"]);assets[k]=meta;paths[k]=p
    return assets,paths

def run(report_path,ocean_path,root,out,search,aa,r2,max_objects,max_bytes):
    root=root.resolve();out=out.resolve()
    check(not any((p/".git").exists() for p in [root,*root.parents,out,*out.parents]) and
          root!=out and not out.is_relative_to(root/"images"),"Private work directory required")
    raw=report_path.read_bytes()
    report=json.loads(raw)
    ocean=json.loads(ocean_path.read_bytes())
    normal=source_rows(report)
    ocean_targets=ocean_rows(ocean)
    check(len({r["imageSha256"] for r in normal+ocean_targets})==116,"Unexpected overlapping source hashes")
    root.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
    pending=recover_local(normal+ocean_targets,search,root)
    s3=None;canonical={};pages=0
    stats={"getRequests":0,"downloadBytes":0}
    if r2:
        s3=client()
        _,canonical,pages,legacy=census(s3)
        pending,stats=recover_public(s3,list(pending.values()),root,canonical,legacy)
    missing_normal={r["imageSha256"]:r for r in normal if r["imageSha256"] in pending}
    missing_ocean=[r for r in ocean_targets if r["imageSha256"] in pending]
    if missing_normal:
        check(aa is not None,"Missing normal originals after local/public recovery; matching Steam 1.26.2 required")
        extract_missing(aa.resolve(),missing_normal,root)
    if missing_ocean and aa:
        try:
            recover_ocean(aa.resolve(),missing_ocean,root)
        except Exception as exc:
            print("SDF recovery incomplete:",str(exc)[:250],flush=True)
    candidate,assets,paths=prepare(report,root)
    ocean_assets,ocean_paths={},{}
    try:
        ocean_assets,ocean_paths=collect_ocean(ocean_targets,root)
    except (ValueError,OSError) as exc:
        print("SDF originals not complete; normal maps may continue.",str(exc)[:200],flush=True)
    combined={**assets,**ocean_assets}
    paths.update(ocean_paths)
    write_json(out/"world-map-parts-candidate.json",candidate)
    summary={"gameVersion":report["gameVersion"],"sourceReportSha256":hashlib.sha256(raw).hexdigest(),
        "maps":len(candidate["maps"]),"normalOriginals":len(assets),"sdfOriginals":len(ocean_assets),
        "generatedCompositeImages":0,"deleteRequests":0,"listRequests":pages,"publicRecovery":stats}
    if not r2:
        write_json(out/"world-map-parts-plan.json",summary)
        print(json.dumps(summary,indent=2));return
    existing,new=split(combined,canonical)
    total=sum(v["bytes"] for v in new.values())
    summary.update(existing=len(existing),newUploads=len(new),newBytes=total,
        classAUpperBound=pages+len(new),classBUpperBound=stats["getRequests"]+len(combined))
    write_json(out/"world-map-parts-plan.json",summary)
    print(json.dumps(summary,indent=2),flush=True)
    check(len(new)<=max_objects and total<=max_bytes,"Explicit upload budget exceeded; plan saved")
    if input("Confirm account-wide remaining free allowance. Type UPLOAD: ")!="UPLOAD":
        return
    with tempfile.TemporaryDirectory(dir=out) as temp:
        stage=Path(temp)
        for k in new:
            p=stage/k;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(paths[k],p)
        receipt=publish(s3,stage,existing,new)
    normal_receipt={k:receipt[k] for k in assets}
    release=activate(candidate,assets,normal_receipt)
    write_json(out/"world-map-parts-release.json",release)
    write_json(out/"world-map-parts-receipt.json",{"schema":"wand.media.world-map-parts-receipt@1","bucket":BUCKET,
        "sourceReportSha256":summary["sourceReportSha256"],"canonicalMetadataVerified":True,"cdnVerified":False,"objects":normal_receipt})
    if ocean_assets:
        write_json(out/"world-map-ocean-originals-receipt.json",{"schema":"wand.media.ocean-originals-receipt@1",
            "gameVersion":"1.26.2","bucket":BUCKET,"canonicalMetadataVerified":True,"cdnVerified":False,
            "referenceComparisonVerified":False,"objects":{k:receipt[k] for k in ocean_assets},
            "images":{v["sha256"]:{n:v[n] for n in ("width","height","bytes")} for v in ocean_assets.values()}})
    print("Publication reports:",out,flush=True)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--report",type=Path,required=True)
    p.add_argument("--ocean",type=Path,required=True)
    p.add_argument("--root",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--search",type=Path,action="append",default=[])
    p.add_argument("--aa",type=Path)
    p.add_argument("--r2",action="store_true")
    p.add_argument("--max-new-objects",type=int,default=0)
    p.add_argument("--max-new-bytes",type=int,default=0)
    a=p.parse_args()
    run(a.report,a.ocean,a.root,a.out,a.search,a.aa,a.r2,a.max_new_objects,a.max_new_bytes)

if __name__=="__main__":
    main()
