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
        "categories": by_filename, "localizationEvidence": {},
        "unresolvedCategories": sorted(unresolved),
        "verificationScope": "full original file bytes present in probe; hash-checked; source wire IDs",
        "notClaims": ["every definition is a collectible item", "verified 8-language names",
                      "field-4 GUID is an icon", "full 35-category catalog", "current DLC membership"],
    }
    localize1262.write_json(out / "manifest.json", manifest)
    localize1262.write_json(out / "report.json", {
        "schema": "wand.src01.complete-probe-report@1", "definitions": len(rows),
        "fullFileCount": len(by_filename), "unresolvedFileCount": len(unresolved),
        "byCategory": counts, "noLocaleNameClaims": True,
    })
    localize1262.write_json(out / "unresolved.json", {
        "schema": "wand.src01.complete-probe-unresolved@1",
        "notFullSourceInProbe": sorted(unresolved),
        "unverifiedFields": ["display names", "current user-facing category", "icon role",
                             "attributes", "worlds", "universes", "expansions", "adventure packs"],
    })
    return {"definitions": len(rows), "verifiedFullFiles": len(by_filename),
            "unresolvedSourceFiles": len(unresolved), "byCategory": counts}


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