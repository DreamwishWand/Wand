"""Owner-private DutyAch milestone projection, using DB-03's canonical native reader.

Original game source and resulting index MUST remain outside the public repo.
The exporter does not infer game-state completion, milestone claimability,
earned rewards, ownership, mission state, or save Writer permission.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-03-guide"))
from native_guide import canonical_wire, native_frames, sha  # noqa: E402

SCHEMA = "wand.db05.native-duty-milestones@1"
GUIDE_SCHEMA = "wand.db03.native-guide@1"
SOURCE_FILE = "ddv_Data/StreamingAssets/itemlist/DutyAch.json"
MAX_SOURCE = 16 * 1024 * 1024
MAX_INDEX = 32 * 1024 * 1024
MAX_ROWS = 100_000
INT_MAX = (1 << 31) - 1


def _positive_id(value):
    return (isinstance(value, str) and value.isascii() and value.isdecimal()
            and value == str(int(value)) and 0 < int(value) <= INT_MAX)


def _sha(value):
    return (isinstance(value, str) and len(value) == 64
            and all(ch in "0123456789abcdef" for ch in value))


def _guide_rows(index):
    if (not isinstance(index, dict) or index.get("schema") != GUIDE_SCHEMA
            or index.get("family") != "duties"
            or not isinstance(index.get("target"), dict)
            or not isinstance(index["target"].get("platform"), str)
            or not index["target"]["platform"].strip()
            or not isinstance(index["target"].get("gameVersion"), str)
            or not index["target"]["gameVersion"].strip()
            or not isinstance(index.get("records"), list)
            or not 0 < len(index["records"]) <= MAX_ROWS):
        raise ValueError("DB05_DUTY_GUIDE_SCHEMA_REQUIRED")
    by_id = {}
    source_sha = None
    used_frames = set()
    for row in index["records"]:
        if not isinstance(row, dict) or not _positive_id(row.get("id")):
            raise ValueError("DB05_DUTY_GUIDE_INVALID_ID")
        origin = row.get("source")
        if (row["id"] in by_id
                or not isinstance(origin, dict)
                or origin.get("file") != SOURCE_FILE
                or not _sha(origin.get("sha256"))
                or not _sha(row.get("nativeWireSha256"))
                or not isinstance(origin.get("frameIndex"), int)
                or isinstance(origin.get("frameIndex"), bool)
                or origin["frameIndex"] < 0
                or origin["frameIndex"] >= MAX_ROWS
                or origin["frameIndex"] in used_frames
                or (source_sha is not None and source_sha != origin["sha256"])):
            raise ValueError("DB05_DUTY_GUIDE_INVALID_PROVENANCE")
        source_sha = origin["sha256"]
        used_frames.add(origin["frameIndex"])
        by_id[row["id"]] = row
    return by_id, source_sha


def _milestone(payload):
    """Only the exact AchievementMilestone protobuf 1/2/3 varint triple."""
    from native_guide import wire_fields
    try:
        sub = wire_fields(payload)
    except (TypeError, ValueError, IndexError):
        return None
    if (len(sub) != 3 or {(n, w) for n, w, _ in sub}
            != {(1, 0), (2, 0), (3, 0)}):
        return None
    members = {n: value for n, _, value in sub}
    if (not all(isinstance(v, int) and 0 <= v <= INT_MAX
                for v in members.values())
            or members[1] <= 0):
        return None
    return {"milestone": members[1], "rewardItem": members[2],
            "rewardAmount": members[3]}


def project(native, guide):
    """Validate complete private original source against complete private DB-03 index."""
    if not isinstance(native, bytes) or not native or len(native) > MAX_SOURCE:
        raise ValueError("DB05_DUTY_SOURCE_SIZE_INVALID")
    by_id, expected_sha = _guide_rows(guide)
    actual_sha = sha(native)
    if expected_sha != actual_sha:
        raise ValueError("DB05_DUTY_SOURCE_HASH_MISMATCH")
    frames = list(native_frames(native))
    if len(frames) != len(by_id):
        raise ValueError("DB05_DUTY_FRAME_COUNT_MISMATCH")
    records = []
    typed_count = 0
    ambiguous_count = 0
    no_field_count = 0
    milestone_count = 0
    seen_ids = set()
    for frame_index, offset, native_id, fields in frames:
        id_ = str(native_id)
        source = by_id.get(id_)
        if (source is None or id_ in seen_ids
                or source["source"]["frameIndex"] != frame_index
                or source["nativeWireSha256"] != sha(canonical_wire(fields))):
            raise ValueError("DB05_DUTY_FRAME_PROVENANCE_MISMATCH")
        seen_ids.add(id_)
        opaque = False
        milestones = []
        for number, wire, value in fields:
            if number != 13:
                continue
            if wire != 2:
                opaque = True
                continue
            member = _milestone(value)
            if member is None:
                opaque = True
            else:
                milestones.append(member)
        # Never silently certify mixed, unsorted, or duplicated milestones.
        amounts = [row["milestone"] for row in milestones]
        if any(left >= right for left, right in zip(amounts, amounts[1:])):
            opaque = True
        if opaque:
            state = "opaque_or_mixed_field13"
            milestones = []
            ambiguous_count += 1
        elif milestones:
            state = "typed_milestone_fields"
            typed_count += 1
            milestone_count += len(milestones)
        else:
            state = "no_field13_observed"
            no_field_count += 1
        records.append({
            "id": id_, "frameIndex": frame_index,
            "nativeWireSha256": source["nativeWireSha256"],
            "evidenceState": state,
            "milestones": milestones
        })
    return {
        "schema": SCHEMA,
        "sourceSchema": GUIDE_SCHEMA,
        "target": guide["target"],
        "source": {"file": SOURCE_FILE, "sha256": actual_sha},
        "evidence": {
            "nativeMessage": "Definitions.Items.AchievementItemData",
            "milestonesFieldNumber": 13,
            "nestedMessage": "Definitions.Items.AchievementMilestone",
            "nestedFieldNumbers": {
                "milestone": 1, "rewardItem": 2, "rewardAmount": 3
            },
            "typedFieldProofOnly": True,
            "allDefinitionsInterpreted": False,
            "rewardEligibilityVerified": False,
            "rewardOwnershipVerified": False,
            "saveProgressVerified": False,
            "writerAuthorized": False,
            "exportAuthorized": False
        },
        "summary": {
            "nativeRows": len(records),
            "typedMilestoneDefinitions": typed_count,
            "typedMilestones": milestone_count,
            "opaqueOrMixedDefinitions": ambiguous_count,
            "noField13Definitions": no_field_count,
        },
        "records": records,
    }


def _json_file(path, limit):
    if path.stat().st_size > limit:
        raise ValueError("DB05_DUTY_INPUT_TOO_LARGE")
    return json.loads(path.read_text(encoding="utf-8"))


def write_private_output(output, index):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Do not write private source-derived data into a public Git checkout.
    if any(p.name == ".git" for parent in [output.parent, *output.parents]
           for p in [parent] if p.exists()):
        raise ValueError("DB05_DUTY_PRIVATE_OUTPUT_ONLY")
    for parent in [output.parent, *output.parent.parents]:
        if (parent / ".git").exists():
            raise ValueError("DB05_DUTY_PRIVATE_OUTPUT_ONLY")
    fd, temp = tempfile.mkstemp(prefix=".db05-duty-", suffix=".tmp", dir=output.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(index, stream, sort_keys=True, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temp, output)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    parser = argparse.ArgumentParser(description="Private source-validated DutyAch milestone projection")
    parser.add_argument("--native", type=Path, required=True)
    parser.add_argument("--duties", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if (args.output.resolve() in (args.native.resolve(), args.duties.resolve())
            or args.native.stat().st_size > MAX_SOURCE):
        raise SystemExit("DB05_DUTY_INVALID_OUTPUT_OR_SOURCE")
    result = project(args.native.read_bytes(), _json_file(args.duties, MAX_INDEX))
    write_private_output(args.output, result)
    # Only anonymous counts are reported; native IDs/rewards stay private.
    print(json.dumps({"schema": SCHEMA, **result["summary"]}, sort_keys=True))


if __name__ == "__main__":
    main()
