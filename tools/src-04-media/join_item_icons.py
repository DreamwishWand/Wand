"""Join exact SRC-04 Unity icon identities to SRC-01 Item IDs.

Offline, read-only with respect to source files and extracted images.
Do not use platform or game version as a compatibility key: the exact GUID,
serialized object identity, and source-file integrity establish the mapping.
All generated records remain unpublished until separately approved.
"""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

GUID = re.compile(r"^guid:([0-9a-f]{32})$")
SHA = re.compile(r"^[0-9a-f]{64}$")
EVIDENCE = "exact_catalog_key_and_serialized_bundle_path_id"
SCHEMA = "wand.src04.item-icon-join@1"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path, obj):
    payload = (json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(payload)
    tmp.replace(path)
    return digest(payload)


def safe_variant(variant, output):
    if not isinstance(variant, dict):
        raise ValueError("Variant record is not an object")
    name = variant.get("path")
    if not isinstance(name, str) or "\\" in name or ":" in name:
        raise ValueError("Invalid image path")
    pure = Path(name)
    if (pure.is_absolute() or not pure.parts or ".." in pure.parts or
            pure.parts[0] != "images" or pure.suffix != ".webp" or
            pure.parts[1] not in ("thumbnail", "detail")):
        raise ValueError("Invalid image path or variant folder: " + name)
    h = variant.get("sha256")
    if not isinstance(h, str) or not SHA.fullmatch(h):
        raise ValueError("Invalid variant checksum")
    file_path = output / pure
    # Do not read 18k derived images by default; only validate the filename
    # is safe and that its expected SHA-256 is explicitly recorded.
    return {"path": pure.as_posix(), "sha256": h,
            "width": variant.get("width"), "height": variant.get("height")}


def exact_image(guid, image, output):
    if not isinstance(image, dict):
        raise ValueError("Missing image identity for " + guid)
    if image.get("identityEvidence") != EVIDENCE:
        raise ValueError("Unverified image identity for " + guid)
    if image.get("assetClass") not in ("Sprite", "Texture2D"):
        raise ValueError("Unsupported image class for " + guid)
    asset_id = image.get("assetId")
    sha = image.get("decodedSha256")
    if (not isinstance(asset_id, str) or
            not asset_id.endswith(":" + image["assetClass"]) or
            not isinstance(sha, str) or not SHA.fullmatch(sha)):
        raise ValueError("Invalid image asset identity for " + guid)
    pointer_count = image.get("pointerObjectCount")
    counterpart = image.get("counterpartAssetId")
    if image["assetClass"] == "Sprite":
        if pointer_count not in (1, 2):
            raise ValueError("Invalid Sprite pointer count for " + guid)
        if (pointer_count == 2) != bool(counterpart):
            raise ValueError("Sprite/Texture pairing is inconsistent for " + guid)
        if counterpart and (not isinstance(counterpart, str) or
                            not counterpart.endswith(":Texture2D")):
            raise ValueError("Invalid counterpart image for " + guid)
    elif pointer_count != 1 or counterpart:
        raise ValueError("Invalid Texture2D-only pointer for " + guid)
    variants = image.get("variants", {})
    if not isinstance(variants, dict) or not ("detail" in variants and "thumbnail" in variants):
        raise ValueError("Expected thumbnail and detail variants for " + guid)
    return {
        "assetId": asset_id,
        "assetClass": image["assetClass"],
        "counterpartAssetId": counterpart,
        "decodedSha256": sha,
        "identityEvidence": EVIDENCE,
        "sourceWidth": image.get("sourceWidth"),
        "sourceHeight": image.get("sourceHeight"),
        "variants": {k: safe_variant(variants[k], output) for k in ("thumbnail", "detail")},
    }


def join(output):
    output = Path(output).resolve()
    src = output / "source-items" / "items.jsonl"
    src_manifest = load_json(output / "source-items" / "manifest.json")
    src_data = src.read_bytes()
    src_sha = digest(src_data)
    if src_sha != src_manifest.get("itemsSha256"):
        raise ValueError("SRC-01 item-list checksum mismatch")
    link_path = output / "catalog-identity-links-private.json"
    links_raw = link_path.read_bytes()
    links = json.loads(links_raw.decode("utf-8"))
    report = load_json(output / "catalog-identity-report.json")
    if (links.get("schema") != "wand.src04.identity-links@2" or
            links.get("publicationApproved") is not False or
            report.get("schema") != "wand.src04.identity-probe@2" or
            report.get("publicationApproved") is not False or
            report.get("imageDecodingPerformed") is not False or
            report.get("processedBundleCount") != report.get("targetBundleCount") or
            report.get("processedBundleCount") != 24 or
            report.get("crossBundleConflictCount") != 0 or
            report.get("warnings") or
            any(b.get("error") or b.get("errors") or b.get("ambiguousGuidCount") or
                b.get("missingObjectPointerCount") for b in report.get("bundles", {}).values())):
        raise ValueError("Identity evidence is incomplete or inconsistent")
    mapping = links.get("guidToImage")
    expected = report.get("totalVerifiedUniqueGuids")
    if (not isinstance(mapping, dict) or len(mapping) != links.get("verifiedGuidCount") or
            len(mapping) != expected or sum(
                int(v.get("exactGuidPointerCount", 0))
                for v in report.get("bundles", {}).values()) != expected):
        raise ValueError("Identity map and report disagree; full mapping required")
    records = []
    seen_item_ids = set()
    guid_items = collections.defaultdict(list)
    categories = collections.Counter()
    for raw in src_data.splitlines():
        item = json.loads(raw)
        item_id = item.get("itemId")
        guid = item.get("iconGuid")
        if (not isinstance(item_id, int) or item_id in seen_item_ids or
                not isinstance(guid, str) or not GUID.fullmatch(guid)):
            raise ValueError("Invalid or duplicate SRC-01 item")
        seen_item_ids.add(item_id)
        guid_items[guid[5:]].append(item_id)
        categories[str(item.get("nativeCategory"))] += 1
        records.append(item)
    if (len(records) != src_manifest.get("itemCount") or
            len(records) != 13202 or len(guid_items) != 9542):
        raise ValueError("Unexpected SRC-01 item count or unique GUID count")

    normalized = {}
    for guid, image in mapping.items():
        if not isinstance(guid, str) or not re.fullmatch(r"[0-9a-f]{32}", guid):
            raise ValueError("Invalid GUID key in identity map")
        if guid not in guid_items:
            raise ValueError("Identity GUID is absent from SRC-01 item list")
        normalized[guid] = exact_image(guid, image, output)

    lines = []
    missing = {}
    linked_items = 0
    status_categories = collections.defaultdict(collections.Counter)
    for item in sorted(records, key=lambda item: item["itemId"]):
        guid = item["iconGuid"][5:]
        image = normalized.get(guid)
        status = "verified" if image else "unresolved"
        if image:
            linked_items += 1
        else:
            missing.setdefault(guid, []).append(item["itemId"])
        status_categories[status][str(item.get("nativeCategory"))] += 1
        row = {"itemId": item["itemId"], "iconGuid": item["iconGuid"],
               "nativeCategory": item.get("nativeCategory"),
               "rawNameField": item.get("rawNameField"),
               "status": status,
               "image": image}
        lines.append(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    output_lines = ("\n".join(lines) + "\n").encode("utf-8")
    output_path = output / "item-icon-map-private.jsonl"
    tmp = output_path.with_name(output_path.name + ".tmp")
    tmp.write_bytes(output_lines)
    tmp.replace(output_path)
    miss = {"schema": SCHEMA, "publicationApproved": False,
            "unresolvedUniqueGuids": len(missing),
            "unresolvedItemCount": len(records) - linked_items,
            "guids": [{"guid": "guid:" + guid,
                       "itemIds": sorted(ids)} for guid, ids in sorted(missing.items())]}
    missing_sha = save_json(output / "item-icon-unresolved-private.json", miss)
    result = {
        "schema": SCHEMA, "status": "identity_join_complete",
        "publicationApproved": False,
        "source": {"itemListSha256": src_sha,
                   "identityMapSha256": digest(links_raw),
                   "sourceVersionProvenance": src_manifest.get("gameVersion"),
                   "sourcePlatformProvenance": src_manifest.get("platform")},
        "identityEvidence": EVIDENCE,
        "totalItems": len(records),
        "totalUniqueGuids": len(guid_items),
        "verifiedUniqueGuids": len(normalized),
        "unresolvedUniqueGuids": len(missing),
        "verifiedItems": linked_items,
        "unresolvedItems": len(records) - linked_items,
        "verifiedItemCategories": dict(sorted(status_categories["verified"].items())),
        "unresolvedItemCategories": dict(sorted(status_categories["unresolved"].items())),
        "outputMapSha256": digest(output_lines),
        "outputUnresolvedSha256": missing_sha,
        "complete": len(missing) == 0,
        "note": "Identity join is complete; image coverage is partial and publication is not approved.",
    }
    save_json(output / "item-icon-join-report.json", result)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = join(args.out)
    print(json.dumps({k: result[k] for k in (
        "totalItems", "verifiedItems", "unresolvedItems",
        "verifiedUniqueGuids", "unresolvedUniqueGuids", "complete")},
        ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
