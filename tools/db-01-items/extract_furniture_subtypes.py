"""Steam v1.26.2 Furniture.json: seven source-exact protobuf subtypes.

The "Furniture" itemlist is a heterogeneous original item file. Its records
are NOT all FurnitureItemData and share field numbers for different meanings.
Use the same-version, SHA-pinned IL2CPP class field contracts to identify
their exact class before interpreting Tags or SetItemID.

This offline extractor emits a private, SHA-indexed read model for all 6,746
source Furniture records. It never writes original source bytes to Git, and
neither infers live Collection UI membership nor player/DLC state.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile

HELPER = Path(__file__).resolve().parents[1] / "collection" / "extract_scope_evidence.py"
_spec = importlib.util.spec_from_file_location("db01_furniture_original_wire", HELPER)
if _spec is None or _spec.loader is None:
    raise RuntimeError("DB01_FURNITURE_ORIGINAL_WIRE_HELPER_MISSING")
_wire = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_wire)

SCHEMA = "wand.db01.original-furniture-ihastags-steam-1262@1"
VERSION = "1.26.2"
FURNITURE_SHA256 = "cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196"
SET_SHA256 = "3682f4888244a9a460d08300a00cc873307c9ad3553fb929aaca135efb38708f"
TAG_SHA256 = "bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4"
IL2CPP_SHA256 = "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08"
EXPECTED_SOURCE_COUNTS = {
    "FurnitureItemData": 5288,
    "LandscapingItemData": 526,
    "FurnitureBlockerItemData": 422,
    "FenceAndRoadItemData": 395,
    "FurnitureRequestItemData": 85,
    "FurnitureSnippetTrapItemData": 18,
    "FurnitureAncientMachineItemData": 12,
}
# (Tags protobuf field, optional SetItemID protobuf field, actual IHasSet interface)
# Ancient machines have a field named SetItemID but DO NOT implement IHasSet.
SOURCE_CLASS_FIELDS = {
    "FurnitureItemData": (9, 8, True),
    "LandscapingItemData": (9, None, False),
    "FurnitureBlockerItemData": (14, None, False),
    "FenceAndRoadItemData": (10, None, False),
    "FurnitureRequestItemData": (7, None, False),
    "FurnitureSnippetTrapItemData": (7, None, False),
    "FurnitureAncientMachineItemData": (9, 8, False),
}
EXPECTED_TOTAL = 6746
EXPECTED_SET_DEFS = 727
EXPECTED_TAG_DEFS = 409
SHARDS = 256


def require(ok: object, name: str) -> None:
    if not ok:
        raise ValueError("DB01_FURNITURE_SUBTYPE_" + name)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verified_file(path: Path, expected: str, name: str) -> bytes:
    require(path.is_file() and not path.is_symlink(), "MISSING_" + name)
    data = path.read_bytes()
    require(digest(data) == expected, "SOURCE_SHA_" + name)
    return data


def original_records(data: bytes, name: str) -> list[tuple[int, str, list]]:
    result = []
    ids: set[int] = set()
    for _, raw in _wire.frames(data):
        ff = list(_wire.fields(raw))
        identity = [(f, w, v) for f, w, v in ff if f == 1]
        keys = [(f, w, v) for f, w, v in ff if f == 2]
        require(len(identity) == len(keys) == 1 and
                identity[0][1] == 0 and type(identity[0][2]) is int and
                identity[0][2] > 0 and identity[0][2] not in ids and
                keys[0][1] == 2 and isinstance(keys[0][2], bytes),
                "RECORD_IDENTITY_" + name)
        item_id = identity[0][2]
        native_key = keys[0][2].decode("utf-8")
        require(native_key and native_key == native_key.strip(),
                "RECORD_NAME_" + name)
        ids.add(item_id)
        result.append((item_id, native_key, ff))
    return result


def verify_il2cpp_contract(source: str) -> None:
    for name, (tags_field, set_field, has_set) in SOURCE_CLASS_FIELDS.items():
        found = re.search(
            r"^public sealed class " + re.escape(name) +
            r"\b[^\n]*\n\{(.*?)\n\t// Properties", source, re.M | re.S)
        require(found is not None, "IL2CPP_CLASS_" + name)
        header = found.group(0).split("\n", 1)[0]
        block = found.group(1)
        implemented = re.findall(r"\bIHasSet\b", header)
        require("IHasTags" in header and
                bool(implemented) == has_set and len(implemented) <= 1,
                "IL2CPP_INTERFACE_" + name)
        require(f"public const int TagsFieldNumber = {tags_field};" in block,
                "IL2CPP_TAG_FIELD_" + name)
        if set_field is not None:
            require(f"public const int SetItemIDFieldNumber = {set_field};"
                    in block, "IL2CPP_SET_FIELD_" + name)
        else:
            require("SetItemIDFieldNumber" not in block,
                    "IL2CPP_UNEXPECTED_SET_FIELD_" + name)


def values(ff: list, number: int) -> list[tuple[int, int | bytes]]:
    return [(w, v) for f, w, v in ff if f == number]


def single_value(ff: list, number: int, wire: int) -> int | bytes | None:
    matches = values(ff, number)
    require(len(matches) <= 1, "DUPLICATE_OR_MIXED_FIELD_" + str(number))
    if not matches:
        return None
    require(matches[0][0] == wire, "WRONG_WIRE_" + str(number))
    return matches[0][1]


def exact_tag_list(raw: bytes | None, tag_ids: set[int]) -> tuple[int, ...] | None:
    if raw is None:
        return ()
    require(isinstance(raw, bytes), "NON_BYTES_TAGS")
    if not raw:
        return ()
    parsed = _wire.packed_tags(raw, tag_ids)
    if not parsed or len(set(parsed)) != len(parsed):
        return None
    return tuple(parsed)


@dataclass(frozen=True)
class FurnitureNativeSubtype:
    item_id: int
    native_key: str
    data_class: str
    tags_field: int
    native_tags: tuple[int, ...]
    implements_has_set: bool
    set_item_id: int | None


def classify_furniture(
    item_id: int, native_key: str, ff: list,
    known_tag_ids: set[int],
) -> FurnitureNativeSubtype:
    require(type(item_id) is int and item_id > 0 and
            isinstance(native_key, str) and native_key and
            isinstance(known_tag_ids, set) and len(known_tag_ids) > 0,
            "INVALID_CLASSIFY_INPUT")
    field_pairs = {(f, w) for f, w, _ in ff}

    def has(number: int, wire: int) -> bool:
        return (number, wire) in field_pairs

    raw9 = single_value(ff, 9, 2)
    raw7 = single_value(ff, 7, 2) if has(7, 2) else None
    parsed9 = exact_tag_list(raw9, known_tag_ids) if raw9 is not None else None
    parsed7 = exact_tag_list(raw7, known_tag_ids) if raw7 is not None else None
    candidates: list[str] = []
    if parsed9:
        # Valid field-9 Tag IDs alone are NOT class identity. These three
        # separate native classes use the same field for different layouts.
        if has(7, 0) and has(20, 2) and has(21, 2):
            candidates.append("FurnitureItemData")
        if has(8, 2) and has(11, 2):
            candidates.append("LandscapingItemData")
        if (has(11, 0) and has(13, 0) and
                has(15, 0) and has(19, 2)):
            candidates.append("FurnitureAncientMachineItemData")
    elif raw9 is not None:
        # For FenceAndRoad, field 9 is OptionalField VillageArea, NOT Tags.
        # Field 10 is Tags. Missing Tag field means the original default [].
        if not has(8, 2) and not has(20, 2) and not has(21, 2):
            candidates.append("FenceAndRoadItemData")
    elif has(13, 2) and (has(7, 2) or has(8, 2)):
        # Blocker oneof ToolBreakable / MountPushable is fields 7/8.
        # Neither message is a packed Tag list; actual Tags is field 14.
        candidates.append("FurnitureBlockerItemData")
    elif parsed7:
        if (has(11, 0) and (has(8, 2) or has(10, 2))
                and not has(999, 0)):
            candidates.append("FurnitureSnippetTrapItemData")
        if field_pairs == {
            (1, 0), (2, 2), (3, 2), (4, 2),
            (5, 2), (6, 2), (7, 2), (999, 0),
        }:
            candidates.append("FurnitureRequestItemData")

    require(len(candidates) == 1,
            "UNCLASSIFIED_OR_AMBIGUOUS_SOURCE_RECORD")
    name = candidates[0]
    tag_field, set_field, has_set = SOURCE_CLASS_FIELDS[name]
    tags_raw = single_value(ff, tag_field, 2)
    parsed = exact_tag_list(tags_raw, known_tag_ids)
    require(parsed is not None, "INVALID_NATIVE_TAG_FIELD")
    set_item_id: int | None = None
    if has_set:
        require(set_field is not None, "INVALID_HAS_SET_CONTRACT")
        candidate = single_value(ff, set_field, 0)
        require(candidate is None or
                (type(candidate) is int and candidate >= 0),
                "INVALID_NATIVE_SET_ITEM_ID")
        set_item_id = candidate if candidate is not None else 0
    return FurnitureNativeSubtype(
        item_id, native_key, name, tag_field, parsed,
        has_set, set_item_id)


def classify_corpus(
    furniture: list[tuple[int, str, list]], known_tags: set[int],
) -> list[FurnitureNativeSubtype]:
    require(len(furniture) == EXPECTED_TOTAL, "FURNITURE_CENSUS")
    rows = [classify_furniture(item_id, native_key, ff, known_tags)
            for item_id, native_key, ff in furniture]
    observed = Counter(row.data_class for row in rows)
    require(dict(observed) == EXPECTED_SOURCE_COUNTS,
            "NATIVE_SUBTYPE_CENSUS")
    require(len({x.item_id for x in rows}) == EXPECTED_TOTAL,
            "DUPLICATE_ITEM_ID")
    return sorted(rows, key=lambda x: x.item_id)


def original_set_tags(
    original_sets: list[tuple[int, str, list]], tag_ids: set[int],
) -> dict[int, tuple[int, ...]]:
    require(len(original_sets) == EXPECTED_SET_DEFS, "SET_CENSUS")
    result = {}
    for item_id, _, ff in original_sets:
        value = single_value(ff, 6, 2)
        parsed = exact_tag_list(value, tag_ids)
        require(parsed is not None, "SET_TAG_FIELD")
        result[item_id] = parsed
    require(len(result) == EXPECTED_SET_DEFS, "SET_UNIQUE_IDS")
    return result


def original_rows(
    furniture: list[tuple[int, str, list]],
    known_tags: set[int],
    sets: dict[int, tuple[int, ...]],
) -> tuple[list[dict], dict]:
    classes = classify_corpus(furniture, known_tags)
    counts = Counter()
    rows = []
    for item in classes:
        counts["items"] += 1
        counts["sourceTagsPresent"] += bool(item.native_tags)
        counts["directCollectionAreaCandidates"] += bool(
            set(item.native_tags) & {
                2001200028, 2001200029, 2001200030,
                2001200040, 2001200066, 2001200067,
            })
        if item.implements_has_set:
            counts["actualIHasSetItems"] += 1
            require(item.set_item_id is not None, "MISSING_SET_ID")
            set_id = item.set_item_id
            if set_id == 0:
                definition = {"kind": "missing_original_set_definition"}
                counts["noSetItemReference"] += 1
            else:
                require(set_id in sets, "ORIGINAL_SET_REFERENCE_MISSING")
                definition = {"kind": "original_set_definition",
                              "itemId": set_id, "nativeTags": list(sets[set_id])}
                counts["sourceResolvedSetItem"] += 1
                counts["setInheritedTagItems"] += bool(
                    set(sets[set_id]) - set(item.native_tags))
            lookup = {"kind": "has_set", "setItemId": set_id,
                      "definition": definition}
        else:
            lookup = {"kind": "not_ihas_set"}
        rows.append({
            "itemId": item.item_id,
            "nativeKey": item.native_key,
            "originalNativeClass": item.data_class,
            "tagsFieldNumber": item.tags_field,
            "nativeTags": list(item.native_tags),
            "setLookup": lookup,
            "nativeHasTagSchemaVerified": True,
            "gameUiCollectionMembershipVerified": False,
            "dlcEntitlementVerified": False,
        })
    require(counts["items"] == EXPECTED_TOTAL and
            counts["actualIHasSetItems"] == EXPECTED_SOURCE_COUNTS[
                "FurnitureItemData"] and
            counts["sourceResolvedSetItem"] == 4223 and
            counts["noSetItemReference"] == 1065,
            "SOURCE_SET_REFERENCE_CENSUS")
    return rows, {
        "items": EXPECTED_TOTAL,
        "byOriginalNativeClass": dict(sorted(
            Counter(x.data_class for x in classes).items())),
        "counts": dict(sorted(counts.items())),
    }


def private_target(output: Path, inputs: tuple[Path, ...]) -> None:
    require(not output.exists() and not output.is_symlink(),
            "REFUSE_OVERWRITE")
    for src in inputs:
        require(output != src and
                output not in src.parents and
                src not in output.parents,
                "ORIGINAL_OUTPUT_OVERLAP")
    for parent in (output, *output.parents):
        require(not (parent / ".git").exists() and
                not ((parent / "package.json").exists() and
                     (parent / "src").is_dir()),
                "OUTPUT_MUST_BE_OUTSIDE_GIT")


def json_bytes(data: object) -> bytes:
    return (json.dumps(data, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":")) + "\n").encode("utf-8")


def write_new(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".db01-furniture-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(tmp, 0o600)
        require(not path.exists(), "REFUSE_FILE_OVERWRITE")
        os.link(tmp, path)
    finally:
        Path(tmp).unlink(missing_ok=True)


def build(
    itemlist_dir: Path, il2cpp_dump: Path, output: Path,
) -> dict:
    source = itemlist_dir.resolve(strict=True)
    dump = il2cpp_dump.resolve(strict=True)
    target = output.resolve()
    private_target(target, (source, dump))
    require(source.is_dir() and not source.is_symlink(),
            "INVALID_SOURCE_DIRECTORY")
    originals = {
        name: original_records(verified_file(
            source / (name + ".json"), digest_expected, name), name)
        for name, digest_expected in (
            ("Furniture", FURNITURE_SHA256),
            ("Set", SET_SHA256),
            ("Tag", TAG_SHA256),
        )
    }
    tag_ids = {item_id for item_id, _, _ in originals["Tag"]}
    require(len(originals["Tag"]) == EXPECTED_TAG_DEFS and
            len(tag_ids) == EXPECTED_TAG_DEFS,
            "TAG_CENSUS")
    verify_il2cpp_contract(
        verified_file(dump, IL2CPP_SHA256, "IL2CPP").decode("utf-8"))
    sets = original_set_tags(originals["Set"], tag_ids)
    rows, census = original_rows(originals["Furniture"], tag_ids, sets)

    shards = [[] for _ in range(SHARDS)]
    for row in rows:
        shards[row["itemId"] % SHARDS].append(row)
    files = {}
    target.mkdir(parents=True, exist_ok=False)
    for i, part in enumerate(shards):
        key = f"id/{i:02x}.json"
        blob = json_bytes(part)
        write_new(target / key, blob)
        files[key] = {"sha256": digest(blob),
                      "bytes": len(blob), "count": len(part)}
    manifest = {
        "schema": SCHEMA, "platform": "Steam",
        "gameVersion": VERSION, "privateOnly": True,
        "publicationAuthorized": False,
        "sourceFurnitureSha256": FURNITURE_SHA256,
        "sourceSetSha256": SET_SHA256,
        "sourceTagSha256": TAG_SHA256,
        "sourceIl2cppDumpSha256": IL2CPP_SHA256,
        "originalNativeClassCounts": census["byOriginalNativeClass"],
        "sourceDefinitionCount": EXPECTED_TOTAL,
        "bucketCount": SHARDS, "files": files,
        "nativeIHasTagsSubtypesVerified": True,
        "originalSetLookupComplete": True,
        "nativeCollectionUiMembershipVerified": False,
        "dlcEntitlementVerified": False,
        "playerOwnershipVerified": False,
    }
    write_new(target / "manifest.json", json_bytes(manifest))
    return {"status": "PASS", "privateOnly": True,
            "manifestSha256": digest(json_bytes(manifest)),
            "source": "Steam 1.26.2", "census": census,
            "bucketCount": SHARDS}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--itemlist", type=Path, required=True)
    parser.add_argument("--il2cpp-dump", type=Path, required=True)
    parser.add_argument("--private-out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.itemlist, args.il2cpp_dump,
                           args.private_out), sort_keys=True))


if __name__ == "__main__":
    main()
