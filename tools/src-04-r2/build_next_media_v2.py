#!/usr/bin/env python3
"""SRC-04: assemble a new private v2 lossless media snapshot from safe delta jobs.

Unchanged source-exact GUIDs reuse *verified prior WebP bytes*; changed GUIDs
are decoded from the exact SHA-pinned new Unity object. No R2/API operations.
No public release or unsafe fallback to matched names or old Unity path IDs.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import os
import shutil
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

from plan_media_update import (read_scan, read_items, read_overlay, read_proofs,
                               plan, require, file_digest, path_safe,
                               MANIFEST_SCHEMA, SHARD_SCHEMA, EVIDENCE, SHA_RE,
                               BASELINE_VERSION, BASELINE_ITEMS_SHA, BASELINE_OVERLAY_SHA)
from stage_media_v2 import webp_lossless_dimensions

POLICY = "thumbnail_128_lossless_webp_plus_original_native_lossless_webp"


def write_json(path, obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=(json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+"\n").encode()
    path.write_bytes(raw)
    return hashlib.sha256(raw).hexdigest(),len(raw)


def assert_private_location(path, prior_root, game_root):
    path=path.resolve()
    require(path!=prior_root and path not in prior_root.parents and
            prior_root not in path.parents and path!=game_root and
            path not in game_root.parents and game_root not in path.parents,
            "OUTPUT_OVERLAPS_PRIVATE_INPUT")
    for part in (path,*path.parents):
        require(not (part/".git").exists(), "OUTPUT_INSIDE_GIT")


def checked_copy_variant(src_root, dst_root, variant):
    src_rel=variant["path"]
    path_safe(src_rel)
    require(src_rel.startswith("images-v2/") and src_rel.endswith(".webp"),
            "INVALID_REUSE_PATH")
    source=src_root.joinpath(*src_rel.split("/"))
    require(source.is_file() and not source.is_symlink() and
            source.resolve().is_relative_to(src_root.resolve()), "OLD_IMAGE_MISSING")
    require(source.stat().st_size==variant["bytes"] and
            file_digest(source)==variant["sha256"] and
            webp_lossless_dimensions(source)==(variant["width"],variant["height"]),
            "OLD_IMAGE_INVALID")
    target=dst_root.joinpath(*src_rel.split("/"))
    require(target.resolve().is_relative_to(dst_root.resolve()), "IMAGE_PATH_UNSAFE")
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():
        require(target.stat().st_size==variant["bytes"] and
                file_digest(target)==variant["sha256"],"IMAGE_PATH_CONFLICT")
    else:
        shutil.copyfile(source,target)
        require(file_digest(target)==variant["sha256"],"COPY_MISMATCH")
    return variant


def make_lossless_variant(img, output_root, decoded_sha, kind):
    from PIL import Image
    picture=img.copy()
    if kind=="thumbnail":
        picture.thumbnail((128,128),Image.Resampling.LANCZOS)
    rel=f"images-v2/{kind}/{decoded_sha[:2]}/{decoded_sha}.webp"
    path=output_root.joinpath(*rel.split("/"))
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        temp=path.with_name(path.name+".tmp")
        try:
            picture.save(temp,format="WEBP",lossless=True,exact=True,method=6)
            os.replace(temp,path)
        finally:
            temp.unlink(missing_ok=True)
    require(webp_lossless_dimensions(path)==picture.size,"OUTPUT_WEBP_DIMENSIONS")
    return {"path":rel,"sha256":file_digest(path),"bytes":path.stat().st_size,
            "width":picture.width,"height":picture.height}


def decode_exact(game_root, target_scan, link, cache=None):
    """Read one source-exact Unity Sprite/Texture2D image; no search by name."""
    try:
        import UnityPy
    except ImportError as exc:
        raise RuntimeError("Install UnityPy and Pillow for changed image objects") from exc
    rel=link["bundlePath"]
    path_safe(rel)
    sha=link["sourceBundleSha256"]
    require(target_scan["files"].get(rel,{}).get("sha256")==sha,
            "DECODE_BUNDLE_SHA_NOT_PINNED")
    source=game_root.joinpath(*rel.split("/"))
    require(source.is_file() and not source.is_symlink() and
            source.resolve().is_relative_to(game_root.resolve()) and
            file_digest(source)==sha,"DECODE_SOURCE_HASH")
    identity=link["unityAssetId"]
    parts=identity.split(":")
    require(len(parts)==5 and parts[0]=="unity" and parts[1]==sha and
            parts[4] in ("Sprite","Texture2D"),"DECODE_ASSET_ID")
    try:
        path_id=int(parts[3])
    except ValueError as exc:
        raise ValueError("SRC04_UPDATE_DECODE_PATH_ID") from exc
    if cache is not None and cache[0]==rel:
        env=cache[1]
    else:
        env=UnityPy.load(str(source))
        if cache is not None:
            cache[0],cache[1]=rel,env
    candidates=env.objects.values() if isinstance(env.objects,dict) else env.objects
    matched=[]
    for obj in candidates:
        if (obj.type.name==parts[4] and int(obj.path_id)==path_id and
                str(getattr(getattr(obj,"assets_file",None),"name",""))==parts[2]):
            matched.append(obj)
    require(len(matched)==1,"DECODE_OBJECT_NOT_UNIQUE")
    image=matched[0].read().image
    require(image is not None,"DECODE_PIXELS_MISSING")
    image.load()
    return image


def write_private_overlay(root, target_items, images, *, variant_policy=POLICY):
    """All Item IDs from the target export, verified and sorted into 256 shards."""
    by_guid=target_items["guids"]
    require(set(images)==set(by_guid),"UNRESOLVED_IMAGE_GUIDS")
    buckets=defaultdict(list)
    for item_id,guid in sorted(target_items["items"].items()):
        buckets[item_id & 255].append({
          "itemId":item_id,"iconGuid":guid,"status":"verified","image":images[guid]})
    meta={}
    for number in range(256):
        key=f"id/{number:02x}.json"
        rows=buckets[number]
        sha,size=write_json(root/"private-media-overlay-v2-latest"/key,{
          "schema":SHARD_SCHEMA,"bucket":f"{number:02x}","rows":rows})
        meta[key]={"sha256":sha,"bytes":size,"count":len(rows),"verified":len(rows)}
    manifest={
      "schema":MANIFEST_SCHEMA,"bucketCount":256,
      "privateOnly":True,"publicationAuthorized":False,
      "imageByteVerification":True,
      "coverage":{"complete":False,
                  "scope":"verified_native_item_icon_extract_not_entire_game",
                  "totalItems":len(target_items["items"]),
                  "verifiedItems":len(target_items["items"]),
                  "unresolvedItems":0,
                  "verifiedGuids":len(images),
                  "unresolvedGuids":0},
      "files":meta,
      "source":{"sourceItemsSha256":target_items["sha256"],
                "variantPolicy":variant_policy,
                "generatedBy":"build_next_media_v2.py"}
    }
    sha,_=write_json(root/"private-media-overlay-v2-latest"/"manifest.json",manifest)
    return sha


def create_images(base_root, target_root, plan_doc, target_scan, game_root):
    """Convert ready jobs into complete private image records, no public releases."""
    images={}
    counts=Counter()
    # Group changed image objects by source bundle to avoid repeated Unity parsing.
    order=lambda job:(job.get("target",{}).get("bundlePath",""),job["iconGuid"])
    decoded_env_cache=[None,None]
    copied=set()
    for job in sorted(plan_doc["imageJobs"],key=order):
        guid=job["iconGuid"]
        if job["state"]=="reused_verified":
            # Prior image identities must have been proven unchanged by plan().
            prior=job.get("prior")
            require(prior is not None,"MISSING_REUSE_PROVENANCE")
            old_overlay=plan_doc["_base_by_guid"][guid]
            image=dict(old_overlay)
            for kind in ("thumbnail","original"):
                variant=image[kind]
                if variant["path"] not in copied:
                    checked_copy_variant(base_root,target_root,variant)
                    copied.add(variant["path"])
            counts["reusedGuid"]+=1
        elif job["state"]=="needs_decode":
            link=job.get("target")
            require(link is not None,"MISSING_EXACT_LINK")
            img=decode_exact(game_root,target_scan,link,decoded_env_cache)
            png=io.BytesIO()
            img.save(png,format="PNG")
            pixel_sha=hashlib.sha256(png.getvalue()).hexdigest()
            old_overlay=plan_doc["_base_by_guid"].get(guid)
            same_pixel=old_overlay and old_overlay["decodedSha256"]==pixel_sha and \
                       (old_overlay["sourceWidth"],old_overlay["sourceHeight"])==img.size
            if same_pixel:
                variants={}
                for kind in ("thumbnail","original"):
                    variant=old_overlay[kind]
                    if variant["path"] not in copied:
                        checked_copy_variant(base_root,target_root,variant)
                        copied.add(variant["path"])
                    variants[kind]=variant
                counts["samePixelReused"]+=1
            else:
                variants={kind:make_lossless_variant(img,target_root,pixel_sha,kind)
                          for kind in ("thumbnail","original")}
                counts["newPixelEncoded"]+=1
            image={
              "class":link["unityAssetId"].rsplit(":",1)[-1],
              "unityAssetId":link["unityAssetId"],
              "textureAssetId":None,
              "decodedSha256":pixel_sha,
              "sourceBundleSha256":link["sourceBundleSha256"],
              "sourceWidth":img.width,"sourceHeight":img.height,
              "identityEvidence":EVIDENCE,
              **variants
            }
            counts["decodedGuid"]+=1
        else:
            raise ValueError("SRC04_UPDATE_UNRESOLVED_"+job["state"])
        images[guid]=image
    return images,counts


def build(base_root, old_scan_path, next_scan_path, next_items_path,
          next_proofs_path, next_game, out, *, base_items_sha=None,
          base_overlay_sha=None, image_builder=None, variant_policy=POLICY,
          finalize=None, published=None):
    published=published or {}
    base_root=base_root.resolve()
    next_game=next_game.resolve()
    out=out.resolve()
    assert_private_location(out,base_root,next_game)
    require(not out.exists() and out.parent.is_dir(),"OUTPUT_MUST_NOT_EXIST")
    old_scan=read_scan(old_scan_path)
    target_scan=read_scan(next_scan_path)
    if old_scan["version"]==BASELINE_VERSION:
        expected_items_sha=base_items_sha or BASELINE_ITEMS_SHA
        expected_overlay_sha=base_overlay_sha or BASELINE_OVERLAY_SHA
    else:
        require(base_items_sha is not None and base_overlay_sha is not None,
                "CUSTOM_BASELINE_REQUIRES_SHA_PINS")
        expected_items_sha=base_items_sha
        expected_overlay_sha=base_overlay_sha
    require(SHA_RE.fullmatch(expected_items_sha) and
            SHA_RE.fullmatch(expected_overlay_sha), "BAD_BASELINE_SHA_PINS")
    old_items=read_items(base_root/"source-items"/"items.jsonl",
                         expected_sha=expected_items_sha)
    new_items=read_items(next_items_path)
    overlay=read_overlay(base_root/"private-media-overlay-v2-latest",
                         expected_sha=expected_overlay_sha)
    proofs=read_proofs(next_proofs_path,target_scan,new_items)
    require(proofs is not None,"NEW_EXACT_PROOFS_REQUIRED")
    delta=plan(old_scan,old_items,overlay,target_scan,new_items,
               proofs=proofs,target_game=next_game)
    require(delta["targetGameRelevantFilesRehashed"],"TARGET_NOT_REHASHED")
    require(set(delta["classification"]).issubset({"reused_verified","needs_decode"}),
            "UNRESOLVED_GUIDS_REMAIN")
    old_images={}
    for item_id,(guid,img) in overlay["rows"].items():
        if guid in old_images:
            require(old_images[guid]==img,"OLD_GUID_IMAGE_CONFLICT")
        else:
            old_images[guid]=img
    # This private in-memory attachment is deliberately not serialized.
    delta["_base_by_guid"]=old_images
    temp=Path(tempfile.mkdtemp(prefix=".src04-version-",dir=out.parent))
    try:
        images,counts=(image_builder or create_images)(base_root,temp,delta,target_scan,next_game)
        # Independently verify every file output, including deduped references.
        audited=set()
        for image in images.values():
            for kind in ("thumbnail","original"):
                entry=image[kind]
                if entry["path"] in audited:
                    continue
                file=temp.joinpath(*entry["path"].split("/"))
                if not file.is_file() and published.get('images/'+entry['sha256']+'.webp')==entry['bytes']:
                    audited.add(entry['path'])
                    continue
                require(file.is_file() and
                        file.stat().st_size==entry["bytes"] and
                        file_digest(file)==entry["sha256"] and
                        webp_lossless_dimensions(file)==
                        (entry["width"],entry["height"]), "NEW_IMAGE_FAILED_AUDIT")
                audited.add(entry["path"])
        (temp/"source-items").mkdir(parents=True,exist_ok=True)
        shutil.copyfile(next_items_path,temp/"source-items"/"items.jsonl")
        shutil.copyfile(next_scan_path,temp/"source-manifest.json")
        require(file_digest(temp/"source-items"/"items.jsonl")==new_items["sha256"]
                and file_digest(temp/"source-manifest.json")==target_scan["sha256"],
                "SOURCE_COPY_HASH")
        manifest_sha=write_private_overlay(temp,new_items,images,variant_policy=variant_policy)
        files={image[kind]["path"] for image in images.values()
               for kind in ("thumbnail","original")}
        report={
          "schema":"wand.src04.update-build@1",
          "status":"private_v2_built_not_uploaded",
          "complete":True,"publicationApproved":False,
          "sourceFilesModified":False,
          "baselineVersion":old_scan["version"],
          "gameVersion":target_scan["version"],
          "sourceScanSha256":target_scan["sha256"],
          "sourceItemsSha256":new_items["sha256"],
          "privateOverlayManifestSha256":manifest_sha,
          "itemCount":len(new_items["items"]),
          "guidCount":len(images),
          "distinctMediaFiles":len(files),
          "publishedObjectsReferenced":len({entry['sha256'] for image in images.values() for entry in (image['original'],image['thumbnail']) if published.get('images/'+entry['sha256']+'.webp')==entry['bytes']}),
          "reusedGuidCount":counts["reusedGuid"],
          "decodedGuidCount":counts["decodedGuid"],
          "samePixelReusedCount":counts["samePixelReused"],
          "newPixelEncodedCount":counts["newPixelEncoded"]
        }
        if finalize is not None:
            finalize(temp,new_items,images,target_scan["version"],counts)
        write_json(temp/"src04-next-release-report.json",report)
        temp.rename(out)
        return report
    finally:
        if temp.exists():
            shutil.rmtree(temp,ignore_errors=True)


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    for name in ("base-root","base-scan","target-scan","target-items",
                 "target-proofs","target-game","out"):
        p.add_argument("--"+name,type=Path,required=True)
    p.add_argument("--base-items-sha",help="Prior SRC-01 items.jsonl SHA-256 pin")
    p.add_argument("--base-overlay-sha",help="Prior SRC-04 private v2 manifest SHA-256 pin")
    p.add_argument('--cdn-ledger',type=Path)
    args=p.parse_args(argv)
    try:
        # The historical 128px API is retained for old private-staging tests only.
        from build_next_item_256 import build_next
        report=build_next(args.base_root,args.base_scan,args.target_scan,
                     args.target_items,args.target_proofs,args.target_game,args.out,
                     base_items_sha=args.base_items_sha,
                     base_overlay_sha=args.base_overlay_sha,cdn_ledger=args.cdn_ledger)
    except (OSError,ValueError,KeyError,TypeError) as error:
        p.exit(2,str(error)+"\n")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
