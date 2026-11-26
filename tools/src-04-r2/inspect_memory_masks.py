#!/usr/bin/env python3
"""Offline native memory mask evidence. No writes to images, save or R2.

Reports exact RGBA values, channel histograms, dominant color bounding boxes
and transparent RGB statistics. A color/region count does not establish shard-bit order.
"""
import argparse
import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from PIL import Image

SHA = re.compile(r"[0-9a-f]{64}")
POLICY = "lossless-webp-lanczos-512-v1"


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def read_pixels(root, sha, meta):
    require(SHA.fullmatch(sha) and meta["sha256"] == sha, "Invalid image identity")
    path = (root / "images" / (sha + ".webp")).resolve()
    require(path.is_relative_to(root), "Image outside source directory")
    raw = path.read_bytes()
    require(len(raw) == meta["bytes"] and hashlib.sha256(raw).hexdigest() == sha,
            "Source bytes mismatch: " + sha)
    with Image.open(io.BytesIO(raw)) as image:
        require(image.format == "WEBP" and image.size == (meta["width"], meta["height"]),
                "Source dimensions mismatch")
        require(image.width * image.height <= 16_777_216, "Image pixel budget")
        return image.convert("RGBA")


def color_stats(image):
    """Preserve transparent RGB and all exact channel values."""
    width, height = image.size
    colors = Counter(image.getdata())
    channels = [Counter() for _ in range(4)]
    for rgba, count in colors.items():
        for channel, value in zip(channels, rgba):
            channel[value] += count
    ranked = sorted(colors.items(), key=lambda p: (-p[1], p[0]))
    tracked = {rgba for rgba, _ in ranked[:64]}
    bounds = {}
    for i, rgba in enumerate(image.getdata()):
        if rgba not in tracked:
            continue
        x, y = i % width, i // width
        if rgba not in bounds:
            bounds[rgba] = [x, y, x, y]
        else:
            b = bounds[rgba]
            b[0] = min(b[0], x)
            b[1] = min(b[1], y)
            b[2] = max(b[2], x)
            b[3] = max(b[3], y)
    return {
        "width": width, "height": height,
        "decodedRgbaSha256": hashlib.sha256(image.tobytes()).hexdigest(),
        "distinctRgba": len(colors),
        "transparentPixels": channels[3][0],
        "transparentNonzeroRgbPixels": sum(n for c, n in colors.items() if c[3] == 0 and c[:3] != (0, 0, 0)),
        "channelHistograms": [{str(k): v for k, v in sorted(c.items())} for c in channels],
        "dominantColors": [{"rgba": list(rgba), "pixels": count, "boundsInclusive": bounds[rgba]}
                           for rgba, count in ranked[:64]],
        "otherColorPixels": sum(n for _, n in ranked[64:]),
        "coordinateConvention": "decoded top-left origin, inclusive bounds",
    }


def inspect(root, index, receipt):
    require(index.get("schema") == "wand.media.memory-index@2" and
            index.get("gameVersion") == "1.26.2" and
            index.get("thumbnailPolicy") == POLICY and index.get("pieceBitMappingVerified") is False,
            "Unexpected index")
    require(receipt.get("schema") == "wand.media.memory-publication-receipt@1" and
            receipt.get("bucket") == "dreamwishwand-media" and receipt.get("canonicalMetadataVerified") is True,
            "Verified receipt required")
    images, refs, items = index["images"], index["references"], index["items"]
    require(receipt["objects"] == {"images/" + k + ".webp": v["bytes"] for k, v in images.items()},
            "Receipt/index mismatch")
    groups = defaultdict(list)
    for item, row in items.items():
        require(len(row) == 3 and type(row[2]) is int and row[2] > 0, "Invalid Memory row")
        image_guid, mask_guid, count = row
        require(set(refs[image_guid]) == {"Image", "Thumbnail"} and
                set(refs[mask_guid]) == {"Mask", "Outline"}, "Invalid native roles")
        groups[(refs[mask_guid]["Mask"], refs[mask_guid]["Outline"])].append((int(item), count))
    wanted = {sha for pair in groups for sha in pair}
    require(len(items) == 472 and len(wanted) == 40, "Unexpected reviewed coverage")
    stats = {}
    for n, sha in enumerate(sorted(wanted), 1):
        stats[sha] = color_stats(read_pixels(root, sha, images[sha]))
        print(f"  Mask/outline {n}/{len(wanted)}", flush=True)
    result_groups = []
    for (mask, outline), rows in sorted(groups.items()):
        counts = Counter(n for _, n in rows)
        result_groups.append({
            "maskSha256": mask, "outlineSha256": outline,
            "itemCount": len(rows),
            "shardCountDistribution": dict(sorted(counts.items())),
            "representativeItemIds": [min(i for i, n in rows if n == count) for count in sorted(counts)],
        })
    return {
        "schema": "wand.media.private-memory-mask-evidence@1",
        "gameVersion": index["gameVersion"], "privateOnly": True,
        "pieceBitMappingVerified": False, "renderingVerified": False,
        "itemCount": len(items), "uniqueNativeTextures": len(stats),
        "maskOutlinePairs": result_groups, "textures": stats,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", type=Path, required=True)
    a = p.parse_args()
    root = a.root.resolve()
    require(not any((d / ".git").exists() for d in (root, *root.parents)), "Private working directory required")
    index = json.loads((root / "memory-index-candidate.json").read_bytes())
    receipt = json.loads((root / "memory-publication-receipt.json").read_bytes())
    result = inspect(root, index, receipt)
    path = root / "memory-mask-evidence.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    print(f"Verified {result['uniqueNativeTextures']} textures; {len(result['maskOutlinePairs'])} distinct mask/outline pairs.")
    print("No piece-bit mapping is inferred. Report:", path)


if __name__ == "__main__":
    main()
