"""Sanitize an original-backed Shop cache to a price-free catalog source.
Private cache stays outside Git. Preserve exact authored title and item order.
Only confirmed original sources should be pinned in public-native-shop.ts.
"""
import argparse
import hashlib
import json
from pathlib import Path

def extract(raw, key):
    outer=json.loads(raw)
    snap=json.loads(outer["Data"][key])
    if snap["OnlineId"]!=key or snap["Language"]!="en-US":
        raise ValueError("source identity or language mismatch")
    rows=[]
    seen=set()
    for category in snap["Categories"]:
        for root in category["Data"].values():
            offers=root.get("Bundles",[])+[
                offer for store in root.get("Stores",[]) for offer in store["Data"].get("BundleContents",[])]
            for offer in offers:
                d=offer["Data"]
                if d["OnlineId"]!=offer["Id"] or d["Language"]!="en-US" or d["Active"] is not True or offer["Id"] in seen:
                    raise ValueError("invalid or duplicate offer identity")
                seen.add(offer["Id"])
                parts=[[p["ItemId"],p["Quantity"]] for p in d["Contents"]]
                if not parts or any(type(v) is not int or not 0<v<=9007199254740991 for part in parts for v in part):
                    raise ValueError("invalid item or quantity")
                rows.append([offer["Id"],category["Title"],d.get("Title") or None,parts])
    return json.dumps({"schema":"wand.shop.bundle-catalog-source@1","snapshotKey":key,
        "sourceSha256":hashlib.sha256(raw).hexdigest(),"sourceLocale":"en-US","offers":rows},
        ensure_ascii=False,separators=(",",":")).encode("utf-8")

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("source",type=Path)
    p.add_argument("snapshot")
    p.add_argument("output",type=Path)
    args=p.parse_args()
    data=extract(args.source.read_bytes(),args.snapshot)
    with args.output.open("xb") as f: f.write(data)
    print(len(data),hashlib.sha256(data).hexdigest())

if __name__=="__main__": main()
