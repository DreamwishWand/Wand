"""Reconstruct ORIGINAL Steam 1.26.2 CollectionAreaConfig from UnityFS.

Offline Python standard-library tool. The SHA-pinned original scene-main bundle
contains a serialized CollectionsUIConfig MonoBehaviour. This extracts its
ORDERED seven config records and five ItemLocationException IDs, verifying
their Tag/Scene IDs against the exact source itemlist definitions.

Only the original source static configuration is verified. A native
Item->CollectionArea result also depends on source Item/scene tags, Critter
location in ProfileWorld, first-match routing and runtime inputs. Do not mark
runtime UI membership, availability, DLC entitlement or ownership verified.

Never publish original bundle/CAB/private extraction output to GitHub.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import struct
import tempfile

SCHEMA = "wand.db01.original-collection-area-static.private@1"
BUNDLE_SHA256 = "7e53e4c03a539f7b4484cb106382ed590c77570ced0232ae40af245954d2974f"
CAB_SHA256 = "423016b54020bdedefe868d30e8c7eeadc453e9e5c0e16410d32400ce1bc7fdb"
IL2CPP_SHA256 = "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08"
TAG_SHA256 = "bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4"
SCENE_SHA256 = "d8fc56cfc282323df94461e360c26aaf98a884f01b7bd83cabf967ac2cd397d5"
CAB_NAME = "CAB-f964901dc61a2e4b4c90324c3c573ff4"
AREA_NAMES = {
    1: "DreamlightValley", 2: "EternityIsle", 3: "StorybookVale",
    4: "WishblossomRanch", 5: "SeaOfSecrets", 4097: "Honeywood",
    0: "AllAreas",
}
AREA_TAG_NAMES = {
    1: "IsDreamlightValley", 2: "IsEternityIsle",
    3: "IsStorybookVale", 4: "IsWishBlossomMountains",
    5: "isSeaOfSecrets", 4097: "isHoneywood",
}
SPRITE_TYPE = (
    "UnityEngine.Sprite, UnityEngine.CoreModule, Version=0.0.0.0, "
    "Culture=neutral, PublicKeyToken=null"
)
HELPER = Path(__file__).resolve().parents[1] / "collection" / "extract_scope_evidence.py"
_spec = importlib.util.spec_from_file_location("wand_db01_area_wire", HELPER)
if _spec is None or _spec.loader is None:
    raise RuntimeError("DB01_AREA_CONFIG_SOURCE_WIRE_HELPER_MISSING")
_wire = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_wire)


def require(ok: object, reason: str) -> None:
    if not ok:
        raise ValueError("DB01_AREA_CONFIG_" + reason)


def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def read_exact(path: Path, expected: str, label: str) -> bytes:
    require(path.is_file() and not path.is_symlink(), "SOURCE_MISSING_" + label)
    blob = path.read_bytes()
    require(sha(blob) == expected, "SOURCE_SHA_MISMATCH_" + label)
    return blob


def lz4_block(data: bytes, expected: int) -> bytes:
    """Minimal bounds-checked LZ4 block decoder; no optional pip dependencies."""
    src = memoryview(data)
    result = bytearray()
    index = 0

    def length(base: int) -> int:
        nonlocal index
        if base == 15:
            while True:
                require(index < len(src), "LZ4_TRUNCATED_LENGTH")
                extra = src[index]
                index += 1
                base += extra
                require(base <= expected, "LZ4_LENGTH_LIMIT")
                if extra != 255:
                    break
        return base

    while index < len(src):
        token = src[index]
        index += 1
        literal_length = length(token >> 4)
        require(index + literal_length <= len(src) and
                len(result) + literal_length <= expected,
                "LZ4_LITERAL_BOUNDS")
        result.extend(src[index:index + literal_length])
        index += literal_length
        if index == len(src):
            break
        require(index + 2 <= len(src), "LZ4_TRUNCATED_MATCH")
        distance = int.from_bytes(src[index:index + 2], "little")
        index += 2
        require(0 < distance <= len(result), "LZ4_MATCH_DISTANCE")
        count = length(token & 15) + 4
        require(len(result) + count <= expected, "LZ4_MATCH_LENGTH")
        while count:
            part = result[-distance:][:min(distance, count)]
            require(bool(part), "LZ4_EMPTY_MATCH")
            result.extend(part)
            count -= len(part)
    require(len(result) == expected, "LZ4_DECODE_SIZE")
    return bytes(result)


def unityfs_serialized_cab(blob: bytes) -> bytes:
    require(blob[:8] == b"UnityFS\0" and len(blob) < 1024 * 1024,
            "UNITYFS_SIGNATURE")
    require(struct.unpack_from(">I", blob, 8)[0] == 8,
            "UNITYFS_FORMAT_VERSION")
    cursor = 12
    names = []
    for _ in range(2):
        ending = blob.index(0, cursor)
        names.append(blob[cursor:ending].decode("ascii"))
        cursor = ending + 1
    require(names == ["5.x.x", "6000.0.62f1"], "UNITYFS_UNITY_VERSION")
    size, compressed, uncompressed, flags = struct.unpack_from(
        ">QIII", blob, cursor)
    cursor += 20
    require(size == len(blob) and 0 < compressed <= 4096 and
            0 < uncompressed <= 8192 and flags & 0x3f in (2, 3) and
            not flags & 0x80, "UNITYFS_BLOCK_INFO")
    cursor = (cursor + 15) & ~15
    directory = lz4_block(blob[cursor:cursor + compressed], uncompressed)
    cursor += compressed
    if flags & 0x200:
        cursor = (cursor + 15) & ~15
    offset = 16  # UnityFS blocks-info hash
    count = struct.unpack_from(">I", directory, offset)[0]
    offset += 4
    require(1 <= count <= 32, "UNITYFS_BLOCK_COUNT")
    blocks = []
    for _ in range(count):
        plain, packed, mode = struct.unpack_from(">IIH", directory, offset)
        offset += 10
        require(0 < plain <= 131072 and 0 < packed <= 131072 and
                mode & 0x3f in (0, 2, 3), "UNITYFS_BLOCK_FIELDS")
        blocks.append((plain, packed, mode))
    count = struct.unpack_from(">I", directory, offset)[0]
    offset += 4
    require(1 <= count <= 16, "UNITYFS_ENTRY_COUNT")
    entries = {}
    for _ in range(count):
        begin, length, kind = struct.unpack_from(">QQI", directory, offset)
        offset += 20
        end = directory.index(0, offset)
        name = directory[offset:end].decode("ascii")
        offset = end + 1
        require(name not in entries, "UNITYFS_DUPLICATE_ENTRY")
        entries[name] = (begin, length, kind)
    require(offset == len(directory) and
            sum(row[1] for row in blocks) == len(blob) - cursor,
            "UNITYFS_BLOCK_TOTAL")
    plain = bytearray()
    for size, packed, mode in blocks:
        chunk = blob[cursor:cursor + packed]
        cursor += packed
        plain.extend(lz4_block(chunk, size) if mode & 0x3f else chunk)
    require(CAB_NAME in entries, "SERIALIZED_CAB_MISSING")
    start, length, _ = entries[CAB_NAME]
    require(0 < length <= len(plain) and start + length <= len(plain),
            "SERIALIZED_CAB_BOUNDS")
    cab = bytes(plain[start:start + length])
    require(sha(cab) == CAB_SHA256, "SERIALIZED_CAB_SHA256")
    return cab


def read_sprite_string(blob: bytes, position: int) -> tuple[str, int]:
    require(position + 4 <= len(blob), "SPRITE_STRING_SIZE")
    size = struct.unpack_from("<I", blob, position)[0]
    position += 4
    require(0 < size <= 160 and position + size <= len(blob),
            "SPRITE_STRING_BOUNDS")
    return blob[position:position + size].decode("ascii"), (
        position + size + 3) & ~3


def extract_serialized_config(
    cab: bytes, tags: dict[int, str], scenes: dict[int, str],
) -> tuple[list[dict], list[int]]:
    """Find a single source-typed array; never infer its file offset."""
    area_order = [1, 2, 3, 4, 5, 4097, 0]
    dreamlight_tag = [
        identity for identity, name in tags.items()
        if name == AREA_TAG_NAMES[1]
    ]
    require(len(dreamlight_tag) == 1, "SOURCE_DREAMLIGHT_TAG_ID")
    anchor = struct.pack("<III", 7, 1, dreamlight_tag[0])
    matches = []
    start = 0
    while True:
        start = cab.find(anchor, start)
        if start == -1:
            break
        matches.append(start)
        start += 1
    require(len(matches) == 1, "AREA_CONFIG_ARRAY_AMBIGUOUS")
    position = matches[0] + 4
    rows = []
    for code in area_order:
        require(position + 12 <= len(cab), "AREA_RECORD_TRUNCATED")
        actual, tag_id, village_id = struct.unpack_from(
            "<iii", cab, position)
        position += 12
        require(actual == code and (
            (tag_id == 0 and village_id == 0) if code == 0 else
            (tag_id > 0 and village_id > 0)),
            "AREA_CODE_ORDER_OR_SOURCE_ID")
        guid, position = read_sprite_string(cab, position)
        sprite, position = read_sprite_string(cab, position)
        sprite_type, position = read_sprite_string(cab, position)
        require(re.fullmatch(r"[a-f0-9]{32}", guid) and
                sprite.startswith("icon_") and
                sprite_type == SPRITE_TYPE, "SPRITE_SOURCE_IDENTITY")
        if code:
            require(tags.get(tag_id) == AREA_TAG_NAMES[code] and
                    village_id in scenes, "SOURCE_TAG_SCENE_RELATION")
        rows.append({
            "configOrder": len(rows), "collectionArea": code,
            "enumName": AREA_NAMES[code],
            "gameplayTagId": tag_id,
            "gameplayTagNativeKey": tags.get(tag_id) if tag_id else None,
            "villageItemId": village_id,
            "villageNativeKey": scenes.get(village_id) if village_id else None,
            "iconGuid": guid, "iconSubObject": sprite,
        })
    require(position + 4 <= len(cab), "LOCATION_EXCEPTION_COUNT")
    count = struct.unpack_from("<I", cab, position)[0]
    position += 4
    require(count == 5 and position + count * 4 <= len(cab),
            "LOCATION_EXCEPTION_OR_SOURCE_DRIFT")
    exceptions = list(struct.unpack_from("<5i", cab, position))
    require(len(set(exceptions)) == count and all(v > 0 for v in exceptions),
            "LOCATION_EXCEPTION_IDENTITY")
    return rows, exceptions


def verify_il2cpp(blob: bytes) -> None:
    text = blob.decode("utf-8")
    fields = [
        "public class CollectionAreaConfig //",
        "public CollectionArea CollectionArea; // 0x10",
        "public int GameplayTagID; // 0x14",
        "public int VillageItemID; // 0x18",
        "public class CollectionsUIConfig :",
        "private CollectionAreaConfig[] _collectionAreaConfigs; // 0x20",
        "private ItemLocationException[] _itemLocationExceptions; // 0x38",
        "public HashSet<Item> GetAreaTags(Item item, bool onlyPurchased = False)",
        "public IEnumerable<CollectionAreaConfig> GetAreaConfigs(Item item, bool onlyPurchased = False)",
    ]
    require(all(field in text for field in fields),
            "NATIVE_IL2CPP_FIELD_OR_SIGNATURE_DRIFT")
    for code, name in AREA_NAMES.items():
        require(f"public const CollectionArea {name} = {code};" in text,
                "NATIVE_COLLECTION_AREA_ENUM_DRIFT")


def extract(
    bundle: Path, original_tags: Path, original_scenes: Path,
    il2cpp_dump: Path,
) -> dict:
    cab = unityfs_serialized_cab(
        read_exact(bundle, BUNDLE_SHA256, "UNITYFS"))
    tags = _wire.read_definitions(
        read_exact(original_tags, TAG_SHA256, "TAGS"), "Tag")
    scenes = _wire.read_definitions(
        read_exact(original_scenes, SCENE_SHA256, "SCENES"), "Scene")
    require(len(tags) == 409 and len(scenes) == 194,
            "SOURCE_TAG_SCENE_CENSUS")
    verify_il2cpp(read_exact(il2cpp_dump, IL2CPP_SHA256, "IL2CPP"))
    config, exceptions = extract_serialized_config(cab, tags, scenes)
    return {
        "schema": SCHEMA, "platform": "Steam", "gameVersion": "1.26.2",
        "privateOnly": True, "publicationAuthorized": False,
        "originalUnityBundleSha256": BUNDLE_SHA256,
        "originalSerializedCabSha256": CAB_SHA256,
        "originalIl2cppDumpSha256": IL2CPP_SHA256,
        "originalTagSha256": TAG_SHA256,
        "originalSceneSha256": SCENE_SHA256,
        "staticCollectionAreaConfigVerified": True,
        "nativeItemToCollectionAreaMembershipVerified": False,
        "nativeCritterWorldStateRoutingVerified": False,
        "playerDlcEntitlementVerified": False,
        "playerOwnershipVerified": False,
        "originalAreaConfigs": config,
        "originalItemLocationExceptionIds": exceptions,
        "itemLocationExceptionMeaningVerified": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--tags", required=True, type=Path)
    parser.add_argument("--scenes", required=True, type=Path)
    parser.add_argument("--il2cpp-dump", required=True, type=Path)
    parser.add_argument("--private-out", required=True, type=Path)
    args = parser.parse_args()
    inputs = {p.resolve() for p in
              (args.bundle, args.tags, args.scenes, args.il2cpp_dump)}
    require(args.private_out.resolve() not in inputs and
            args.private_out.suffix == ".json", "UNSAFE_OUTPUT_PATH")
    report = extract(
        args.bundle, args.tags, args.scenes, args.il2cpp_dump)
    args.private_out.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(
        prefix=".db01-original-area-", dir=args.private_out.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as dest:
            json.dump(report, dest, ensure_ascii=False, indent=2, sort_keys=True)
            dest.write("\n")
        os.replace(temp, args.private_out)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    print(json.dumps({
        "schema": SCHEMA, "status": "PASS",
        "sourceAreaConfigs": len(report["originalAreaConfigs"]),
        "sourceItemLocationExceptionIds":
            len(report["originalItemLocationExceptionIds"]),
        "nativeItemToCollectionAreaMembershipVerified": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
