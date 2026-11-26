#!/usr/bin/env python3
"""Source-exact next-version Item media build: 256px list art + native originals.

Called by build_next_media_v2.py's CLI. Never stage private assets or contact R2.
Reuse the preceding verified native WebP and encoded-hash thumbnail cache.
The complete candidate and next baseline are committed atomically by the builder.
"""
import hashlib
import io
import json
import os
import shutil
from collections import Counter
from pathlib import Path

import build_next_media_v2 as core
from migrate_item_thumbnails_256 import (POLICY, EDGE, meta, verify_local,
                                         make_thumbnail, key)
from stage_media_v2 import webp_lossless_dimensions

VARIANT_POLICY_256 = "thumbnail_256_lossless_webp_plus_original_native_lossless_webp"


def native_variant(img, root, pixel):
    rel=f"images-v2/original/{pixel[:2]}/{pixel}.webp"
    path=root/rel
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        img.convert("RGBA").save(path,format="WEBP",lossless=True,quality=100,method=6,exact=True)
    core.require(webp_lossless_dimensions(path)==img.size,"NEW_ORIGINAL_DIMENSIONS")
    return {"path":rel,**meta(core.file_digest(path),path.stat().st_size,*img.size)}


def metadata(variant):
    return {k:variant[k] for k in ("sha256","bytes","width","height")}


def copy_verified(source, target, info, *, link=False):
    verify_local(source,info)
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
        if link:
            try:
                os.link(source,target)
            except OSError:
                shutil.copyfile(source,target)
        else:
            shutil.copyfile(source,target)
    verify_local(target,info)


def create_images(base_root, target_root, plan_doc, target_scan, game_root):
    prior_root=base_root/"item-thumbnails-256"
    output=target_root/"item-thumbnails-256"
    output.mkdir()
    cache_path=prior_root/"item-256-thumbnail-cache.json"
    prior={}
    if cache_path.is_file():
        cache=json.loads(cache_path.read_bytes())
        if cache.get("policy")==POLICY:
            prior=cache["images"]
            core.require(isinstance(prior,dict),"THUMB_CACHE_FORMAT")
    old=plan_doc["_base_by_guid"]
    by_pixel={}
    for previous in old.values():
        pixel=previous["decodedSha256"]
        original=previous["original"]
        if pixel in by_pixel:
            core.require(by_pixel[pixel]==original,"OLD_PIXEL_ORIGINAL_CONFLICT")
        by_pixel[pixel]=original
    counts=Counter()
    images={}
    originals={}
    thumbnails={}
    copied=set()
    decoded_env=[None,None]

    def keep_original(variant):
        path=variant["path"]
        if path not in copied:
            core.checked_copy_variant(base_root,target_root,variant)
            copied.add(path)
        return variant

    def thumbnail(original,pixel):
        o=metadata(original)
        sha=o["sha256"]
        if sha not in thumbnails:
            old_thumb=prior.get(sha)
            # Reuse the exact preceding 256px bytes, not a legacy 128px variant.
            if (max(o["width"],o["height"])>EDGE and isinstance(old_thumb,dict)
                    and core.SHA_RE.fullmatch(str(old_thumb.get("sha256","")))
                    and all(type(old_thumb.get(k)) is int and old_thumb[k]>0 for k in ("bytes","width","height"))
                    and max(old_thumb["width"],old_thumb["height"])==EDGE
                    and old_thumb["width"]<=o["width"] and old_thumb["height"]<=o["height"]):
                source=prior_root/key(old_thumb["sha256"])
                if source.is_file():
                    core.require(source.resolve().is_relative_to(prior_root.resolve()) and not source.is_symlink(),"THUMB_CACHE_PATH")
                    copy_verified(source,output/key(old_thumb["sha256"]),old_thumb)
                    counts["cachedThumbnailReused"]+=1
                else:
                    old_thumb=None
            else:
                old_thumb=None
            t=make_thumbnail(target_root/original["path"],o,output,old_thumb)
            if t!=o and old_thumb!=t:
                counts["newlyGeneratedThumbnails"]+=1
            thumbnails[sha]=t
        t=thumbnails[sha]
        # Keep the historical private overlay shape for the source-delta reader,
        # without re-encoding a small original or duplicating it in R2.
        rel=f"images-v2/thumbnail/{pixel[:2]}/{pixel}.webp"
        dest=target_root/rel
        if rel not in copied:
            source=target_root/original["path"] if t==o else output/key(t["sha256"])
            copy_verified(source,dest,t,link=True)
            copied.add(rel)
        return {"path":rel,**t}

    order=lambda j:(j.get("target",{}).get("bundlePath",""),j["iconGuid"])
    for job in sorted(plan_doc["imageJobs"],key=order):
        guid=job["iconGuid"]
        if job["state"]=="reused_verified":
            core.require(job.get("prior") is not None,"MISSING_REUSE_PROVENANCE")
            image=dict(old[guid])
            pixel=image["decodedSha256"]
            original=keep_original(image["original"])
            counts["reusedGuid"]+=1
        elif job["state"]=="needs_decode":
            link=job.get("target")
            core.require(link is not None,"MISSING_EXACT_LINK")
            img=core.decode_exact(game_root,target_scan,link,decoded_env)
            png=io.BytesIO()
            img.save(png,format="PNG")
            pixel=hashlib.sha256(png.getvalue()).hexdigest()
            if pixel in by_pixel and (by_pixel[pixel]["width"],by_pixel[pixel]["height"])==img.size:
                original=keep_original(by_pixel[pixel])
                counts["samePixelReused"]+=1
            elif pixel in originals:
                original=originals[pixel]
                counts["samePixelReused"]+=1
            else:
                original=native_variant(img,target_root,pixel)
                counts["newPixelEncoded"]+=1
            image={"class":link["unityAssetId"].rsplit(":",1)[-1],
                   "unityAssetId":link["unityAssetId"],"textureAssetId":None,
                   "decodedSha256":pixel,"sourceBundleSha256":link["sourceBundleSha256"],
                   "sourceWidth":img.width,"sourceHeight":img.height,"identityEvidence":core.EVIDENCE}
            counts["decodedGuid"]+=1
        else:
            raise ValueError("SRC04_UPDATE_UNRESOLVED_"+job["state"])
        originals[pixel]=original
        image["original"]=original
        image["thumbnail"]=thumbnail(original,pixel)
        images[guid]=image
    return images,counts


def finalize(root, target_items, images, version, counts):
    output=root/"item-thumbnails-256"
    originals={}
    thumbs={}
    items={}
    for item_id,guid in sorted(target_items["items"].items()):
        image=images[guid]
        o,t=metadata(image["original"]),metadata(image["thumbnail"])
        sha=o["sha256"]
        core.require(sha not in originals or originals[sha]==o,"ORIGINAL_META_CONFLICT")
        core.require(sha not in thumbs or thumbs[sha]==t,"THUMB_META_CONFLICT")
        originals[sha]=o
        thumbs[sha]=t
        items[str(item_id)]=[sha,t["sha256"]]
    all_images=dict(originals)
    unique_thumbs={}
    for t in thumbs.values():
        sha=t["sha256"]
        core.require(sha not in all_images or all_images[sha]==t,"IMAGE_META_CONFLICT")
        all_images[sha]=t
        unique_thumbs[sha]=t
    core.write_json(output/"item-256-thumbnail-cache.json",{"policy":POLICY,"images":thumbs})
    core.write_json(output/"item-256-index-candidate.json",{
        "schema":"wand.media.item-index@256-v1","gameVersion":version,
        "thumbnailPolicy":POLICY,"maxThumbnailLongEdge":EDGE,
        "items":items,"images":all_images})
    core.write_json(output/"item-256-generation-report.json",{
        "itemCount":len(items),"guidCount":len(images),"uniqueOriginals":len(originals),
        "originalsReusedAsThumbnail":sum(sha==t["sha256"] for sha,t in thumbs.items()),
        "newlyGeneratedThumbnails":counts["newlyGeneratedThumbnails"],
        "cachedThumbnailsReused":counts["cachedThumbnailReused"],
        "uniqueThumbnails":len(unique_thumbs),"uniqueImages":len(all_images),
        "originalBytes":sum(v["bytes"] for v in originals.values()),
        "thumbnailBytes":sum(v["bytes"] for v in unique_thumbs.values()),
        "totalBytes":sum(v["bytes"] for v in all_images.values()),"publicationVerified":False})


def build_next(*args,**kwargs):
    return core.build(*args,**kwargs,image_builder=create_images,
                      variant_policy=VARIANT_POLICY_256,finalize=finalize)


if __name__=="__main__":
    raise SystemExit(core.main())
