import argparse
import base64
import hashlib
import json
import os
import tempfile
import zipfile
from collections import Counter
from pathlib import Path

VERSION_SHA256 = "e0aad8c7c19ebd3f441161db4d27f7838dd62b261927a974793f54fc0a81fc98"
LOCALE_ZIPS = {"en": "en-US", "fr": "fr", "it": "it", "de": "de", "es-ES": "es",
               "ja": "ja", "zh-CN": "zh-CN", "pt-BR": "pt-BR"}
LOCALE_MEMBERS = ("ActivityItem", "Furniture", "Clothing", "Trimming", "Building",
                  "Character", "Companion", "BoardGame", "AvatarFeature", "Makeup",
                  "Skin", "MountGear", "PhotoMode", "Tool", "Upgrade")
SKIP_NATIVE = {"ActivityItem", "Furniture", "Clothing", "Trimming"}
MAX_SAMPLE = 16384
MAX_ITEMLIST_SIZE = 8 * 1024 * 1024
MAX_UNCOMPRESSED = 16 * 1024 * 1024


def sha256_file(path):
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def read_varint(data, pos):
    start = pos
    value = 0
    for index in range(10):
        if pos >= len(data):
            raise ValueError("truncated_varint")
        byte = data[pos]
        pos += 1
        if index == 9 and byte > 1:
            raise ValueError("overflow_varint")
        value |= (byte & 127) << (index * 7)
        if byte < 128:
            if data[start:pos] != write_varint(value):
                raise ValueError("noncanonical_varint")
            return value, pos
    raise ValueError("unterminated_varint")


def write_varint(value):
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return bytes(result)


def probe_frame_fields(data, max_fields=48):
    fields = []
    pos = 0
    try:
        while pos < len(data) and len(fields) < max_fields:
            tag, pos = read_varint(data, pos)
            number, wire = tag >> 3, tag & 7
            if not number or wire not in (0, 1, 2, 5):
                raise ValueError("unsupported_tag")
            item = {"field": number, "wire": wire}
            if wire == 0:
                value, pos = read_varint(data, pos)
                item["integer"] = value
            elif wire in (1, 5):
                size = 8 if wire == 1 else 4
                if size > len(data) - pos:
                    raise ValueError("truncated_fixed")
                pos += size
            else:
                size, pos = read_varint(data, pos)
                if size > len(data) - pos:
                    raise ValueError("truncated_length")
                item["bytes"] = size
                pos += size
            fields.append(item)
        return {"status": "wire_profile_only", "bytesTraversed": pos, "fields": fields,
                "truncatedByFieldLimit": pos < len(data)}
    except ValueError as error:
        return {"status": "unrecognized_wire_structure", "reason": str(error),
                "bytesTraversed": pos, "fieldsBeforeError": fields}


def inspect_itemlist(root, sample_bytes):
    result = {}
    folder = root / "ddv_Data" / "StreamingAssets" / "itemlist"
    for path in sorted(folder.glob("*.json")):
        if path.name in {name + ".json" for name in SKIP_NATIVE}:
            continue
        if path.is_symlink() or not path.is_file():
            continue
        meta = {"size": path.stat().st_size, "sha256": sha256_file(path),
                "source": path.relative_to(root).as_posix(), "isJsonText": False}
        if meta["size"] == 0:
            meta["status"] = "empty"
        elif meta["size"] > MAX_ITEMLIST_SIZE:
            meta["status"] = "too_large"
        else:
            data = path.read_bytes()
            try:
                json.loads(data.decode("utf-8-sig"))
                meta["isJsonText"] = True
                meta["status"] = "json_text_detected"
            except (ValueError, UnicodeError):
                meta["status"] = "binary_structure_probe"
            frames = []
            pos = 0
            try:
                for _ in range(3):
                    if pos == len(data):
                        break
                    key, pos = read_varint(data, pos)
                    size, pos = read_varint(data, pos)
                    if not size or size > len(data) - pos or size > 1024 * 1024:
                        raise ValueError("invalid_frame_size")
                    frames.append({"frameKey": key, "frameBytes": size,
                                   "fieldProfile": probe_frame_fields(data[pos:pos + size])})
                    pos += size
                meta["frameProbe"] = {"status": "candidate_frame_model", "frames": frames,
                                      "bytesTraversed": pos}
            except ValueError as error:
                meta["frameProbe"] = {"status": "unrecognized_frame_model",
                                      "reason": str(error), "frames": frames}
            meta["headBase64"] = base64.b64encode(data[:sample_bytes]).decode("ascii")
        result[path.name] = meta
    return result


def inspect_localizations(root, sample_bytes):
    result = {}
    folder = root / "ddv_Data" / "StreamingAssets" / "Localization"
    for locale, stem in LOCALE_ZIPS.items():
        path = folder / ("LocDB_" + stem + ".zip")
        if path.is_symlink() or not path.is_file():
            result[locale] = {"status": "missing_archive"}
            continue
        output = {"status": "inspected", "source": path.relative_to(root).as_posix(),
                  "sha256": sha256_file(path), "members": {}}
        with zipfile.ZipFile(path) as archive:
            members = {item.filename: item for item in archive.infolist() if not item.is_dir()}
            output["archiveEntries"] = len(members)
            for name in LOCALE_MEMBERS:
                member = members.get(name + ".locbin")
                if member is None:
                    output["members"][name] = {"status": "missing"}
                    continue
                meta = {"status": "structure_sample_only", "bytes": member.file_size,
                        "crc32": f"{member.CRC:08x}", "compressedBytes": member.compress_size}
                if member.file_size > MAX_UNCOMPRESSED:
                    meta["status"] = "uncompressed_size_too_large"
                else:
                    with archive.open(member) as handle:
                        head = handle.read(sample_bytes)
                    meta["headBase64"] = base64.b64encode(head).decode("ascii")
                    meta["headWireProfile"] = probe_frame_fields(head, max_fields=20)
                output["members"][name] = meta
        result[locale] = output
    return result


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".src01-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            handle.write("\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def run(game, out, sample_bytes):
    game = game.resolve(strict=True)
    out = out.resolve()
    if not game.is_dir() or out == game or game in out.parents or out in game.parents:
        raise ValueError("Invalid input/output directory overlap")
    if sha256_file(game / "FullVersion.txt") != VERSION_SHA256:
        raise ValueError("Game source version does not match verified Steam 1.26.2")
    result = {"schema": "wand.src01.format-probe@1", "platform": "Steam",
              "gameVersion": "1.26.2", "sampleBytesPerEntry": sample_bytes,
              "itemlistCandidates": inspect_itemlist(game, sample_bytes),
              "localization": inspect_localizations(game, sample_bytes),
              "notVerified": ["other item type semantics", "locbin binary format",
                              "Item ID to localization entry mapping", "official translated names"]}
    write_json(out, result)
    summary = {"output": str(out), "itemlistCandidates": len(result["itemlistCandidates"]),
               "locales": len(result["localization"])}
    print(json.dumps(summary, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="Read-only game-format probe for Steam DDV v1.26.2")
    parser.add_argument("--game", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--sample-bytes", type=int, default=4096)
    args = parser.parse_args()
    if args.sample_bytes < 1 or args.sample_bytes > MAX_SAMPLE:
        parser.error("sample-bytes must be 1..16384")
    try:
        run(args.game, args.out, args.sample_bytes)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f"SRC-01 probe failed: {error}\n")


if __name__ == "__main__":
    main()
