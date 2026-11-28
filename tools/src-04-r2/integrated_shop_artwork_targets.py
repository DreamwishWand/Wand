#!/usr/bin/env python3
"""Private artwork reference projection from the DB-01 integrated premium source."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from resolve_shop_catalog import resolve
from bundle_thumbnails import write_json

GUID = re.compile(r"guid:([a-f0-9]{32})")
SHA = re.compile(r"[a-f0-9]{64}")
SCHEMA = "wand.item-master.premium-bundle-private-source@1"

def extract(doc):
    if doc.get("schema") != SCHEMA or doc.get("privateOnly") is not True or doc.get("publicationAuthorized") is not False:
        raise ValueError("Expected private DB-01 source")
    bundles = doc["bundles"]
    if len(bundles) != doc["counts"]["total"]:
        raise ValueError("Bundle count mismatch")
    rows = {}
    refs = set()
    def legacy_reference(bid,bundle):
        row=doc['legacyDefinitions'][bid]
        rev=row['revisionSha256']
        if bundle.get('legacyRevisionSha256')!=rev or not SHA.fullmatch(rev):
            raise ValueError('Legacy revision mismatch')
        fields={};unsupported=[]
        def add(field,value):
            if value is None or value=='':return
            m=GUID.fullmatch(value) if isinstance(value,str) else None
            if m:fields[field]=m[1];refs.add(m[1])
            else:unsupported.append(field)
        for field in ('image','background'):add(field,row['artwork'].get(field))
        for i,part in enumerate(row['components']):add(f'Contents.{i}.Image',part.get('image'))
        return {'platform':'Switch','revisionSha256':rev,'refs':fields,'lightLayout':None,'legacyLayout':None,'unsupportedFields':unsupported}
    for bid, bundle in sorted(bundles.items()):
        fields = {}
        unsupported = []
        def add(field, value):
            if value is None or value == "":
                return
            m = GUID.fullmatch(value) if isinstance(value, str) else None
            if m:
                fields[field] = m[1]
                refs.add(m[1])
            else:
                unsupported.append(field)
        observed = bundle.get("serverObservation")
        if observed:
            rev = observed["revisionSha256"]
            row = doc["steamRevisions"][rev]
            native = row["nativeOffer"]
            v = native["Data"]
            if not (bid == row["bundleId"] == native["Id"] == v["OnlineId"] and rev == row["revisionSha256"]):
                raise ValueError("Steam revision mismatch")
            if doc["serverDefinitions"][bid]["revisionSha256"] != rev:
                raise ValueError("Server definition mismatch")
            platform = "Steam"
            for field in ("Image", "Background"):
                add(field, v.get(field))
            for i, part in enumerate(v["Contents"]):
                add(f"Contents.{i}.Image", part.get("Image"))
            for i in range(1,5):
                field = f"OverridedImage{i}"
                add(f"MegaBundleAdjustment.{field}", (v.get("MegaBundleAdjustment") or {}).get(field))
            layout, legacy = v.get("LightLayout"), v.get("Layout")
        else:
            if bundle.get("legacyOnly") is not True:
                raise ValueError("Missing selected revision")
            rows[bid]=legacy_reference(bid,bundle)
            continue
        if not SHA.fullmatch(rev):
            raise ValueError("Invalid revision")
        rows[bid] = {"platform": platform, "revisionSha256": rev, "refs": fields,
                     "lightLayout": layout, "legacyLayout": legacy, "unsupportedFields": unsupported}
        # Keep the historical revision separate even when a Steam revision is
        # available. Its distinct GUIDs also belong to the extraction census.
        if bundle.get("legacyRevisionSha256") is not None:
            rows[bid]["historicalRevision"]=legacy_reference(bid,bundle)
    if sum(r["platform"] == "Steam" for r in rows.values()) != doc["counts"]["steam"]:
        raise ValueError("Steam source count mismatch")
    return rows, refs

def project(raw, aa):
    doc = json.loads(raw)
    rows, refs = extract(doc)
    locs, pins = resolve(aa, refs)
    unresolved = sorted(g for g in refs if not locs[g])
    report = {"schema":"wand.media.private-integrated-shop-artwork-refs@1","privateOnly":True,
              "publicationAuthorized":False,"renderingVerified":False,
              "sourceSha256":hashlib.sha256(raw).hexdigest(),"catalogSha256":pins,
              "bundles":rows,"locations":locs,"unresolvedGuids":unresolved}
    # Addresses are confirmed, not necessarily visible in the selected native layout.
    # Extraction must still resolve each typed serialized object and verify pixel bytes.
    sources = doc["steamSources"]
    latest = doc["latestSteamSource"]
    if not isinstance(sources,list) or not isinstance(latest,dict) or latest not in sources:
        raise ValueError("Latest Steam source mismatch")
    if latest.get("platform")!="Steam" or not re.fullmatch(r"\d+\.\d+\.\d+",latest["gameVersion"]):
        raise ValueError("Invalid latest Steam source")
    targets = {"schema":"wand.media.confirmed-shared-image-targets@1",
               "gameVersion":latest["gameVersion"],
               "targets":{g:"shop-512" for g in sorted(refs) if locs[g]}}
    return report, targets

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source",type=Path,required=True)
    p.add_argument("--aa",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    out=a.out.resolve()
    if out.exists() or any((x/".git").exists() for x in out.parents):
        raise ValueError("New private output directory required")
    report, targets=project(a.source.read_bytes(),a.aa.resolve())
    out.mkdir(parents=True)
    write_json(out/"integrated-shop-artwork-refs.json",report)
    write_json(out/"shop-image-targets.json",targets)
    print(json.dumps({"bundles":len(report["bundles"]),"guids":len(report["locations"]),
                      "unresolvedGuids":len(report["unresolvedGuids"]),
                      "withoutExplicitImage":sum(not r["refs"] for r in report["bundles"].values()),
                      "historicalRevisions":sum("historicalRevision" in r for r in report["bundles"].values()),
                      "historicalOnlyGuids":len({g for r in report["bundles"].values() for g in r.get("historicalRevision",{}).get("refs",{}).values()}-{g for r in report["bundles"].values() for g in r["refs"].values()}),
                      "unsupportedFields":sum(len(r["unsupportedFields"]) for r in report["bundles"].values()),
                      "publicationAuthorized":False},indent=2))

if __name__=="__main__":
    main()
