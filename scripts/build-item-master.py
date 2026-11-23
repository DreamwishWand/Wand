#!/usr/bin/env python3
"""Expand the published Item-ID master into static assets for Wand.

The committed archive is already a source-derived, public item-data release.
Nothing here reads Steam installations, private saves, R2 credentials, or
other owner files. The 256 parts stay lazy-loadable by Item ID in the browser.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data/ddv/item-master/steam-1.26.2.zip"
OUTPUT = ROOT / "static/ddv/item-master/steam-1.26.2"
EXPECTED_ARCHIVE_SHA = "3c80a42139014211100eb556665636088af45d1d0b54ebd2933a4aeab2a405c6"
EXPECTED_SOURCE_SHA = "de579d94fa10258249c9c477075110d0bcf001a0d865a15ded039efb3616c8f0"


def require(ok: object, reason: str) -> None:
    if not ok:
        raise ValueError("ITEM_MASTER_" + reason)


def main() -> int:
    data = ARCHIVE.read_bytes()
    require(hashlib.sha256(data).hexdigest() == EXPECTED_ARCHIVE_SHA, "ARCHIVE_CHANGED")
    expected = [f"id/{i:02x}.json" for i in range(256)]
    with ZipFile(ARCHIVE) as source:
        require(set(source.namelist()) == {"index.json", *expected} and
                len(source.infolist()) == 257, "FILES_INCOMPLETE")
        index_raw = source.read("index.json")
        index = json.loads(index_raw)
        require(index.get("schema") == "wand.item-master.release@1" and
                index.get("version") == "steam-1.26.2-item-id-master-v1" and
                index.get("count") == 13202 and index.get("bucketCount") == 256 and
                index.get("source", {}).get("sourceItemsSha256") == EXPECTED_SOURCE_SHA,
                "INDEX_SOURCE_MISMATCH")
        require(set(index.get("shards", {})) == set(expected), "INDEX_SHARDS_MISSING")
        coverage = index.get("coverage", {})
        require(coverage.get("itemIconGuid") == 13202 and
                coverage.get("itemNamesVerified") == 11492 and
                coverage.get("itemNamesUnverified") == 1710 and
                coverage.get("sourceTagReferences") == 60814,
                "COVERAGE_CHANGED")
        total = 0
        seen: set[int] = set()
        images = 0
        tag_refs = 0
        for path in expected:
            raw = source.read(path)
            info = index["shards"][path]
            require(len(raw) == info["bytes"] and
                    hashlib.sha256(raw).hexdigest() == info["sha256"],
                    "SHARD_CHANGED_" + path)
            parsed = json.loads(raw)
            require(parsed.get("schema") == "wand.item-master.shard@1" and
                    parsed.get("bucket") == path[3:5] and
                    len(parsed.get("items", [])) == info["count"],
                    "SHARD_INVALID_" + path)
            for item in parsed["items"]:
                item_id = item.get("itemId")
                require(isinstance(item_id, int) and item_id > 0 and
                        item_id & 255 == int(path[3:5], 16) and
                        item_id not in seen, "INVALID_ITEM_ID")
                seen.add(item_id)
                images += int(isinstance(item.get("iconGuid"), str) and
                              len(item["iconGuid"]) == 32)
                tag_refs += len(item.get("tags", []))
            total += info["count"]
            dest = OUTPUT / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.is_file() or dest.read_bytes() != raw:
                dest.write_bytes(raw)
        require(total == 13202 and len(seen) == total and
                images == 13202 and tag_refs == 60814,
                "RELEASE_COVERAGE_MISMATCH")
        dest = OUTPUT / "index.json"
        if not dest.is_file() or dest.read_bytes() != index_raw:
            dest.write_bytes(index_raw)
    print("Published Item master prepared: 13,202 items, 256 shards, 8 locales, 60,814 Tag links")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
