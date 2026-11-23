"""Audit ORIGINAL Steam 1.26.2 CollectionVisibility wire cases, owner-private.

Checks source SHA-256 and native IL2CPP field numbers before decoding raw
protobuf-framed itemlist records. Never reconstructs runtime CollectionArea
membership, save discovery, DLC ownership, or in-game visibility behavior.
Only audit source/case evidence; output stays in owner-private storage.

For Steam 1.26.2, ActivityItem field 31 is AMBIGUOUS:
CropItemData.CollectionVisibility AND SeedItemData.Tags use field 31.
The only safe way to distinguish them is to validate the whole nested
visibility oneof or the packed Tag IDs against the exact original Tag.json.
Do NOT count all field-31 occurrences as visibility records.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import tempfile
import os

HELPER = Path(__file__).resolve().parents[1] / "collection" / "extract_scope_evidence.py"
_spec = importlib.util.spec_from_file_location("wand_db01_scope_wire", HELPER)
if _spec is None or _spec.loader is None:
    raise RuntimeError("SOURCE_WIRE_READER_MISSING")
_wire = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_wire)

SCHEMA = "wand.db01.original-collection-visibility-private@1"
GAME_VERSION = "1.26.2"
IL2CPP_SHA = "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08"
SOURCE_SHA = {
    "Furniture": "cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196",
    "ActivityItem": "4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2",
    "Companion": "62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219",
    "Tag": "bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4",
}
EXPECTED_ROWS = {"Furniture": 6746, "ActivityItem": 4050, "Companion": 394, "Tag": 409}
VISIBILITY_FIELDS = {
    "FurnitureItemData": 46, "CropItemData": 31,
    "MealItemData": 20, "PetItemData": 20,
}
CASES = {1: "WhenUnlocked", 2: "When", 5: "WhenUnloked"}
SEED_TAG_FIELD = 31


def require(ok: object, code: str) -> None:
    if not ok:
        raise ValueError("DB01_COLLECTION_VISIBILITY_" + code)


def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def verify_il2cpp(text: str) -> dict[str, int]:
    """Pure pinned native schema audit, no inferred method implementation."""
    field_numbers: dict[str, int] = {}
    for cls, field_number in VISIBILITY_FIELDS.items():
        match = re.search(
            r"public sealed class " + re.escape(cls) +
            r"\b[^\n]*\n\{(.*?)\n\t// Properties", text, re.S,
        )
        require(match is not None and "IHasCollectionVisibility" in match.group(0),
                "MISSING_NATIVE_" + cls)
        field = re.search(
            r"public const int CollectionVisibilityFieldNumber = (\d+);",
            match.group(1),
        )
        require(field is not None and int(field.group(1)) == field_number,
                "VISIBILITY_FIELD_DRIFT_" + cls)
        field_numbers[cls] = field_number

    match = re.search(
        r"public sealed class SeedItemData\b[^\n]*\n\{(.*?)\n\t// Properties",
        text, re.S,
    )
    require(match is not None and
            re.search(r"public const int TagsFieldNumber = 31;", match.group(1)),
            "SEED_TAG_FIELD_DRIFT")
    for cls in ("CollectionItemVisibility",):
        match = re.search(
            r"public enum " + re.escape(cls) +
            r"\.VisibilityOneofCase\b[^\n]*\n\{(.*?)\n\}", text, re.S,
        )
        require(match is not None, "NATIVE_VISIBILITY_ONEOF")
        for code, name in CASES.items():
            require(re.search(
                r"public const " + re.escape(cls) +
                r"\.VisibilityOneofCase " + name + r" = " +
                str(code) + r";", match.group(1)),
                "NATIVE_VISIBILITY_CASE_DRIFT_" + name)
    return field_numbers


def read_originals(itemlist: Path, dump: Path) -> tuple[dict[str, bytes], str]:
    require(itemlist.is_dir() and not itemlist.is_symlink(),
            "SOURCE_DIRECTORY")
    data = {}
    for family, expected in SOURCE_SHA.items():
        path = itemlist / (family + ".json")
        require(path.is_file() and not path.is_symlink(), "SOURCE_MISSING_" + family)
        value = path.read_bytes()
        require(0 < len(value) <= 32 * 1024 * 1024 and sha(value) == expected,
                "SOURCE_SHA_MISMATCH_" + family)
        data[family] = value
    require(dump.is_file() and not dump.is_symlink() and
            hashlib.file_digest(dump.open("rb"), "sha256").hexdigest() == IL2CPP_SHA,
            "IL2CPP_SOURCE_SHA_MISMATCH")
    return data, dump.read_text(encoding="utf-8")


def decode_visibility(raw: bytes) -> tuple[str, str | None] | None:
    """Decode only exact supported oneof frames; other payloads return None."""
    try:
        fields = list(_wire.fields(raw))
    except (ValueError, IndexError):
        return None
    if len(fields) != 1:
        return None
    field, wire_type, payload = fields[0]
    if wire_type != 2 or field not in CASES:
        return None
    if field in (1, 5):
        # Empty protobuf message, not an arbitrary value-bearing field.
        if payload != b"":
            return None
        return CASES[field], None
    # ConditionsList is source data, not a verified runtime evaluator.
    return CASES[field], sha(payload)


def read_family(blob: bytes, family: str) -> list[tuple[int, str, list]]:
    """Fail closed on malformed/duplicated current source Item identity."""
    rows = []
    seen: set[int] = set()
    for _, raw in _wire.frames(blob):
        ff = list(_wire.fields(raw))
        identities = [value for index, wire, value in ff if index == 1 and wire == 0]
        names = [value for index, wire, value in ff if index == 2 and wire == 2]
        require(len(identities) == 1 and len(names) == 1 and
                type(identities[0]) is int and identities[0] > 0 and
                identities[0] not in seen and names[0] and
                len(names[0]) <= 1024,
                "INVALID_SOURCE_ROW_" + family)
        try:
            native_name = names[0].decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("DB01_COLLECTION_VISIBILITY_INVALID_NATIVE_NAME") from exc
        seen.add(identities[0])
        rows.append((identities[0], native_name, ff))
    require(len(rows) == EXPECTED_ROWS[family], "SOURCE_ROW_CENSUS_" + family)
    return rows


def collect_cases(
    furniture: list[tuple[int, str, list]],
    activities: list[tuple[int, str, list]],
    companions: list[tuple[int, str, list]],
    tags: set[int],
) -> tuple[list[dict], dict]:
    """Exact source visibility cases and ambiguous seed Tag 31 disambiguation."""
    results: list[dict] = []
    seeds = 0

    def record(family: str, item_id: int, native_name: str,
               raw: bytes) -> None:
        decoded = decode_visibility(raw)
        require(decoded is not None, "UNRECOGNIZED_VISIBILITY_" + family)
        case, condition_sha = decoded
        results.append({
            "itemId": item_id, "sourceFamily": family,
            "sourceNativeKey": native_name, "case": case,
            "conditionBlobSha256": condition_sha,
            "sourcePredicateOnly": True,
            "runtimeVisibilityBehaviorVerified": False,
            "gameCollectionAreaMembershipVerified": False,
            "playerDiscoveryVerified": False,
        })

    def scan(family: str, rows: list[tuple[int, str, list]],
             field: int) -> None:
        for item_id, native_name, ff in rows:
            selected = [raw for f, wire, raw in ff if f == field and wire == 2]
            require(len(selected) <= 1, "DUPLICATE_VISIBILITY_FIELD_" + family)
            for raw in selected:
                record(family, item_id, native_name, raw)

    scan("Furniture", furniture, VISIBILITY_FIELDS["FurnitureItemData"])
    scan("Companion", companions, VISIBILITY_FIELDS["PetItemData"])
    scan("ActivityMeal", activities, VISIBILITY_FIELDS["MealItemData"])
    for item_id, native_name, ff in activities:
        selected = [raw for f, wire, raw in ff
                    if f == VISIBILITY_FIELDS["CropItemData"] and wire == 2]
        require(len(selected) <= 1, "DUPLICATE_ACTIVITY_FIELD_31")
        for raw in selected:
            # CropItemData.CollectionVisibility and SeedItemData.Tags
            # share field 31. Distinguish by whole oneof / exact Tag IDs.
            decoded = decode_visibility(raw)
            tag_matches = _wire.packed_tags(raw, tags)
            require(not (decoded and tag_matches), "COLLIDING_TAG_AND_VISIBILITY")
            if decoded is not None:
                record("ActivityCrop", item_id, native_name, raw)
            else:
                require(bool(tag_matches), "UNKNOWN_ACTIVITY_FIELD_31")
                seeds += 1

    require(len(results) == len({row["itemId"] for row in results}),
            "DUPLICATE_VISIBILITY_ITEM")
    counts = Counter(row["case"] for row in results)
    families = Counter(row["sourceFamily"] for row in results)
    return sorted(results, key=lambda x: x["itemId"]), {
        "visibilityRecords": len(results),
        "cases": {name: counts[name] for name in CASES.values()},
        "sourceFamilies": {name: families[name] for name in
                           ("Furniture", "ActivityCrop", "ActivityMeal", "Companion")},
        "activityField31RecognizedSeedTagReferences": seeds,
        "requiresRuntimeConditionEvaluator": counts["When"] > 0,
    }


def audit(itemlist: Path, dump: Path) -> dict:
    originals, native_text = read_originals(itemlist, dump)
    fields = verify_il2cpp(native_text)
    data = {name: read_family(blob, name) for name, blob in originals.items()}
    tag_ids = {item_id for item_id, _, _ in data["Tag"]}
    require(len(tag_ids) == 409, "TAG_SOURCE_COVERAGE")
    rows, census = collect_cases(
        data["Furniture"], data["ActivityItem"], data["Companion"], tag_ids,
    )
    return {
        "schema": SCHEMA, "platform": "Steam", "gameVersion": GAME_VERSION,
        "privateOnly": True, "publicationAuthorized": False,
        "originalSourcesSha256": dict(SOURCE_SHA),
        "originalIl2cppDumpSha256": IL2CPP_SHA,
        "nativeVisibilityFields": fields,
        "sourceFieldCasesVerified": True,
        "runtimeVisibilityBehaviorVerified": False,
        "gameCollectionAreaMembershipVerified": False,
        "worldAvailabilityVerified": False,
        "dlcEntitlementVerified": False,
        "playerDiscoveryVerified": False,
        "census": census, "rows": rows,
    }


def write_private(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".db01-visibility-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False,
                      sort_keys=True, indent=2)
            stream.write("\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Steam v1.26.2 original CollectionVisibility audit (private)"
    )
    parser.add_argument("--itemlist", type=Path, required=True)
    parser.add_argument("--il2cpp-dump", type=Path, required=True)
    parser.add_argument("--private-out", type=Path, required=True)
    args = parser.parse_args()
    require(not args.private_out.resolve().is_relative_to(args.itemlist.resolve()),
            "OUTPUT_INSIDE_GAME_ORIGINAL")
    result = audit(args.itemlist, args.il2cpp_dump)
    write_private(args.private_out, result)
    print(json.dumps({"schema": result["schema"], "status": "PASS",
                      "census": result["census"],
                      "runtimeVisibilityBehaviorVerified": False},
                     sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        sys.exit("DB-01 visibility audit failed: " + str(exc))
