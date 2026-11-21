"""Fail-closed local verifier for SRC-04's private DB-01 media overlay ZIP.

Verifies all 256 SHA-pinned shards, 13,202 item rows (or a future count), exact
GUID/image records, and optionally the original SRC-01 item source. No images,
source binaries or private datasets are uploaded, modified, or published.

Usage:
python tools/src-04-media/verify_private_overlay.py private-media-overlay-latest.zip \
    --source-items path/to/source-items/items.jsonl \
    --expected-items 13202 --expected-guids 9542
"""
import argparse
import collections
import hashlib
import json
import re
import zipfile
from pathlib import Path, PurePosixPath

PREFIX = "private-media-overlay-latest/"
SHA = re.compile(r"[0-9a-f]{64}\Z")
GUID = re.compile(r"guid:[0-9a-f]{32}\Z")
UNITY = re.compile(r"unity:[0-9a-f]{64}:[^:]+:-?[0-9]+:(?:Sprite|Texture2D)\Z")
PROOF = "exact_catalog_key_and_serialized_bundle_path_id"


def require(condition, reason):
    if not condition:
        raise ValueError("SRC04_PRIVATE_OVERLAY_" + reason)


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def verify(archive, source_items=None, expected_items=None, expected_guids=None,
           expected_manifest_sha=None, expected_map_sha=None):
    with zipfile.ZipFile(archive) as z:
        info = z.infolist()
        regular = [i for i in info if not i.is_dir()]
        require(len(regular) == 257, "FILE_COUNT")
        require(sum(i.file_size for i in regular) < 200_000_000, "ZIP_SIZE")
        names = [i.filename for i in regular]
        require(len(set(names)) == len(names), "DUPLICATE_FILENAME")
        required = {PREFIX + "manifest.json"} | {
            PREFIX + f"id/{i:02x}.json" for i in range(256)}
        require(set(names) == required, "UNEXPECTED_FILES")
        for entry in info:
            parts = PurePosixPath(entry.filename).parts
            require(entry.filename.startswith(PREFIX) and
                    ".." not in parts and not entry.filename.startswith("/"), "UNSAFE_ZIP_PATH")
            require((entry.external_attr >> 16) & 0o170000 != 0o120000, "SYMLINK")
            require(entry.file_size < 10_000_000, "OVERSIZED_ENTRY")
        raw = z.read(PREFIX + "manifest.json")
        manifest_sha = digest(raw)
        if expected_manifest_sha:
            require(manifest_sha == expected_manifest_sha, "MANIFEST_SHA")
        manifest = json.loads(raw)
        require(manifest.get("schema") == "wand.src04.media-overlay@1", "MANIFEST_SCHEMA")
        require(manifest.get("privateOnly") is True and
                manifest.get("publicationAuthorized") is False and
                manifest.get("imageByteVerification") == "not_performed", "PUBLICATION_GATE")
        require(manifest.get("bucketCount") == 256 and
                isinstance(manifest.get("files"), dict) and
                len(manifest["files"]) == 256, "SHARD_MANIFEST")
        source = manifest.get("source", {})
        require(isinstance(source.get("itemsSha256"), str) and
                SHA.fullmatch(source["itemsSha256"]), "SOURCE_DIGEST")
        require(isinstance(source.get("itemMapSha256"), str) and
                SHA.fullmatch(source["itemMapSha256"]), "MAP_DIGEST")
        if expected_map_sha:
            require(source["itemMapSha256"] == expected_map_sha, "MAP_SHA")
        unique_items, gids, identity = {}, set(), {}
        types = collections.Counter()
        image_paths = {}
        for bucket_number in range(256):
            bucket = f"{bucket_number:02x}"
            name = f"id/{bucket}.json"
            meta = manifest["files"].get(name)
            require(isinstance(meta, dict), "MISSING_SHARD_META")
            payload = z.read(PREFIX + name)
            require(len(payload) == meta.get("bytes") and
                    digest(payload) == meta.get("sha256"), "SHARD_DIGEST")
            shard = json.loads(payload)
            require(shard.get("schema") == "wand.src04.media-overlay-shard@1" and
                    shard.get("bucket") == bucket and
                    isinstance(shard.get("rows"), list) and
                    len(shard["rows"]) == meta.get("count"), "SHARD_SCHEMA")
            verified = 0
            for item in shard["rows"]:
                item_id, guid, image = (
                    item.get("itemId"), item.get("iconGuid"), item.get("image"))
                require(type(item_id) is int and item_id > 0 and
                        item_id % 256 == bucket_number and
                        item_id not in unique_items, "ITEM_ID")
                require(isinstance(guid, str) and GUID.fullmatch(guid) and
                        item.get("status") == "verified" and
                        isinstance(image, dict), "ITEM_GUID")
                unique_items[item_id] = guid
                gids.add(guid)
                cls = image.get("class")
                asset = image.get("unityAssetId")
                texture = image.get("textureAssetId")
                content_sha = image.get("sourceSha256")
                require(cls in ("Sprite", "Texture2D") and
                        isinstance(asset, str) and UNITY.fullmatch(asset) and
                        asset.endswith(":" + cls) and
                        image.get("identityEvidence") == PROOF, "UNITY_PROOF")
                require(texture is None or (
                        cls == "Sprite" and isinstance(texture, str) and
                        UNITY.fullmatch(texture) and texture.endswith(":Texture2D")),
                        "UNITY_PAIR")
                require(isinstance(content_sha, str) and
                        SHA.fullmatch(content_sha), "IMAGE_SHA")
                exact = (asset, content_sha)
                require(guid not in identity or identity[guid] == exact,
                        "CONFLICTING_GUID_IDENTITY")
                identity[guid] = exact
                for kind in ("detail", "thumbnail"):
                    variant = image.get(kind)
                    path = f"images/{kind}/{content_sha[:2]}/{content_sha}.webp"
                    require(isinstance(variant, dict) and
                            variant.get("path") == path and
                            isinstance(variant.get("sha256"), str) and
                            SHA.fullmatch(variant["sha256"]) and
                            type(variant.get("width")) is int and variant["width"] > 0 and
                            type(variant.get("height")) is int and variant["height"] > 0,
                            "IMAGE_VARIANT")
                    previous = image_paths.setdefault(path, variant["sha256"])
                    require(previous == variant["sha256"], "CONFLICTING_IMAGE_SHA")
                types[cls] += 1
                verified += 1
            require(verified == meta.get("verified"), "SHARD_VERIFIED_COUNT")
        coverage = manifest.get("coverage", {})
        require(len(unique_items) == coverage.get("totalItems") ==
                coverage.get("verifiedItems") and
                coverage.get("unresolvedItems") == 0 and
                coverage.get("unresolvedGuids") == 0 and
                len(gids) == coverage.get("verifiedGuids"), "COVERAGE")
        if expected_items is not None:
            require(len(unique_items) == expected_items, "EXPECTED_ITEMS")
        if expected_guids is not None:
            require(len(gids) == expected_guids, "EXPECTED_GUIDS")
        if source_items is not None:
            original_bytes = Path(source_items).read_bytes()
            require(digest(original_bytes) == source["itemsSha256"], "SOURCE_SHA")
            originals = {}
            for line in original_bytes.splitlines():
                if not line:
                    continue
                item = json.loads(line)
                item_id = item.get("itemId")
                require(type(item_id) is int and item_id not in originals, "SOURCE_ID")
                originals[item_id] = item.get("iconGuid")
            require(originals == unique_items, "SOURCE_ITEM_GUID_MISMATCH")
        return {
            "schema": "wand.src04.private-overlay-validation@1",
            "manifestSha256": manifest_sha,
            "sourceItemsSha256": source["itemsSha256"],
            "sourceItemMapSha256": source["itemMapSha256"],
            "verifiedItems": len(unique_items),
            "verifiedGuids": len(gids),
            "shards": 256,
            "sourceItemsMatched": source_items is not None,
            "imageClassCounts": dict(sorted(types.items())),
            "uniqueVariantPaths": len(image_paths),
            "privateOnly": True,
            "publicationAuthorized": False,
            "imageBytesVerified": False,
        }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("archive")
    p.add_argument("--source-items")
    p.add_argument("--expected-items", type=int)
    p.add_argument("--expected-guids", type=int)
    p.add_argument("--manifest-sha")
    p.add_argument("--map-sha")
    p.add_argument("--report")
    a = p.parse_args()
    outcome = verify(a.archive, a.source_items, a.expected_items, a.expected_guids,
                     a.manifest_sha, a.map_sha)
    if a.report:
        Path(a.report).write_text(json.dumps(outcome, sort_keys=True, indent=2) + "\n",
                                  encoding="utf-8")
    print(json.dumps(outcome, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
