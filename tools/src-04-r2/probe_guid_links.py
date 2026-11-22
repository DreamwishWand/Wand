#!/usr/bin/env python3
"""Metadata-only exact SRC-04 GUID→Unity object probe for updated Steam game.

Searches SHA-verified Addressables AssetBundles for EXACT GUID tokens in
serialized Unity container keys, then links to the referenced Sprite/Texture2D
reader's file and path ID. Does not decode image pixels or guess by name.
Result may be partial; unresolved GUIDs remain explicit. No game file writes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from collections import defaultdict

from plan_media_update import (read_scan, read_items, read_overlay,
                               file_digest, path_safe, require, PROOF_SCHEMA, EVIDENCE)

GUID_TOKEN = re.compile(r"(?<![a-zA-Z0-9])(?:guid:)?([a-f0-9]{32})(?![a-zA-Z0-9])", re.I)
ICON_DIR = "ddv_Data/StreamingAssets/aa/win/ui-images-generatedicons_assets_assets/"


def selected_paths(base_scan, base_overlay, target_scan, *, include_all=False):
    current = target_scan["files"]
    if include_all:
        return sorted(path for path in current if path.endswith(".bundle"))
    base_sha_to_path = base_scan["bySha"]
    old_paths = set()
    for _, image in base_overlay["rows"].values():
        h = image["sourceBundleSha256"]
        paths = [p for p in base_sha_to_path.get(h, []) if p.endswith(".bundle")]
        require(len(paths)==1, "BASE_IMAGE_BUNDLE_AMBIGUOUS")
        old_paths.add(paths[0])
    paths = set()
    for rel, row in current.items():
        if not rel.endswith(".bundle"):
            continue
        if rel in old_paths or rel.startswith(ICON_DIR) or \
           rel not in base_scan["files"] or \
           row["sha256"] != base_scan["files"][rel]["sha256"]:
            paths.add(rel)
    return sorted(paths)


def normalize_container_entries(entries, target_guids):
    """Extract exact matches only; do NOT compare artwork names or numeric Item IDs."""
    candidates = defaultdict(set)
    iterator = entries.items() if isinstance(entries, dict) else entries
    for key, value in iterator:
        keys = {match.lower() for match in GUID_TOKEN.findall(str(key))}
        keys &= target_guids
        # Multiple GUID tokens in a key cannot unambiguously identify the object.
        if len(keys)!=1:
            continue
        obj = value[0] if isinstance(value, (tuple,list)) and value else value
        if obj is None:
            continue
        cls = str(getattr(getattr(obj,"type",None),"name",""))
        asset_file = str(getattr(getattr(obj,"assets_file",None),"name",""))
        path_id = getattr(obj,"path_id",None)
        if cls not in ("Sprite","Texture2D") or not asset_file or \
                type(path_id) is not int:
            continue
        guid=next(iter(keys))
        candidates[guid].add((asset_file,path_id,cls))
    return candidates


def select_exact(candidates):
    """A single Sprite wins over a Texture2D; multiple Sprites are ambiguous."""
    winners={}
    collisions={}
    for guid, refs in candidates.items():
        sprites=[r for r in refs if r[2]=="Sprite"]
        textures=[r for r in refs if r[2]=="Texture2D"]
        if len(sprites)==1:
            winners[guid]=sprites[0]
        elif len(sprites)==0 and len(textures)==1:
            winners[guid]=textures[0]
        else:
            collisions[guid]=len(refs)
    return winners,collisions


def probe(baseline_scan, baseline_overlay, target_scan, target_items, target_game,
          *, include_all=False, max_bundles=3000):
    targets={guid[5:] for guid in target_items["guids"]}
    paths=selected_paths(baseline_scan,baseline_overlay,target_scan,
                         include_all=include_all)
    require(0 < len(paths) <= max_bundles, "BUNDLE_SCOPE_TOO_LARGE")
    root=target_game.resolve()
    require(root.is_dir(), "TARGET_GAME_MISSING")
    try:
        import UnityPy
    except ImportError as exc:
        raise RuntimeError("UnityPy required for exact metadata-only probe") from exc
    found=defaultdict(set)
    failed=[]
    inspected=0
    for idx, rel in enumerate(paths,1):
        source=root.joinpath(*path_safe(rel).parts)
        meta=target_scan["files"][rel]
        require(source.is_file() and not source.is_symlink() and
                source.resolve().is_relative_to(root), "TARGET_BUNDLE_MISSING")
        require(source.stat().st_size==meta["size"] and
                file_digest(source)==meta["sha256"], "TARGET_BUNDLE_SHA_CHANGED")
        try:
            env=UnityPy.load(str(source))
            candidates=normalize_container_entries(getattr(env,"container",{}),
                                                   targets)
            for guid,refs in candidates.items():
                for assets_file,path_id,cls in refs:
                    found[guid].add((rel,meta["sha256"],assets_file,path_id,cls))
        except Exception as exc:
            failed.append({"bundlePath":rel,"errorType":type(exc).__name__})
        inspected+=1
        if inspected%100==0:
            print(f"SRC04 metadata bundles inspected {inspected}/{len(paths)}",
                  file=sys.stderr,flush=True)
    links=[]
    ambiguous=[]
    for guid in sorted(targets):
        refs=found.get(guid,set())
        # Candidate selection within bundle; identical duplicate matches deduplicate.
        sprite_refs=sorted(ref for ref in refs if ref[-1]=="Sprite")
        texture_refs=sorted(ref for ref in refs if ref[-1]=="Texture2D")
        if len(sprite_refs)==1:
            choice=sprite_refs[0]
        elif not sprite_refs and len(texture_refs)==1:
            choice=texture_refs[0]
        else:
            if refs:
                ambiguous.append({"iconGuid":"guid:"+guid,
                                  "candidateCount":len(refs)})
            continue
        rel,sha,asset_file,path_id,cls=choice
        links.append({"iconGuid":"guid:"+guid,
                      "bundlePath":rel,"sourceBundleSha256":sha,
                      "unityAssetId":f"unity:{sha}:{asset_file}:{path_id}:{cls}",
                      "identityEvidence":EVIDENCE})
    return {
        "schema":PROOF_SCHEMA,"privateOnly":True,"publicationAuthorized":False,
        "complete":len(links)==len(targets) and not failed and not ambiguous,
        "gameVersion":target_scan["version"],
        "sourceScanSha256":target_scan["sha256"],
        "sourceItemsSha256":target_items["sha256"],
        "links":links,
        "probe":{"source":"exact_Unity_container_key_and_serialized_path_id",
                 "noPixelDecode":True,
                 "scannedBundleCount":inspected,
                 "matchedGuids":len(links),
                 "unresolvedGuids":len(targets)-len(links),
                 "ambiguousGuids":len(ambiguous),
                 "failedBundleCount":len(failed),
                 "failedBundleExamples":failed[:20],
                 "ambiguousExamples":ambiguous[:20],
                 "scope":"all_bundles" if include_all else
                         "prior_relevant_plus_modified_new_plus_generatedicons"},
    }


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ("base-scan","base-overlay","target-scan","target-items",
                "target-game","out"):
        p.add_argument("--"+arg,type=Path,required=True)
    p.add_argument("--all-bundles",action="store_true",
                   help="Scan every SHA-verified Unity bundle (expensive).")
    p.add_argument("--max-bundles",type=int,default=3000)
    args=p.parse_args(argv)
    base_scan=read_scan(args.base_scan)
    next_scan=read_scan(args.target_scan)
    require(base_scan["version"]!=next_scan["version"], "SAME_VERSION")
    base_overlay=read_overlay(args.base_overlay)
    next_items=read_items(args.target_items)
    result=probe(base_scan,base_overlay,next_scan,next_items,args.target_game,
                 include_all=args.all_bundles,max_bundles=args.max_bundles)
    dest=args.out.resolve()
    require(not dest.exists() and dest.parent.is_dir() and
            not dest.is_symlink() and dest.suffix==".json", "OUTPUT_MUST_BE_NEW")
    for parent in (dest.parent,*dest.parents):
        require(not (parent/".git").exists(), "OUTPUT_INSIDE_GIT")
    temp=dest.with_name(dest.name+".tmp")
    require(not temp.exists(), "TMP_EXISTS")
    try:
        temp.write_text(json.dumps(result,sort_keys=True,ensure_ascii=False,indent=2)+"\n",
                        encoding="utf8")
        temp.replace(dest)
    finally:
        temp.unlink(missing_ok=True)
    print(json.dumps({"matched":len(result["links"]),
                      "unresolved":result["probe"]["unresolvedGuids"],
                      "inspected":result["probe"]["scannedBundleCount"],
                      "failedBundles":result["probe"]["failedBundleCount"],
                      "output":str(dest)},ensure_ascii=False))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
