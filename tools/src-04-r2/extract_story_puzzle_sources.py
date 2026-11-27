#!/usr/bin/env python3
"""Extract Quest Puzzle / Lorekeeper images from exact DB-01 Story addresses.
Local-only; preserve original assets, generate only missing 512px completed-image
thumbnails. No precomposed puzzle states, template guessing, or R2 mutations.
"""
import argparse
import base64
import json
import re
import zlib
from collections import defaultdict
from pathlib import Path
from bundle_thumbnails import DEFAULT_ROOT, MAX_EDGE, POLICY, image_info, resize, write_json
from extract_memory_sources import exact_objects, manifests, materialize, object_identity, verify_game_version
from resolve_shop_catalog import resolve

FIELDS = ("ImageAddress", "IconAddress", "BlurredIconAddress", "PuzzleTemplateAddress")
GUID = re.compile(r"guid:([0-9a-f]{32})")
SHA = re.compile(r"[0-9a-f]{64}")

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def read_story_rows(parts):
    source = None
    fields = {}
    for path in parts:
        doc = json.loads(path.read_bytes())
        identity = (doc["gameVersion"], doc["sourceItemsSha256"], doc["sourceIl2cppDumpSha256"])
        require(source is None or source == identity, "Mixed DB-01 sources")
        source = identity
        for field in (*FIELDS, "IsMissionItem"):
            key = "Story." + field + ("@bool" if field == "IsMissionItem" else "@string")
            if key not in doc["fields"]:
                continue
            require(field not in fields, "Duplicate field: " + field)
            packed = doc["fields"][key]
            rows = json.loads(zlib.decompress(base64.b64decode(packed["packed"], validate=True)))
            require(len(rows) == packed["count"], "DB-01 field count mismatch")
            values = {}
            item = 0
            for delta, value in rows:
                require(type(delta) is int and delta > 0, "Invalid Item ID delta")
                item += delta
                if field == "IsMissionItem":
                    require(type(value) is bool, "Invalid mission flag")
                else:
                    require(isinstance(value, str) and GUID.fullmatch(value), "Unsupported Story address: " + field)
                values[item] = value
            fields[field] = values
    require(source and set(fields) == set(FIELDS) | {"IsMissionItem"}, "Missing Story fields")
    ids = set(fields["ImageAddress"])
    require(ids and all(set(fields[k]) == ids for k in FIELDS), "Incomplete Story references")
    require(set(fields["IsMissionItem"]) <= ids, "Unexpected mission Item IDs")
    rows = {item: {**{k: fields[k][item] for k in FIELDS},
                   "IsMissionItem": fields["IsMissionItem"].get(item, False)} for item in sorted(ids)}
    return source, rows

def target_roles(rows):
    result = defaultdict(set)
    for row in rows.values():
        for k in FIELDS[:3]:
            result[row[k][5:]].add(k)
    return dict(result)

def meta(row):
    return {k: row[k] for k in ("sha256", "bytes", "width", "height")}

def local_image(out, row):
    info = meta(row)
    path = out / "images" / (info["sha256"] + ".webp")
    if row.get('reusedPublished'):return {**info,'sourcePixelSha256':row['sourcePixelSha256']}
    raw = Path(row["localSource"]).read_bytes()
    require(image_info(raw, info["sha256"]) == info, "Source image metadata mismatch")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        require(path.read_bytes() == raw, "Existing image collision")
    else:
        with path.open("xb") as handle:
            handle.write(raw)
    return {**info,'sourcePixelSha256':row['sourcePixelSha256']} if row.get('sourcePixelSha256') else info

def thumbnail(out, original, cache, ledger=None):
    from source_image_ledger import thumbnail as published_thumbnail
    original=meta(original)
    prior=published_thumbnail(ledger,original)
    if prior:return prior
    sha = original["sha256"]
    if max(original["width"], original["height"]) <= MAX_EDGE:
        return original
    old = cache.get(sha)
    if isinstance(old, dict) and SHA.fullmatch(str(old.get("sha256", ""))):
        path = out / "images" / (old["sha256"] + ".webp")
        if path.is_file() and image_info(path.read_bytes(), old["sha256"]) == old:
            if max(old["width"], old["height"]) <= MAX_EDGE and old["width"] <= original["width"] and old["height"] <= original["height"]:
                return old
    _, result, raw = resize({**original, "path": out / "images" / (sha + ".webp")})
    path = out / "images" / (result["sha256"] + ".webp")
    if path.exists():
        require(path.read_bytes() == raw, "Thumbnail collision")
    else:
        with path.open("xb") as handle:
            handle.write(raw)
    return result

def run(parts, aa, root, out, ledger=None):
    source, rows = read_story_rows(parts)
    version = verify_game_version(aa, source[0])
    roles = target_roles(rows)
    locations, pins = resolve(aa, set(roles), ("UnityEngine.Texture2D", "UnityEngine.Sprite"))
    report = {"schema": "wand.media.private-story-puzzle-sources@1", "gameVersion": source[0],
              "sourceItemsSha256": source[1], "sourceIl2cppDumpSha256": source[2],
              "sourceFullVersion": version, "catalogSha256": pins, "items": rows,
              "locations": locations, "assets": {}, "errors": {}, "publicationAuthorized": False,
              "puzzleTemplateRenderingVerified": False}
    existing = manifests(root)
    # Reuse this extraction's exact source identities on reruns.
    prior_path = out / "story-puzzle-source-report.json"
    if prior_path.is_file():
        prior = json.loads(prior_path.read_bytes())
        if prior.get("catalogSha256") == pins:
            for a in prior.get("assets", {}).values():
                v = a["original"]
                sha = v["sha256"]
                if SHA.fullmatch(sha):
                    path = out / "images" / (sha + ".webp")
                    if path.is_file():
                        existing.setdefault(a["unityAssetId"], []).append((path, v))
    memo = {}
    for guid, match, error in exact_objects(aa, locations):
        if error:
            report["errors"].setdefault(guid, []).append(error)
            continue
        identity, refs, bundles = match
        try:
            obj = refs["Image"]
            ident = object_identity(obj, bundles)[0]
            cache_key=(ident,'ImageAddress' in roles[guid])
            if cache_key not in memo:
                # Verify native RGBA even when reusing an existing source object.
                m = materialize(obj, bundles, existing, out, True, ledger, 'story-puzzle-thumbnail-cache.json' if cache_key[1] else None)
                memo[cache_key] = local_image(out, m)
            value = {"unityAssetId": identity, "original": memo[cache_key]}
            prior = report["assets"].get(guid)
            if prior and prior["original"] != value["original"]:
                raise ValueError("Conflicting exact catalog image objects")
            if prior is None:
                report["assets"][guid] = value
        except Exception as exc:
            report["errors"].setdefault(guid, []).append(type(exc).__name__ + ": " + str(exc)[:200])
    missing = sorted(g for g in roles if g not in report["assets"] or g in report["errors"])
    report["complete"] = not missing
    report["summary"] = {"itemCount": len(rows), "questPuzzles": sum(v["IsMissionItem"] for v in rows.values()),
                         "lorekeeperCandidates": sum(not v["IsMissionItem"] for v in rows.values()),
                         "targetGuids": len(roles), "resolvedGuids": len(report["assets"]),
                         "unresolvedGuids": missing, "errorGuids": len(report["errors"])}
    write_json(prior_path, report)
    if missing:
        return report["summary"], False
    previous = {}
    cache_path = out / "story-puzzle-thumbnail-cache.json"
    if cache_path.is_file():
        old = json.loads(cache_path.read_bytes())
        if old.get("policy") == POLICY:
            previous = old.get("images", {})
    cache = {}
    images = {}
    refs = {}
    for guid, a in sorted(report["assets"].items()):
        orig = meta(a["original"])
        images[orig["sha256"]] = orig
        r = {"original": orig["sha256"]}
        if "ImageAddress" in roles[guid]:
            sha = orig["sha256"]
            if sha not in cache:
                cache[sha] = thumbnail(out, orig, previous, ledger)
            t = cache[sha]
            images[t["sha256"]] = t
            r["thumbnail"] = t["sha256"]
        refs[guid] = r
    write_json(cache_path, {"policy": POLICY, "images": cache})
    # No machine-local paths, Unity GUIDs or raw template references in the
    # candidate index. Template identities stay in the private source report.
    index = {"schema": "wand.media.story-puzzle-index@1", "gameVersion": source[0],
             "thumbnailPolicy": POLICY, "maxThumbnailLongEdge": MAX_EDGE,
             "items": {str(item): {"isMissionItem": row["IsMissionItem"],
                                  "image": refs[row["ImageAddress"][5:]],
                                  "icon": refs[row["IconAddress"][5:]]["original"],
                                  "blurredIcon": refs[row["BlurredIconAddress"][5:]]["original"]}
                       for item, row in rows.items()},
             "images": images}
    write_json(out / "story-puzzle-index-candidate.json", index)
    summary = {**report["summary"], "originalImages": len({a["original"]["sha256"] for a in report["assets"].values()}),
               "uniqueThumbnails": len({v["sha256"] for v in cache.values()}),
               "uniqueImages": len(images), "totalBytes": sum(v["bytes"] for v in images.values()),
               "publicationVerified": False}
    write_json(out / "story-puzzle-generation-report.json", summary)
    return summary, True

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--db01", type=Path, action="append", required=True)
    p.add_argument("--aa", type=Path, required=True)
    p.add_argument("--existing-root", type=Path, default=DEFAULT_ROOT)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument('--ledger',type=Path)
    a = p.parse_args()
    from source_image_ledger import load
    ledger=load(json.loads(a.ledger.read_bytes())) if a.ledger else None
    out, aa, root = a.out.resolve(), a.aa.resolve(), a.existing_root.resolve()
    require(not any((x / ".git").exists() for x in (out, *out.parents))
            and not out.is_relative_to(aa) and not out.is_relative_to(root)
            and not root.is_relative_to(out), "Use a separate private output directory")
    summary, complete = run(a.db01, aa, root, out, ledger)
    print(json.dumps(summary, indent=2), flush=True)
    if not complete:
        raise SystemExit(2)

if __name__ == "__main__":
    main()
