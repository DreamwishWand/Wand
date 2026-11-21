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

SCHEMA = "wand.src01.localized-names@1"
SOURCE_SCHEMA = "wand.src01.steam-native@1"
VERSION_FILE_SHA = "e0aad8c7c19ebd3f441161db4d27f7838dd62b261927a974793f54fc0a81fc98"
LOCALES = {
    "en": "en-US", "fr": "fr", "it": "it", "de": "de",
    "es-ES": "es", "ja": "ja", "zh-CN": "zh-CN", "pt-BR": "pt-BR",
}
CATEGORY_HASHES = {
    "ActivityItem": "4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2",
    "Furniture": "cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196",
    "Clothing": "a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946",
    "Trimming": "a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c",
}
NOBR = re.compile(r"</?nobr>", re.I)
ZERO_WIDTH = re.compile("[\u200b\u200c\u200d\ufeff]")
MAX_LOC_FILE_BYTES = 16 * 1024 * 1024
MAX_ENTRIES = 200000


def sha_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def varint(data, position):
    start = position
    value = 0
    for index in range(10):
        if position >= len(data):
            raise ValueError("TRUNCATED_VARINT")
        byte = data[position]
        position += 1
        if index == 9 and byte > 1:
            raise ValueError("OVERFLOW_VARINT")
        value |= (byte & 127) << (7 * index)
        if byte < 128:
            if data[start:position] != make_varint(value):
                raise ValueError("NONCANONICAL_VARINT")
            return value, position
    raise ValueError("UNTERMINATED_VARINT")


def make_varint(value):
    if value < 0:
        raise ValueError("NEGATIVE_VARINT")
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return bytes(result)


def decode_entry(data):
    position = 0
    fields = {}
    while position < len(data):
        tag, position = varint(data, position)
        number, wire = tag >> 3, tag & 7
        if number not in (1, 2) or wire != 2 or number in fields:
            raise ValueError("UNEXPECTED_LOCALIZATION_ENTRY_FIELD")
        size, position = varint(data, position)
        if size > len(data) - position:
            raise ValueError("TRUNCATED_LOCALIZATION_ENTRY_FIELD")
        fields[number] = data[position:position + size]
        position += size
    if set(fields) != {1, 2}:
        raise ValueError("MISSING_LOCALIZATION_ENTRY_FIELD")
    try:
        key = fields[1].decode("utf-8")
        value = fields[2].decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("INVALID_LOCALIZATION_TEXT") from error
    if not key or len(key) > 1024 or len(value) > 8192:
        raise ValueError("LOCALIZATION_KEY_OR_VALUE_OUT_OF_BOUNDS")
    return key, value


def decode_locbin(data):
    position = 0
    result = {}
    while position < len(data):
        tag, position = varint(data, position)
        if tag != 10:
            raise ValueError("UNEXPECTED_LOCALIZATION_CONTAINER_FIELD")
        size, position = varint(data, position)
        if not size or size > len(data) - position:
            raise ValueError("INVALID_LOCALIZATION_CONTAINER_SIZE")
        key, value = decode_entry(data[position:position + size])
        position += size
        if key in result:
            raise ValueError("DUPLICATE_LOCALIZATION_KEY")
        result[key] = value
        if len(result) > MAX_ENTRIES:
            raise ValueError("LOCALIZATION_ENTRY_COUNT_EXCEEDED")
    return result


def clean_display_name(value):
    return ZERO_WIDTH.sub("", NOBR.sub("", value)).strip()


def read_json(path):
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def atomic_write(path, emit):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".src01-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            emit(stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def write_json(path, data):
    def emit(stream):
        json.dump(data, stream, ensure_ascii=False, indent=2, sort_keys=True)
        stream.write("\n")
    atomic_write(path, emit)


def write_jsonl(path, data):
    def emit(stream):
        for row in data:
            stream.write(json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n")
    atomic_write(path, emit)


def load_source_data(game, source):
    manifest = read_json(source / "manifest.json")
    if manifest.get("schema") != SOURCE_SCHEMA or manifest.get("gameVersion") != "1.26.2" or \
            manifest.get("platform") != "Steam" or manifest.get("status") != "partial_native_extraction":
        raise ValueError("INVALID_NATIVE_ITEMS_MANIFEST")
    items_path = source / "items.jsonl"
    if sha_file(items_path) != manifest.get("itemsSha256"):
        raise ValueError("INPUT_ITEMS_SHA256_MISMATCH")
    if sha_file(game / "FullVersion.txt") != VERSION_FILE_SHA:
        raise ValueError("GAME_VERSION_SHA256_MISMATCH")
    source_paths = {x.get("path"): x.get("sha256") for x in manifest.get("sourceFiles", [])}
    for category, pinned_hash in CATEGORY_HASHES.items():
        relative = f"ddv_Data/StreamingAssets/itemlist/{category}.json"
        if source_paths.get(relative) != pinned_hash:
            raise ValueError(f"MANIFEST_SOURCE_MISMATCH_{category}")
        if sha_file(game / Path(relative)) != pinned_hash:
            raise ValueError(f"GAME_ITEMLIST_SHA256_MISMATCH_{category}")
    items = []
    item_ids = set()
    with items_path.open("r", encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            item_id = row.get("itemId")
            category = row.get("nativeCategory")
            raw_key = row.get("rawNameField")
            if type(item_id) is not int or item_id in item_ids or category not in CATEGORY_HASHES or \
                    not isinstance(raw_key, str) or not raw_key or len(raw_key) > 1024:
                raise ValueError(f"INVALID_NATIVE_ITEM_ROW_{line_no}")
            item_ids.add(item_id)
            items.append(row)
    if len(items) != manifest.get("itemCount"):
        raise ValueError("NATIVE_ITEM_COUNT_MISMATCH")
    return manifest, items


def read_locale_category(game, locale, category):
    archive_path = game / "ddv_Data" / "StreamingAssets" / "Localization" / f"LocDB_{LOCALES[locale]}.zip"
    member = f"{category}.locbin"
    if archive_path.is_symlink():
        raise ValueError("LOCALIZATION_ARCHIVE_SYMLINK")
    with zipfile.ZipFile(archive_path) as archive:
        info = archive.getinfo(member)
        if not info.file_size or info.file_size > MAX_LOC_FILE_BYTES:
            raise ValueError(f"LOCALIZATION_MEMBER_TOO_LARGE_{locale}_{category}")
        data = archive.read(info)
    if len(data) != info.file_size:
        raise ValueError("INCOMPLETE_LOCALIZATION_MEMBER")
    return decode_locbin(data), {
        "archive": archive_path.name, "entry": member,
        "archiveSha256": sha_file(archive_path), "entrySha256": hashlib.sha256(data).hexdigest(),
        "entries": None, "bytes": len(data),
    }


def build_localized(game, source, out):
    game = game.resolve(strict=True)
    source = source.resolve(strict=True)
    out = out.resolve()
    if not game.is_dir() or game == out or game in out.parents or out in game.parents:
        raise ValueError("OUTPUT_MUST_NOT_OVERLAP_GAME")
    original_manifest, items = load_source_data(game, source)
    by_category = defaultdict(list)
    for item in items:
        by_category[item["nativeCategory"]].append(item)
        item["localizationKey"] = item["rawNameField"] + "_DisplayName"
        item["names"] = {locale: None for locale in LOCALES}
    archives = {}
    name_counts = {}
    missing = {}
    for locale, suffix in LOCALES.items():
        archive_path = game / "ddv_Data" / "StreamingAssets" / "Localization" / f"LocDB_{suffix}.zip"
        archive_hash = sha_file(archive_path)
        archives[locale] = {"archive": archive_path.name, "sha256": archive_hash,
                            "source": archive_path.relative_to(game).as_posix(), "categories": {}}
        category_counts = {}
        missing[locale] = {}
        for category in CATEGORY_HASHES:
            text_by_key, meta = read_locale_category(game, locale, category)
            meta.pop("archiveSha256")
            meta["entries"] = len(text_by_key)
            archives[locale]["categories"][category] = meta
            matched = 0
            missing_ids = []
            for item in by_category[category]:
                key = item["localizationKey"]
                raw = text_by_key.get(key)
                if raw is None:
                    missing_ids.append(item["itemId"])
                    continue
                value = clean_display_name(raw)
                if not value:
                    missing_ids.append(item["itemId"])
                    continue
                item["names"][locale] = value
                matched += 1
            category_counts[category] = matched
            missing[locale][category] = missing_ids
        name_counts[locale] = category_counts
    summary = {locale: {"localized": sum(categories.values()),
                        "missing": len(items) - sum(categories.values()),
                        "byCategory": categories} for locale, categories in name_counts.items()}
    all_locales = sum(all(item["names"][locale] is not None for locale in LOCALES) for item in items)
    any_locale = sum(any(item["names"][locale] is not None for locale in LOCALES) for item in items)
    out.mkdir(parents=True, exist_ok=True)
    output_path = out / "items-localized.jsonl"
    write_jsonl(output_path, items)
    manifest = {
        "schema": SCHEMA, "status": "validated_localization_join", "platform": "Steam",
        "gameVersion": "1.26.2", "createdUtc": datetime.now(timezone.utc).isoformat(),
        "nativeItemCount": len(items), "localizedAllEightCount": all_locales,
        "localizedAtLeastOneCount": any_locale,
        "sourceItemSha256": original_manifest["itemsSha256"],
        "itemsFile": output_path.name, "itemsSha256": sha_file(output_path),
        "keyRule": "rawNameField + '_DisplayName'",
        "sourceFiles": original_manifest["sourceFiles"], "locales": list(LOCALES),
        "localizationEvidence": archives,
        "verifiedFields": ["Item ID", "raw native name identifier", "localized display-name value for exact category key"],
        "unverifiedFields": ["subcategory", "world", "universe", "expansion", "ownership", "acquisition"],
    }
    write_json(out / "localization-manifest.json", manifest)
    write_json(out / "localization-report.json", {
        "schema": "wand.src01.localization-report@1", "nativeItemCount": len(items),
        "localizedAllEightCount": all_locales, "localizedAtLeastOneCount": any_locale,
        "byLocale": summary, "mappingMethod": "exact category-specific localization key",
        "sourceVersion": "Steam 1.26.2",
        "note": "Missing names remain null; no heuristic name fallback was applied.",
    })
    write_json(out / "localization-unresolved.json", {
        "schema": "wand.src01.localization-unresolved@1",
        "missingItemIdsByLocaleAndCategory": missing,
        "additionalUnverified": ["Unparsed 35 other itemlist definition types",
                                 "Official categorization / subcategories",
                                 "World, DLC, and acquisition references"],
    })
    print(json.dumps({"status": "localized", "version": "1.26.2",
                      "total": len(items), "allEight": all_locales,
                      "anyLocale": any_locale,
                      "missingByLocale": {key: val["missing"] for key, val in summary.items()},
                      "output": str(output_path)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="Join verified Steam 1.26.2 item IDs to eight official locale binaries")
    parser.add_argument("--game", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        build_localized(args.game, args.source, args.out)
    except (OSError, ValueError, UnicodeError, KeyError, zipfile.BadZipFile) as error:
        parser.exit(1, f"SRC-01 localization failed: {error}\n")


if __name__ == "__main__":
    main()
