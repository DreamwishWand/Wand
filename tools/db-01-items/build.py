"""DB-01: evidence-preserving, incremental private item catalog compiler.

Inputs are verified SRC-01 outputs, not raw game assets. All outputs stay local/private.
"""
import argparse
import hashlib
import json
import os
import re
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = "wand.db01.items@1"
LOCALES = ("en", "fr", "it", "de", "es-ES", "ja", "zh-CN", "pt-BR")
REFERENCE_LOCALES = ("EN", "FR", "IT", "DE", "ES-ES", "JA", "ZH-CN", "PT-BR")
NATIVE_CATEGORIES = frozenset(("ActivityItem", "Furniture", "Clothing", "Trimming"))
MAX_ID = 2**53 - 1
HASH = re.compile(r"[0-9a-f]{64}\Z")
GUID = re.compile(r"guid:[0-9a-f]{32}\Z")
NONDISPLAY_MARKER = re.compile(r"^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}", re.I)
LOCALE_ARCHIVES = {"en": "en-US", "fr": "fr", "it": "it", "de": "de",
                   "es-ES": "es", "ja": "ja", "zh-CN": "zh-CN", "pt-BR": "pt-BR"}


def valid_hash(value):
    return isinstance(value, str) and HASH.fullmatch(value) is not None


def digest(path):
    sha = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def read_json(path):
    with Path(path).open("r", encoding="utf-8-sig") as stream:
        return json.load(stream)


def json_lines(path):
    seen = set()
    with Path(path).open("r", encoding="utf-8") as stream:
        for number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            item_id = row.get("itemId")
            if type(item_id) is not int or not 0 < item_id <= MAX_ID or item_id in seen:
                raise ValueError(f"INVALID_OR_DUPLICATE_ITEM_ID:{path}:{number}")
            seen.add(item_id)
            yield row


def atomic(path, writer):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".db01-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            writer(stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def save_json(path, payload):
    def emit(stream):
        json.dump(payload, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")
    atomic(path, emit)


def save_jsonl(path, records):
    def emit(stream):
        for row in records:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
    atomic(path, emit)


def checked_index(dictionary, value, label):
    if type(value) is not int or value < 0 or value >= len(dictionary):
        raise ValueError(f"INVALID_REFERENCE_INDEX:{label}:{value}")
    return dictionary[value]


def reference_collection(folder):
    """Read the existing Collection contract with SHA and shard continuity checks."""
    index_path = folder / "index.json"
    index = read_json(index_path)
    if index.get("s") != "wand.collection.runtime@1" or index.get("l") != list(REFERENCE_LOCALES):
        raise ValueError("UNSUPPORTED_REFERENCE_CONTRACT")
    target = index.get("t", {})
    if any(not isinstance(target.get(key), str) or not target[key] for key in ("platform", "gameVersion", "buildID")):
        raise ValueError("MISSING_REFERENCE_PROVENANCE")
    for key in "fcmwue":
        if not isinstance(index.get(key), list):
            raise ValueError(f"MISSING_REFERENCE_DICTIONARY:{key}")
    output, offset, seen = {}, 0, set()
    shards = index.get("shards", [])
    if not shards:
        raise ValueError("MISSING_REFERENCE_SHARDS")
    for shard in shards:
        name = shard.get("file")
        if not isinstance(name, str) or not name.startswith("records-") or not name.endswith(".json") or \
                len(name) != 15 or not name[8:10].isdigit():
            raise ValueError("INVALID_REFERENCE_SHARD_NAME")
        filename = folder / name
        data = filename.read_bytes()
        if len(data) != shard.get("bytes") or hashlib.sha256(data).hexdigest() != shard.get("sha256"):
            raise ValueError(f"REFERENCE_SHARD_HASH_MISMATCH:{name}")
        payload = json.loads(data)
        rows = payload.get("r")
        if payload.get("s") != "wand.collection.records@1" or not isinstance(rows, list) or \
                payload.get("offset") != offset or shard.get("offset") != offset or \
                payload.get("count") != len(rows) or shard.get("count") != len(rows):
            raise ValueError(f"REFERENCE_SHARD_SEQUENCE_MISMATCH:{name}")
        for row in rows:
            if not isinstance(row, list) or len(row) != 8:
                raise ValueError("INVALID_REFERENCE_RECORD")
            item_id, family, state, semantic, worlds, universes, expansions, names = row
            if type(item_id) is not int or not 0 < item_id <= MAX_ID or item_id in seen:
                raise ValueError("REFERENCE_ITEM_ID_COLLISION")
            if not isinstance(names, list) or len(names) != 8 or not all(isinstance(v, str) for v in names):
                raise ValueError("INVALID_REFERENCE_LOCALIZATION")
            if any(not isinstance(v, list) for v in (worlds, universes, expansions)):
                raise ValueError("INVALID_REFERENCE_RELATIONSHIP")
            seen.add(item_id)
            output[item_id] = {
                "itemId": item_id, "names": dict(zip(LOCALES, (v.strip() or None for v in names))),
                "category": checked_index(index["f"], family, "family"),
                "stateClass": checked_index(index["c"], state, "stateClass"),
                "stateSemantic": checked_index(index["m"], semantic, "stateSemantic"),
                "worlds": [checked_index(index["w"], v, "world") for v in worlds],
                "universes": [checked_index(index["u"], v, "universe") for v in universes],
                "expansions": [checked_index(index["e"], v, "expansion") for v in expansions],
                "source": {"platform": target["platform"], "gameVersion": target["gameVersion"],
                           "buildID": target["buildID"], "file": f"{folder.name}/{name}",
                           "verification": "existing_collection_reference"},
            }
        offset += len(rows)
    if offset != index.get("n"):
        raise ValueError("REFERENCE_TOTAL_COUNT_MISMATCH")
    return output, {"indexSha256": digest(index_path), "count": offset, "target": target}


def load_native(source):
    manifest = read_json(source / "manifest.json")
    path = source / "items.jsonl"
    if manifest.get("schema") != "wand.src01.steam-native@1" or \
            manifest.get("platform") != "Steam" or not manifest.get("gameVersion") or \
            manifest.get("status") != "partial_native_extraction" or digest(path) != manifest.get("itemsSha256"):
        raise ValueError("INVALID_OR_MODIFIED_NATIVE_INPUT")
    native = list(json_lines(path))
    if len(native) != manifest.get("itemCount"):
        raise ValueError("NATIVE_ITEM_COUNT_MISMATCH")
    source_files = {row["path"]: row["sha256"] for row in manifest.get("sourceFiles", [])}
    if len(source_files) != len(manifest.get("sourceFiles", [])):
        raise ValueError("DUPLICATE_NATIVE_SOURCE")
    for row in native:
        file = row.get("source", {})
        category = row.get("nativeCategory")
        expected_file = f"ddv_Data/StreamingAssets/itemlist/{category}.json"
        if category not in NATIVE_CATEGORIES or file.get("platform") != "Steam" or \
                file.get("gameVersion") != manifest["gameVersion"] or file.get("file") != expected_file or \
                not valid_hash(source_files.get(expected_file)) or \
                not isinstance(row.get("rawNameField"), str) or not row["rawNameField"] or \
                not isinstance(row.get("iconGuid"), str) or GUID.fullmatch(row["iconGuid"]) is None or \
                not isinstance(row.get("names"), dict) or set(row["names"]) != set(LOCALES) or \
                any(value is not None for value in row["names"].values()):
            raise ValueError(f"UNTRUSTED_NATIVE_ROW:{row.get('itemId')}")
    localized_manifest_path = source / "localization-manifest.json"
    localized_path = source / "items-localized.jsonl"
    localization = None
    if localized_path.exists() != localized_manifest_path.exists():
        raise ValueError("INCOMPLETE_LOCALIZATION_INPUT")
    if localized_path.exists():
        localization = read_json(localized_manifest_path)
        if localization.get("schema") != "wand.src01.localized-names@1" or \
                localization.get("gameVersion") != manifest["gameVersion"] or \
                localization.get("platform") != "Steam" or \
                localization.get("sourceItemSha256") != manifest["itemsSha256"] or \
                digest(localized_path) != localization.get("itemsSha256"):
            raise ValueError("INVALID_LOCALIZATION_EVIDENCE")
        localized = list(json_lines(localized_path))
        baseline = {r["itemId"]: r for r in native}
        if len(localized) != len(native):
            raise ValueError("LOCALIZATION_ITEM_COUNT_MISMATCH")
        for row in localized:
            earlier = baseline.get(row["itemId"])
            if earlier is None or any(row.get(k) != earlier.get(k) for k in
                                     ("nativeCategory", "rawNameField", "iconGuid", "source")) or \
                    row.get("localizationKey") != row["rawNameField"] + "_DisplayName" or \
                    set(row.get("names", {})) != set(LOCALES) or \
                    any(v is not None and (not isinstance(v, str) or not v.strip() or NONDISPLAY_MARKER.match(v))
                        for v in row["names"].values()):
                raise ValueError(f"LOCALIZATION_ROW_MISMATCH:{row['itemId']}")
            for locale, value in row["names"].items():
                if value is None:
                    continue
                archive = localization.get("localizationEvidence", {}).get(locale, {})
                evidence = archive.get("categories", {}).get(row["nativeCategory"], {})
                if archive.get("archive") != f"LocDB_{LOCALE_ARCHIVES[locale]}.zip" or \
                        not valid_hash(archive.get("sha256")) or \
                        evidence.get("entry") != f"{row['nativeCategory']}.locbin" or \
                        not valid_hash(evidence.get("entrySha256")):
                    raise ValueError(f"LOCALIZATION_EVIDENCE_MISSING:{row['itemId']}:{locale}")
        actual_any = sum(any(v is not None for v in row["names"].values()) for row in localized)
        actual_all = sum(all(v is not None for v in row["names"].values()) for row in localized)
        if (localization.get("localizedAtLeastOneCount") != actual_any or
                localization.get("localizedAllEightCount") != actual_all):
            raise ValueError("LOCALIZATION_MANIFEST_COUNT_MISMATCH")
        native = localized
    return native, {"nativeManifest": manifest, "nativeHash": digest(path),
                    "nativeManifestHash": digest(source / "manifest.json"),
                    "localizationManifest": localization,
                    "localizationHash": digest(localized_path) if localization else None,
                    "localizationManifestHash": digest(localized_manifest_path) if localization else None,
                    "sourceHashes": source_files}


def load_extended(folder, game_version):
    if folder is None:
        return [], None
    manifest = read_json(folder / "manifest.json")
    data_path = folder / "definitions.jsonl"
    if manifest.get("schema") != "wand.src01.extended@1" or manifest.get("platform") != "Steam" or \
            manifest.get("gameVersion") != game_version or digest(data_path) != manifest.get("itemsSha256"):
        raise ValueError("INVALID_EXTENDED_DEFINITION_INPUT")
    rows = list(json_lines(data_path))
    if len(rows) != manifest.get("definitionCount"):
        raise ValueError("EXTENDED_COUNT_MISMATCH")
    categories = manifest.get("categories", {})
    if not isinstance(categories, dict) or not categories or not valid_hash(manifest.get("probeSha256")):
        raise ValueError("EXTENDED_CATEGORY_MANIFEST_MISSING")
    counted = Counter()
    for row in rows:
        src = row.get("source", {})
        category = row.get("nativeCategory")
        filename = f"{category}.json"
        category_meta = categories.get(filename, {})
        expected_file = f"ddv_Data/StreamingAssets/itemlist/{filename}"
        if src.get("platform") != "Steam" or src.get("gameVersion") != game_version or \
                src.get("file") != expected_file or src.get("sha256") != category_meta.get("sha256") or \
                category_meta.get("source") != expected_file or \
                category_meta.get("status") != "native_wire_verified" or \
                not valid_hash(src.get("sha256")) or \
                row.get("iconGuid") is not None or \
                not isinstance(row.get("names"), dict) or set(row["names"]) != set(LOCALES) or \
                (row.get("localizationKey") is not None and not (
                    isinstance(row["localizationKey"], str) and
                    row["localizationKey"].startswith(category + ".") and
                    row["localizationKey"].endswith("_DisplayName"))):
            raise ValueError(f"UNTRUSTED_EXTENDED_ROW:{row['itemId']}")
        for locale, name in row["names"].items():
            if name is None:
                continue
            if not isinstance(name, str) or not name.strip() or NONDISPLAY_MARKER.match(name) or not row.get("localizationKey"):
                raise ValueError(f"EXTENDED_NAME_INVALID:{row['itemId']}:{locale}")
            archives = manifest.get("localizationEvidence", {})
            archive = archives.get(locale, {})
            member = archive.get("members", {}).get(category, {})
            if archive.get("archive") != f"LocDB_{LOCALE_ARCHIVES[locale]}.zip" or \
                    not valid_hash(archive.get("sha256")) or \
                    member.get("entry") != f"{category}.locbin" or \
                    not valid_hash(member.get("entrySha256")):
                raise ValueError(f"EXTENDED_LOCALIZATION_EVIDENCE_MISSING:{row['itemId']}:{locale}")
        counted[filename] += 1
    for filename, category_meta in categories.items():
        if category_meta.get("status") == "verified_empty":
            if counted[filename] != 0 or category_meta.get("count") != 0:
                raise ValueError(f"EXTENDED_EMPTY_CATEGORY_MISMATCH:{filename}")
        elif category_meta.get("status") != "native_wire_verified" or \
                not valid_hash(category_meta.get("sha256")) or \
                counted[filename] != category_meta.get("count"):
            raise ValueError(f"EXTENDED_CATEGORY_COUNT_MISMATCH:{filename}")
    return rows, {"manifest": manifest, "hash": digest(data_path),
                  "manifestHash": digest(folder / "manifest.json")}


def normalized(row, original, evidence, *, domain):
    names = row.get("names", {})
    if not isinstance(names, dict) or set(names) != set(LOCALES):
        raise ValueError("INVALID_NAME_LOCALES")
    name_checks = {locale: bool(value) for locale, value in names.items()}
    source = row["source"]
    return {
        "itemId": row["itemId"], "catalogDomain": domain, "nativeCategory": row["nativeCategory"],
        "internalIdentifier": None, "nativeNameField": row.get("rawNameField"),
        "localizationKey": row.get("localizationKey"), "names": names,
        "category": None, "subcategory": None, "tags": None, "attributes": None,
        "worlds": None, "universes": None, "expansions": None, "adventurePacks": None,
        "image": {"iconGuid": row.get("iconGuid"), "mediaExtracted": False},
        "source": {**source, "sha256": evidence},
        "verification": {
            "itemId": "native_frame_verified", "nativeCategory": "native_file_verified",
            "names": {k: "exact_locdb_join" if v else "unresolved" for k, v in name_checks.items()},
            "iconGuid": "native_wire_verified" if row.get("iconGuid") else "unresolved",
            "classification": "unresolved", "relationships": "unresolved",
            "currentVersionObserved": True,
        },
        "historicalReference": original,
    }


def build(source, reference, output, extended=None, force=False):
    source, output = Path(source).resolve(), Path(output).resolve()
    # Legacy Switch Collection is optional historical context, never a
    # dependency of canonical Steam extraction for future game versions.
    reference = Path(reference).resolve() if reference else None
    extended = Path(extended).resolve() if extended else None
    for root in (source, reference, extended):
        if root is not None and (output == root or output in root.parents or root in output.parents):
            raise ValueError("OUTPUT_OVERLAPS_SOURCE")
    native, meta = load_native(source)
    previous, reference_meta = (
        reference_collection(reference) if reference is not None else
        ({}, {'indexSha256': None, 'count': 0, 'target': None})
    )
    extra, extra_meta = load_extended(extended, meta["nativeManifest"]["gameVersion"])
    inputs = {"native": meta["nativeHash"], "nativeManifest": meta["nativeManifestHash"],
              "localized": meta["localizationHash"],
              "localizationManifest": meta["localizationManifestHash"],
              "referenceIndex": reference_meta["indexSha256"],
              "extended": extra_meta["hash"] if extra_meta else None,
              "extendedManifest": extra_meta["manifestHash"] if extra_meta else None,
              "schema": SCHEMA}
    build_key = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    manifest_path = output / "manifest.json"
    if not force and manifest_path.is_file():
        try:
            old = read_json(manifest_path)
            if old.get("schema") == SCHEMA and old.get("buildKey") == build_key and all(
                digest(output / name) == checksum for name, checksum in old.get("outputSha256", {}).items()
            ) and len(old.get("outputSha256", {})) == 4:
                return {"status": "unchanged", **old["counts"]}
        except (OSError, ValueError, TypeError):
            pass
    by_id = {}
    for row in native + extra:
        if row["itemId"] in by_id:
            raise ValueError(f"CROSS_SOURCE_ITEM_ID_COLLISION:{row['itemId']}")
        by_id[row["itemId"]] = row
    source_hashes = meta["sourceHashes"]
    normalized_rows = []
    for item_id, row in sorted(by_id.items()):
        category = row["nativeCategory"]
        domain = "item" if category in NATIVE_CATEGORIES else "definition_unclassified"
        original = previous.get(item_id)
        original = ({"source": original["source"], "category": original["category"],
                     "stateClass": original["stateClass"], "stateSemantic": original["stateSemantic"],
                     "worlds": original["worlds"], "universes": original["universes"],
                     "expansions": original["expansions"], "names": original["names"]} if original else None)
        evidence = row["source"].get("sha256") or source_hashes.get(row["source"]["file"])
        if not evidence:
            raise ValueError(f"MISSING_SOURCE_DIGEST:{item_id}")
        normalized_rows.append(normalized(row, original, evidence, domain=domain))
    only_new = sorted(set(by_id) - set(previous))
    not_observed = sorted(set(previous) - set(by_id))
    common = sorted(set(previous) & set(by_id))
    changes = {}
    for item_id in common:
        old = previous[item_id]["names"]
        new = by_id[item_id]["names"]
        locales = [locale for locale in LOCALES if old.get(locale) and new.get(locale) and old[locale] != new[locale]]
        if locales:
            changes[str(item_id)] = locales
    reference_only = [previous[key] for key in not_observed]
    diff = {"schema": "wand.db01.diff@1", "old": reference_meta["target"],
            "new": {"platform": "Steam", "gameVersion": meta["nativeManifest"]["gameVersion"]},
            "coverageComparable": False, "newOnlyIds": only_new,
            "oldNotObservedIds": not_observed, "commonCount": len(common),
            "verifiedNameDifferencesByItemId": changes,
            "removedIds": None, "meaningChangedIds": None,
            "note": "Not observed does not mean removed. Equal IDs do not establish equal semantics."}
    count = Counter(row["nativeCategory"] for row in normalized_rows)
    unresolved = {"schema": "wand.db01.unresolved@1", "count": len(normalized_rows),
                  "unverifiedCurrentFields": ["category", "subcategory", "tags", "attributes", "worlds",
                                               "universes", "expansions", "adventurePacks"],
                  "missingNamesByLocale": {locale: sum(not row["names"][locale] for row in normalized_rows)
                                           for locale in LOCALES},
                  "historicalNotObservedCount": len(not_observed),
                  "partialDefinitionCoverage": extra_meta is None or bool(extra_meta["manifest"].get("unresolvedCategories")),
                  "note": "Historical classification is retained separately, never asserted for current Steam."}
    counts = {"currentDefinitions": len(normalized_rows), "verifiedFourNativeItems": len(native),
              "additionalDefinitionRecords": len(extra), "oldCollection": len(previous),
              "idIntersection": len(common), "newOnly": len(only_new),
              "oldNotObserved": len(not_observed), "verifiedNameDifferenceCount": len(changes)}
    output.mkdir(parents=True, exist_ok=True)
    files = {"items.jsonl": normalized_rows, "reference-only.jsonl": reference_only,
             "diff.json": diff, "unresolved.json": unresolved}
    for name, value in files.items():
        (save_jsonl if name.endswith(".jsonl") else save_json)(output / name, value)
    manifest = {"schema": SCHEMA, "buildKey": build_key, "createdUtc": datetime.now(timezone.utc).isoformat(),
                "gameVersion": meta["nativeManifest"]["gameVersion"], "platform": "Steam",
                "inputs": inputs, "counts": counts, "byNativeCategory": dict(sorted(count.items())),
                "localizationValidated": bool(meta["localizationManifest"]),
                "extendedDefinitionsValidated": bool(extra_meta),
                "outputSha256": {name: digest(output / name) for name in files},
                "publicationStatus": "private_not_approved_for_public_catalog"}
    save_json(manifest_path, manifest)
    return {"status": "built", **counts}


def main():
    parser = argparse.ArgumentParser(description="Build private, evidence-preserving Wand DB-01 item data")
    parser.add_argument("--source", type=Path, required=True, help="SRC-01 Steam extraction folder")
    parser.add_argument("--reference", type=Path, help="Optional legacy Collection reference; never required for future releases")
    parser.add_argument("--extended", type=Path, help="Optional extended native definitions folder")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.source, args.reference, args.out, args.extended, args.force), sort_keys=True))
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.exit(1, f"DB-01 failed: {error}\n")


if __name__ == "__main__":
    main()