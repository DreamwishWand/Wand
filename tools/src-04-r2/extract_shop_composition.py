#!/usr/bin/env python3
"""Extract private Shop artwork composition descriptors; no image or network writes.

Fields are preserved as authored in the native snapshot. Missing values remain
absent: default layouts, actual image precedence and template geometry require
separate Unity rendering evidence. Never infer GUIDs from asset names.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

VISUAL = (
    "Background", "Image", "Layout", "LightLayout", "AdjustImage",
    "ImageAdjustment", "MegaBundleAdjustment", "OverrideAccentColor",
    "AccentColor", "UnPinColor",
)
CONTENT_VISUAL = ("Image", "ImageAdjustment", "ForcePreview2D")

def select(data, fields):
    return {k: data[k] for k in fields if k in data}

def extract(raw):
    outer = json.loads(raw)
    if not isinstance(outer.get("Data"), dict):
        raise ValueError("Invalid Shop cache")
    rows = []
    for snapshot_key, encoded in sorted(outer["Data"].items()):
        snap = json.loads(encoded) if isinstance(encoded, str) else encoded
        if snap.get("OnlineId") != snapshot_key:
            raise ValueError("Snapshot identity mismatch")
        seen = set()
        for category in snap["Categories"]:
            for root in category["Data"].values():
                entries = [(None, o) for o in root.get("Bundles", [])]
                for store in root.get("Stores", []):
                    sd = store["Data"]
                    if sd.get("OnlineId") != store["Id"]:
                        raise ValueError("Store identity mismatch")
                    entries.extend((store, o) for o in sd.get("BundleContents", []))
                for store, offer in entries:
                    d = offer["Data"]
                    bid = offer["Id"]
                    if bid != d.get("OnlineId") or bid in seen:
                        raise ValueError("Offer identity mismatch")
                    seen.add(bid)
                    contents = []
                    for part in d["Contents"]:
                        contents.append({"itemId": part["ItemId"],
                                         "quantity": part["Quantity"],
                                         "visual": select(part, CONTENT_VISUAL)})
                    rows.append({"snapshotKey": snapshot_key, "offerId": bid,
                                 "storeId": store["Id"] if store else None,
                                 "storeVisual": select(store["Data"], VISUAL) if store else {},
                                 "visual": select(d, VISUAL), "contents": contents})
    return {"schema": "wand.media.private-shop-composition-source@1",
            "privateOnly": True, "publicationAuthorized": False,
            "renderingVerified": False,
            "sourceSha256": hashlib.sha256(raw).hexdigest(),
            "offers": rows}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("source", type=Path)
    p.add_argument("output", type=Path)
    a = p.parse_args()
    out = a.output.resolve()
    if any((parent / ".git").exists() for parent in out.parents):
        raise ValueError("Private source projection must stay outside Git")
    if out == a.source.resolve():
        raise ValueError("Cannot overwrite source")
    doc = extract(a.source.read_bytes())
    with out.open("x", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Offer appearances:", len(doc["offers"]))
    print("Rendering verified: false")

if __name__ == "__main__":
    main()
