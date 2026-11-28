"""Read-only native ActivityItem recovery evidence, never a Save writer.

Use the archived Steam 1.26.2 dump and local decoded profiles. The report
contains source field definitions, method candidates and aggregate structural
counts only. It never exports Save map keys, values, coordinates or item IDs.
A matching property name/type is NOT a proved native conversion.
"""
import argparse
import base64
from collections import Counter
import json
from pathlib import Path
import re
import zlib

from discover_native_shapes import parse_native_messages, output_is_outside_git
from verify_domain_native_fields import native_field_chain, sha256_stream

ROOT = Path(__file__).resolve().parents[2]
DUMP_SHA = "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08"
SOURCE_SCHEMA = "wand.item-master.reviewed-structure-groups@1"
REPORT_SCHEMA = "wand.db05.activity-recovery-state-audit@1"
MAX_PROFILE_BYTES = 512 * 1024 * 1024
MAX_ROWS = 1_000_000
TYPE_HEADER = re.compile(r"^(?:(?:public|internal|private|protected|abstract|sealed|static|partial|readonly)\s+)*(?:class|struct|interface)\s+([A-Za-z_][A-Za-z0-9_.]*)\b")
RVA = re.compile(r"// RVA: (0x[0-9A-Fa-f]+)")
METHOD = re.compile(r"^\s*(?:(?:public|private|protected|internal|static|virtual|override|sealed|abstract|extern|unsafe|new|async)\s+)+[^{};]*\([^{};]*\)\s*(?:\{\s*\}|;)?\s*$")
FAMILIES = ("GridState", "ItemState")


def activity_membership(root=ROOT):
    release = json.loads((root / "static/ddv/item-master-releases.json").read_text(encoding="utf-8"))
    entry = next(r for r in release["releases"] if r["gameVersion"] == "1.26.2")
    path = root / "data/ddv/item-master/reviewed-structure-steam-1.26.2.json"
    digest = sha256_stream(path)
    if digest != entry["complete"]["reviewedStructure"]["reviewed-structure"]:
        raise ValueError("SOURCE_HASH")
    source = json.loads(path.read_text(encoding="utf-8"))
    if source["schema"] != SOURCE_SCHEMA or source["gameVersion"] != "1.26.2":
        raise ValueError("SOURCE_VERSION")
    field = source["fields"]["ActivityItem.GridAreaData"]
    if field["category"] != "ActivityItem":
        raise ValueError("SOURCE_FAMILY")
    packed = base64.b64decode(field["packed"], validate=True)
    dec = zlib.decompressobj()
    data = dec.decompress(packed, 32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024 or not dec.eof or dec.unused_data or dec.unconsumed_tail:
        raise ValueError("SOURCE_BOUNDS")
    rows = json.loads(data)
    if not isinstance(rows, list) or len(rows) != field["count"]:
        raise ValueError("SOURCE_COUNT")
    ids, n = set(), 0
    for row in rows:
        delta = row[0]
        if type(delta) is not int or delta <= 0 or n + delta > 0xffffffff:
            raise ValueError("SOURCE_ID")
        n += delta
        ids.add(n)
    return ids, digest


def source_fields(native):
    # Assert the real Profile-to-State chain, not a name-only class match.
    routes = {
        "GridState": "/World/GridCollection/Grids/{id}/Objects/{id}/State",
        "ItemState": "/Player/ContainerInventories/{id}/Inventory[]/State",
    }
    fields = {}
    for family, path in routes.items():
        _, _, _, actual = native_field_chain(native, path)
        if actual != family or not native.get(family):
            raise ValueError("SOURCE_STATE_ROUTE")
        rows = native[family]
        if len({r[0] for r in rows}) != len(rows) or len({r[1] for r in rows}) != len(rows):
            raise ValueError("SOURCE_DUPLICATE_STATE_FIELD")
        fields[family] = [{"name": name, "tag": tag, "type": typ} for name, tag, typ in rows]
    return fields


def amount_wrapper(native):
    """The direct, typed bridge found in the original 1.26.2 metadata."""
    path = "/World/GridCollection/Grids/{id}/Objects/{id}/State/ItemAmountState"
    cls, name, tag, typ = native_field_chain(native, path)
    if (cls, name, tag, typ) != ("GridState", "ItemAmountState", 2, "AmountWithState"):
        raise ValueError("SOURCE_AMOUNT_WRAPPER")
    expected = {"Amount": (1, "Nullable<int>"), "State": (2, "ItemState"),
                "AssignedPlayer": (3, "Nullable<int>")}
    result = []
    for field, (number, property_type) in expected.items():
        if native_field_chain(native, path + "/" + field) != ("AmountWithState", field, number, property_type):
            raise ValueError("SOURCE_AMOUNT_WRAPPER_FIELD")
        result.append({"name": field, "tag": number, "type": property_type})
    return {"gridField": {"name": name, "tag": tag, "type": typ},
            "fields": result, "nativeCallFlowVerified": False}


def candidate_methods(dump):
    """Locate source declarations for subsequent binary call-flow analysis."""
    current, namespace, rva = "", "", None
    candidates = []
    with Path(dump).open(encoding="utf-8-sig") as stream:
        for line in stream:
            if line.startswith("// Namespace:"):
                namespace = line.split(":", 1)[1].strip()
            cls = TYPE_HEADER.match(line)
            if cls:
                current, rva = cls.group(1), None
            if line.startswith("}"):
                current, rva = "", None
            address = RVA.search(line)
            if address:
                rva = address.group(1)
                continue
            if not current or not rva or not METHOD.match(line):
                continue
            sig = line.strip()
            # Include the concrete pickup/drop transaction classes and the
            # methods that explicitly mention both distinct State types.
            has_pair = all(re.search(r"\b" + family + r"\b", sig) for family in FAMILIES)
            native_route = re.search(r"(PickUpContainerItem|PutDownContainerItem|DropContainerItem)", current)
            if has_pair or native_route and re.search(r"\b(ValidateThis|ApplyThis|Execute|Create)\s*\(", sig):
                candidates.append({"namespace": namespace, "class": current, "signature": sig, "rva": rva})
                if len(candidates) > 512:
                    raise ValueError("METHOD_CANDIDATE_LIMIT")
            rva = None
    return candidates


def field_map(fields):
    return {f["name"]: f["type"] for f in fields}


def state_shape(state, native_fields):
    if state is None:
        return "null"
    if not isinstance(state, dict):
        return "invalid_kind"
    if not state:
        return "empty"
    # Only public native property names may leave the analyzer. Unknown
    # private JSON keys are represented by one fixed marker, not copied.
    return "+".join(sorted({k if k in native_fields else "<unknown>" for k in state}))


def observed_profiles(profiles, ids, fields):
    """Exhaustive bounded scan, grouped by public structural signatures."""
    counts = {k: Counter() for k in ("fullGrid", "diffModified", "inventory")}
    cross = {}
    total = 0
    def rows(value, group, family):
        nonlocal total
        if not isinstance(value, (dict, list)):
            raise ValueError("PROFILE_ROW_SHAPE")
        for row in value.values() if isinstance(value, dict) else value:
            total += 1
            if total > MAX_ROWS:
                raise ValueError("PROFILE_ROW_LIMIT")
            if not isinstance(row, dict):
                raise ValueError("PROFILE_ROW")
            item = row.get("ItemID")
            if type(item) is not int or item not in ids:
                continue
            shape = state_shape(row.get("State"), field_map(fields[family]))
            counts[group][shape] += 1
            cross.setdefault(item, {"grid": set(), "inventory": set()})["inventory" if group == "inventory" else "grid"].add(shape)
    for root in profiles:
        if root.get("GameInfo", {}).get("Version") != 643:
            raise ValueError("PROFILE_SCHEMA")
        collection = root["World"]["GridCollection"]
        for field, group, member in (("Grids", "fullGrid", "Objects"), ("DiffGrids", "diffModified", "ModifiedObjects")):
            grids = collection.get(field, {})
            if not isinstance(grids, dict):
                raise ValueError("PROFILE_GRID_MAP")
            for grid in grids.values():
                rows(grid.get(member, {}), group, "GridState")
        containers = root["Player"]["ContainerInventories"]
        if not isinstance(containers, dict):
            raise ValueError("PROFILE_CONTAINER_MAP")
        for inv in containers.values():
            rows(inv["Inventory"], "inventory", "ItemState")
    pairs = Counter()
    for groups in cross.values():
        for grid in groups["grid"]:
            for inv in groups["inventory"]:
                pairs[(grid, inv)] += 1
    return {"counts": {k: dict(sorted(v.items())) for k, v in counts.items()},
            "sameItemDefinitionShapePairs": [{"gridShape": a, "inventoryShape": b, "distinctDefinitions": n}
                                            for (a, b), n in sorted(pairs.items())],
            "sameItemDefinitionDoesNotProveInstanceConversion": True}


def audit(dump, profile_paths=(), root=ROOT):
    if sha256_stream(dump) != DUMP_SHA:
        raise ValueError("DUMP_HASH")
    native = parse_native_messages(dump)
    fields = source_fields(native)
    ids, digest = activity_membership(root)
    grid, item = (field_map(fields[f]) for f in FAMILIES)
    profiles = []
    for path in profile_paths:
        path = Path(path)
        if path.stat().st_size > MAX_PROFILE_BYTES:
            raise ValueError("PROFILE_SIZE")
        profiles.append(json.loads(path.read_text(encoding="utf-8-sig")))
    observations = observed_profiles(profiles, ids, fields)
    return {"schema": REPORT_SCHEMA, "sourceGameVersion": "1.26.2",
            "sourceDumpSha256": DUMP_SHA, "activitySourceSha256": digest,
            "activityDefinitionCount": len(ids), "nativeFields": fields,
            "amountWithState": amount_wrapper(native),
            "directItemStateFieldsInGridState": [k for k, v in grid.items() if v == "ItemState"],
            "sameNameAndTypeCandidates": sorted(k for k in grid.keys() & item.keys() if grid[k] == item[k]),
            "nativeMethodCandidates": candidate_methods(dump),
            "profilesScanned": len(profiles), "observations": observations,
            "nativeCallFlowVerified": False, "writerAuthorized": False,
            "gameRuntimeVerified": False, "privateValuesExported": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump", required=True, type=Path)
    parser.add_argument("--decoded-json", action="append", type=Path, default=[])
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        out = args.out.resolve()
        if not output_is_outside_git(out) or out.exists():
            raise ValueError("PRIVATE_OUTPUT_REQUIRED")
        result = audit(args.dump, args.decoded_json)
        with out.open("x", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=True, sort_keys=True, indent=2)
            f.write("\n")
        print(json.dumps({"schema": REPORT_SCHEMA, "activityDefinitionCount": result["activityDefinitionCount"],
                          "profilesScanned": result["profilesScanned"], "writerAuthorized": False}))
    except (OSError, ValueError, KeyError, TypeError, StopIteration, IndexError, zlib.error):
        print("DB05_ACTIVITY_STATE_AUDIT_FAILED")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
