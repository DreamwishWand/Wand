#!/usr/bin/env python3
"""Select, register and release exact typed Shop source images from completed extraction.
No native re-extraction, recomposition, or regeneration. Public catalog is the allowlist.
"""
import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
from bundle_thumbnails import POLICY, write_json
from publish_bundle_thumbnails import check, info, key
from project_shop_source_release import public_targets, SHA
from source_image_ledger import load, published, verify_local_or_published, signature
from shared_source_delta import REPORT_SCHEMA, INDEX_SCHEMA, prepare, register, verify

def select(catalog, report, cache):
    version, allowed = public_targets(catalog)
    check(report.get("schema") == "wand.media.private-typed-shop-sources@1" and
          report.get("privateOnly") is True and report.get("publicationAuthorized") is False and
          report.get("renderingVerified") is False and report.get("complete") is True and
          not report.get("errors") and report["gameVersion"] == version and
          cache["policy"] == POLICY, "Completed typed private source required")
    required = {}
    def add(address, cls):
        if address:
            required.setdefault(address[5:], set()).add(cls)
    for bundle in catalog["definitions"]:
        for row in (bundle["current"], bundle["legacy"]):
            if row is None: continue
            art = row.get("artwork") or {}
            add(art.get("image"), "Sprite")
            add(art.get("background"), "Texture2D")
            for address in (art.get("megaImages") or {}).values(): add(address, "Sprite")
            for component in row["components"]:
                add(component.get("image"), "Sprite")
                add(component.get("image"), "Texture2D")
    check(set(required) == allowed and allowed, "Public typed target coverage")
    missing = sorted(g for g, kinds in required.items() if
                     not kinds <= set(report["assets"].get(g, {}).get("sources", {})))
    check(not missing, f"{len(missing)} public GUIDs lack required typed sources; no upload")
    entries = {}
    images = {}
    for guid, kinds in sorted(required.items()):
        for cls in sorted(kinds):
            source = report["assets"][guid]["sources"][cls]
            original, thumb = source["original"], source.get("thumbnail")
            o = info(original)
            signature(original.get("sourcePixelSha256"), o["width"], o["height"])
            check(source["unityAssetId"].endswith(":"+cls) and thumb is not None and
                  cache["images"].get(o["sha256"]) == thumb, "Typed witness/thumbnail mismatch: "+guid)
            t = info(thumb)
            check(max(t["width"], t["height"]) <= 512 and
                  t["width"] <= o["width"] and t["height"] <= o["height"] and
                  (t == o if max(o["width"], o["height"]) <= 512 else max(t["width"], t["height"]) == 512),
                  "Thumbnail policy mismatch")
            for m in (o,t):
                check(images.setdefault(m["sha256"], m) == m, "Conflicting image metadata")
            entries[guid+":"+cls] = {"original": original, "thumbnail": t, "unityAssetId":source["unityAssetId"]}
    return version, entries, images

def batches(entries, max_objects=1800, max_bytes=450_000_000):
    result=[]; rows={}; objects={}
    for ref, row in entries.items():
        pair={m["sha256"]: info(m) for m in (row["original"], row["thumbnail"])}
        check(len(pair)<=max_objects and sum(m["bytes"] for m in pair.values())<=max_bytes,"Single pair exceeds budget")
        combined={**objects,**pair}
        if rows and (len(combined)>max_objects or sum(m["bytes"] for m in combined.values())>max_bytes):
            result.append(rows); rows={};objects={}
        rows[ref]=row; objects.update(pair)
    if rows: result.append(rows)
    return result

def stage(source, root, version, rows, ledger):
    assets={r:{"original":v["original"],"unityAssetId":v["unityAssetId"]} for r,v in rows.items()}
    refs={r:{"role":"shop-512","original":v["original"]["sha256"],"thumbnail":v["thumbnail"]["sha256"]} for r,v in rows.items()}
    images={m["sha256"]:info(m) for v in rows.values() for m in (v["original"],v["thumbnail"])}
    cache={v["original"]["sha256"]:v["thumbnail"] for v in rows.values()}
    docs={"shared-source-report.json":{"schema":REPORT_SCHEMA,"gameVersion":version,"privateOnly":True,
             "publicationAuthorized":False,"complete":True,"errors":{},"targets":{r:"shop-512" for r in rows},"assets":assets},
          "shared-index-candidate.json":{"schema":INDEX_SCHEMA,"gameVersion":version,"privateOnly":True,
             "thumbnailPolicy":POLICY,"references":refs,"images":images},
          "shared-thumbnail-cache.json":{"policy":POLICY,"images":cache}}
    root.mkdir(parents=True,exist_ok=True)
    (root/"images").mkdir(exist_ok=True)
    for name, doc in docs.items():
        p=root/name
        if p.exists(): check(json.loads(p.read_bytes())==doc,"Existing publication batch changed: "+name)
        else: write_json(p,doc)
    for sha,m in images.items():
        dest=root/key(sha)
        if dest.is_file() or published(ledger,m): continue
        src=verify_local_or_published(source,m,ledger)
        check(src.is_file(),"Local bytes required")
        try: os.link(src,dest)
        except OSError:
            with src.open("rb") as inp,dest.open("xb") as out: shutil.copyfileobj(inp,out)
    prepare(root,ledger)

def release(version, entries, images, ledger):
    check(all(published(ledger,m) for m in images.values()),"Complete verified CDN ledger coverage required")
    refs={}
    for ref,row in entries.items():
        guid,cls=ref.split(":")
        refs.setdefault(guid,{})[cls]=[row["original"]["sha256"],row["thumbnail"]["sha256"]]
    return {"schema":"wand.media.shop-source-release@2","state":"published","gameVersion":version,
            "publicationAuthorized":True,"publicReadbackVerified":True,"renderingVerified":False,
            "references":refs,"images":{sha:{k:m[k] for k in ("bytes","width","height")} for sha,m in images.items()}}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("mode",choices=("plan","publish","release"))
    p.add_argument("--catalog",type=Path,required=True)
    p.add_argument("--source",type=Path,required=True)
    p.add_argument("--ledger",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    source=a.source.resolve();out=a.out.resolve();lp=a.ledger.resolve()
    check(not any((x/".git").exists() for x in (source,*source.parents,out,*out.parents,lp,*lp.parents)),
          "Private workspace required")
    check(source!=out and lp!=out and not lp.is_relative_to(out),"Separate publication workspace and ledger required")
    check(lp.is_file(),"Existing verified ledger required; do not discard prior witnesses")
    ledger=load(json.loads(lp.read_bytes()))
    catalog=json.loads(a.catalog.read_bytes())
    report=json.loads((source/"typed-shop-source-report.json").read_bytes())
    cache=json.loads((source/"typed-shop-thumbnail-cache.json").read_bytes())
    version,entries,images=select(catalog,report,cache)
    groups=batches(entries)
    missing={s:m for s,m in images.items() if not published(ledger,m)}
    print(json.dumps({"publicGuids":len({r.split(":")[0] for r in entries}),"typedReferences":len(entries),
        "uniqueImages":len(images),"totalBytes":sum(m["bytes"] for m in images.values()),
        "ledgerReused":len(images)-len(missing),"notInVerifiedLedger":len(missing),
        "unverifiedBytes":sum(m["bytes"] for m in missing.values()),"batches":len(groups)},indent=2),flush=True)
    if a.mode=="plan":
        for i,m in enumerate(images.values(),1):
            verify_local_or_published(source,m,ledger)
            if i==1 or i%100==0 or i==len(images): print(f"  Source verification {i}/{len(images)}",flush=True)
        return
    if a.mode=="publish":
        for i,rows in enumerate(groups,1):
            root=out/("batch-%03d"%i)
            print(f"Publication batch {i}/{len(groups)}",flush=True)
            stage(source,root,version,rows,ledger)
            if not (root/"shared-publication-receipt.json").is_file():
                register(root,ledger,1800,450_000_000,True)
            check((root/"shared-publication-receipt.json").is_file(),"Upload not completed; rerun to resume")
            _,_,_,objects=prepare(root,ledger)
            if not (root/"shared-cdn-readback.json").is_file() or not all(published(ledger,m) for m in objects.values()):
                result=verify(root,ledger,lp,1800,450_000_000,"curl")
                check(result and result["ledgerUpdated"],"CDN verification incomplete; rerun to resume")
                ledger=load(json.loads(lp.read_bytes()))
            check(all(published(ledger,m) for m in objects.values()),"Missing verified batch")
    result=release(version,entries,images,ledger)
    out.mkdir(parents=True,exist_ok=True)
    path=out/"typed-shop-release.json"
    if path.exists():check(json.loads(path.read_bytes())==result,"Different release already exists")
    else:write_json(path,result)
    print("Return verified public release:",path,flush=True)

if __name__=="__main__":main()
