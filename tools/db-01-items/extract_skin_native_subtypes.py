"""Offline SHA-verified original Steam 1.26.2 Skin source subtype index.

Skin.json contains 163 original framed entries in seven disjoint original
source ID bands. Each band has a distinct IL2CPP protobuf layout; two native
classes do NOT implement IHasTags. The band plus wire-field identity is
checked against the original same-version dump. This is source schema and
layout evidence, NOT runtime object identity or live Collection membership.

Produces only PRIVATE SHA-ledger files outside the repository. The original
Skin.json, Tag.json and dump.cs are never committed or included in output.
"""
from __future__ import annotations

import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import re
import sys

HELPER = Path(__file__).with_name("extract_furniture_subtypes.py")
_spec = importlib.util.spec_from_file_location(
    "db01_original_skin_wire_helpers", HELPER)
if _spec is None or _spec.loader is None:
    raise RuntimeError("DB01_SKIN_WIRE_HELPER_MISSING")
_f = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = _f
_spec.loader.exec_module(_f)

SCHEMA = "wand.db01.original-skin-subtypes-steam-1262@1"
VERSION = "1.26.2"
SKIN_SHA256 = "c557b76c8a762afb3d6cdd66e9c6ced22e7d863ff3dc7426f8f9aff3939e6371"
IL2CPP_SHA256 = _f.IL2CPP_SHA256
TAG_SHA256 = _f.TAG_SHA256
EXPECTED_COUNT = 163
SHARDS = 256

# ID band is an exact, full-corpus original source observation. Protobuf
# payloads themselves are NOT tagged with an explicit native class name.
# The IL2CPP native class header + required shape anchor are independently
# verified; do not equate this with runtime type identity proof.
# (native class name, Tags field | None, original count,
#  mandatory class-specific wire field shapes)
ORIGINAL_BAND_LAYOUTS = {
    1700: ("CharacterSkinItemData", 11, 91, ((10, 0),)),
    1701: ("StallSkinItemData", 18, 15, ((7, 2), (8, 2))),
    1702: ("BuildingOtherSkinItemData", 18, 32, ((7, 2), (8, 2))),
    1703: ("SceneAssetsSkinItemData", 18, 9, ((7, 2),)),
    1704: ("MountSkinItemData", None, 1, ((10, 0), (16, 2))),
    1705: ("BoatSkinItemData", None, 3, ()),
    1706: ("HouseSkinItemData", 18, 12, ((6, 0), (8, 2))),
}
POSITIVE_TAGS = {
    1: 2001200028, 2: 2001200029, 3: 2001200030,
    4: 2001200040, 5: 2001200066, 4097: 2001200067,
}
EXPECTED_POSITIVE = {1: 5, 2: 3, 3: 3, 4: 1, 5: 2, 4097: 7}
EXPECTED_DIRECT_TAG_ROWS = 71
EXPECTED_TAG_MATCHES = 21
EXPECTED_NON_IHAS_TAGS = 4

def require(ok: object, reason: str) -> None:
    if not ok:
        raise ValueError("DB01_SKIN_ORIGINAL_" + reason)

def verify_native_layout(dump: str) -> None:
    for band, (class_name, tag_field, _, fields) in ORIGINAL_BAND_LAYOUTS.items():
        match = re.search(
            r"^public sealed class " + re.escape(class_name) +
            r"\b[^\n]*\n\{(.*?)\n\t// Properties",
            dump, re.M | re.S)
        require(match is not None,
                "IL2CPP_CLASS_MISSING_" + class_name)
        header = match.group(0).split("\n", 1)[0]
        block = match.group(1)
        require(("IHasTags" in header) == (tag_field is not None) and
                "IHasSet" not in header,
                "INCORRECT_IHASTAGS_OR_IHASSET_" + class_name)
        if tag_field is None:
            require("TagsFieldNumber" not in block,
                    "FORBIDDEN_NATIVE_TAG_FIELD_" + class_name)
        else:
            require(f"public const int TagsFieldNumber = {tag_field};"
                    in block,
                    "NATIVE_TAG_FIELD_" + class_name)
        if band == 1700:
            require("public const int CharacterItemIDFieldNumber = 10;"
                    in block, "CHARACTER_SKIN_REFERENCE")
        if band == 1704:
            require("public const int MountItemIDFieldNumber = 10;"
                    in block, "MOUNT_SKIN_REFERENCE")
        if band == 1706:
            require("public const int HouseItemIDFieldNumber = 6;"
                    in block, "HOUSE_SKIN_REFERENCE")

def classify_record(
    item_id: int, native_key: str, ff: list,
    known_tags: set[int],
) -> dict:
    require(type(item_id) is int and item_id > 0 and
            isinstance(native_key, str) and bool(native_key) and
            isinstance(ff, list) and isinstance(known_tags, set),
            "UNTRUSTED_ORIGINAL_ROW")
    band = item_id // 100_000
    require(band in ORIGINAL_BAND_LAYOUTS,
            "UNMAPPED_ORIGINAL_SOURCE_ID_BAND")
    class_name, tag_field, _, anchors = ORIGINAL_BAND_LAYOUTS[band]
    pairs = {(f, w) for f, w, _ in ff}
    require(all(pair in pairs for pair in anchors),
            "NATIVE_SUBTYPE_WIRE_LAYOUT_" + class_name)
    # Class-specific fields that would be inconsistent with each source
    # band: e.g. a CharacterSkin cannot have a BuildingOther field-18.
    if band == 1700:
        require((18, 2) not in pairs and (7, 2) not in pairs,
                "FOREIGN_CHARACTER_SKIN_FIELDS")
    elif band == 1701:
        require((6, 2) not in pairs and (10, 0) not in pairs,
                "FOREIGN_STALL_SKIN_FIELDS")
    elif band == 1702:
        require((10, 0) not in pairs and (21, 2) not in pairs,
                "FOREIGN_OTHER_BUILDING_SKIN_FIELDS")
    elif band == 1703:
        require((8, 2) not in pairs and (10, 0) not in pairs,
                "FOREIGN_SCENE_ASSET_SKIN_FIELDS")
    elif band in (1704, 1705, 1706):
        require((11, 2) not in pairs and (18, 2) not in pairs,
                "FOREIGN_TAGGED_SKIN_FIELDS")
    if tag_field is None:
        native_tags = None
        require((11, 2) not in pairs and (18, 2) not in pairs,
                "NON_IHAS_TAGS_HAS_FOREIGN_TAGS")
    else:
        source_raw = _f.single_value(ff, tag_field, 2)
        native_tags = _f.exact_tag_list(source_raw, known_tags)
        require(native_tags is not None,
                "UNVERIFIED_SOURCE_TAG_FIELD_" + class_name)
    return {
        "itemId": item_id,
        "nativeKey": native_key,
        "nativeCategory": "Skin",
        "sourceIdBand": band,
        "sourceProtobufClass": class_name,
        "tagsFieldNumber": tag_field,
        "nativeTags": list(native_tags) if native_tags is not None else None,
        "originalIHasTagsInterface": tag_field is not None,
        "originalIHasSetInterface": False,
        "sourceSubtypeLayoutVerified": True,
        "nativeRuntimeObjectTypeIndependentlyVerified": False,
        "actualCollectionUiMembershipVerified": False,
        "nativeAllAreasDefaultPredicateVerified": False,
        "playerEntitlementVerified": False,
        "dlcEntitlementVerified": False,
    }

def classify_corpus(
    originals: list[tuple[int, str, list]],
    known_tags: set[int],
    *, check_census: bool = True,
) -> tuple[list[dict], dict]:
    require(len(originals) == EXPECTED_COUNT and
            len(known_tags) == 409,
            "COMPLETE_ORIGINAL_SKIN_TAG_SOURCE_REQUIRED")
    classes: Counter = Counter()
    area: Counter = Counter()
    direct = 0
    notags = 0
    ids: set[int] = set()
    rows = []
    for item_id, native_key, ff in originals:
        require(item_id not in ids, "DUPLICATE_ORIGINAL_ITEM_ID")
        ids.add(item_id)
        row = classify_record(item_id, native_key, ff, known_tags)
        classes[row["sourceProtobufClass"]] += 1
        if row["nativeTags"] is None:
            notags += 1
        else:
            direct += bool(row["nativeTags"])
            matching = [c for c, tag in POSITIVE_TAGS.items()
                        if tag in row["nativeTags"]]
            require(len(matching) <= 1,
                    "AMBIGUOUS_ORIGINAL_POSITIVE_AREA_TAGS")
            area.update(matching)
        rows.append(row)
    if check_census:
        require(classes == Counter({
            name: count for name, _, count, _ in
            ORIGINAL_BAND_LAYOUTS.values()
        }) and
            dict(area) == EXPECTED_POSITIVE and
            direct == EXPECTED_DIRECT_TAG_ROWS and
            notags == EXPECTED_NON_IHAS_TAGS,
            "SOURCE_SUBTYPE_OR_AREA_CENSUS_DRIFT")
    report = {
        "sourceDefinitions": EXPECTED_COUNT,
        "byOriginalSourceProtobufClass": dict(sorted(classes.items())),
        "sourceItemsWithNonemptyDirectNativeTags": direct,
        "sourcePositiveNativeAreaItems": sum(area.values()),
        "sourceIHasTagsWithoutPositiveArea": EXPECTED_COUNT -
            sum(area.values()) - notags,
        "sourceWithoutIHasTagsInterface": notags,
        "sourcePositiveAreaByCode": {
            str(code): area[code] for code in POSITIVE_TAGS
        },
        "nativeRuntimeObjectTypeIndependentlyVerified": False,
        "actualCollectionUiMembershipVerified": False,
        "nativeAllAreasDefaultPredicateVerified": False,
    }
    return sorted(rows, key=lambda row: row["itemId"]), report

def build(itemlist: Path, il2cpp_dump: Path, private_out: Path) -> dict:
    root = itemlist.resolve(strict=True)
    dump = il2cpp_dump.resolve(strict=True)
    output = private_out.resolve()
    _f.private_target(output, (root, dump))
    require(root.is_dir() and not root.is_symlink(),
            "REFUSE_UNTRUSTED_SOURCE_DIRECTORY")
    originals = _f.original_records(_f.verified_file(
        root / "Skin.json", SKIN_SHA256, "SKIN"), "Skin")
    tags = _f.original_records(_f.verified_file(
        root / "Tag.json", TAG_SHA256, "TAG"), "Tag")
    known = {id for id, _, _ in tags}
    require(len(tags) == len(known) == 409,
            "ORIGINAL_TAG_SOURCE_CENSUS")
    verify_native_layout(_f.verified_file(
        dump, IL2CPP_SHA256, "IL2CPP").decode("utf-8"))
    entries, report = classify_corpus(originals, known)
    output.mkdir(parents=True, exist_ok=False)
    buckets = [[] for _ in range(SHARDS)]
    for row in entries:
        buckets[row["itemId"] % SHARDS].append(row)
    ledger = {}
    for i, part in enumerate(buckets):
        key = f"id/{i:02x}.json"
        blob = _f.json_bytes(part)
        _f.write_new(output / key, blob)
        ledger[key] = {
            "sha256": _f.digest(blob),
            "bytes": len(blob), "count": len(part),
        }
    manifest = {
        "schema": SCHEMA,
        "platform": "Steam",
        "gameVersion": VERSION,
        "privateOnly": True,
        "publicationAuthorized": False,
        "sourceSkinSha256": SKIN_SHA256,
        "sourceTagSha256": TAG_SHA256,
        "sourceIl2cppDumpSha256": IL2CPP_SHA256,
        "sourceDefinitionCount": EXPECTED_COUNT,
        "originalSourceProtobufClassCounts":
            report["byOriginalSourceProtobufClass"],
        "originalSourcePositiveAreaCounts":
            report["sourcePositiveAreaByCode"],
        "nativeIHasTagsAndSetInterfacesVerified": True,
        "nativeRuntimeObjectTypeIndependentlyVerified": False,
        "nativeAllAreasDefaultPredicateVerified": False,
        "actualCollectionUiMembershipVerified": False,
        "playerEntitlementVerified": False,
        "dlcEntitlementVerified": False,
        "bucketCount": SHARDS,
        "files": ledger,
    }
    _f.write_new(output / "manifest.json", _f.json_bytes(manifest))
    return {
        "status": "PASS",
        "privateOnly": True,
        "manifestSha256": _f.digest(_f.json_bytes(manifest)),
        "census": report,
    }

def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--itemlist", type=Path, required=True)
    p.add_argument("--il2cpp-dump", type=Path, required=True)
    p.add_argument("--private-out", type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(build(args.itemlist, args.il2cpp_dump,
                           args.private_out), sort_keys=True))

if __name__ == "__main__":
    main()
