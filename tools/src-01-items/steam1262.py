import argparse
import hashlib
import json
import os
import re
import tempfile
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = "wand.src01.steam-native@1"
GAME_VERSION = "1.26.2"
FULLVERSION_SHA256 = "e0aad8c7c19ebd3f441161db4d27f7838dd62b261927a974793f54fc0a81fc98"
CATEGORIES = {
    "ActivityItem": (30000000, "4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2"),
    "Furniture": (40000000, "cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196"),
    "Clothing": (50000000, "a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946"),
    "Trimming": (160000000, "a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c"),
}
LOCALES = {
    "en": "en-US", "fr": "fr", "it": "it", "de": "de",
    "es-ES": "es", "ja": "ja", "zh-CN": "zh-CN", "pt-BR": "pt-BR",
}
GUID = re.compile(r"guid:[0-9a-f]{32}\Z")
VERSION = re.compile(r"(?<![0-9.])(?:v)?(1\.26\.2)(?![0-9.])")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def varint(data, pos):
    begin = pos
    value = 0
    for i in range(10):
        if pos >= len(data):
            raise ValueError("TRUNCATED_VARINT")
        byte = data[pos]
        pos += 1
        if i == 9 and byte > 1:
            raise ValueError("OVERFLOW_VARINT")
        value |= (byte & 127) << (7 * i)
        if byte < 128:
            if data[begin:pos] != encode_varint(value):
                raise ValueError("NON_CANONICAL_VARINT")
            return value, pos
    raise ValueError("UNTERMINATED_VARINT")


def encode_varint(value):
    if value < 0:
        raise ValueError("NEGATIVE_VARINT")
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return bytes(result)


def parse_record(data, category, offset):
    fields = {}
    position = 0
    while position < len(data):
        tag, position = varint(data, position)
        field, wire = tag >> 3, tag & 7
        if field == 0:
            raise ValueError("INVALID_FIELD_ZERO")
        if wire == 0:
            value, position = varint(data, position)
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            if position + size > len(data):
                raise ValueError("TRUNCATED_FIXED_FIELD")
            value = data[position:position + size]
            position += size
        elif wire == 2:
            size, position = varint(data, position)
            if size > len(data) - position:
                raise ValueError("TRUNCATED_LENGTH_FIELD")
            value = data[position:position + size]
            position += size
        else:
            raise ValueError("UNSUPPORTED_WIRE_TYPE")
        if field in (1, 2, 4):
            if field in fields or wire != (0 if field == 1 else 2):
                raise ValueError("MALFORMED_REQUIRED_FIELD")
            fields[field] = value
    if set(fields) != {1, 2, 4}:
        raise ValueError("MISSING_REQUIRED_FIELDS")
    item_id = fields[1]
    if type(item_id) is not int or item_id <= 0 or item_id >= 2**53:
        raise ValueError("UNSAFE_ITEM_ID")
    if item_id - CATEGORIES[category][0] != offset:
        raise ValueError("ITEM_FRAME_KEY_MISMATCH")
    try:
        raw_name = fields[2].decode("utf-8")
        icon_guid = fields[4].decode("ascii")
    except UnicodeDecodeError as error:
        raise ValueError("INVALID_TEXT_ENCODING") from error
    if not raw_name or len(raw_name) > 1024 or not GUID.fullmatch(icon_guid):
        raise ValueError("INVALID_NATIVE_NAME_OR_GUID")
    return {
        "itemId": item_id, "rawNameField": raw_name, "nativeCategory": category,
        "iconGuid": icon_guid,
        "names": {name: None for name in LOCALES},
        "category": None, "subcategory": None, "internalIdentifier": None,
        "worlds": [], "universes": [], "expansions": [], "attributes": {},
        "source": {"platform": "Steam", "gameVersion": GAME_VERSION,
                   "file": f"ddv_Data/StreamingAssets/itemlist/{category}.json",
                   "wireFields": {"itemId": 1, "rawName": 2, "iconGuid": 4}},
    }


def parse_category(data, category):
    if category not in CATEGORIES or len(data) > 32 * 1024 * 1024:
        raise ValueError("INVALID_CATEGORY_OR_SOURCE_SIZE")
    position = 0
    rows = []
    frames = set()
    while position < len(data):
        offset, position = varint(data, position)
        length, position = varint(data, position)
        if offset in frames or not length or length > 1024 * 1024 or length > len(data) - position:
            raise ValueError("INVALID_OR_DUPLICATE_FRAME")
        frames.add(offset)
        row = parse_record(data[position:position + length], category, offset)
        position += length
        rows.append(row)
        if len(rows) > 20000:
            raise ValueError("EXCESSIVE_ROW_COUNT")
    if not rows:
        raise ValueError("EMPTY_NATIVE_CATEGORY")
    return rows


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".src01-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def atomic_items(path, items):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".src01-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            for item in items:
                stream.write(json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def inspect_locales(game):
    reports = {}
    for name, suffix in LOCALES.items():
        file = game / "ddv_Data" / "StreamingAssets" / "Localization" / f"LocDB_{suffix}.zip"
        if not file.is_file() or file.is_symlink():
            reports[name] = {"status": "missing"}
            continue
        try:
            with zipfile.ZipFile(file) as archive:
                files = [entry for entry in archive.infolist() if not entry.is_dir()]
                reports[name] = {
                    "status": "archive_inspected_only", "archiveBytes": file.stat().st_size,
                    "entryCount": len(files), "uncompressedBytes": sum(e.file_size for e in files),
                    "entriesSample": [{"name": e.filename[:240], "bytes": e.file_size} for e in files[:30]],
                }
        except (OSError, ValueError, zipfile.BadZipFile) as error:
            reports[name] = {"status": "unreadable", "reason": type(error).__name__}
    return reports


def run(game, out):
    game = game.resolve(strict=True)
    out = out.resolve()
    if not game.is_dir() or game == out or game in out.parents or out in game.parents:
        raise ValueError("INVALID_GAME_OR_OUTPUT_PATH")
    version_path = game / "FullVersion.txt"
    if not version_path.is_file() or sha(version_path.read_bytes()) != FULLVERSION_SHA256:
        raise ValueError("STEAM_1262_VERSION_FILE_SHA_MISMATCH")
    version = version_path.read_text(encoding="utf-8-sig")
    if VERSION.search(version) is None:
        raise ValueError("GAME_VERSION_NOT_1262")
    items = []
    sources = []
    for category, (_, expected_sha) in CATEGORIES.items():
        file = game / "ddv_Data" / "StreamingAssets" / "itemlist" / (category + ".json")
        if file.is_symlink() or not file.is_file():
            raise ValueError(f"MISSING_NATIVE_CATEGORY_{category}")
        data = file.read_bytes()
        actual_sha = sha(data)
        if actual_sha != expected_sha:
            raise ValueError(f"STEAM_1262_CATEGORY_SHA_MISMATCH_{category}")
        rows = parse_category(data, category)
        items.extend(rows)
        sources.append({"path": file.relative_to(game).as_posix(), "sha256": actual_sha, "bytes": len(data), "count": len(rows)})
    items.sort(key=lambda row: row["itemId"])
    ids = [row["itemId"] for row in items]
    if len(ids) != len(set(ids)):
        raise ValueError("DUPLICATE_CROSS_CATEGORY_ITEM_ID")
    locale_reports = inspect_locales(game)
    collisions = defaultdict(list)
    for row in items:
        collisions[row["rawNameField"].casefold()].append(row["itemId"])
    ambiguous = {key: ids for key, ids in collisions.items() if len(ids) > 1}
    out.mkdir(parents=True, exist_ok=True)
    items_path = out / "items.jsonl"
    atomic_items(items_path, items)
    items_hash = hashlib.sha256(items_path.read_bytes()).hexdigest()
    atomic_json(out / "localization-structure.json", {"schema": "wand.src01.localization-survey@1", "archives": locale_reports,
        "note": "ZIP directory evidence does not establish any localized item-name mapping."})
    manifest = {"schema": SCHEMA, "status": "partial_native_extraction", "platform": "Steam",
                "gameVersion": GAME_VERSION, "createdUtc": datetime.now(timezone.utc).isoformat(),
                "itemCount": len(items), "itemsFile": "items.jsonl", "itemsSha256": items_hash,
                "sourceFiles": sources, "versionFileSha256": FULLVERSION_SHA256,
                "validatedNativeCategories": list(CATEGORIES), "sourceRoot": str(game),
                "locales": list(LOCALES), "languageNamesVerified": False}
    atomic_json(out / "manifest.json", manifest)
    atomic_json(out / "report.json", {"schema": "wand.src01.report@1", "status": "partial_native_extraction",
        "nativeItemCount": len(items), "categoryCounts": dict(Counter(row["nativeCategory"] for row in items)),
        "sameRawNameDifferentIdCount": len(ambiguous), "sameRawNameDifferentIdSample": list(ambiguous.items())[:30],
        "localizationArchiveStatus": {key: value["status"] for key, value in locale_reports.items()},
        "sourceOnly": True, "namesVerified": 0,
        "explanation": "Four SHA-pinned Steam 1.26.2 protobuf itemlists decoded. Other itemlist types and localization are pending verified mappings."})
    atomic_json(out / "unresolved.json", {"schema": "wand.src01.unresolved@1", "status": "pending_source_mappings",
        "missing": ["Localization file format and ItemID-to-localization-key mapping",
                    "Verified official names for eight locales", "All other itemlist category schemas",
                    "Validated user-facing category and subcategory semantics", "Expansion, world, universe and attributes mappings",
                    "Comparison against the older Switch 1.25.0 Collection"],
        "notClaims": ["not a complete game item catalog", "not verified official display names",
                      "not an image extraction", "not a game save editor"]})
    print(json.dumps({"status": "partial_native_extraction", "gameVersion": GAME_VERSION,
                      "items": len(items), "out": str(out)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="SRC-01 verified Steam 1.26.2 native item extraction")
    parser.add_argument("--game", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    options = parser.parse_args()
    try:
        run(options.game, options.out)
    except (OSError, ValueError, UnicodeError, zipfile.BadZipFile) as error:
        parser.exit(1, f"SRC-01 error: {error}\n")


if __name__ == "__main__":
    main()
