#!/usr/bin/env python3
"""Plan exact male icon sources for Steam Shop artwork, using the canonical
bundle catalog and original ClothingItemData; no image generation or upload.
The output is consumable by the existing shared_source_delta extract path.
Keep original evidence outside Git. Existing pixel/encoded-SHA ledgers remain
the authority for reuse; a new GUID alone is not a new image.
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from resolve_shop_catalog import resolve

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-02-acquisition"))
from acquisition import frames, single, wire, values

CLOTHING_SHA = "a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946"
DUMP_SHA = "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08"
VERSION = "1.26.2"
CATALOG_PINS = {
 "catalog.json": "d8f6f8ae340da3e30de8c46d059acbf49fc2d67e338d028fe953d02c0b285c48",
 "catalog.keyData.bin": "20be86edc02effe8f236e722ac0125459790de5415e9ba2f1456e3c85b5f6176",
 "catalog.bucketData.bin": "bcfdf91e4206bc09ea7a013a298f4f2432b9f84905deebc753776e800b07bc9e",
 "catalog.entryData.bin": "fc4a579b494b4e80c0ebfba5ca0d8d2d4abca10c34f3555b9ad84146b6aba866",
 "catalog.InternalIds.bin": "09d7a580c211d1a3606488403ea6431fdae3c63aa281152ccf3bccab7402b4c6",
}
GUID = re.compile(r"guid:([0-9a-f]{32})")
def check(ok, message):
    if not ok: raise ValueError(message)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def read_clothing(raw, dump):
    check(sha(raw)==CLOTHING_SHA and sha(dump)==DUMP_SHA,"Original source SHA mismatch")
    body=re.search(rb"^public sealed class ClothingItemData\s*:[^\n]*\n\{([\s\S]*?)\n\}",dump,re.M)
    check(body is not None,"Missing ClothingItemData declaration")
    fields={k.decode():int(v) for k,v in re.findall(rb"public const int (\w+)FieldNumber = (\d+);",body[1])}
    check(all(fields.get(k)==v for k,v in {"ID":1,"IconAddress":4,"MaleIconAddress":18,"EvolvingConditions":32}.items()),"Source schema mismatch")
    evolve=re.search(rb"^public sealed class EvolveClothData\s*:[^\n]*\n\{([\s\S]*?)\n\}",dump,re.M)
    check(evolve is not None and b"public const int EvolvesIntoFieldNumber = 14;" in evolve[1],"Evolution source schema mismatch")
    result={}
    for item,record in frames(raw,50000000):
        primary=single(record,4,2,True).decode()
        male=single(record,18,2,True).decode()
        check(GUID.fullmatch(primary) and GUID.fullmatch(male),"Unsupported original icon address")
        steps=[single(wire(v),14,0,True) for v in values(record,32,2)]
        result[item]=(primary,male,steps)
    check(len(result)==2041 and sum(a!=b for a,b,_ in result.values())==1208,"Original Clothing census mismatch")
    check(all(t in result for _,_,steps in result.values() for t in steps),"Unknown evolution target")
    return result

def select(catalog, clothing):
    check(catalog.get("schema")=="wand.item-master.premium-bundle-source@1" and
          catalog["source"]["steam"]["platform"]=="Steam" and
          catalog["source"]["steam"]["gameVersion"]==VERSION and
          len(catalog["definitions"])==catalog["counts"]["publicDefinitions"],"Canonical catalog mismatch")
    selected=set(); bundles=set(); seen=set()
    for definition in catalog["definitions"]:
        bid=definition["bundleId"]
        check(bid not in seen,"Duplicate bundle")
        seen.add(bid)
        revision=definition["current"]
        if revision is None:continue
        check(revision["gameVersion"]==VERSION,"Unsupported current revision")
        for component in revision["components"]:
            item=component["itemId"]
            if type(item) is not int or item//10000000!=5:continue
            check(item in clothing,"Catalog clothing not in original source")
            if component.get("image") in (None,""):
                selected.add(item);bundles.add(bid)
            # Evolution steps use independent native item icons, not the
            # purchased base's explicit Image field.
            selected.update(clothing[item][2])
    targets={clothing[i][1][5:] for i in selected if clothing[i][0]!=clothing[i][1]}
    return selected,bundles,targets

def plan(catalog, clothing, aa, prior):
    selected,bundles,targets=select(catalog,clothing)
    check(prior["schema"]=="wand.media.shop-source-release@2" and prior["gameVersion"]==VERSION and
          prior["state"]=="published" and prior["publicationAuthorized"] is True and prior["publicReadbackVerified"] is True,"Unverified prior Shop release")
    locs,pins=resolve(aa,targets)
    check(pins==CATALOG_PINS,"Addressables source mismatch")
    check(all(sorted(x["class"] for x in v)==["Sprite","Texture2D"] for v in locs.values()),"Unresolved typed sources")
    # Only reuse a complete typed reference; missing typed aliases still need
    # the existing exact-object extraction. Pixel-level reuse happens later.
    reused={g for g in targets if set(prior["references"].get(g,{}))=={"Sprite","Texture2D"}}
    missing=targets-reused
    spec={"schema":"wand.media.confirmed-shared-image-targets@1","gameVersion":VERSION,
          "targets":{g:"shop-512" for g in sorted(missing)}}
    report={"schema":"wand.media.private-shop-profile-icon-plan@1","privateOnly":True,
            "publicationAuthorized":False,"gameVersion":VERSION,"catalogSha256":pins,
            "clothingSha256":CLOTHING_SHA,"itemCount":len(selected),"bundleCount":len(bundles),
            "distinctMaleGuids":len(targets),"reusedTypedGuids":len(reused),
            "locations":{g:locs[g] for g in sorted(missing)}}
    return spec,report

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ("catalog","clothing","dump","aa","prior-release","out"):
        p.add_argument("--"+name,type=Path,required=True)
    a=p.parse_args();out=a.out.resolve()
    check(not out.exists() and not any((x/".git").exists() for x in out.parents),"New private output required")
    clothing=read_clothing(a.clothing.read_bytes(),a.dump.read_bytes())
    spec,report=plan(json.loads(a.catalog.read_bytes()),clothing,a.aa.resolve(),json.loads(a.prior_release.read_bytes()))
    out.mkdir(parents=True)
    for name,doc in (("shop-profile-icon-targets.json",spec),("shop-profile-icon-plan.private.json",report)):
        with (out/name).open("x",encoding="utf8") as f:json.dump(doc,f,separators=(",",":"));f.write("\n")
    print(json.dumps({k:v for k,v in report.items() if k!="locations"},indent=2))
    print("Pending GUIDs:",len(spec["targets"]))

if __name__=="__main__":main()
