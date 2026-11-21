"""Evidence-gated wire decoder for the 35 additional Steam 1.26.2 itemlists.

This deliberately does NOT equate all native definitions to collectible inventory items.
"""
import argparse
import base64
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import steam1262
import localize1262

SCHEMA = "wand.src01.extended@1"
PROBE_SCHEMA = "wand.src01.format-probe@1"
GUID = re.compile(r"guid:[0-9a-f]{32}\Z")
NAME_KEY = re.compile(r"[A-Za-z][A-Za-z0-9]*\..+_DisplayName\Z")
MAX_SOURCE_BYTES = 128 * 1024 * 1024
MAX_RECORD_BYTES = 4 * 1024 * 1024
MAX_FRAMES = 200000


def decode_fields(data):
    """Decode top-level protobuf wire values; nested blobs remain uninterpreted."""
    fields = {}
    pos = 0
    while pos < len(data):
        tag, pos = steam1262.varint(data, pos)
        number, kind = tag >> 3, tag & 7
        if not number or kind not in (0, 1, 2, 5):
            raise ValueError("INVALID_PROTOBUF_FIELD")
        if kind == 0:
            value, pos = steam1262.varint(data, pos)
        elif kind == 2:
            length, pos = steam1262.varint(data, pos)
            if length > len(data) - pos:
                raise ValueError("TRUNCATED_PROTOBUF_BYTES")
            value = data[pos:pos + length]
            pos += length
        else:
            width = 8 if kind == 1 else 4
            if pos + width > len(data):
                raise ValueError("TRUNCATED_PROTOBUF_FIXED")
            value = data[pos:pos + width]
            pos += width
        fields.setdefault(number, []).append((kind, value))
    return fields


def single(fields, number, wire):
    values = fields.get(number, [])
    if len(values) != 1 or values[0][0] != wire:
        return None
    return values[0][1]


def text_field(fields, number):
    value = single(fields, number, 2)
    if value is None or len(value) > 2048:
        return None
    try:
        return value.decode("utf-8")
    except UnicodeDecodeError:
        return None


def frames(data):
    pos = 0
    seen = set()
    counter = 0
    while pos < len(data):
        key, pos = steam1262.varint(data, pos)
        length, pos = steam1262.varint(data, pos)
        if key in seen or length == 0 or length > MAX_RECORD_BYTES or length > len(data) - pos:
            raise ValueError("INVALID_OR_DUPLICATE_NATIVE_FRAME")
        seen.add(key)
        item = data[pos:pos + length]
        pos += length
        counter += 1
        if counter > MAX_FRAMES:
            raise ValueError("EXCESSIVE_NATIVE_FRAME_COUNT")
        yield key, item


def parse_definition(frame_key, data, base, category, source, file_digest):
    fields = decode_fields(data)
    item_id = single(fields, 1, 0)
    if type(item_id) is not int or not 0 < item_id < 2**53 or item_id - frame_key != base:
        raise ValueError(f"NATIVE_FRAME_ID_MISMATCH:{category}:{frame_key}")
    raw = text_field(fields, 2)
    key = text_field(fields, 3)
    key = key if key and NAME_KEY.fullmatch(key) and key.startswith(category + ".") else None
    guid_field4 = text_field(fields, 4)
    guid_field4 = guid_field4 if guid_field4 and GUID.fullmatch(guid_field4) else None
    return {
        "itemId": item_id, "nativeCategory": category, "rawNameField": raw,
        "localizationKey": key, "names": {locale: None for locale in localize1262.LOCALES},
        "iconGuid": None, "imageGuidField4Candidate": guid_field4,
        "category": None, "subcategory": None, "attributes": None,
        "worlds": None, "universes": None, "expansions": None,
        "source": {"platform": "Steam", "gameVersion": "1.26.2", "file": source,
                   "sha256": file_digest, "verifiedWireFields": {"itemId": 1,
                   "rawNameCandidate": 2, "localizationKeyCandidate": 3}},
    }


def category_localization_key(record, category):
    """Native field 3 is `Category.Key`, but Category.locbin stores `Key`."""
    key = record.get("localizationKey")
    prefix = category + "."
    return key[len(prefix):] if isinstance(key, str) and key.startswith(prefix) else None


def pinned_category(game, filename, spec):
    """Require full SHA, record alignment, and agreement with the original probe's three samples."""
    source = spec.get("source")
    if source != f"ddv_Data/StreamingAssets/itemlist/{filename}" or spec.get("status") != "binary_structure_probe":
        raise ValueError(f"INVALID_PROBE_SOURCE:{filename}")
    path = game / Path(source)
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_SOURCE_BYTES:
        raise ValueError(f"INVALID_NATIVE_FILE:{filename}")
    data = path.read_bytes()
    if len(data) != spec.get("size") or hashlib.sha256(data).hexdigest() != spec.get("sha256"):
        raise ValueError(f"NATIVE_SOURCE_HASH_MISMATCH:{filename}")
    model = spec.get("frameProbe", {})
    examples = model.get("frames", [])
    if model.get("status") != "candidate_frame_model" or len(examples) < 3:
        raise ValueError(f"INSUFFICIENT_FORMAT_EVIDENCE:{filename}")
    baselines = []
    for sample in examples:
        field = next((x.get("integer") for x in sample.get("fieldProfile", {}).get("fields", [])
                      if x.get("field") == 1 and x.get("wire") == 0), None)
        if type(field) is not int or type(sample.get("frameKey")) is not int:
            raise ValueError("UNVERIFIED_SAMPLE_ID")
        baselines.append(field - sample["frameKey"])
    if len(set(baselines)) != 1:
        raise ValueError(f"INCONSISTENT_PROBE_BASE:{filename}")
    base = baselines[0]
    category = filename[:-5]
    decoded = []
    for frame_key, content in frames(data):
        decoded.append(parse_definition(frame_key, content, base, category, source, spec["sha256"]))
    if len(decoded) < len(examples):
        raise ValueError("INCOMPLETE_SOURCE_FRAMES")
    for actual, expected in zip(decoded, examples):
        expected_id = next(x["integer"] for x in expected["fieldProfile"]["fields"]
                           if x.get("field") == 1 and x.get("wire") == 0)
        if actual["itemId"] != expected_id:
            raise ValueError(f"PROBE_SAMPLE_MISMATCH:{filename}")
    return decoded


def build(game, probe_path, out, include_localization=True):
    game = Path(game).resolve(strict=True)
    out = Path(out).resolve()
    probe_path = Path(probe_path).resolve(strict=True)
    if not game.is_dir() or out == game or out in game.parents or game in out.parents or \
            out == probe_path.parent:
        raise ValueError("OUTPUT_OVERLAPS_INPUT")
    if localize1262.sha_file(game / "FullVersion.txt") != steam1262.FULLVERSION_SHA256:
        raise ValueError("VERSION_FILE_SHA_MISMATCH")
    probe = localize1262.read_json(probe_path)
    if probe.get("schema") != PROBE_SCHEMA or probe.get("gameVersion") != "1.26.2" or \
            probe.get("platform") != "Steam" or not isinstance(probe.get("itemlistCandidates"), dict):
        raise ValueError("INVALID_FORMAT_PROBE")
    raw = probe["itemlistCandidates"]
    definitions = []
    categories = {}
    unresolved_categories = []
    for filename, spec in sorted(raw.items()):
        if filename == "ItemCondition.json" and spec.get("size") == 0 and \
                spec.get("sha256") == hashlib.sha256(b"").hexdigest():
            categories[filename] = {"status": "verified_empty", "count": 0}
            continue
        records = pinned_category(game, filename, spec)
        definitions.extend(records)
        categories[filename] = {"status": "native_wire_verified", "count": len(records),
                                "sha256": spec["sha256"], "source": spec["source"]}
    ids = [row["itemId"] for row in definitions]
    if len(set(ids)) != len(ids):
        raise ValueError("CROSS_CATEGORY_NATIVE_ID_COLLISION")
    names = {locale: {"matched": 0, "missing": 0, "missingMemberCategories": []}
             for locale in localize1262.LOCALES}
    archive_evidence = {}
    if include_localization:
        for locale, suffix in localize1262.LOCALES.items():
            archive = game / "ddv_Data" / "StreamingAssets" / "Localization" / f"LocDB_{suffix}.zip"
            archive_evidence[locale] = {"archive": archive.name,
                                        "sha256": localize1262.sha_file(archive), "members": {}}
            by_category = {}
            for record in definitions:
                by_category.setdefault(record["nativeCategory"], []).append(record)
            for category, records in by_category.items():
                try:
                    table, evidence = localize1262.read_locale_category(game, locale, category)
                except KeyError:
                    names[locale]["missingMemberCategories"].append(category)
                    names[locale]["missing"] += len(records)
                    unresolved_categories.append(category)
                    continue
                evidence["entries"] = len(table)
                archive_evidence[locale]["members"][category] = evidence
                for record in records:
                    key = category_localization_key(record, category)
                    display = localize1262.clean_display_name(table[key]) if key in table else ""
                    if display:
                        record["names"][locale] = display
                        names[locale]["matched"] += 1
                    else:
                        names[locale]["missing"] += 1
    else:
        unresolved_categories = [filename[:-5] for filename in raw if filename != "ItemCondition.json"]
    definitions.sort(key=lambda row: row["itemId"])
    out.mkdir(parents=True, exist_ok=True)
    output_path = out / "definitions.jsonl"
    localize1262.write_jsonl(output_path, definitions)
    manifest = {"schema": SCHEMA, "platform": "Steam", "gameVersion": "1.26.2",
                "createdUtc": datetime.now(timezone.utc).isoformat(),
                "definitionCount": len(definitions), "itemsFile": output_path.name,
                "itemsSha256": localize1262.sha_file(output_path), "probeSha256": localize1262.sha_file(probe_path),
                "categories": categories, "localizationEvidence": archive_evidence,
                "unresolvedCategories": sorted(set(unresolved_categories)),
                "verificationScope": "native IDs, source wire format, exact locale keys where present",
                "notClaims": ["all native definitions are collectible items", "field-4 GUID always is icon",
                              "verified game UI category", "verified DLC or world membership"]}
    localize1262.write_json(out / "manifest.json", manifest)
    localize1262.write_json(out / "report.json", {"schema": "wand.src01.extended-report@1",
        "categories": {key: value["count"] for key, value in categories.items()},
        "total": len(definitions), "byLocale": names})
    localize1262.write_json(out / "unresolved.json", {"schema": "wand.src01.extended-unresolved@1",
        "missingLocaleCategories": sorted(set(unresolved_categories)),
        "unverified": ["category semantics", "field-4 image role", "tags and attributes",
                       "world/universe/expansion relationships", "non-Itemlist game data"]})
    return {"definitions": len(definitions), "categories": len(categories),
            "localized": include_localization, "out": str(out)}


def main():
    p = argparse.ArgumentParser(description="Decode SHA-pinned extended Steam 1.26.2 definition files")
    p.add_argument("--game", required=True, type=Path)
    p.add_argument("--probe", required=True, type=Path, help="Existing private format-probe.json")
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--no-localize", action="store_true")
    a = p.parse_args()
    try:
        print(json.dumps(build(a.game, a.probe, a.out, not a.no_localize), ensure_ascii=False))
    except (OSError, ValueError, KeyError, UnicodeError) as exc:
        p.exit(1, f"SRC-01 extended failed: {exc}\n")


if __name__ == "__main__":
    main()