#!/usr/bin/env python3
"""DB-04: read-only extraction of native DDV world/placement evidence.

No guessed world hierarchy, terrain mask, orientation, or save-state coordinates.
Game-derived outputs MUST remain outside the Git repository.
"""
import argparse
import hashlib
import json
import os
import re
import struct
import tempfile
from collections import Counter
from pathlib import Path

SCHEMA = "wand.db04.world@1"
STREAM = Path("ddv_Data/StreamingAssets")
BASE_IDS = {"Furniture": 40000000, "Building": 20000000, "Scene": 1540000000}
RESTRICTION_FIELDS = {
    1: "canMove", 2: "canRotate", 4: "canBeRemoved",
    6: "canBeSelected", 7: "canSwitchGrid",
}
MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_FILES = 30000
VERSION_RE = re.compile(r"(?<![0-9.])([0-9]+\.[0-9]+\.[0-9]+)(?![0-9.])")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def varint(data, pos):
    start, value = pos, 0
    for index in range(10):
        if pos >= len(data):
            raise ValueError("truncated protobuf varint")
        byte = data[pos]
        pos += 1
        if index == 9 and byte > 1:
            raise ValueError("overflow protobuf varint")
        value |= (byte & 127) << (7 * index)
        if byte < 128:
            if encode_varint(value) != data[start:pos]:
                raise ValueError("noncanonical protobuf varint")
            return value, pos
    raise ValueError("unterminated protobuf varint")


def encode_varint(value):
    if value < 0:
        raise ValueError("negative protobuf integer")
    out = bytearray()
    while value >= 128:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)


def wire_fields(data):
    """Decode protobuf wire framing, never infer unknown field semantics."""
    pos, result = 0, []
    while pos < len(data):
        tag, pos = varint(data, pos)
        field, wire = tag >> 3, tag & 7
        if field == 0 or wire not in (0, 1, 2, 5):
            raise ValueError("invalid protobuf tag")
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            size, pos = varint(data, pos)
            if size > len(data) - pos:
                raise ValueError("truncated length-delimited protobuf field")
            value = data[pos:pos + size]
            pos += size
        else:
            size = 8 if wire == 1 else 4
            if size > len(data) - pos:
                raise ValueError("truncated fixed-width protobuf field")
            value = data[pos:pos + size]
            pos += size
        result.append((field, wire, value))
    return result


def one(fields, number, wire, required=False):
    found = [value for field, kind, value in fields if field == number and kind == wire]
    invalid = [1 for field, kind, _ in fields if field == number and kind != wire]
    if len(found) > 1 or invalid or (required and not found):
        raise ValueError(f"missing, duplicate or wrong-wire field {number}")
    return found[0] if found else None


def text_field(fields, number, required=False):
    raw = one(fields, number, 2, required)
    if raw is None:
        return None
    value = raw.decode("utf-8")
    if required and not value:
        raise ValueError("empty required string")
    return value


def parse_itemlist(data, kind):
    if kind not in BASE_IDS:
        raise ValueError("unsupported native category")
    pos, result = 0, {}
    while pos < len(data):
        frame_id, pos = varint(data, pos)
        size, pos = varint(data, pos)
        if size == 0 or size > MAX_SOURCE_BYTES or size > len(data) - pos:
            raise ValueError("invalid indexed native record size")
        fields = wire_fields(data[pos:pos + size])
        pos += size
        native_id = one(fields, 1, 0, True)
        if native_id - BASE_IDS[kind] != frame_id or native_id in result:
            raise ValueError("duplicate or mismatched native ID/frame key")
        raw_name = text_field(fields, 2, True)
        label_key = text_field(fields, 3)
        result[native_id] = (fields, raw_name, label_key)
    if not result:
        raise ValueError(f"empty native category: {kind}")
    return result


def footprint(fields):
    raw = one(fields, 6, 2)
    if raw is None:
        return None
    inner = wire_fields(raw)
    width = one(inner, 1, 0, True)
    height = one(inner, 2, 0, True)
    layers = one(inner, 3, 2, True)
    floor_flag = one(inner, 4, 0)
    if not 0 < width <= 256 or not 0 < height <= 256 or width * height > 16384:
        raise ValueError("invalid native footprint dimensions")
    if len(layers) != width * height * 4:
        raise ValueError("native layer array is not SizeX*SizeY uint32 cells")
    return {
        "sizeX": width, "sizeY": height,
        "layerValues": list(struct.unpack("<" + "I" * (width * height), layers)),
        "acceptedFloorTypesFlag": floor_flag,
        "nativeWireFields": {"sizeX": "6.1", "sizeY": "6.2",
                             "layerValues": "6.3", "acceptedFloorTypesFlag": "6.4"},
        "cellIndexToXYVerified": False,
        "layerMaskSemanticsVerified": False,
    }


def restrictions(fields):
    raw = one(fields, 25, 2)
    if raw is None:
        return {}
    values = {}
    for field, wire, data in wire_fields(raw):
        name = RESTRICTION_FIELDS.get(field)
        if not name or wire != 2:
            continue
        value = one(wire_fields(data), 1, 0)
        if value is not None:
            if value not in (0, 1):
                raise ValueError("non-boolean edit restriction")
            values[name] = {"value": bool(value), "nativeWireField": f"25.{field}.1"}
    return values


def safe_reference(value):
    if not value or "\\" in value or ":" in value or value.startswith("/"):
        return False
    parts = value.split("/")
    return all(part not in ("", ".", "..") for part in parts)


def explicit_references(data, depth=0, prefix=""):
    """Collect literal paths in nested protobuf STRING fields only; no linking by filename."""
    if depth > 7:
        return []
    try:
        fields = wire_fields(data)
    except ValueError:
        return []
    found = []
    for field, wire, value in fields:
        if wire != 2 or len(value) > 1024 * 1024:
            continue
        where = f"{prefix}.{field}" if prefix else str(field)
        try:
            decoded = value.decode("utf-8")
        except UnicodeDecodeError:
            decoded = None
        if decoded and (decoded.startswith("GridData/") or
                        decoded.startswith("SceneLayouts/")) and decoded.endswith(".json"):
            if safe_reference(decoded):
                found.append({"path": decoded, "wireField": where})
        if value:
            found.extend(explicit_references(value, depth + 1, where))
    return found


def source_bytes(root, relative, sources):
    path = root / relative
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"missing or unsafe source: {relative}")
    if path.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError(f"oversized native source: {relative}")
    raw = path.read_bytes()
    sources.append({"path": relative.as_posix(), "bytes": len(raw), "sha256": digest(raw)})
    return raw


def optional_files(root, relative, sources):
    folder = root / relative
    if not folder.is_dir() or folder.is_symlink():
        return []
    paths = sorted(folder.rglob("*.json"), key=lambda p: p.relative_to(root).as_posix())
    if len(paths) > MAX_FILES:
        raise ValueError("too many world source files")
    for path in paths:
        if path.is_symlink() or not path.is_file():
            raise ValueError("unsafe native source symlink")
    return [p.relative_to(root) for p in paths]


def native_objects(root, sources):
    results, scenes, missing = [], [], Counter()
    for kind in ("Scene", "Building", "Furniture"):
        relative = STREAM / "itemlist" / (kind + ".json")
        data = parse_itemlist(source_bytes(root, relative, sources), kind)
        for native_id, (fields, name, label_key) in sorted(data.items()):
            evidence = {"path": relative.as_posix(), "idField": "1",
                        "nameField": "2", "labelKeyField": "3"}
            if kind == "Scene":
                scenes.append({
                    "sceneId": native_id, "nativeName": name,
                    "localizationKey": label_key,
                    "nativeSceneKindCode": one(fields, 6, 0),
                    "parentWorldId": None, "parentAreaId": None,
                    "worldHierarchyVerified": False, "source": evidence,
                })
                continue
            grid = footprint(fields)
            if grid is None:
                missing[kind] += 1
            # Building field 42 is an explicit layout path, not a derived world placement.
            layout = text_field(fields, 42) if kind == "Building" else None
            if layout is not None and (not layout.startswith("SceneLayouts/") or
                                       not layout.endswith(".json") or not safe_reference(layout)):
                raise ValueError("unsafe native building layout reference")
            scene_id = one(fields, 10, 0) if kind == "Building" else None
            results.append({
                "itemId": native_id, "nativeType": kind, "nativeName": name,
                "localizationKey": label_key, "footprint": grid,
                "gridEditRestrictions": restrictions(fields),
                "sceneReferenceNativeField10": scene_id,
                "sceneLayoutPathNativeField42": layout,
                "orientationOrderVerified": False,
                "placeableInWorldVerified": False,
                "source": evidence,
            })
    return results, scenes, missing


def grid_assets(root, sources):
    grids = []
    for relative in optional_files(root, STREAM / "GridData", sources):
        raw = source_bytes(root, relative, sources)
        try:
            fields = wire_fields(raw)
            field_one = one(fields, 1, 0)
            field_two = one(fields, 2, 0)
            opaque = one(fields, 5, 2)
            status = "wire_structure_only"
        except (ValueError, UnicodeError):
            field_one, field_two, opaque = None, None, None
            status = "unrecognized_binary_structure"
        grids.append({
            "gridId": relative.relative_to(STREAM).as_posix(),
            "sourcePartition": relative.relative_to(STREAM / "GridData").parts[0],
            "nativeIntegerField1": field_one, "nativeIntegerField2": field_two,
            "nativePayloadField5Bytes": len(opaque) if opaque is not None else None,
            "nativePayloadField5Sha256": digest(opaque) if opaque is not None else None,
            "cellToWorldCoordinatesVerified": False,
            "terrainFlagsVerified": False, "status": status,
            "source": {"path": relative.as_posix()},
        })
    return grids


def scene_layouts(root, sources):
    layouts = []
    for relative in optional_files(root, STREAM / "SceneLayouts", sources):
        data = source_bytes(root, relative, sources)
        links = explicit_references(data)
        refs = sorted({(entry["path"], entry["wireField"]) for entry in links})
        layouts.append({
            "layoutId": relative.relative_to(STREAM).as_posix(),
            "gridReferences": [{"path": path, "wireField": field} for path, field in refs],
            "coordinatesVerified": False, "fixedObjectsVerified": False,
            "source": {"path": relative.as_posix()},
        })
    return layouts


def validate_overrides(root, sources, objects):
    by_id = {row["itemId"]: row for row in objects}
    conflicts, inspected = [], 0
    for relative in optional_files(root, STREAM / "Furniture", sources):
        raw = source_bytes(root, relative, sources)
        try:
            document = json.loads(raw.decode("utf-8-sig"))
        except (ValueError, UnicodeError):
            conflicts.append({"path": relative.as_posix(), "reason": "non_json_override"})
            continue
        inspected += 1
        if not isinstance(document, dict) or type(document.get("ID")) is not int:
            conflicts.append({"path": relative.as_posix(), "reason": "unknown_override_schema"})
            continue
        native_id = document["ID"]
        record = by_id.get(native_id)
        if record is None:
            conflicts.append({"path": relative.as_posix(), "itemId": native_id,
                              "reason": "native_itemlist_id_not_found"})
        elif record["nativeName"] != document.get("Name"):
            conflicts.append({"path": relative.as_posix(), "itemId": native_id,
                              "reason": "name_mismatch_with_itemlist",
                              "itemlistName": record["nativeName"],
                              "overrideName": document.get("Name")})
        else:
            # The explicitly stored JSON is supplementary evidence, NEVER an implicit override.
            record["additionalSource"] = {"path": relative.as_posix()}
    return conflicts, inspected


def semantic(record):
    return {key: value for key, value in record.items()
            if key not in ("source", "additionalSource")}


def diff_records(old, new, key):
    before = {str(item[key]): semantic(item) for item in old}
    after = {str(item[key]): semantic(item) for item in new}
    old_keys, new_keys = set(before), set(after)
    changed = []
    for ident in sorted(old_keys & new_keys):
        if canonical(before[ident]) != canonical(after[ident]):
            changed.append({"id": ident,
                            "fields": sorted(k for k in set(before[ident]) | set(after[ident])
                                             if before[ident].get(k) != after[ident].get(k))})
    return {"added": sorted(new_keys - old_keys), "removed": sorted(old_keys - new_keys),
            "changed": changed}


def make_diff(previous, outputs):
    if previous is None:
        return {"schema": SCHEMA, "status": "no_previous_snapshot",
                "note": "An initial snapshot cannot establish update deltas."}
    result = {"schema": SCHEMA, "status": "compared", "entities": {}}
    for name, key in (("scenes", "sceneId"), ("objects", "itemId"),
                      ("grids", "gridId"), ("layouts", "layoutId")):
        file = previous / (name + ".json")
        if not file.is_file():
            raise ValueError(f"missing prior snapshot: {file.name}")
        old = json.loads(file.read_text(encoding="utf-8"))
        if not isinstance(old, list):
            raise ValueError(f"invalid prior snapshot: {file.name}")
        result["entities"][name] = diff_records(old, outputs[name], key)
    return result


def write_json(path, value):
    payload = (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
    fd, temp = tempfile.mkstemp(prefix=".db04-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return digest(payload)


def checked_dirs(game, out):
    if not game.is_dir() or game == out or game in out.parents or out in game.parents:
        raise ValueError("input/output directories must exist and never overlap")
    if any((parent / ".git").exists() for parent in (out, *out.parents)):
        raise ValueError("game-derived output cannot be written into a Git worktree")


def extract(game, out, previous=None):
    game, out = game.resolve(), out.resolve()
    previous = previous.resolve() if previous is not None else None
    checked_dirs(game, out)
    if previous is not None and (previous == out or previous == game or game in previous.parents):
        raise ValueError("invalid previous snapshot path")
    sources = []
    version = source_bytes(game, Path("FullVersion.txt"), sources)
    matches = sorted(set(VERSION_RE.findall(version.decode("utf-8-sig"))))
    if len(matches) != 1:
        raise ValueError("FullVersion.txt does not establish a single game version")
    objects, scenes, missing = native_objects(game, sources)
    grids = grid_assets(game, sources)
    layouts = scene_layouts(game, sources)
    conflicts, overrides = validate_overrides(game, sources, objects)
    source_paths = {row["path"] for row in sources}
    missing_refs = sorted({
        ref["path"] for layout in layouts for ref in layout["gridReferences"]
        if (STREAM / ref["path"]).as_posix() not in source_paths
    })
    unresolved = {
        "schema": SCHEMA,
        "unknownSemantics": [
            "Scene parent-world/biome hierarchy is not established by native Scene ID alone",
            "GridData protobuf payload field 5 is opaque: do not infer terrain or blocked cells",
            "Footprint layer values are native uint32 values; their bit meanings and XY indexing are unverified",
            "AcceptedFloorTypesFlag is a raw mask, not a validated placement permission",
            "Rotation order, wall/floor placement, road/fence adjacency and terrain transitions are unverified",
            "No save-specific positions are included (DB-05 owns them)",
        ],
        "missingFootprintsByCategory": dict(sorted(missing.items())),
        "unresolvedExplicitGridReferences": missing_refs,
        "nativeOverrideConflicts": conflicts,
    }
    outputs = {"scenes": scenes, "objects": objects, "grids": grids, "layouts": layouts}
    delta = make_diff(previous, outputs)
    out.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name, rows in outputs.items():
        hashes[name + ".json"] = write_json(out / (name + ".json"), rows)
    hashes["worlds.json"] = write_json(out / "worlds.json", [])
    hashes["unresolved.json"] = write_json(out / "unresolved.json", unresolved)
    hashes["diff.json"] = write_json(out / "diff.json", delta)
    report = {
        "schema": SCHEMA, "gameVersion": matches[0],
        "status": "native_partial_world_extraction",
        "sceneCount": len(scenes), "objectCount": len(objects),
        "withNativeFootprint": sum(row["footprint"] is not None for row in objects),
        "gridFileCount": len(grids), "layoutFileCount": len(layouts),
        "furnitureOverridesInspected": overrides,
        "nativeOverrideConflictCount": len(conflicts), "unresolvedGridReferenceCount": len(missing_refs),
    }
    hashes["report.json"] = write_json(out / "report.json", report)
    manifest = {
        "schema": SCHEMA, "status": "partial_game_native_evidence",
        "platform": "Steam", "gameVersion": matches[0],
        "gameVersionEvidence": "FullVersion.txt", "worldHierarchyComplete": False,
        "placementRulesComplete": False, "sources": sorted(sources, key=lambda x: x["path"]),
        "outputSha256": hashes,
        "note": "All game-derived output belongs in private SRC-05; no assets or save-state copied to Git.",
    }
    write_json(out / "manifest.json", manifest)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description="DB-04 original-game world evidence (read-only)")
    parser.add_argument("--game", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args(argv)
    try:
        print(canonical(extract(args.game, args.out, args.previous)))
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError, struct.error) as error:
        parser.exit(1, f"DB-04 failed: {error}\n")


if __name__ == "__main__":
    main()
