#!/usr/bin/env python3
"""Compare Shop product-image reuse using an existing private artwork plan.

Counts are content-addressed, not per GUID or per offer. This is a metadata-only
comparison; it does not authorize publication, prove rendering, or perform I/O
against R2. Item fallback and scroll artwork are excluded from the byte totals.
"""
import argparse
import json
import re
from pathlib import Path

SHA = re.compile(r"[a-f0-9]{64}")
GUID = re.compile(r"[a-f0-9]{32}")


def image(row, role):
    if not isinstance(row, dict):
        raise ValueError("Invalid image metadata")
    key = row.get("sha256")
    size = row.get("bytes")
    width, height = row.get("width"), row.get("height")
    if (not isinstance(key, str) or not SHA.fullmatch(key)
            or any(type(n) is not int or n <= 0 for n in (size, width, height))
            or (role == "thumbnail" and max(width, height) > 512)):
        raise ValueError("Invalid image metadata")
    return key, (size, width, height)


def add(dest, key, value):
    if key in dest and dest[key] != value:
        raise ValueError("Conflicting metadata for one content hash")
    dest[key] = value


def measure(images):
    return {"objects": len(images), "bytes": sum(v[0] for v in images.values())}


def compare(plan):
    if plan.get("schema") != "wand.media.private-shop-product-artwork-plan@1":
        raise ValueError("Unknown private plan schema")
    if plan.get("publicationAuthorized") is not False or plan.get("renderingVerified") is not False:
        raise ValueError("Expected an unverified private plan")
    pairs = plan["pairs"]
    direct, multi = {}, {}
    roles = {r: {"direct": {}, "multi": {}} for r in ("original", "thumbnail")}
    item_ids, missing = set(), set()
    counts = {"singleGuid": 0, "singleItem": 0, "multi": 0}
    for offer in plan["offers"]:
        refs = offer["refs"]
        if not isinstance(refs, list) or not refs:
            raise ValueError("Empty artwork reference list")
        group = "direct" if len(refs) == 1 else "multi"
        if group == "direct":
            if refs[0][0] not in ("item", "guid"):
                raise ValueError("Unsupported reference kind")
            counts["singleItem" if refs[0][0] == "item" else "singleGuid"] += 1
        else:
            counts["multi"] += 1
        for kind, ref in refs:
            if kind == "item":
                if type(ref) is not int or ref <= 0:
                    raise ValueError("Invalid Item ID")
                item_ids.add(ref)
                continue
            if kind != "guid" or not isinstance(ref, str) or not GUID.fullmatch(ref):
                raise ValueError("Invalid GUID reference")
            if ref not in pairs:
                missing.add(ref)
                continue
            pair = pairs[ref]["pair"]
            o, t = image(pair["original"], "original"), image(pair["thumbnail"], "thumbnail")
            if t[1][1] > o[1][1] or t[1][2] > o[1][2]:
                raise ValueError("Upscaled thumbnail")
            for role, (key, meta) in (("original", o), ("thumbnail", t)):
                add(roles[role][group], key, meta)
                add(direct if group == "direct" else multi, key, meta)
    def summarize(a, b):
        union = dict(a)
        for k, v in b.items():
            add(union, k, v)
        return {
            "direct": measure(a),
            "multi": measure(b),
            "shared": measure({k: v for k, v in b.items() if k in a}),
            "multiExclusive": measure({k: v for k, v in b.items() if k not in a}),
            "total": measure(union),
        }
    return {
        "schema": "wand.media.private-shop-artwork-reuse-cost@1",
        "publicationAuthorized": False,
        "renderingVerified": False,
        "recipes": counts,
        "missingGuidCount": len(missing),
        "itemReferenceCount": len(item_ids),
        "excludesItemAndScrollBytes": True,
        "roles": {r: summarize(v["direct"], v["multi"]) for r, v in roles.items()},
        "allRolesDeduplicated": summarize(direct, multi),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("plan", type=Path)
    args = p.parse_args()
    print(json.dumps(compare(json.loads(args.plan.read_bytes())), indent=2))


if __name__ == "__main__":
    main()
