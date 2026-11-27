#!/usr/bin/env python3
"""Verify existing native map parts and publish only missing original WebP objects."""
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import tempfile
from pathlib import Path
from bundle_thumbnails import image_info, write_json
from publish_bundle_thumbnails import BUCKET, check, key, census, publish

SOURCE = re.compile(r"images/maps/original/([a-f0-9]{2})/([a-f0-9]{64})\.webp")
ID = re.compile(r"[A-Za-z0-9_]{1,128}")
SCHEMAS = {"wand.src04.world-map-composition@2", "wand.src04.world-map-repair@3"}
EVIDENCE = "observed_guid_field_exact_catalog_internal_id_container_pptr"

def size(v):
    return type(v) is int and 0 < v <= 32768

def prepare(report, root):
    root = root.resolve()
    check(report.get("schema") in SCHEMAS and
          re.fullmatch(r"\d+\.\d+\.\d+", report.get("gameVersion", "")) and
          report.get("publicationAuthorized") is False, "Unexpected source report")
    worlds = report["worlds"]
    check(isinstance(worlds, list) and 0 < len(worlds) <= 128, "Invalid maps")
    maps, assets, paths, seen = [], {}, {}, set()
    for w in worlds:
        ident, world = w["prefab"], w["worldCandidate"]
        check(ID.fullmatch(ident) and ID.fullmatch(world) and ident not in seen and
              size(w["width"]) and size(w["height"]) and w["width"]*w["height"] <= 200_000_000 and
              w["worldPlacementVerified"] is False, "Invalid map identity")
        seen.add(ident)
        check(isinstance(w["parts"], list) and 0 < len(w["parts"]) <= 512 and
              w.get("allExpectedNamesPresent") is not False and not w.get("missingExpectedNames"), "Incomplete map parts")
        rows = []
        for p in w["parts"]:
            match = SOURCE.fullmatch(p["imagePath"])
            check(match and match[1] == match[2][:2], "Invalid source path")
            sha = p["imageSha256"]
            k = key(sha)
            matrix = p["imageToCanvas"]
            evidence = p["layoutEvidence"]
            check(evidence.get("componentEnabled") is True and evidence.get("mapping") == EVIDENCE and
                  p.get("renderMode") in {"native_pixel_copy", "affine_resample_no_downscale"} and
                  isinstance(matrix, list) and len(matrix) == 6 and
                  all(type(v) in (int, float) and math.isfinite(v) and abs(v) <= 1e7 for v in matrix) and
                  abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]) > 1e-8, "Invalid native placement")
            path = (root / p["imagePath"]).resolve()
            check(path.is_relative_to(root) and path.is_file(), "Missing original: "+p["imagePath"])
            if k not in paths or paths[k] != path:
                check(20 <= path.stat().st_size <= 80*1024*1024, "Invalid original size")
                meta = image_info(path.read_bytes(), sha)
                check(size(meta["width"]) and size(meta["height"]) and meta["width"]*meta["height"] <= 100_000_000,
                      "Invalid original dimensions")
                check(k not in assets or assets[k] == meta, "Original metadata conflict")
                assets[k], paths[k] = meta, path
            rows.append([sha, matrix])
        status = w["status"]
        check(isinstance(status, str) and 0 < len(status) <= 128, "Missing map review status")
        maps.append({"id": ident, "worldCandidate": world, "width": w["width"], "height": w["height"],
                     "oceanMissing": status == "incomplete_ocean_not_rendered",
                     "visualReviewRequired": status != "owner_preliminary_visual_review_no_issue_reported",
                     "worldPlacementVerified": False, "parts": rows})
    candidate = {"schema": "wand.media.world-map-parts@1", "gameVersion": report["gameVersion"],
                 "state": "unpublished", "canonicalMetadataVerified": False, "maps": maps,
                 "images": {v["sha256"]: {k:v[k] for k in ("width","height","bytes")} for v in assets.values()}}
    return candidate, assets, paths

def split(assets, canonical):
    existing, pending = {}, {}
    for k, v in assets.items():
        if k in canonical:
            check(canonical[k] == v["bytes"], "Canonical size conflict: "+k)
            existing[k] = v
        else:
            pending[k] = v
    return existing, pending

def activate(candidate, assets, receipt):
    check(candidate["state"] == "unpublished" and candidate["canonicalMetadataVerified"] is False and
          receipt == {k:v["bytes"] for k,v in assets.items()}, "Incomplete canonical receipt")
    return {**candidate, "state":"published", "canonicalMetadataVerified":True}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--report", type=Path, required=True)
    p.add_argument("--source-root", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--r2", action="store_true")
    p.add_argument("--max-new-objects", type=int, default=0)
    p.add_argument("--max-new-bytes", type=int, default=0)
    a = p.parse_args()
    out = a.out.resolve()
    check(not any((x/".git").exists() for x in [out,*out.parents]), "Private work directory required")
    check(out != a.source_root.resolve() and not out.is_relative_to(a.source_root.resolve()/"images"), "Output overlaps source")
    out.mkdir(parents=True, exist_ok=True)
    raw = a.report.read_bytes()
    candidate, assets, paths = prepare(json.loads(raw), a.source_root)
    write_json(out/"world-map-parts-candidate.json", candidate)
    summary = {"gameVersion":candidate["gameVersion"], "sourceReportSha256":hashlib.sha256(raw).hexdigest(),
               "maps":len(candidate["maps"]), "uniqueOriginals":len(assets),
               "totalBytes":sum(v["bytes"] for v in assets.values()), "generatedImages":0, "deleteRequests":0}
    if not a.r2:
        print(json.dumps(summary, indent=2))
        return
    account = os.getenv("R2_ACCOUNT_ID", "")
    check(re.fullmatch(r"[0-9a-f]{32}", account) and os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"), "R2 credentials required")
    import boto3
    from botocore.config import Config
    s3 = boto3.client("s3", region_name="auto", endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                      config=Config(retries={"total_max_attempts":1}, connect_timeout=10, read_timeout=30, max_pool_connections=8))
    check("IfNoneMatch" in s3.meta.service_model.operation_model("PutObject").input_shape.members, "Conditional PUT required")
    _, canonical, pages, _ = census(s3)
    existing, pending = split(assets, canonical)
    new_bytes = sum(v["bytes"] for v in pending.values())
    summary.update(existing=len(existing), newUploads=len(pending), newBytes=new_bytes,
                   listRequests=pages, classAUpperBound=pages+len(pending), classBUpperBound=len(assets))
    write_json(out/"world-map-parts-plan.json", summary)
    print(json.dumps(summary, indent=2), flush=True)
    check(0 <= len(pending) <= a.max_new_objects and 0 <= new_bytes <= a.max_new_bytes, "Explicit upload budget exceeded; read-only plan saved")
    if input("Confirm account-wide remaining free allowance. Type UPLOAD: ") != "UPLOAD":
        return
    # Stage only missing originals, unchanged; existing canonical objects are never copied or overwritten.
    with tempfile.TemporaryDirectory(dir=out) as work:
        stage = Path(work)
        for k in pending:
            target = stage/k
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(paths[k], target)
        receipt = publish(s3, stage, existing, pending)
    release = activate(candidate, assets, receipt)
    write_json(out/"world-map-parts-receipt.json", {"schema":"wand.media.world-map-parts-receipt@1",
               "bucket":BUCKET, "sourceReportSha256":summary["sourceReportSha256"],
               "canonicalMetadataVerified":True, "cdnVerified":False, "objects":receipt})
    write_json(out/"world-map-parts-release.json", release)
    print("Return the receipt and release JSON; actual visual and Grid alignment remain unverified.")

if __name__ == "__main__":
    main()
