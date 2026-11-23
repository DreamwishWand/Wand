"""SHA-pinned Steam 1.26.2 original Clothing/Trimming/Makeup IHasTags index.

Offline original-source extraction only. Reuses the complete, fail-closed
protobuf framing, Tag dictionary, Set item lookup and private shard writer of
the previously implemented native Furniture extractor. Does NOT make any
runtime Collection UI/ownership/DLC claims. NEVER publish generated shards.
"""
from __future__ import annotations

import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import re
import sys

SRC = Path(__file__).with_name("extract_furniture_subtypes.py")
_spec = importlib.util.spec_from_file_location(
    "db01_other_native_tag_source_helper", SRC)
if _spec is None or _spec.loader is None:
    raise RuntimeError("DB01_OTHER_NATIVE_TAG_SOURCE_HELPER_MISSING")
_f = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = _f
_spec.loader.exec_module(_f)

SCHEMA = "wand.db01.original-wardrobe-ihastags-steam-1262@1"
VERSION = "1.26.2"
SOURCE_FAMILIES = {
    # family -> (SHA256, native data class, Tags field, SetItemID field,
    #            original record count, original positive-area Tag count)
    "Clothing": (
        "a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946",
        "ClothingItemData", 9, 8, 2041, 2041),
    "Trimming": (
        "a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c",
        "TrimmingItemData", 10, 9, 365, 365),
    "Makeup": (
        "ce83251a6ac082690c7a93698fee7526cf465b13a09d9e117d2e158500effe22",
        "MakeupItemData", 15, 14, 69, 0),
}
POSITIVE_AREA_TAGS = {
    1: 2001200028, 2: 2001200029, 3: 2001200030,
    4: 2001200040, 5: 2001200066, 4097: 2001200067,
}
SOURCE_AREA_COUNTS = {
    "Clothing": {1: 1792, 2: 19, 3: 42, 4: 25, 5: 132, 4097: 31},
    "Trimming": {1: 348, 2: 0, 3: 5, 4: 3, 5: 5, 4097: 4},
    "Makeup": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 4097: 0},
}
EXPECTED_TOTAL = 2475
EXPECTED_SET_LINKS = 2405
EXPECTED_AREA_ITEMS = 2406
SHARDS = 256


def require(value: object, code: str) -> None:
    if not value:
        raise ValueError("DB01_OTHER_NATIVE_TAG_" + code)


def verify_class_contracts(dump: str) -> None:
    for family, (_, native_class, tags_number, set_number, _, _) in (
            SOURCE_FAMILIES.items()):
        match = re.search(
            r"^public sealed class " + re.escape(native_class) +
            r"\b[^\n]*\n\{(.*?)\n\t// Properties",
            dump, re.M | re.S)
        require(match is not None, "MISSING_NATIVE_CLASS_" + family)
        head = match.group(0).split("\n", 1)[0]
        body = match.group(1)
        require(re.search(r"\bIHasTags\b", head) and
                re.search(r"\bIHasSet\b", head),
                "NATIVE_INTERFACE_" + family)
        require(f"public const int TagsFieldNumber = {tags_number};"
                in body and
                f"public const int SetItemIDFieldNumber = {set_number};"
                in body, "NATIVE_FIELD_NUMBERS_" + family)


def extract_rows(
    originals: dict[str, list[tuple[int, str, list]]],
    known_tags: set[int],
    set_tags: dict[int, tuple[int, ...]],
    *, verify_census: bool = True,
) -> tuple[list[dict], dict]:
    require(len(known_tags) == 409 and
            len(set_tags) == 727 and
            all(key in originals for key in SOURCE_FAMILIES),
            "INCOMPLETE_ORIGINAL_TAG_SET_CORPUS")
    entries = []
    observed = Counter()
    set_refs = Counter()
    area = {family: Counter() for family in SOURCE_FAMILIES}
    direct_tagged = Counter()
    inherited_novel = Counter()
    all_item_ids: set[int] = set()
    for family, (_hash, native_class, tag_number, set_number,
                 expected_rows, _expected_area) in SOURCE_FAMILIES.items():
        source = originals[family]
        require(len(source) == expected_rows,
                "SOURCE_FAMILY_RECORD_COUNT_" + family)
        for item_id, native_key, fields in source:
            require(item_id not in all_item_ids,
                    "DUPLICATE_ITEM_ID_ACROSS_FAMILIES")
            all_item_ids.add(item_id)
            direct = _f.exact_tag_list(
                _f.single_value(fields, tag_number, 2), known_tags)
            require(direct is not None and len(direct) > 0,
                    "INVALID_DIRECT_TAGS_" + family)
            ref = _f.single_value(fields, set_number, 0)
            require(ref is None or
                    (type(ref) is int and ref >= 0),
                    "INVALID_SET_REFERENCE_" + family)
            set_id = ref or 0
            if set_id:
                require(set_id in set_tags,
                        "UNRESOLVED_SET_REFERENCE_" + family)
                definition = {
                    "kind": "original_set_definition",
                    "itemId": set_id,
                    "nativeTags": list(set_tags[set_id]),
                }
                set_refs[family] += 1
            else:
                definition = {"kind": "missing_original_set_definition"}
            lookup = {
                "kind": "has_set", "setItemId": set_id,
                "definition": definition,
            }
            inherited = set_tags.get(set_id, ())
            effective = set(direct) | set(inherited)
            codes = [code for code, tag in POSITIVE_AREA_TAGS.items()
                     if tag in effective]
            require(len(codes) <= 1,
                    "MULTIPLE_POSITIVE_AREA_TAGS_" + family)
            area[family].update(codes)
            require(not any(
                tag in inherited and tag not in direct
                for tag in POSITIVE_AREA_TAGS.values()),
                "SET_AREA_INHERITANCE_DRIFT_" + family)
            observed[family] += 1
            direct_tagged[family] += bool(direct)
            inherited_novel[family] += bool(set(inherited) - set(direct))
            entries.append({
                "itemId": item_id,
                "nativeKey": native_key,
                "nativeCategory": family,
                "originalNativeClass": native_class,
                "tagsFieldNumber": tag_number,
                "nativeTags": list(direct),
                "setLookup": lookup,
                "nativeHasTagSchemaVerified": True,
                "gameUiCollectionMembershipVerified": False,
                "dlcEntitlementVerified": False,
            })
    census = {
        "total": len(entries),
        "byNativeCategory": dict(sorted(observed.items())),
        "sourceNonemptyDirectTagItems": dict(sorted(direct_tagged.items())),
        "sourceResolvedSetReferences": dict(sorted(set_refs.items())),
        "sourceNewInheritedSetTagItems": dict(sorted(inherited_novel.items())),
        "sourcePositiveAreaItems": sum(sum(x.values())
                                       for x in area.values()),
        "sourcePositiveAreaByCategory": {
            family: {str(code): area[family][code]
                     for code in POSITIVE_AREA_TAGS}
            for family in SOURCE_FAMILIES
        },
        "sourceAllAreasDefaultTagVerified": False,
        "actualGameCollectionUiMembershipVerified": False,
    }
    require(len(entries) == EXPECTED_TOTAL and
            len(all_item_ids) == EXPECTED_TOTAL,
            "ORIGINAL_ITEMS_CENSUS")
    if verify_census:
        require(sum(set_refs.values()) == EXPECTED_SET_LINKS and
                set_refs["Clothing"] == 2040 and
                set_refs["Trimming"] == 365 and
                set_refs["Makeup"] == 0 and
                inherited_novel["Clothing"] == 2040 and
                inherited_novel["Trimming"] == 365 and
                inherited_novel["Makeup"] == 0 and
                census["sourcePositiveAreaItems"] ==
                EXPECTED_AREA_ITEMS and
                all(dict(area[family]) ==
                    {code:count for code,count in SOURCE_AREA_COUNTS[
                        family].items() if count}
                    for family in SOURCE_FAMILIES),
                "ORIGINAL_POSITIVE_AREA_OR_SET_CENSUS_DRIFT")
    return sorted(entries, key=lambda row: row["itemId"]), census


def build(itemlist: Path, il2cpp_dump: Path, private_output: Path) -> dict:
    source = itemlist.resolve(strict=True)
    dump = il2cpp_dump.resolve(strict=True)
    output = private_output.resolve()
    _f.private_target(output, (source, dump))
    require(source.is_dir() and not source.is_symlink(),
            "UNSAFE_ORIGINAL_ITEMLIST_DIRECTORY")
    originals = {
        family: _f.original_records(_f.verified_file(
            source / (family + ".json"), expected_sha, family), family)
        for family, (expected_sha, *_rest) in SOURCE_FAMILIES.items()
    }
    tags = _f.original_records(_f.verified_file(
        source / "Tag.json", _f.TAG_SHA256, "Tag"), "Tag")
    sets = _f.original_records(_f.verified_file(
        source / "Set.json", _f.SET_SHA256, "Set"), "Set")
    tag_ids = {id for id, _, _ in tags}
    require(len(tag_ids) == len(tags) == 409,
            "ORIGINAL_TAG_DEFINITION_COUNT")
    set_tags = _f.original_set_tags(sets, tag_ids)
    verify_class_contracts(_f.verified_file(
        dump, _f.IL2CPP_SHA256, "IL2CPP").decode("utf-8"))
    entries, census = extract_rows(originals, tag_ids, set_tags)

    parts = [[] for _ in range(SHARDS)]
    for row in entries:
        parts[row["itemId"] % SHARDS].append(row)
    output.mkdir(parents=True, exist_ok=False)
    ledger = {}
    for index, rows in enumerate(parts):
        path = f"id/{index:02x}.json"
        content = _f.json_bytes(rows)
        _f.write_new(output / path, content)
        ledger[path] = {
            "sha256": _f.digest(content),
            "bytes": len(content), "count": len(rows),
        }
    manifest = {
        "schema": SCHEMA,
        "platform": "Steam", "gameVersion": VERSION,
        "privateOnly": True, "publicationAuthorized": False,
        "sourceCategorySha256": {
            name: values[0] for name, values in SOURCE_FAMILIES.items()},
        "sourceTagSha256": _f.TAG_SHA256,
        "sourceSetSha256": _f.SET_SHA256,
        "sourceIl2cppDumpSha256": _f.IL2CPP_SHA256,
        "sourceDefinitionCount": EXPECTED_TOTAL,
        "originalCategoryCounts": census["byNativeCategory"],
        "bucketCount": SHARDS,
        "files": ledger,
        "originalIHasTagsAndIHasSetVerified": True,
        "sourceSetReferenceLookupComplete": True,
        "sourcePositiveAreaCountsVerified": True,
        "nativeAllAreasDefaultTagVerified": False,
        "actualCollectionUiMembershipVerified": False,
        "playerOwnershipVerified": False,
        "dlcEntitlementVerified": False,
    }
    content = _f.json_bytes(manifest)
    _f.write_new(output / "manifest.json", content)
    return {
        "status": "PASS",
        "manifestSha256": _f.digest(content),
        "privateOnly": True,
        "shards": SHARDS,
        "census": census,
    }


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
