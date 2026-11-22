"""Offline Steam v1.26.2 Collection world/universe evidence extractor.

Inputs: six SHA-pinned original *binary protobuf-framed* itemlist files.
Outputs: PRIVATE candidate JSONL + audit; never upload output to public GitHub.
This tool makes no save-file changes and does not infer ownership/entitlement.
World IDs are exact native Tag references. Universe Set references remain
candidates until the game's CollectionSet membership is fully corroborated.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import tempfile
from collections import Counter
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "src-01-items" / "steam1262.py"
_spec = importlib.util.spec_from_file_location("wand_src01_steam1262", SOURCE)
if _spec is None or _spec.loader is None:
    raise RuntimeError("SRC01_READER_MISSING")
_src01 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_src01)
varint = _src01.varint
CATEGORIES = _src01.CATEGORIES
EXPECTED = {"Furniture": 6746, "Clothing": 2041, "Trimming": 365, "ActivityItem": 4050}
EXTRA_HASHES = {
    "Tag": "bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4",
    "Set": "3682f4888244a9a460d08300a00cc873307c9ad3553fb929aaca135efb38708f",
}
WORLD_TAGS = (
    "IsDreamlightValley", "IsEternityIsle", "IsStorybookVale",
    "IsWishBlossomMountains", "isSeaOfSecrets", "isHoneywood",
)
# Field numbers are from the exact pinned native itemlist record framing;
# only packed sets whose ENTIRE contents match source-defined Tag IDs count.
TAG_FIELDS = {
    "Furniture": {7, 9, 10},
    "Clothing": {9},
    "Trimming": {10},
    "ActivityItem": {8, 9, 11, 12, 13, 14, 15, 16, 30, 31},
}
SET_FIELDS = {"Furniture": 8, "Clothing": 8, "Trimming": 9}
SET_NAME = re.compile(r"^\\d+_([^!]+)![fc]_([A-Za-z0-9]+)_")
PRIVATE_SCHEMA = "wand.collection.scope-evidence.private@1"


def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def frames(blob: bytes):
    """Read the same framed protobuf container used by SRC-01, fail closed."""
    pos = 0
    seen = set()
    while pos < len(blob):
        sequence, pos = varint(blob, pos)
        size, pos = varint(blob, pos)
        if sequence in seen or not 0 < size <= 1_048_576 or size > len(blob)-pos:
            raise ValueError("INVALID_FRAMED_RECORD")
        seen.add(sequence)
        yield sequence, blob[pos:pos+size]
        pos += size


def fields(blob: bytes):
    """Minimal wire reader, no guessing at unknown gameplay semantics."""
    pos = 0
    while pos < len(blob):
        key, pos = varint(blob, pos)
        index, wire = key >> 3, key & 7
        if index == 0:
            raise ValueError("PROTO_FIELD_ZERO")
        if wire == 0:
            value, pos = varint(blob, pos)
        elif wire == 2:
            length, pos = varint(blob, pos)
            if length > len(blob)-pos:
                raise ValueError("PROTO_LENGTH_OVERFLOW")
            value = blob[pos:pos+length]
            pos += length
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            if size > len(blob)-pos:
                raise ValueError("PROTO_FIXED_OVERFLOW")
            value = blob[pos:pos+size]
            pos += size
        else:
            raise ValueError("PROTO_UNSUPPORTED_WIRE")
        yield index, wire, value


def packed_tags(raw: bytes, known_ids: set[int]) -> list[int]:
    if not raw:
        return []
    try:
        pos = 0
        ids = []
        while pos < len(raw):
            identity, pos = varint(raw, pos)
            ids.append(identity)
        return ids if ids and all(identity in known_ids for identity in ids) else []
    except (ValueError, IndexError):
        return []


def read_definitions(blob: bytes, category: str) -> dict[int, str]:
    records = {}
    for _, raw in frames(blob):
        field_map = {k: value for k, wire, value in fields(raw)
                     if (k == 1 and wire == 0) or (k == 2 and wire == 2)}
        item_id, raw_name = field_map[1], field_map[2].decode("utf-8")
        if item_id in records or not raw_name:
            raise ValueError("DUPLICATE_OR_EMPTY_NATIVE_DEFINITION")
        records[item_id] = raw_name
    if (category == "Tag" and len(records) != 409) or (category == "Set" and len(records) != 727):
        raise ValueError("NATIVE_DEFINITION_COUNT_MISMATCH")
    return records


def source_bytes(source: Path, name: str) -> bytes:
    path = source / (name + ".json")
    if path.is_symlink() or not path.is_file():
        raise ValueError("MISSING_SOURCE_" + name)
    data = path.read_bytes()
    expected = EXTRA_HASHES[name] if name in EXTRA_HASHES else CATEGORIES[name][1]
    if sha(data) != expected:
        raise ValueError("SOURCE_SHA_MISMATCH_" + name)
    return data


def extract(source: Path) -> tuple[list[dict], dict]:
    """Extract source-linked evidence, without promoting guesses to facts."""
    source_hashes = {}
    def verified(name: str):
        content = source_bytes(source, name)
        source_hashes[name + ".json"] = sha(content)
        return content

    tag_names = read_definitions(verified("Tag"), "Tag")
    set_names = read_definitions(verified("Set"), "Set")
    tags_by_name = {name: item for item, name in tag_names.items()}
    if len(tags_by_name) != len(tag_names) or not set(WORLD_TAGS).issubset(tags_by_name):
        raise ValueError("WORLD_TAG_DEFINITION_MISSING")
    world_names = {tags_by_name[name]: name for name in WORLD_TAGS}
    universe_tags = {identity: name for identity, name in tag_names.items()
                     if 2000500000 <= identity < 2000600000}
    verified_universe_names = set(universe_tags.values())
    known_ids = set(tag_names)
    output = []
    counts = Counter()
    by_world = Counter()
    collisions = set()
    for category in ("Furniture", "Clothing", "Trimming", "ActivityItem"):
        content = verified(category)
        category_count = 0
        for _, raw in frames(content):
            category_count += 1
            rec = list(fields(raw))
            ids = [v for k, wire, v in rec if k == 1 and wire == 0]
            if len(ids) != 1 or ids[0] in collisions:
                raise ValueError("NATIVE_ITEM_ID_COLLISION")
            item_id = ids[0]
            collisions.add(item_id)
            # Only known Tag IDs in complete packed-tag fields count.
            observed_tags = {
                identity for k, wire, value in rec
                if k in TAG_FIELDS[category] and wire == 2
                for identity in packed_tags(value, known_ids)
            }
            worlds = sorted((world_names[i] for i in observed_tags if i in world_names))
            direct_universes = sorted((universe_tags[i] for i in observed_tags
                                       if i in universe_tags))
            set_universes = []
            set_ids = []
            if category in SET_FIELDS:
                refs = [v for k, wire, v in rec
                        if k == SET_FIELDS[category] and wire == 0 and v in set_names]
                for ref in refs:
                    match = SET_NAME.match(set_names[ref])
                    if match and match.group(1) == match.group(2) and match.group(1) in verified_universe_names:
                        set_ids.append(ref)
                        set_universes.append(match.group(1))
            set_universes = sorted(set(set_universes))
            if direct_universes and set_universes and not set(direct_universes).issubset(set_universes):
                raise ValueError("CONFLICTING_NATIVE_UNIVERSE_EVIDENCE")
            if len(worlds)>1:
                raise ValueError("AMBIGUOUS_NATIVE_WORLD_TAG")
            counts["items"] += 1
            counts["world_direct"] += bool(worlds)
            counts["universe_direct"] += bool(direct_universes)
            counts["universe_set_candidate"] += bool(set_universes)
            counts["universe_any_evidence"] += bool(direct_universes or set_universes)
            by_world.update(worlds)
            output.append({
                "itemId": item_id, "nativeCategory": category,
                "worldsDirect": worlds, "universeTagsDirect": direct_universes,
                "universeSetCandidates": set_universes,
                "setDefinitionIds": sorted(set(set_ids)),
            })
        if category_count != EXPECTED[category]:
            raise ValueError("ITEM_CATEGORY_COUNT_MISMATCH_" + category)
    if counts["items"] != 13202:
        raise ValueError("ITEM_COUNT_MISMATCH")
    output.sort(key=lambda row: row["itemId"])
    audit = {
        "schema": PRIVATE_SCHEMA, "sourcePlatform": "Steam", "gameVersion": "1.26.2",
        "privateOnly": True, "publicationAuthorized": False,
        "sourceSha256": source_hashes, "counts": dict(counts),
        "byWorldTag": dict(sorted(by_world.items())),
        "meaning": {
            "worldsDirect": "World Tag ID explicitly present in current native item record",
            "universeTagsDirect": "Universe Tag ID explicitly present in current native item record",
            "universeSetCandidates": "Universe name matched via current Set reference; candidate, NOT verified UI membership",
            "empty": "No source-backed classification; do not infer a default world",
        },
    }
    return output, audit


def atomic_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(prefix=".scope-private-", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\\n") as file:
            file.write(text)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--itemlist", required=True, type=Path,
                        help="PRIVATE ddv_Data/StreamingAssets/itemlist directory")
    parser.add_argument("--private-out", required=True, type=Path,
                        help="Local PRIVATE output folder, outside the public Wand repository")
    args = parser.parse_args()
    source = args.itemlist.resolve(strict=True)
    target = args.private_out.resolve()
    if target == source or source in target.parents:
        parser.error("OUTPUT_MUST_BE_OUTSIDE_SOURCE")
    # Never silently write unpublished source-derived shards into Git.
    if any((ancestor / ".git").exists() for ancestor in (target, *target.parents)):
        parser.error("OUTPUT_MUST_BE_OUTSIDE_GIT_REPOSITORY")
    records, audit = extract(source)
    rows = "".join(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\\n"
                   for record in records)
    atomic_text(target / "scope-candidates-private.jsonl", rows)
    audit["rowsSha256"] = sha(rows.encode("utf-8"))
    atomic_text(target / "scope-audit-private.json",
                json.dumps(audit, ensure_ascii=False, sort_keys=True, indent=2) + "\\n")
    print(json.dumps({"privateOut": str(target), "counts": audit["counts"],
                      "byWorldTag": audit["byWorldTag"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
