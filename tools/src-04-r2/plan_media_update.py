#!/usr/bin/env python3
"""SRC-04 version-to-version image delta planner.

Reuses immutable verified baseline images only when both the Unity image object
AND its Addressables GUID linkage remain source-exact. New/changed/ambiguous
objects are queued for new-version extraction; no guesses or deletes.

Inputs are private SRC-00 full scans, SRC-01 native Item ID/GUID exports, and
a SHA-pinned SRC-04 v2 overlay. Optional new-version exact GUID link evidence
lets unchanged images be reused even when the catalog itself changes.

Never edits game files, writes images, uploads R2 data or publishes anything.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath

SCHEMA = "wand.src04.update-plan@1"
PROOF_SCHEMA = "wand.src04.exact-guid-links@1"
MANIFEST_SCHEMA = "wand.src04.media-overlay-manifest@2"
SHARD_SCHEMA = "wand.src04.media-overlay-shard@2"
BASELINE_ITEMS_SHA = "3ff0043692c88699d1cb44f4a953095c5f5fcd1afd700761396f13cca96851bf"
BASELINE_OVERLAY_SHA = "fd2d07d541293a19ac7b845e996ccf4e3af41270c79daaa56b2ff74316a45e9f"
BASELINE_VERSION = "1.26.2"
GUID_RE = re.compile(r"^guid:[0-9a-f]{32}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:\.\d+)?$")
EVIDENCE = "exact_catalog_key_and_serialized_bundle_path_id"
CATALOG_ROOT = "ddv_Data/StreamingAssets/aa/"
PRIVATE_OVERLAY = "private-media-overlay-v2-latest"


def require(ok, code):
    if not ok:
        raise ValueError("SRC04_DELTA_" + code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def path_safe(s):
    require(isinstance(s, str) and s and "\\" not in s and ":" not in s and
            "\x00" not in s and not s.startswith("/"), "PATH_UNSAFE")
    p = PurePosixPath(s)
    require(all(part not in ("", ".", "..") for part in s.split("/")) and
            p.as_posix() == s, "PATH_UNSAFE")
    return p


def file_digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for buf in iter(lambda: f.read(1024 * 1024), b""):
            h.update(buf)
    return h.hexdigest()


def read_scan(path):
    raw = path.read_bytes()
    data = json.loads(raw)
    require(data.get("schema_version") == 1 and data.get("status") == "complete" and
            not data.get("errors") and data.get("platform", {}).get("value") == "steam" and
            data.get("game_version", {}).get("status") == "verified_from_file",
            "SCAN_NOT_VERIFIED")
    version = data["game_version"].get("value")
    require(isinstance(version, str) and VERSION_RE.fullmatch(version),
            "SCAN_VERSION_UNKNOWN")
    files = data.get("files")
    require(isinstance(files, list) and files, "SCAN_FILES_MISSING")
    by_path = {}
    by_sha = defaultdict(list)
    for row in files:
        require(isinstance(row, dict), "SCAN_ROW_INVALID")
        path_name = row.get("path")
        path_safe(path_name)
        sha = row.get("sha256")
        require(isinstance(sha, str) and SHA_RE.fullmatch(sha) and
                isinstance(row.get("size"), int) and row["size"] >= 0,
                "SCAN_FILE_HASH")
        require(path_name not in by_path, "SCAN_DUPLICATE_PATH")
        by_path[path_name] = row
        by_sha[sha].append(path_name)
    return {"version": version, "sha256": digest(raw),
            "files": by_path, "bySha": by_sha}


def read_items(path, *, expected_sha=None):
    raw = path.read_bytes()
    sha = digest(raw)
    require(expected_sha is None or sha == expected_sha, "ITEMS_SHA_CHANGED")
    items, guids = {}, defaultdict(set)
    for line in raw.splitlines():
        if not line:
            continue
        row = json.loads(line)
        require(isinstance(row, dict) and type(row.get("itemId")) is int and
                isinstance(row.get("iconGuid"), str) and
                GUID_RE.fullmatch(row["iconGuid"]), "ITEM_ROW_INVALID")
        item_id, guid = row["itemId"], row["iconGuid"]
        require(item_id not in items, "ITEM_DUPLICATE_ID")
        items[item_id] = guid
        guids[guid].add(item_id)
    require(items, "ITEMS_EMPTY")
    return {"sha256":sha,"items":items,"guids":guids}


def read_overlay(root, *, expected_sha=None):
    manifest_path = root / "manifest.json"
    raw = manifest_path.read_bytes()
    sha = digest(raw)
    require(expected_sha is None or sha == expected_sha, "OVERLAY_MANIFEST_CHANGED")
    doc = json.loads(raw)
    require(doc.get("schema") == MANIFEST_SCHEMA and doc.get("bucketCount") == 256 and
            doc.get("privateOnly") is True and
            doc.get("publicationAuthorized") is False and
            doc.get("imageByteVerification") is True and
            len(doc.get("files", {})) == 256,
            "OVERLAY_NOT_PRIVATE_V2")
    rows = {}
    for bucket_num in range(256):
        bucket = f"{bucket_num:02x}"
        key = f"id/{bucket}.json"
        file = root / "id" / f"{bucket}.json"
        raw_shard = file.read_bytes()
        pin = doc["files"].get(key) or {}
        require(len(raw_shard) == pin.get("bytes") and
                digest(raw_shard) == pin.get("sha256"), "OVERLAY_SHARD_SHA")
        shard = json.loads(raw_shard)
        require(shard.get("schema") == SHARD_SCHEMA and shard.get("bucket") == bucket and
                isinstance(shard.get("rows"), list) and
                len(shard["rows"]) == pin.get("count"), "OVERLAY_SHARD_INVALID")
        for row in shard["rows"]:
            item_id, guid, img = row["itemId"], row["iconGuid"], row["image"]
            require(type(item_id) is int and item_id & 255 == bucket_num and
                    item_id not in rows and GUID_RE.fullmatch(guid) and
                    row.get("status") == "verified" and
                    img.get("identityEvidence") == EVIDENCE and
                    isinstance(img.get("unityAssetId"), str) and
                    isinstance(img.get("sourceBundleSha256"), str) and
                    SHA_RE.fullmatch(img["sourceBundleSha256"]) and
                    img["unityAssetId"].startswith("unity:"+img["sourceBundleSha256"]+":") and
                    isinstance(img.get("decodedSha256"), str) and
                    SHA_RE.fullmatch(img["decodedSha256"]),
                    "OVERLAY_ROW_IDENTITY")
            for kind in ("thumbnail","original"):
                variant = img.get(kind) or {}
                pixel_sha = img["decodedSha256"]
                require(variant.get("path") ==
                        f"images-v2/{kind}/{pixel_sha[:2]}/{pixel_sha}.webp" and
                        isinstance(variant.get("sha256"), str) and
                        SHA_RE.fullmatch(variant["sha256"]) and
                        isinstance(variant.get("bytes"), int) and
                        variant["bytes"] > 0, "OVERLAY_IMAGE_PATH")
            require((img["original"]["width"],img["original"]["height"]) ==
                    (img["sourceWidth"],img["sourceHeight"]), "OVERLAY_ORIGINAL_SIZE")
            rows[item_id] = (guid,img)
    require(doc["coverage"]["totalItems"] == len(rows) and
            doc["coverage"]["verifiedItems"] == len(rows) and
            doc["coverage"]["unresolvedItems"] == 0, "OVERLAY_COUNT")
    return {"sha256":sha,"rows":rows, "sourceSha":doc["source"]["sourceItemsSha256"]}


def read_proofs(path, target_scan, target_items):
    if path is None:
        return None
    raw = path.read_bytes()
    doc = json.loads(raw)
    require(doc.get("schema") == PROOF_SCHEMA and
            doc.get("privateOnly") is True and
            doc.get("publicationAuthorized") is False and
            doc.get("complete") is True and
            doc.get("gameVersion") == target_scan["version"] and
            doc.get("sourceScanSha256") == target_scan["sha256"] and
            doc.get("sourceItemsSha256") == target_items["sha256"],
            "PROOF_SOURCE_MISMATCH")
    records = doc.get("links")
    require(isinstance(records,list) and len(records) == len(target_items["guids"]),
            "PROOF_COVERAGE")
    links = {}
    for row in records:
        require(isinstance(row,dict), "PROOF_ROW")
        guid = row.get("iconGuid")
        rel = row.get("bundlePath")
        path_safe(rel)
        sha = row.get("sourceBundleSha256")
        identity = row.get("unityAssetId")
        require(isinstance(guid,str) and GUID_RE.fullmatch(guid) and
                guid in target_items["guids"] and guid not in links and
                isinstance(sha,str) and SHA_RE.fullmatch(sha) and
                isinstance(identity,str) and
                identity.startswith("unity:"+sha+":") and
                identity.rsplit(":",1)[-1] in ("Sprite","Texture2D") and
                row.get("identityEvidence") == EVIDENCE and
                target_scan["files"].get(rel,{}).get("sha256") == sha and
                rel.endswith(".bundle"), "PROOF_INVALID")
        links[guid] = {"bundlePath":rel,"sourceBundleSha256":sha,
                        "unityAssetId":identity}
    require(set(links) == set(target_items["guids"]), "PROOF_GUID_MISMATCH")
    return {"sha256":digest(raw), "links":links}


def catalog_files(scan):
    return {key: item["sha256"] for key,item in scan["files"].items()
            if key.startswith(CATALOG_ROOT) and
            (key.rsplit("/",1)[-1].startswith("catalog.") or
             key == CATALOG_ROOT+"settings.json")}


def verify_target_files(scan, game_root, paths):
    """Only rehash bundles/cataloɡ files relevant to this plan (no game writes)."""
    if game_root is None:
        return False
    root = game_root.resolve()
    require(root.is_dir(), "TARGET_GAME_MISSING")
    for index, rel in enumerate(sorted(paths), 1):
        path = root.joinpath(*path_safe(rel).parts)
        require(path.is_file() and not path.is_symlink() and
                path.resolve().is_relative_to(root), "TARGET_FILE_MISSING")
        need = scan["files"][rel]
        require(path.stat().st_size == need["size"] and
                file_digest(path) == need["sha256"], "TARGET_SOURCE_HASH_CHANGED")
    return True


def plan(base_scan, base_items, base_overlay, target_scan, target_items,
         *, proofs=None, target_game=None, allow_same_version=False):
    require(base_scan["version"] != target_scan["version"] or allow_same_version,
            "SAME_GAME_VERSION")
    require(base_overlay["sourceSha"] == base_items["sha256"], "BASE_ITEM_PROVENANCE")
    require(set(base_overlay["rows"]) == set(base_items["items"]), "BASE_ITEM_COVERAGE")
    base_by_guid = {}
    for item_id, (guid,img) in base_overlay["rows"].items():
        require(base_items["items"][item_id] == guid, "BASE_GUID_MISMATCH")
        sig = (img["unityAssetId"],img["decodedSha256"],img["sourceBundleSha256"])
        if guid in base_by_guid:
            require(base_by_guid[guid]["signature"] == sig, "BASE_GUID_COLLISION")
        else:
            possible=base_scan["bySha"].get(img["sourceBundleSha256"],[])
            require(len(possible) == 1 and possible[0].endswith(".bundle"),
                    "BASE_BUNDLE_NOT_PINNED")
            base_by_guid[guid] = {"signature":sig,"image":img,"bundlePath":possible[0]}

    base_cat=catalog_files(base_scan)
    next_cat=catalog_files(target_scan)
    require(base_cat and next_cat, "CATALOG_MISSING")
    catalog_same=(base_cat == next_cat)
    next_paths=set(target_items["guids"])
    baseline_paths=set(base_by_guid)
    verified = set(next_cat)
    if proofs is not None:
        verified.update(x["bundlePath"] for x in proofs["links"].values())
    else:
        verified.update(e["bundlePath"] for guid,e in base_by_guid.items()
                        if guid in next_paths and e["bundlePath"] in target_scan["files"])
    target_hashes_verified=verify_target_files(target_scan,target_game,verified)
    delta = []
    counts = Counter()
    for guid in sorted(next_paths):
        prior = base_by_guid.get(guid)
        proof = proofs["links"].get(guid) if proofs else None
        status="needs_exact_guid_relink"
        reason="catalog_changed_or_new_guid"
        if proof:
            if prior and proof["sourceBundleSha256"] == prior["signature"][2] and \
               proof["unityAssetId"] == prior["signature"][0]:
                status="reused_verified";reason="same_SHA_pinned_bundle_and_Unity_object"
            else:
                status="needs_decode";reason="new_or_changed_exact_Unity_source"
        elif prior and catalog_same and \
             target_scan["files"].get(prior["bundlePath"],{}).get("sha256") == \
             prior["signature"][2]:
            status="reused_verified";reason="catalog_and_SHA_pinned_bundle_unchanged"
        if status=="reused_verified" and not target_hashes_verified:
            # SRC-00 scan caches digest by stat; rehash the actual target before reuse.
            status="needs_source_rehash";reason="target_bundle_and_catalog_bytes_not_rehashed"
        counts[status] += 1
        entry={"iconGuid":guid,"state":status,"reason":reason,
               "itemCount":len(target_items["guids"][guid])}
        if prior:
            entry["prior"]={
                "sourceBundlePath":prior["bundlePath"],
                "sourceBundleSha256":prior["signature"][2],
                "unityAssetId":prior["signature"][0],
                "decodedSha256":prior["signature"][1],
                "thumbnail":prior["image"]["thumbnail"],
                "original":prior["image"]["original"]}
        if proof:
            entry["target"]=proof
        elif prior:
            entry["targetBundleSha256"]=target_scan["files"].get(
                prior["bundlePath"],{}).get("sha256")
        delta.append(entry)
    changed_bundles=[]
    base_bundle={k:v["sha256"] for k,v in base_scan["files"].items()
                 if k.endswith(".bundle")}
    next_bundle={k:v["sha256"] for k,v in target_scan["files"].items()
                 if k.endswith(".bundle")}
    for rel in sorted(set(base_bundle)|set(next_bundle)):
        old,new=base_bundle.get(rel),next_bundle.get(rel)
        if old!=new:
            changed_bundles.append({"path":rel,"oldSha256":old,"newSha256":new})
    old_missing=set(base_items["items"])-set(target_items["items"])
    item_changes=sorted(item_id for item_id,guid in target_items["items"].items()
                        if base_items["items"].get(item_id)!=guid)
    report={
      "schema":SCHEMA,"privateOnly":True,"publicationAuthorized":False,
      "status":"planned_not_extracted","complete":False,
      "baseVersion":base_scan["version"],"targetVersion":target_scan["version"],
      "baseScanSha256":base_scan["sha256"],"targetScanSha256":target_scan["sha256"],
      "baseItemsSha256":base_items["sha256"],"targetItemsSha256":target_items["sha256"],
      "baseOverlayManifestSha256":base_overlay["sha256"],
      "targetProofSha256":proofs["sha256"] if proofs else None,
      "catalogChanged":not catalog_same,
      "targetGameRelevantFilesRehashed":target_hashes_verified,
      "comparableItemScopeNotAssumed":True,
      "itemCounts":{"prior":len(base_items["items"]),"next":len(target_items["items"]),
                    "changedOrAdded":len(item_changes),
                    "missingFromNewExtractionNotConfirmedRemoved":len(old_missing)},
      "guidCounts":{"prior":len(baseline_paths),"next":len(next_paths),
                    "new":len(next_paths-baseline_paths),
                    "notReferencedInNextExtraction":len(baseline_paths-next_paths)},
      "classification":dict(sorted(counts.items())),
      "catalogFilesChanged":[k for k in sorted(set(base_cat)|set(next_cat))
                             if base_cat.get(k)!=next_cat.get(k)],
      "bundlesChanged":len(changed_bundles),
      "changedBundleEvidence":changed_bundles,
      "imageJobs":delta,
      "nextWork":"provide exact GUID link proofs for relink jobs and independently decode only needs_decode; never infer an image from names",
    }
    require(sum(counts.values())==len(next_paths), "INTERNAL_GUID_COUNT")
    return report


def run(args):
    base_scan=read_scan(args.base_scan)
    target_scan=read_scan(args.target_scan)
    require(base_scan["version"]==BASELINE_VERSION or args.allow_custom_baseline,
            "BASE_VERSION_MISMATCH")
    base_items=read_items(args.base_items,expected_sha=(
        BASELINE_ITEMS_SHA if not args.allow_custom_baseline else None))
    target_items=read_items(args.target_items,expected_sha=args.target_items_sha)
    overlay=read_overlay(args.base_overlay,expected_sha=(
        BASELINE_OVERLAY_SHA if not args.allow_custom_baseline else args.base_overlay_sha))
    require(args.target_game is not None or args.allow_unverified_target,
            "TARGET_GAME_REQUIRED_FOR_SAFE_REUSE")
    proofs=read_proofs(args.target_proofs,target_scan,target_items)
    report=plan(base_scan,base_items,overlay,target_scan,target_items,
                proofs=proofs,target_game=args.target_game,
                allow_same_version=args.allow_same_version)
    out=args.out.resolve()
    require(out.parent.is_dir() and not out.is_symlink() and
            not out.exists() and out.suffix.lower()==".json", "OUTPUT_MUST_BE_NEW_JSON")
    # Never accidentally put private source metadata in a public repository.
    for parent in (out.parent,*out.parents):
        require(not (parent/".git").exists(), "OUTPUT_INSIDE_GIT")
    tmp=out.with_name(out.name+".tmp")
    require(not tmp.exists(), "TEMP_EXISTS")
    try:
        tmp.write_text(json.dumps(report,ensure_ascii=False,sort_keys=True,indent=2)+"\n",
                       encoding="utf-8")
        tmp.replace(out)
    finally:
        tmp.unlink(missing_ok=True)
    return report


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    for name in ("base-scan","base-items","base-overlay",
                 "target-scan","target-items","out"):
        p.add_argument("--"+name,required=True,type=Path)
    p.add_argument("--target-game",type=Path,
                   help="Real installed target Steam game root; rehash selected source bytes")
    p.add_argument("--target-proofs",type=Path,
                   help="Exact source-pinned new-version GUID/Unity-object links")
    p.add_argument("--target-items-sha",help="Optional SHA-256 pin for new SRC-01 export")
    p.add_argument("--allow-unverified-target",action="store_true",
                   help="Planning only: never mark reuse verified without actual target hashes")
    p.add_argument("--allow-custom-baseline",action="store_true",
                   help="Explicitly use a later baseline after it has been independently verified")
    p.add_argument("--base-overlay-sha",help="Expected v2 manifest SHA for custom baseline")
    p.add_argument("--allow-same-version",action="store_true",
                   help="Synthetic tests only; never use for deployment")
    args=p.parse_args(argv)
    if args.allow_custom_baseline and not args.base_overlay_sha:
        p.error("--allow-custom-baseline requires --base-overlay-sha")
    if args.target_items_sha is not None and not SHA_RE.fullmatch(args.target_items_sha):
        p.error("--target-items-sha must be 64 lowercase hexadecimal characters")
    try:
        report=run(args)
    except (ValueError,KeyError,TypeError,OSError,UnicodeError) as error:
        p.exit(2,str(error)+"\n")
    print(json.dumps({k:report[k] for k in
        ("status","baseVersion","targetVersion","catalogChanged",
         "classification","bundlesChanged","guidCounts")},ensure_ascii=False))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
