#!/usr/bin/env python3
"""Prepare a sanitized SRC-04 public media catalog candidate, never publish it.

Requires the *completed* owner-side private R2 transfer report and the exact
Steam v1.26.2 private v2 index. Generates two separate local outputs:
  - distribution-candidate/: safe public-facing index (NOT activated)
  - private-promotion-plan.json: sensitive R2 source→target mapping (NEVER publish)
This tool creates no bucket, external URL, DNS, R2 write or release flag.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from plan_public_upload import image_key
import shutil
import tempfile
from collections import Counter
from pathlib import Path

from stage_media_v2 import (collect, digest_file, DEFAULT_OUT, EXPECTED_ITEMS,
                            EXPECTED_GUIDS, SOURCE_ITEMS_SHA)

PRIVATE_BUCKET = "dreamwishwand-media-private"
MANIFEST_SHA = "fd2d07d541293a19ac7b845e996ccf4e3af41270c79daaa56b2ff74316a45e9f"
SOURCE_PREFIX = "private/staging/src04/steam-v1.26.2/" + MANIFEST_SHA[:16]
GAME_VERSION = "steam-v1.26.2"
SHA = re.compile(r"^[0-9a-f]{64}$")


def require(ok, code):
    if not ok:
        raise ValueError("SRC04_DISTRIBUTION_" + code)


def payload(obj):
    return (json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf8")


def save(root, name, obj):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = payload(obj)
    path.write_bytes(raw)
    return {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}


def approved_local_stage(root):
    """Do not prepare distribution if the private upload was not completed."""
    report_path = root / "src04-r2-stage-report.json"
    require(report_path.is_file(), "STAGING_REPORT_MISSING")
    report = json.loads(report_path.read_bytes())
    remote = report.get("remote") or {}
    audit = report.get("localAudit") or {}
    require(report.get("schema") == "wand.src04.r2-stage@1" and
            report.get("complete") is True and
            report.get("status") == "private_staging_uploaded" and
            report.get("publicationApproved") is False and
            report.get("uploadedToPublic") is False and
            report.get("manifestSha256") == MANIFEST_SHA and
            report.get("itemCount") == EXPECTED_ITEMS and
            report.get("guidCount") == EXPECTED_GUIDS and
            report.get("shardsVerified") == 256 and
            audit.get("filesVerified") == 19054 and
            remote.get("mode") == "private-staging-upload" and
            remote.get("bucket") == PRIVATE_BUCKET and
            remote.get("prefix") == SOURCE_PREFIX and
            remote.get("totalVerified") == 19054,
            "PRIVATE_UPLOAD_NOT_VERIFIED")
    manifest_sha, index, summary = collect(root)
    require(manifest_sha == MANIFEST_SHA and len(index) == 19054,
            "PRIVATE_INDEX_CHANGED")
    require(summary["itemCount"] == EXPECTED_ITEMS and
            summary["guidCount"] == EXPECTED_GUIDS, "COVERAGE_CHANGED")
    return index


def prepare(root, verified_images, public_root, promotion_root):
    """Generates only a candidate; public records never include source Unity IDs."""
    require(not public_root.exists(), "PUBLIC_CANDIDATE_ALREADY_EXISTS")
    require(not promotion_root.exists(), "PRIVATE_PROMOTION_ALREADY_EXISTS")
    private_root = root / "private-media-overlay-v2-latest"
    index_manifest = json.loads((private_root / "manifest.json").read_bytes())
    shard_info = {}
    promotions = {}
    total_items = 0
    guid_images = {}
    # Build into temporary folder; never confuse partial output with a release.
    temp = Path(tempfile.mkdtemp(prefix="src04-distribution-", dir=public_root.parent))
    try:
        candidate = temp / "distribution-candidate"
        for bucket_num in range(256):
            bucket = f"{bucket_num:02x}"
            rel = f"id/{bucket}.json"
            source = private_root / rel
            expected = index_manifest["files"][rel]
            source_bytes = source.read_bytes()
            require(hashlib.sha256(source_bytes).hexdigest() == expected["sha256"] and
                    len(source_bytes) == expected["bytes"], "PRIVATE_SHARD_CHANGED")
            source_rows = json.loads(source_bytes)["rows"]
            records = []
            for item in source_rows:
                item_id = item["itemId"]
                require(type(item_id) is int and item_id & 255 == bucket_num,
                        "ITEM_BUCKET_MISMATCH")
                image = item["image"]
                guid = item["iconGuid"]
                identity = (image["unityAssetId"], image["decodedSha256"])
                if guid in guid_images:
                    require(guid_images[guid] == identity, "GUID_IMAGE_CHANGED")
                guid_images[guid] = identity
                clean = {"id": item_id}
                for kind in ("thumbnail", "original"):
                    v = image[kind]
                    src = v["path"]
                    content_sha = v["sha256"]
                    require(isinstance(content_sha, str) and SHA.fullmatch(content_sha) and
                            src in verified_images, "UNKNOWN_SOURCE_IMAGE")
                    expected_sha, expected_bytes, width, height, expected_kind = verified_images[src]
                    require(expected_kind == kind and expected_sha == content_sha and
                            expected_bytes == v["bytes"] and
                            (width, height) == (v["width"], v["height"]),
                            "IMAGE_NOT_VERIFIED")
                    public_key = image_key(content_sha)
                    clean[kind] = {"key": public_key, "width": width, "height": height}
                    mapping = {"source": SOURCE_PREFIX + "/" + src,
                               "target": public_key, "sha256": content_sha,
                               "bytes": expected_bytes}
                    existing = promotions.get(public_key)
                    # Two distinct Unity paths can contain byte-for-byte identical WebP.
                    if existing:
                        require(existing["sha256"] == content_sha and
                                existing["bytes"] == expected_bytes, "HASH_COLLISION")
                    else:
                        promotions[public_key] = mapping
                records.append(clean)
            total_items += len(records)
            shard_info[rel] = {"count": len(records),
                               **save(candidate, rel, {
                                   "schema": "wand.media.distribution-shard@1",
                                   "bucket": bucket, "items": records})}
        require(total_items == EXPECTED_ITEMS and len(guid_images) == EXPECTED_GUIDS,
                "FINAL_COVERAGE")
        public_catalog = {
            "schema": "wand.media.distribution-candidate@1",
            "gameVersion": GAME_VERSION,
            "releaseState": "candidate_unpublished",
            "bucketCount": 256,
            "totalItems": total_items,
            "files": shard_info,
            "cachePolicy": "immutable_content_addressed_media"
        }
        manifest_meta = save(candidate, "manifest.json", public_catalog)
        # Strict separation: this plan MUST NOT be copied into public_root.
        private_plan = {
            "schema": "wand.media.private-promotion-plan@1",
            "publicationAuthorized": False,
            "sourceBucket": PRIVATE_BUCKET,
            "sourceManifestSha256": MANIFEST_SHA,
            "targetRelease": GAME_VERSION,
            "objects": sorted(promotions.values(), key=lambda x: x["target"])
        }
        plan_bytes = payload(private_plan)
        temp_plan = temp / "private-promotion-plan.json"
        temp_plan.write_bytes(plan_bytes)
        report = {
            "schema": "wand.media.distribution-candidate-report@1",
            "status": "candidate_built_not_published",
            "publicItems": total_items,
            "uniquePublicObjects": len(promotions),
            "publicShards": 256,
            "publicManifestSha256": manifest_meta["sha256"],
            "privatePlanSha256": hashlib.sha256(plan_bytes).hexdigest(),
            "sourceManifestSha256": MANIFEST_SHA,
            "uploadedToPublic": False,
            "publicationAuthorized": False
        }
        save(temp, "distribution-candidate-report.json", report)
        for path in candidate.rglob("*.json"):
            content = path.read_bytes()
            for marker in (b"unity:", b"iconGuid", b"decodedSha256",
                           b"sourceBundle", b"private/", b"textureAssetId"):
                require(marker not in content, "PRIVATE_PROVENANCE_LEAK")
        candidate.rename(public_root)
        temp_plan.rename(promotion_root)
        (temp / "distribution-candidate-report.json").rename(root / "src04-distribution-candidate-report.json")
        return report
    finally:
        shutil.rmtree(temp, ignore_errors=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT,
                        help="Existing SRC-04 local output root")
    args = parser.parse_args(argv)
    root = args.out.resolve()
    require(root.is_dir(), "LOCAL_SOURCE_MISSING")
    verified = approved_local_stage(root)
    report = prepare(root, verified, root / "distribution-candidate",
                     root / "src04-private-promotion-plan.json")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
