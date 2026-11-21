"""Recover *complete* SHA-verified game files embedded in the private SRC-01 probe.

`format-probe.json` includes the original first N bytes of each itemlist file.  Some
files are smaller than N and therefore already contain their full original bytes.
The remaining files are deliberately ignored, not extrapolated or approximated.
"""
import argparse
import base64
import binascii
import hashlib
import json
import zlib
from collections import Counter
from pathlib import Path

import extend1262
import localize1262

SCHEMA = "wand.src01.extended@1"
PROBE_SCHEMA = "wand.src01.format-probe@1"


def records_for_complete_source(filename, info):
    """Return verified definitions only when the sample contains the *entire* file."""
    expected_path = f"ddv_Data/StreamingAssets/itemlist/{filename}"
    if not filename.endswith(".json") or Path(filename).name != filename or info.get("source") != expected_path:
        raise ValueError("INVALID_PROBE_FILE_PATH")
    try:
        raw = base64.b64decode(info.get("headBase64", ""), validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f"INVALID_PROBE_BASE64:{filename}") from exc
    expected_size = info.get("size")
    if type(expected_size) is not int or expected_size < 0 or expected_size > extend1262.MAX_SOURCE_BYTES:
        raise ValueError(f"INVALID_PROBE_SOURCE_SIZE:{filename}")
    if len(raw) > expected_size:
        raise ValueError(f"PROBE_BYTES_EXCEED_SOURCE:{filename}")
    if len(raw) < expected_size:
        if info.get("status") != "binary_structure_probe":
            raise ValueError(f"INCOMPLETE_PROBE_STATUS_MISMATCH:{filename}")
        return None
    if hashlib.sha256(raw).hexdigest() != info.get("sha256"):
        raise ValueError(f"COMPLETE_PROBE_DIGEST_MISMATCH:{filename}")
    if expected_size == 0:
        if filename != "ItemCondition.json" or info.get("status") != "empty":
            raise ValueError(f"UNEXPECTED_EMPTY_CATEGORY:{filename}")
        return []
    if info.get("status") != "binary_structure_probe":
        raise ValueError(f"INVALID_COMPLETE_PROBE_STATUS:{filename}")
    examples = info.get("frameProbe", {}).get("frames", [])
    if info.get("frameProbe", {}).get("status") != "candidate_frame_model" or len(examples) != 3:
        raise ValueError(f"INVALID_PROBE_FRAME_SAMPLES:{filename}")
    baselines = []
    for example in examples:
        fields = example.get("fieldProfile", {}).get("fields", [])
        ids = [f["integer"] for f in fields if f.get("field") == 1 and f.get("wire") == 0]
        if len(ids) != 1 or type(example.get("frameKey")) is not int or type(ids[0]) is not int:
            raise ValueError(f"INVALID_PROBE_ID_EVIDENCE:{filename}")
        baselines.append(ids[0] - example["frameKey"])
    if len(set(baselines)) != 1:
        raise ValueError(f"INVALID_PROBE_ID_BASE:{filename}")
    source_name = filename.removesuffix(".json")
    decoded = []
    for key, frame in extend1262.frames(raw):
        decoded.append((key, len(frame), extend1262.parse_definition(
            key, frame, baselines[0], source_name, expected_path, info["sha256"])))
    if len(decoded) < 3:
        raise ValueError(f"INSUFFICIENT_COMPLETE_SOURCE_RECORDS:{filename}")
    for (key, size, record), example in zip(decoded, examples):
        expected_id = next(f["integer"] for f in example["fieldProfile"]["fields"]
                           if f.get("field") == 1 and f.get("wire") == 0)
        if key != example["frameKey"] or size != example.get("frameBytes") or record["itemId"] != expected_id:
            raise ValueError(f"COMPLETE_PROBE_SAMPLE_MISMATCH:{filename}")
    return [row for _, _, row in decoded]


def build(probe_path, out):
    probe_path = Path(probe_path).resolve(strict=True)
    out = Path(out).resolve()
    if out == probe_path.parent or out == probe_path or out in probe_path.parents:
        raise ValueError("PROBE_OUTPUT_OVERLAPS_INPUT")
    probe = json.loads(probe_path.read_text(encoding="utf-8-sig"))
    if probe.get("schema") != PROBE_SCHEMA or probe.get("gameVersion") != "1.26.2" or \
            probe.get("platform") != "Steam" or not isinstance(probe.get("itemlistCandidates"), dict):
        raise ValueError("INVALID_SOURCE_PROBE_CONTRACT")
    by_filename, unresolved, rows, seen_ids = {}, [], [], set()
    for filename, info in sorted(probe["itemlistCandidates"].items()):
        decoded = records_for_complete_source(filename, info)
        if decoded is None:
            unresolved.append(filename.removesuffix(".json"))
            continue
        for row in decoded:
            if row["itemId"] in seen_ids:
                raise ValueError(f"DUPLICATE_COMPLETE_PROBE_ITEM_ID:{row['itemId']}")
            seen_ids.add(row["itemId"])
            rows.append(row)
        by_filename[filename] = {
            "status": "verified_empty" if not decoded else "native_wire_verified",
            "count": len(decoded), "source": info["source"], "sha256": info["sha256"],
            "sourceBytes": info["size"], "evidence": "full_probed_bytes_and_sha256",
        }
    if not rows or not unresolved:
        raise ValueError("UNEXPECTED_PROBE_COVERAGE")
    rows.sort(key=lambda row: row["itemId"])
    by_category = {}
    for row in rows:
        by_category.setdefault(row["nativeCategory"], []).append(row)
    # Complete LocDB members embedded in this same probe can be decoded exactly,
    # without acquiring the archive or pretending a truncated prefix is complete.
    evidence = {}
    localized_counts = {locale: 0 for locale in localize1262.LOCALES}
    for locale, suffix in localize1262.LOCALES.items():
        archive = probe.get("localization", {}).get(locale, {})
        archive_file = f"LocDB_{suffix}.zip"
        archive_source = f"ddv_Data/StreamingAssets/Localization/{archive_file}"
        archive_hash = archive.get("sha256")
        if archive.get("source") != archive_source or not isinstance(archive_hash, str) or len(archive_hash) != 64:
            continue
        evidence[locale] = {"archive": archive_file, "source": archive_source,
                            "sha256": archive_hash, "members": {}}
        for category, definitions in by_category.items():
            member = archive.get("members", {}).get(category)
            if not isinstance(member, dict):
                continue
            try:
                loc_raw = base64.b64decode(member.get("headBase64", ""), validate=True)
            except (binascii.Error, ValueError) as error:
                raise ValueError(f"INVALID_LOCALIZATION_PROBE_BASE64:{locale}:{category}") from error
            if len(loc_raw) > member.get("bytes", -1):
                raise ValueError(f"LOCALIZATION_PROBE_OVERRUN:{locale}:{category}")
            if len(loc_raw) != member["bytes"]:
                continue
            crc = f"{zlib.crc32(loc_raw) & 0xffffffff:08x}"
            if crc != member.get("crc32"):
                raise ValueError(f"COMPLETE_LOCALIZATION_CRC_MISMATCH:{locale}:{category}")
            table = localize1262.decode_locbin(loc_raw)
            evidence[locale]["members"][category] = {
                "entry": f"{category}.locbin", "entrySha256": hashlib.sha256(loc_raw).hexdigest(),
                "bytes": len(loc_raw), "crc32": crc, "entries": len(table),
                "verification": "original_zip_member_complete_probe_bytes_crc32_verified",
            }
            for row in definitions:
                lookup = extend1262.category_localization_key(row, category)
                value = localize1262.clean_display_name(table[lookup]) if lookup in table else ""
                if value:
                    row["names"][locale] = value
                    localized_counts[locale] += 1
    out.mkdir(parents=True, exist_ok=True)
    target = out / "definitions.jsonl"
    localize1262.write_jsonl(target, rows)
    counts = dict(sorted(Counter(row["nativeCategory"] for row in rows).items()))
    manifest = {
        "schema": SCHEMA, "platform": "Steam", "gameVersion": "1.26.2",
        "status": "complete_probe_embedded_files_only",
        "definitionCount": len(rows), "itemsFile": "definitions.jsonl",
        "itemsSha256": localize1262.sha_file(target),
        "probeSha256": localize1262.sha_file(probe_path),
        "categories": by_filename, "localizationEvidence": evidence,
        "unresolvedCategories": sorted(unresolved),
        "localizedByLocale": localized_counts,
        "localizationKeyRule": "definition_field3_Category.Key -> Category.locbin key Key",
        "verificationScope": "full original file bytes present in probe; hash-checked; source wire IDs",
        "notClaims": ["every definition is a collectible item", "all 132 names localized",
                      "field-4 GUID is an icon", "full 35-category catalog", "current DLC membership"],
    }
    localize1262.write_json(out / "manifest.json", manifest)
    localize1262.write_json(out / "report.json", {
        "schema": "wand.src01.complete-probe-report@1", "definitions": len(rows),
        "fullFileCount": len(by_filename), "unresolvedFileCount": len(unresolved),
        "byCategory": counts, "localizedByLocale": localized_counts,
        "fullyLocalizedDefinitions": sum(all(row["names"][locale] for locale in localize1262.LOCALES)
                                          for row in rows),
    })
    localize1262.write_json(out / "unresolved.json", {
        "schema": "wand.src01.complete-probe-unresolved@1",
        "notFullSourceInProbe": sorted(unresolved),
        "missingNamesByLocale": {locale: len(rows) - count for locale, count in localized_counts.items()},
        "unverifiedFields": ["remaining display names", "current user-facing category", "icon role",
                             "attributes", "worlds", "universes", "expansions", "adventure packs"],
    })
    return {"definitions": len(rows), "verifiedFullFiles": len(by_filename),
            "unresolvedSourceFiles": len(unresolved), "byCategory": counts,
            "localizedByLocale": localized_counts}


def main():
    parser = argparse.ArgumentParser(description="Recover SHA-verified complete binary itemlists already in private format probe")
    parser.add_argument("--probe", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.probe, args.out), sort_keys=True))
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(1, f"SRC-01 complete-probe failed: {error}\n")


if __name__ == "__main__":
    main()