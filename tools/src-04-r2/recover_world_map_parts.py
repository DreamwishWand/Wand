#!/usr/bin/env python3
"""Recover existing original map WebPs or re-extract exact Steam 1.26.2 sprites."""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
from pathlib import Path
from bundle_thumbnails import image_info
from publish_world_map_parts import prepare, SOURCE, check
from resolve_shop_catalog import resolve
from extract_memory_sources import exact_objects, verify_game_version

SKIP = {".git", "node_modules", "appdata", "$recycle.bin", "system volume information",
        "windows", "program files", "program files (x86)", ".venv", "venv", "__pycache__"}

def source_rows(report):
    check(report.get("schema") == "wand.src04.world-map-repair@3" and report.get("gameVersion") == "1.26.2"
          and report.get("publicationAuthorized") is False and len(report["worlds"]) == 10, "Unexpected bundled source index")
    rows = [p for w in report["worlds"] for p in w["parts"]]
    check(len(rows) == 109 and len({p["imageSha256"] for p in rows}) == 109, "Unexpected native map coverage")
    for p in rows:
        m = SOURCE.fullmatch(p["imagePath"])
        e = p["layoutEvidence"]
        check(m and m[1] == m[2][:2] and re.fullmatch(r"[a-f0-9]{64}", p["imageSha256"]) and
              e.get("componentEnabled") is True and e.get("mapping") == "observed_guid_field_exact_catalog_internal_id_container_pptr" and
              re.fullmatch(r"[a-f0-9]{32}", e["guid"]) and e["catalogInternalIds"] == [e["guid"]] and
              isinstance(e["highSprite"], list) and len(e["highSprite"]) == 2 and
              re.fullmatch(r"cab-[a-f0-9]{32}", e["highSprite"][0], re.I) and re.fullmatch(r"-?\d+", e["highSprite"][1]),
              "Invalid native sprite reference")
    return rows

def matches(path, sha):
    try:
        if not path.is_file() or not 20 <= path.stat().st_size <= 80*1024*1024:
            return False
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != sha:
            return False
        image_info(raw, sha)
        return True
    except (OSError, ValueError, SyntaxError):
        return False

def install(raw, dest, sha):
    image_info(raw, sha)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        check(matches(dest, sha), "Existing cache contains conflicting bytes: "+str(dest))
        return
    temp = dest.with_suffix(".tmp")
    with temp.open("wb") as f:
        f.write(raw)
    check(matches(temp, sha), "Cache verification failed")
    temp.replace(dest)

def recover_local(rows, roots, out):
    pending = {p["imageSha256"]:p for p in rows if not matches(out/p["imagePath"], p["imageSha256"])}
    by_name = {}
    for sha,p in pending.items():
        for name in (Path(p["imagePath"]).name, sha+".webp"):
            by_name.setdefault(name.casefold(),set()).add(sha)
    found = 0
    seen = set()
    for root in roots:
        if not pending:
            break
        if not root.is_dir():
            continue
        print("Searching existing images:",root,flush=True)
        for directory, dirs, files in os.walk(root, followlinks=False):
            path = Path(directory)
            if path.resolve() in seen:
                dirs[:] = []
                continue
            seen.add(path.resolve())
            dirs[:] = [d for d in dirs if d.casefold() not in SKIP and
                       not (path/d).is_symlink() and (path/d).resolve()!=out]
            for name in files:
                for sha in by_name.get(name.casefold(),()):
                    if sha not in pending:
                        continue
                    src = path/name
                    if matches(src,sha):
                        install(src.read_bytes(),out/pending[sha]["imagePath"],sha)
                        pending.pop(sha)
                        found += 1
            if not pending:
                break
    print("Recovered existing originals:",found,"; missing:",len(pending),flush=True)
    return pending

def extract_missing(aa, pending, out):
    if not pending:
        return
    verify_game_version(aa,"1.26.2")
    targets = {p["layoutEvidence"]["guid"]:p for p in pending.values()}
    locations,_ = resolve(aa,set(targets),("UnityEngine.Sprite",))
    for guid,p in targets.items():
        ids = p["layoutEvidence"]["catalogInternalIds"]
        check(len(locations[guid])==1 and locations[guid][0]["internalId"] in ids,"Exact sprite catalog location missing: "+p["name"])
    done = set()
    for guid,result,error in exact_objects(aa,locations):
        p=targets[guid]
        check(not error and result is not None,"Exact native sprite unresolved: "+p["name"]+" "+str(error))
        _,refs,_=result
        obj=refs["Image"]
        cab,pid=p["layoutEvidence"]["highSprite"]
        check(str(obj.assets_file.name).casefold()==cab.casefold() and obj.path_id==int(pid),"Native serialized sprite identity changed: "+p["name"])
        sprite=obj.read()
        check(sprite.m_Name==p["name"],"Native sprite name mismatch: "+p["name"])
        native=sprite.image
        sha=p["imageSha256"]
        # Only byte-identical reproduction can reuse the original layout report.
        # No inferred substitutions or publication of a different encoding.
        for img in (native.convert("RGBA"),native):
            buf=io.BytesIO()
            img.save(buf,format="WEBP",lossless=True,quality=100,method=6,exact=True)
            raw=buf.getvalue()
            if hashlib.sha256(raw).hexdigest()==sha:
                install(raw,out/p["imagePath"],sha)
                done.add(guid)
                print("Reproduced:",p["name"],flush=True)
                break
        else:
            print("Original WebP bytes not reproduced:",p["name"],flush=True)
    check(done==set(targets),"Some originals could not be reproduced exactly. No publication; retain recovered originals.")

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--report",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--search",type=Path,action="append",default=[])
    p.add_argument("--aa",type=Path)
    a=p.parse_args()
    out=a.out.resolve()
    check(not any((x/".git").exists() for x in [out,*out.parents]),"Private cache outside Git required")
    report=json.loads(a.report.read_bytes())
    rows=source_rows(report)
    pending=recover_local(rows,a.search,out)
    if pending and not a.aa:
        print("Missing originals; matching Steam installation required.",flush=True)
        raise SystemExit(3)
    if pending:
        extract_missing(a.aa.resolve(),pending,out)
    prepare(report,out)
    print("All 109 original WebPs verified.",flush=True)

if __name__=="__main__":
    main()
