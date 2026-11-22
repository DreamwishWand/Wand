#!/usr/bin/env python3
"""Reproducible offline, SHA-checked DB-00 -> DB-03 event reward item label release.

No private source archive, save or images are loaded or published. Native item
"category" here is the DB-00 source category, not the game's Collection menu.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
VERSION = "steam-1.26.2-native-itemlist-v1"
RELEASE = "static/ddv/game-db/releases/" + VERSION
EVENT = "static/guide/public/event-friendship-rewards-1.26.2.json"
OUT = "static/guide/public/event-reward-item-labels-1.26.2.json"
INDEX_SHA = "06912b156823d920d1b3a2b937ebff3d06e1ca670043db616c907c683b46599f"
EVENT_SHA = "9b8857dfaa557a458a8e922ea4145895bc698e50d8d1ce0ad68017492f18b5c9"
NATIVE_SHA = "496782625e68fb53e018659bbabf0d8bb8bdc55f12037f4c568a7d32321f515b"
OUTPUT_SHA = "bddb880086542c027f524c5d5cbd36ef3095385e302bf18f3265f225053e2dac"
LOCALES = ["ja", "en", "fr", "it", "de", "es-ES", "zh-CN", "pt-BR"]


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def checked_json(path: Path, expected_sha: str | None = None, expected_bytes: int | None = None) -> dict:
    data = path.read_bytes()
    if expected_bytes is not None and len(data) != expected_bytes:
        raise ValueError(f"incorrect byte size: {path}")
    if expected_sha is not None and digest(data) != expected_sha:
        raise ValueError(f"incorrect SHA-256: {path}")
    return json.loads(data)


def produce(root: Path) -> bytes:
    active = checked_json(root / "static/ddv/game-db/active.json")
    if active.get("snapshot") != VERSION or active.get("indexSha256") != INDEX_SHA:
        raise ValueError("DB-00 active snapshot drift")
    index = checked_json(root / RELEASE / "index.json", INDEX_SHA)
    if (index.get("id") != VERSION or index.get("count") != 13202
        or index.get("target", {}).get("sourceSha256") != NATIVE_SHA
        or index.get("target", {}).get("gameVersion") != "1.26.2"
        or index.get("coverage", {}).get("nameVerified") != 11492
        or len(index.get("shards", [])) != 14):
        raise ValueError("DB-00 source contract drift")
    events = checked_json(root / EVENT, EVENT_SHA, 14513)
    if (events.get("counts", {}).get("eventRewardCandidates") != 202
        or events.get("counts", {}).get("friendshipDefaultCandidates") != 16):
        raise ValueError("DB-03 reward projection drift")
    ids = {r[2] for e in events["events"] for r in e["rewards"]}
    ids.update(row[3] for row in events["defaultFriendshipRewards"])
    if len(ids) != 141:
        raise ValueError("unexpected reward ID census")
    found: dict[str, dict] = {}
    offset = 0
    for shard in index["shards"]:
        if shard["offset"] != offset:
            raise ValueError("DB-00 offset mismatch")
        payload = checked_json(root / RELEASE / shard["file"], shard["sha256"], shard["bytes"])
        if payload["offset"] != offset or payload["count"] != shard["count"] or len(payload["items"]) != shard["count"]:
            raise ValueError("DB-00 shard count mismatch")
        offset += shard["count"]
        for item in payload["items"]:
            item_id = item["id"]
            if item_id not in ids:
                continue
            if item_id in found or "public-steam-1262-normalized" not in item.get("sourceRefs", []):
                raise ValueError("duplicated or foreign source Item ID")
            found[item_id] = item
    if offset != 13202:
        raise ValueError("DB-00 incomplete release")
    rows = {}
    for item_id in sorted(ids, key=int):
        entry = found.get(item_id)
        if entry is None:
            rows[item_id] = ["missing", None, None]
        elif entry["nameStatus"] == "verified":
            rows[item_id] = ["verified", entry.get("category"),
                             [entry.get("names", {}).get(loc) for loc in LOCALES]]
        else:
            rows[item_id] = ["unverified", entry.get("category"), None]
    match_count = len(found)
    verified = sum(v[0] == "verified" for v in rows.values())
    if match_count != 109 or verified != 109:
        raise ValueError("DB-00 reward name coverage drift")
    media = sum(bool(row.get("media", {}).get("path")) for row in found.values() if isinstance(row.get("media"), dict))
    if media:
        raise ValueError("new public media requires SRC-04 verification")
    output = {
        "schema": "wand.db03.event-reward-item-labels@1",
        "target": {"platform": "Steam", "gameVersion": "1.26.2", "release": VERSION},
        "source": {
            "db00IndexSha256": INDEX_SHA,
            "db00NativeSourceSha256": NATIVE_SHA,
            "eventRewardProjectionSha256": EVENT_SHA,
            "verifiedNamesOnly": True,
            "originalGameScreenCategoriesVerified": False,
            "publicSourceImagesAvailable": False,
        },
        "counts": {
            "rewardItemIds": len(ids), "foundInPublicDb00": match_count,
            "verifiedNames": verified, "unverifiedOrMissing": len(ids) - verified,
            "actualPublicMediaPaths": media,
        },
        "locales": LOCALES,
        "items": rows,
    }
    result = json.dumps(output, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(result) != 29585 or digest(result) != OUTPUT_SHA:
        raise ValueError(f"public projection mismatch: {len(result)} bytes, {digest(result)}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=BASE)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    data = produce(args.root)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(data)
    print(f"verified 141 item IDs, 109 source names, {len(data)} bytes: {args.out}")


if __name__ == "__main__":
    main()