#!/usr/bin/env python3
"""SRC-04: SHA-verified v2 image audit and optional private Cloudflare R2 staging.

Safe default: audit LOCAL images only. No network, public URL, bucket
creation, ACL edits, deletion, CDN activation or automatic upload.
Requires operator-supplied R2 bucket and explicit --apply confirmation
before any objects are transferred to a pre-existing private bucket.

Standard library + Pillow for offline audit. boto3 only for R2 operations.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import re
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

MANIFEST_SCHEMA = "wand.src04.media-overlay-manifest@2"
SHARD_SCHEMA = "wand.src04.media-overlay-shard@2"
VARIANT_POLICY = "thumbnail_128_lossless_webp_plus_original_native_lossless_webp"
VARIANT_POLICY_256 = "thumbnail_256_lossless_webp_plus_original_native_lossless_webp"
EXPECTED_ITEMS = 13202
EXPECTED_GUIDS = 9542
SOURCE_ITEMS_SHA = "3ff0043692c88699d1cb44f4a953095c5f5fcd1afd700761396f13cca96851bf"
DEFAULT_OUT = Path.home() / "Documents" / "DreamwishWand" / "SRC-04 MEDIA" / "Steam-v1.26.2"
SHA_RE = re.compile(r"^[a-f0-9]{64}$")
GUID_RE = re.compile(r"^guid:[a-f0-9]{32}$")
PREFIX = "private/staging/src04/steam-v1.26.2"
REPORT_NAME = "src04-r2-stage-report.json"


def require(condition, code):
    if not condition:
        raise ValueError("SRC04_R2_" + code)


def digest_file(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def save_report(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def read_json(path):
    return json.loads(path.read_bytes())


def ensure_inside(root, rel):
    require(isinstance(rel, str) and rel.startswith("images-v2/"), "INVALID_LOCAL_PATH")
    require("\\" not in rel and ":" not in rel and "\x00" not in rel, "UNSAFE_LOCAL_PATH")
    parts = rel.split("/")
    require(all(s not in ("", ".", "..") for s in parts), "PATH_TRAVERSAL")
    path = root.joinpath(*parts)
    require(path.is_file() and not path.is_symlink(), "FILE_MISSING")
    require(path.resolve().is_relative_to(root.resolve()), "FILE_OUTSIDE_ROOT")
    return path


def webp_lossless_dimensions(path):
    """Parse RIFF and VP8L; independently check decoding/dimensions with Pillow."""
    data = path.read_bytes()
    require(len(data) >= 25 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
            "WEBP_INVALID_RIFF")
    require(int.from_bytes(data[4:8], "little") + 8 == len(data), "WEBP_RIFF_SIZE")
    pos = 12
    lossless_header = None
    lossy = False
    while pos < len(data):
        require(pos + 8 <= len(data), "WEBP_TRUNCATED_CHUNK")
        fourcc = data[pos:pos+4]
        length = int.from_bytes(data[pos+4:pos+8], "little")
        start = pos + 8
        end = start + length
        require(end <= len(data), "WEBP_CHUNK_SIZE")
        if fourcc in (b"VP8 ", b"ANIM", b"ANMF"):
            lossy = True
        if fourcc == b"VP8L":
            require(length >= 5 and data[start] == 0x2f, "WEBP_VP8L_SIGNATURE")
            require(lossless_header is None, "WEBP_MULTIPLE_VP8L")
            lossless_header = data[start+1:start+5]
        pos = end + (length & 1)
        require(pos <= len(data), "WEBP_PADDING")
    require(not lossy and lossless_header is not None, "WEBP_NOT_LOSSLESS")
    bits = int.from_bytes(lossless_header, "little")
    width = (bits & 0x3fff) + 1
    height = ((bits >> 14) & 0x3fff) + 1
    from PIL import Image
    with Image.open(path) as im:
        require(im.format == "WEBP" and im.n_frames == 1, "WEBP_PIL_FORMAT")
        im.load()
        require(im.size == (width, height), "WEBP_PIXELS_SIZE")
    return width, height


def collect(root, *, expected_items=EXPECTED_ITEMS, expected_guids=EXPECTED_GUIDS,
            source_sha=SOURCE_ITEMS_SHA, variant_policy=VARIANT_POLICY):
    """Read source + SHA-pinned v2 shards; return unique immutable image file refs."""
    require(variant_policy in (VARIANT_POLICY,VARIANT_POLICY_256),"UNKNOWN_VARIANT_POLICY")
    edge=256 if variant_policy==VARIANT_POLICY_256 else 128
    root = Path(root).resolve()
    input_items = root / "source-items" / "items.jsonl"
    require(input_items.is_file(), "SOURCE_ITEMS_MISSING")
    require(digest_file(input_items) == source_sha, "SOURCE_ITEMS_SHA_MISMATCH")
    native = {}
    for line in input_items.read_bytes().splitlines():
        if not line:
            continue
        item = json.loads(line)
        key = item["itemId"]
        require(type(key) is int and key not in native, "DUPLICATE_SOURCE_ID")
        require(isinstance(item.get("iconGuid"), str) and
                GUID_RE.fullmatch(item["iconGuid"]), "SOURCE_GUID")
        native[key] = item["iconGuid"]
    require(len(native) == expected_items, "SOURCE_ITEM_COUNT")

    index_dir = root / "private-media-overlay-v2-latest"
    manifest_path = index_dir / "manifest.json"
    require(manifest_path.is_file(), "MANIFEST_MISSING")
    manifest_sha = digest_file(manifest_path)
    manifest = read_json(manifest_path)
    require(manifest.get("schema") == MANIFEST_SCHEMA and
            manifest.get("bucketCount") == 256 and
            manifest.get("privateOnly") is True and
            manifest.get("publicationAuthorized") is False and
            manifest.get("imageByteVerification") is True,
            "MANIFEST_NOT_PRIVATE_V2")
    provenance = manifest.get("source", {})
    require(provenance.get("sourceItemsSha256") == source_sha and
            provenance.get("variantPolicy") == variant_policy,
            "MANIFEST_SOURCE_MISMATCH")
    coverage = manifest.get("coverage", {})
    require(coverage.get("verifiedItems") == expected_items and
            coverage.get("totalItems") == expected_items and
            coverage.get("verifiedGuids") == expected_guids and
            coverage.get("unresolvedItems") == 0 and
            coverage.get("unresolvedGuids") == 0, "MANIFEST_COVERAGE")
    index_files = manifest.get("files", {})
    require(isinstance(index_files, dict) and len(index_files) == 256,
            "MANIFEST_SHARD_COUNT")

    files = {}
    seen = set()
    guid_identity = {}
    for index in range(256):
        bucket = f"{index:02x}"
        shard_name = f"id/{bucket}.json"
        meta = index_files[shard_name]
        shard_path = index_dir / "id" / f"{bucket}.json"
        require(shard_path.is_file() and not shard_path.is_symlink(), "SHARD_MISSING")
        raw_bytes = shard_path.read_bytes()
        require(len(raw_bytes) == meta.get("bytes") and
                hashlib.sha256(raw_bytes).hexdigest() == meta.get("sha256"),
                "SHARD_SHA_OR_LENGTH")
        shard = json.loads(raw_bytes)
        rows = shard.get("rows", [])
        require(shard.get("schema") == SHARD_SCHEMA and shard.get("bucket") == bucket and
                len(rows) == meta.get("count") == meta.get("verified"),
                "SHARD_FORMAT")
        for row in rows:
            item_id = row["itemId"]
            guid = row["iconGuid"]
            require(type(item_id) is int and item_id & 255 == index and
                    item_id in native and item_id not in seen and
                    native[item_id] == guid and row.get("status") == "verified",
                    "ITEM_GUID_MISMATCH")
            seen.add(item_id)
            image = row["image"]
            pixel = image.get("decodedSha256")
            native_width = image.get("sourceWidth")
            native_height = image.get("sourceHeight")
            require(isinstance(pixel, str) and SHA_RE.fullmatch(pixel) and
                    type(native_width) is int and native_width > 0 and
                    type(native_height) is int and native_height > 0,
                    "IMAGE_IDENTITY")
            unit = image.get("unityAssetId", "")
            src_bundle = image.get("sourceBundleSha256")
            require(isinstance(unit, str) and isinstance(src_bundle, str) and
                    SHA_RE.fullmatch(src_bundle) and
                    unit.startswith(f"unity:{src_bundle}:") and
                    image.get("identityEvidence") ==
                    "exact_catalog_key_and_serialized_bundle_path_id",
                    "UNITY_SOURCE_IDENTITY")
            canonical = (unit, pixel, native_width, native_height)
            if guid in guid_identity:
                require(guid_identity[guid] == canonical, "GUID_SOURCE_COLLISION")
            guid_identity[guid] = canonical
            for kind in ("thumbnail", "original"):
                entry = image[kind]
                rel = entry["path"]
                expected_path = f"images-v2/{kind}/{pixel[:2]}/{pixel}.webp"
                require(rel == expected_path, "VARIANT_PATH_IDENTITY")
                require(type(entry.get("width")) is int and
                        type(entry.get("height")) is int and
                        type(entry.get("bytes")) is int and
                        entry["bytes"] > 0 and entry["width"] > 0 and
                        entry["height"] > 0 and
                        isinstance(entry.get("sha256"), str) and
                        SHA_RE.fullmatch(entry["sha256"]),
                        "VARIANT_METADATA")
                if kind == "original":
                    require((entry["width"], entry["height"]) ==
                            (native_width, native_height), "ORIGINAL_DIMENSIONS")
                else:
                    require(entry["width"] <= min(edge, native_width) and
                            entry["height"] <= min(edge, native_height),
                            "THUMBNAIL_DIMENSIONS")
                    if variant_policy==VARIANT_POLICY_256:
                        if max(native_width,native_height)<=edge:
                            require(all(entry[k]==image["original"][k] for k in ("sha256","bytes","width","height")),"SMALL_ORIGINAL_NOT_REUSED")
                        else:
                            require(max(entry["width"],entry["height"])==edge,"THUMBNAIL_LONG_EDGE")
                record = (entry["sha256"], entry["bytes"],
                          entry["width"], entry["height"], kind)
                if rel in files:
                    require(files[rel] == record, "DUPLICATE_PATH_CONFLICT")
                files[rel] = record
    require(len(seen) == expected_items and len(guid_identity) == expected_guids,
            "SOURCE_CORPUS_MISMATCH")
    return manifest_sha, files, {
        "itemCount": len(seen), "guidCount": len(guid_identity),
        "shardsVerified": 256, "sourceItemsSha256": source_sha,
    }


def audit(root, files, *, progress=1000):
    counts = collections.Counter()
    bytes_total = 0
    for number, (rel, (sha, size, width, height, kind)) in enumerate(sorted(files.items()), 1):
        file_path = ensure_inside(root, rel)
        require(file_path.stat().st_size == size, "IMAGE_BYTE_LENGTH")
        require(digest_file(file_path) == sha, "IMAGE_SHA_MISMATCH")
        require(webp_lossless_dimensions(file_path) == (width, height),
                "IMAGE_WEBP_DIMENSIONS")
        counts[kind] += 1
        bytes_total += size
        if progress and number % progress == 0:
            print(f"local verified {number}/{len(files)}", flush=True)
    return {"filesVerified": len(files), "totalBytes": bytes_total,
            "thumbnailCount": counts["thumbnail"], "originalCount": counts["original"]}


def r2_client(account_id):
    require(re.fullmatch(r"[0-9a-f]{32}", account_id or "") is not None,
            "ACCOUNT_ID_REQUIRED")
    require(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"),
            "R2_CREDENTIALS_REQUIRED")
    import boto3
    return boto3.client("s3", region_name="auto",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com")


def is_missing(exc):
    code = str(getattr(exc, "response", {}).get("Error", {}).get("Code", ""))
    return code in ("404", "NoSuchKey", "NotFound")


def list_stage(client, bucket, prefix):
    results = {}
    pager = client.get_paginator("list_objects_v2")
    for page in pager.paginate(Bucket=bucket, Prefix=prefix + "/"):
        for obj in page.get("Contents", []):
            results[obj["Key"]] = obj["Size"]
    return results


def remote_sync(root, files, manifest_sha, *, bucket, account_id, apply, confirm, jobs=4):
    require(re.fullmatch(r"[a-z0-9][a-z0-9.-]{2,62}", bucket or "") is not None,
            "BUCKET_NAME_REQUIRED")
    require(not apply or confirm == "I_CONFIRM_THIS_BUCKET_IS_PRIVATE",
            "PRIVATE_BUCKET_CONFIRMATION_REQUIRED")
    client = r2_client(account_id)
    # This is a versioned, immutable *private staging* prefix, not a public URL.
    prefix = f"{PREFIX}/{manifest_sha[:16]}"
    existing = list_stage(client, bucket, prefix)
    counts = collections.Counter()
    planned = []
    for rel, record in sorted(files.items()):
        key = prefix + "/" + rel
        expected_hash, expected_size = record[:2]
        if key in existing:
            require(existing[key] == expected_size, "REMOTE_LENGTH_CONFLICT")
            head = client.head_object(Bucket=bucket, Key=key)
            meta = head.get("Metadata", {})
            require(head.get("ContentLength") == expected_size and
                    meta.get("sha256") == expected_hash and
                    head.get("ContentType") == "image/webp",
                    "REMOTE_HASH_CONFLICT")
            counts["skippedVerified"] += 1
        else:
            planned.append((key, rel, expected_hash, expected_size))
    counts["pending"] = len(planned)
    if not apply:
        return {"mode":"remote-plan","prefix":prefix,"bucket":bucket,
                "existingVerified":counts["skippedVerified"],
                "wouldUpload":counts["pending"]}
    def upload(task):
        key, rel, expected_hash, expected_size = task
        path = ensure_inside(root, rel)
        require(path.stat().st_size == expected_size and
                digest_file(path) == expected_hash, "SOURCE_CHANGED_BEFORE_UPLOAD")
        with path.open("rb") as body:
            client.put_object(Bucket=bucket, Key=key, Body=body,
                IfNoneMatch="*", ContentType="image/webp",
                CacheControl="private, no-store",
                Metadata={"sha256":expected_hash,"src04-v2":"private-staging"})
        head = client.head_object(Bucket=bucket, Key=key)
        require(head.get("ContentLength") == expected_size and
                head.get("Metadata", {}).get("sha256") == expected_hash and
                head.get("ContentType") == "image/webp", "UPLOADED_HEAD_MISMATCH")
        return key
    uploaded = 0
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(upload, item): item for item in planned}
        for future in as_completed(futures):
            future.result()
            uploaded += 1
            if uploaded % 250 == 0:
                print(f"private staging uploads {uploaded}/{len(planned)}", flush=True)
    return {"mode":"private-staging-upload","prefix":prefix,"bucket":bucket,
            "existingVerified":counts["skippedVerified"],"uploaded":uploaded,
            "totalVerified":counts["skippedVerified"]+uploaded}


def main(argv=None):
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--out", type=Path, default=DEFAULT_OUT)
    cli.add_argument("--remote-plan", action="store_true",
                     help="Read-only R2 inventory check after full local audit")
    cli.add_argument("--apply", action="store_true",
                     help="Explicitly upload verified bytes to private R2 staging")
    cli.add_argument("--confirm-private-bucket",
                     help="Required literal: I_CONFIRM_THIS_BUCKET_IS_PRIVATE")
    cli.add_argument("--bucket", help="Preexisting private R2 bucket")
    cli.add_argument("--account-id", default=os.getenv("R2_ACCOUNT_ID"),
                     help="Cloudflare account ID (or R2_ACCOUNT_ID env var)")
    cli.add_argument("--jobs", type=int, default=4)
    args = cli.parse_args(argv)
    if args.apply and not args.bucket:
        cli.error("--apply requires --bucket and explicit private-bucket confirmation")
    if args.remote_plan and args.apply:
        cli.error("choose --remote-plan OR --apply")
    if args.jobs not in range(1, 9):
        cli.error("--jobs must be 1..8")
    root = args.out.resolve()
    report_path = root / REPORT_NAME
    report = {"schema":"wand.src04.r2-stage@1", "status":"error",
              "publicationApproved":False,"sourceFilesModified":False,
              "uploadedToPublic":False}
    try:
        manifest_sha, files, summary = collect(root)
        report.update(summary)
        report["manifestSha256"] = manifest_sha
        report["localAudit"] = audit(root, files)
        report["status"] = "verified_local"
        # Save local verification before any network operation.
        save_report(report_path, report)
        if args.remote_plan or args.apply:
            report["remote"] = remote_sync(root, files, manifest_sha,
                bucket=args.bucket, account_id=args.account_id,
                apply=args.apply, confirm=args.confirm_private_bucket,
                jobs=args.jobs)
            report["status"] = "private_staging_uploaded" if args.apply else "remote_plan_complete"
        report["complete"] = True
        save_report(report_path, report)
        print(json.dumps({"status":report["status"],"summary":report["localAudit"],
                          "report":str(report_path),"remote":report.get("remote")},
                         ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        report["errorCode"] = str(exc).splitlines()[0][:240]
        report["complete"] = False
        save_report(report_path, report)
        print("SRC-04 R2 staging stopped: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
