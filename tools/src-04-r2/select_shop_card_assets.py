"""Offline native Shop card image candidate selection (Steam 1.26.2).
This is a selection projection, not a publication manifest or rendering proof.
"""
import argparse
import json
from pathlib import Path
from extract_shop_composition import extract

LAYOUTS = {"Light_Dual", "Light_Single", "Light_Single_111", "Light_Single_1111", "Light_Mega_11", "Light_Mega_111", "Light_Mega_1111"}

def select(row):
    v, parts = row["visual"], row["contents"]
    layout = v.get("LightLayout", "Light_Dual")
    if layout not in LAYOUTS:
        return {"layout": layout, "status": "unsupported", "bindings": {}}
    def icon(i):
        if i >= len(parts):
            return {"missingContent": i}
        part = parts[i]
        return part["visual"].get("Image") or {"nativeItemIconRequired": part["itemId"]}
    b = {}
    if v.get("Background"):
        b["Background"] = v["Background"]
    if layout.startswith("Light_Mega_"):
        for i in range(len(layout.rsplit("_", 1)[1])):
            key = "OverridedImage" + str(i + 1)
            b["MegaBundleImage" + str(i + 1)] = (v.get("MegaBundleAdjustment") or {}).get(key) or icon(i)
    elif layout in ("Light_Single_111", "Light_Single_1111"):
        for i in range(len(layout.rsplit("_", 1)[1])):
            b["Items[" + str(i) + "].Icon"] = icon(i)
    else:
        main = v.get("Image") if v.get("Layout") not in ("Single_Mega_11", "Single_Mega_111", "Single_Mega_1111") else None
        b["CurrentImage"] = main or icon(0)
        if layout == "Light_Single":
            for i in range(len(parts)):
                b["Scroll[" + str(i) + "].Icon"] = icon(i)
    return {"layout": layout, "status": "candidate", "bindings": b}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cache", type=Path, action="append", required=True)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    if any((x / ".git").exists() for x in a.out.resolve().parents):
        raise ValueError("Private output outside Git required")
    rows = [{"snapshotKey": r["snapshotKey"], "offerId": r["offerId"], **select(r)}
            for p in a.cache for r in extract(p.read_bytes())["offers"]]
    with a.out.open("x", encoding="utf8") as f:
        json.dump({"schema": "wand.media.private-shop-card-selection@1",
                   "privateOnly": True, "publicationAuthorized": False,
                   "typedConsumerSelectionVerified": False, "renderingVerified": False,
                   "runtimeItemOrderVerified": False, "offers": rows}, f, indent=2)

if __name__ == "__main__":
    main()
