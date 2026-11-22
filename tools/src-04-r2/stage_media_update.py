#!/usr/bin/env python3
"""SRC-04 future-version private R2 delta staging (never public).

SHA-identical WebP objects in the previous verified private R2 release are
reused by reference. Only new encoded WebP bytes are uploaded to a private,
manifest-pinned per-version prefix; a private source-key map preserves the
references for the next release or for a separately approved public exporter.
No bucket creation, ACL, publication, DNS, deletion or automatic upload.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from stage_media_v2 import (collect, audit, ensure_inside, r2_client,
                            list_stage, save_report, digest_file)
from plan_media_update import read_scan, require

SCHEMA = "wand.src04.r2-update-stage@1"
MAP_SCHEMA = "wand.src04.r2-source-map@1"
PRIVATE_BUCKET = "dreamwishwand-media-private"
DEFAULT_ACCOUNT = os.getenv("R2_ACCOUNT_ID")
SOURCE_MAP_NAME = "src04-r2-source-map-private.json"
REPORT_NAME = "src04-r2-update-report.json"
V1262_OVERLAY_SHA = "fd2d07d541293a19ac7b845e996ccf4e3af41270c79daaa56b2ff74316a45e9f"
V1262_STAGE_PREFIX = "private/staging/src04/steam-v1.26.2/" + V1262_OVERLAY_SHA[:16]
VERSION = re.compile(r"^\d+\.\d+\.\d+(?:\.\d+)?$")


def validated_prior_map(root, prior_files, prior_sha, prior_version):
    """Trust only a completed prior private upload, never an unuploaded plan."""
    source_map_path = root / SOURCE_MAP_NAME
    if source_map_path.is_file():
        obj = json.loads(source_map_path.read_bytes())
        require(obj.get("schema") == MAP_SCHEMA and
                obj.get("status") == "private_sources_available" and
                obj.get("privateOnly") is True and
                obj.get("publicationApproved") is False and
                obj.get("sourceOverlayManifestSha256") == prior_sha and
                obj.get("gameVersion") == prior_version and
                obj.get("bucket") == PRIVATE_BUCKET and
                isinstance(obj.get("objects"),list), "BAD_PRIOR_SOURCE_MAP")
        stage_report_path=root/REPORT_NAME
        require(stage_report_path.is_file(), "PRIOR_DELTA_REPORT_MISSING")
        staged=json.loads(stage_report_path.read_bytes())
        require(staged.get("complete") is True and
                staged.get("status")=="private_delta_uploaded" and
                staged.get("newManifestSha256")==prior_sha and
                staged.get("remote",{}).get("bucket")==PRIVATE_BUCKET and
                staged.get("remote",{}).get("totalNewVerified")==
                staged.get("newUniqueUploads"), "PRIOR_DELTA_NOT_CONFIRMED")
        mapping={}
        for item in obj["objects"]:
            rel=item["path"]
            require(rel in prior_files and rel not in mapping and
                    item.get("sha256") == prior_files[rel][0] and
                    item.get("bytes") == prior_files[rel][1] and
                    isinstance(item.get("remoteKey"),str) and
                    item["remoteKey"].startswith("private/staging/src04/"),
                    "PRIOR_SOURCE_MAP_ENTRY")
            mapping[rel]=item["remoteKey"]
        require(set(mapping)==set(prior_files), "PRIOR_SOURCE_MAP_COVERAGE")
        return mapping
    report_path = root / "src04-r2-stage-report.json"
    require(report_path.is_file(), "PRIOR_STAGING_EVIDENCE_MISSING")
    doc=json.loads(report_path.read_bytes())
    remote=doc.get("remote") or {}
    require(prior_version=="1.26.2" and
            prior_sha==V1262_OVERLAY_SHA and
            doc.get("schema") == "wand.src04.r2-stage@1" and
            doc.get("complete") is True and
            doc.get("status")=="private_staging_uploaded" and
            doc.get("publicationApproved") is False and
            doc.get("uploadedToPublic") is False and
            remote.get("bucket")==PRIVATE_BUCKET and
            remote.get("prefix")==V1262_STAGE_PREFIX and
            remote.get("totalVerified")==len(prior_files),
            "PRIOR_PRIVATE_UPLOAD_UNVERIFIED")
    return {rel:V1262_STAGE_PREFIX+"/"+rel for rel in prior_files}


def prepare(prior_root, next_root):
    prior_root=prior_root.resolve()
    next_root=next_root.resolve()
    require(prior_root!=next_root and
            prior_root not in next_root.parents and
            next_root not in prior_root.parents, "OVERLAPPING_VERSIONS")
    prior_scan=read_scan(prior_root/"source-manifest.json")
    next_scan=read_scan(next_root/"source-manifest.json")
    require(prior_scan["version"]!=next_scan["version"],"SAME_VERSION")
    next_build_path=next_root/"src04-next-release-report.json"
    require(next_build_path.is_file(),"NEXT_V2_BUILD_REPORT_MISSING")
    built=json.loads(next_build_path.read_bytes())
    require(built.get("schema")=="wand.src04.update-build@1" and
            built.get("complete") is True and
            built.get("status")=="private_v2_built_not_uploaded" and
            built.get("publicationApproved") is False and
            built.get("sourceFilesModified") is False and
            built.get("gameVersion")==next_scan["version"],
            "NEW_V2_BUILD_NOT_VERIFIED")
    prior_items_hash=digest_file(prior_root/"source-items"/"items.jsonl")
    next_items_hash=digest_file(next_root/"source-items"/"items.jsonl")
    prior_items={r["itemId"] for r in
                 (json.loads(line) for line in
                  (prior_root/"source-items"/"items.jsonl").read_bytes().splitlines() if line)}
    prior_guids=set()
    for number in range(256):
        path=prior_root/"private-media-overlay-v2-latest"/"id"/f"{number:02x}.json"
        rows=json.loads(path.read_bytes())["rows"]
        prior_guids.update(row["iconGuid"] for row in rows)
    prior_sha,prior_files,prior_summary=collect(
        prior_root,expected_items=len(prior_items),
        expected_guids=len(prior_guids),source_sha=prior_items_hash)
    next_sha,next_files,next_summary=collect(
        next_root,expected_items=built["itemCount"],
        expected_guids=built["guidCount"],source_sha=next_items_hash)
    require(next_sha==built.get("privateOverlayManifestSha256") and
            next_scan["sha256"]==built.get("sourceScanSha256") and
            next_items_hash==built.get("sourceItemsSha256") and
            len(next_files)==built.get("distinctMediaFiles"),
            "NEW_INDEX_SOURCE_CHANGED")
    prior_remote=validated_prior_map(prior_root,prior_files,prior_sha,
                                      prior_scan["version"])
    require(VERSION.fullmatch(next_scan["version"]),"GAME_VERSION_INVALID")
    prefix="private/staging/src04/steam-v"+next_scan["version"]+"/"+next_sha[:16]
    by_sha={}
    for rel,(sha,size,*_) in sorted(prior_files.items()):
        key=(sha,size)
        by_sha.setdefault(key,prior_remote[rel])
    objects=[]
    to_upload={}
    origin_counts={"reusedPrior":0,"newEncoded":0}
    for rel,info in sorted(next_files.items()):
        sha,size=info[:2]
        key=(sha,size)
        previous=by_sha.get(key)
        if previous is not None:
            remote_key=previous
            origin_counts["reusedPrior"]+=1
        else:
            # Multiple new paths can share the same encoded WebP bytes.
            remote_key=to_upload.setdefault(key,
                {"path":rel,"remoteKey":prefix+"/"+rel,
                 "sha256":sha,"bytes":size})["remoteKey"]
            origin_counts["newEncoded"]+=1
        objects.append({"path":rel,"sha256":sha,"bytes":size,
                        "remoteKey":remote_key})
    require(len(objects)==len(next_files),"NEW_FILE_COVERAGE")
    candidate={
      "schema":MAP_SCHEMA,"status":"planned_not_uploaded",
      "privateOnly":True,"publicationApproved":False,
      "gameVersion":next_scan["version"],
      "sourceOverlayManifestSha256":next_sha,
      "sourceItemsSha256":next_items_hash,
      "bucket":PRIVATE_BUCKET,
      "objects":objects
    }
    return {"candidate":candidate,"uploadObjects":sorted(
            to_upload.values(),key=lambda x:x["remoteKey"]),
            "prefix":prefix,"summary":{
                "baseVersion":prior_scan["version"],
                "newVersion":next_scan["version"],
                "baseFileCount":len(prior_files),
                "newFileCount":len(next_files),
                "reusedPriorPaths":origin_counts["reusedPrior"],
                "newPaths":origin_counts["newEncoded"],
                "newUniqueUploads":len(to_upload),
                "newManifestSha256":next_sha
            }}


def sync_r2(client, plan, root, *, apply, jobs):
    prefix=plan["prefix"]
    expected=plan["uploadObjects"]
    known=list_stage(client,PRIVATE_BUCKET,prefix)
    targets=[]
    verified_existing=0
    for item in expected:
        key=item["remoteKey"]
        if key in known:
            require(known[key]==item["bytes"],"REMOTE_LENGTH_COLLISION")
            head=client.head_object(Bucket=PRIVATE_BUCKET,Key=key)
            require(head["ContentLength"]==item["bytes"] and
                    head.get("Metadata",{}).get("sha256")==item["sha256"] and
                    head.get("ContentType")=="image/webp",
                    "REMOTE_HASH_COLLISION")
            verified_existing+=1
        else:
            targets.append(item)
    result={"mode":"private-delta-upload" if apply else "remote-plan",
            "bucket":PRIVATE_BUCKET,"prefix":prefix,
            "alreadyVerified":verified_existing,
            "wouldUpload":len(targets),"newObjects":len(expected)}
    if not apply:
        return result
    def upload_one(item):
        source=ensure_inside(root,item["path"])
        require(source.stat().st_size==item["bytes"] and
                digest_file(source)==item["sha256"],"IMAGE_CHANGED_BEFORE_UPLOAD")
        with source.open("rb") as body:
            client.put_object(Bucket=PRIVATE_BUCKET,Key=item["remoteKey"],
                              Body=body,IfNoneMatch="*",
                              ContentType="image/webp",CacheControl="private, no-store",
                              Metadata={"sha256":item["sha256"],
                                        "src04-v2":"private-update-staging"})
        head=client.head_object(Bucket=PRIVATE_BUCKET,Key=item["remoteKey"])
        require(head.get("ContentLength")==item["bytes"] and
                head.get("Metadata",{}).get("sha256")==item["sha256"] and
                head.get("ContentType")=="image/webp",
                "UPLOADED_OBJECT_HEAD_MISMATCH")
    uploaded=0
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        tasks=[pool.submit(upload_one,item) for item in targets]
        for future in as_completed(tasks):
            future.result()
            uploaded+=1
    result["uploaded"]=uploaded
    result["totalNewVerified"]=verified_existing+uploaded
    require(result["totalNewVerified"]==len(expected),"INCOMPLETE_NEW_UPLOAD")
    return result


def run(args):
    require(args.jobs in range(1,9),"JOBS_OUT_OF_RANGE")
    require(not args.apply or args.confirm_private_bucket==
            "I_CONFIRM_THIS_BUCKET_IS_PRIVATE", "PRIVATE_BUCKET_CONFIRM_REQUIRED")
    require(not (args.apply and args.remote_plan),"CONFLICTING_MODES")
    planned=prepare(args.prior,args.next)
    root=args.next.resolve()
    report={"schema":SCHEMA,"privateOnly":True,
            "publicationApproved":False,"uploadedToPublic":False,
            "status":"local_plan_complete","complete":False,
            **planned["summary"]}
    # The next-version builder already checked every produced or reused
    # image, but repeat the full byte audit before any network operation.
    build_report=json.loads((root/"src04-next-release-report.json").read_bytes())
    _,new_files,_=collect(root,
         expected_items=build_report["itemCount"],
         expected_guids=build_report["guidCount"],
         source_sha=planned["candidate"]["sourceItemsSha256"])
    report["localAudit"]=audit(root,new_files)
    if args.remote_plan or args.apply:
        require(isinstance(args.account_id,str) and
                re.fullmatch(r"[a-f0-9]{32}",args.account_id),
                "ACCOUNT_ID_REQUIRED")
        client=r2_client(args.account_id)
        report["remote"]=sync_r2(client,planned,root,apply=args.apply,jobs=args.jobs)
        report["status"]="private_delta_uploaded" if args.apply else "remote_plan_complete"
    report["complete"]=True
    if args.apply:
        candidate=planned["candidate"]
        candidate["status"]="private_sources_available"
        # This file includes private R2 keys and MUST NOT enter public GitHub.
        save_report(root/SOURCE_MAP_NAME,candidate)
    save_report(root/REPORT_NAME,report)
    return report


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--prior",type=Path,required=True)
    p.add_argument("--next",type=Path,required=True)
    p.add_argument("--remote-plan",action="store_true")
    p.add_argument("--apply",action="store_true")
    p.add_argument("--confirm-private-bucket")
    p.add_argument("--account-id",default=DEFAULT_ACCOUNT)
    p.add_argument("--jobs",type=int,default=4)
    args=p.parse_args(argv)
    try:
        report=run(args)
    except (ValueError,OSError,KeyError,TypeError) as exc:
        p.exit(2,str(exc)+"\n")
    print(json.dumps(report,sort_keys=True,ensure_ascii=False,indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
