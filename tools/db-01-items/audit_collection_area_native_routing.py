"""Byte-audit Steam v1.26.2 native CollectionArea routing, owner-private.

The same-version GameAssembly.dll and dump.cs are SHA-pinned. This script
verifies PE section/RVA mapping, native method signatures and instructions
that establish:
  GetAreaConfigs(false) -> serialized configs (not purchased-only);
  Critter.Location case 6 -> world Village Scene Item -> config match;
  otherwise IHasTags -> HasTag(config.GameplayTag);
  GetAreaTags -> FirstOrDefault(GetAreaConfigs), fallback area key 1.
It does not recover IHasTags internal tag inheritance, the player's world
state, game-screen category population or purchased entitlement.

Never publishes or copies original binaries. All source inputs remain local.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct

SCHEMA = "wand.db01.collection-native-routing-evidence.private@1"
GAME_VERSION = "1.26.2"
GAMEASSEMBLY_SHA256 = (
    "a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653")
IL2CPP_DUMP_SHA256 = (
    "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08")
METHODS = {
    "GetAreaTags": (
        0x70D00A0,
        "public HashSet<Item> GetAreaTags(Item item, bool onlyPurchased = False) { }"),
    "GetAreaConfigs": (
        0x70D01C0,
        "public IEnumerable<CollectionAreaConfig> GetAreaConfigs(Item item, bool onlyPurchased = False) { }"),
    "ScenePredicate": (
        0x70D09B0,
        "internal bool <GetAreaConfigs>b__0(CollectionAreaConfig t) { }"),
    "TagPredicate": (
        0x70D0A20,
        "internal bool <GetAreaConfigs>b__1(CollectionAreaConfig t) { }"),
    "GameplayTag": (
        0x70CF2E0, "public Item get_GameplayTag() { }"),
    "HasTag": (
        0x41088E0,
        "public static bool HasTag(IHasTags hasTagsItemData, Item tag) { }"),
}
# Each signature is a fragment verified directly in the original GameAssembly
# disassembly. RVA bytes are version-specific: no heuristic/other build.
INSTRUCTION_ANCHORS = {
    "area_tags_calls_configs": (0x70D0129, "e892000000"),
    "area_tags_checks_first": (0x70D013D, "4885c07549"),
    "area_tags_fallback_area_1": (0x70D0152, "ba01000000"),
    "config_select_only_purchased": (0x70D0369, "4084f6740f"),
    "config_select_original_array": (0x70D037D, "4c8b7f20"),
    "critter_location_oneof_6": (0x70D046F, "83b89800000006"),
    "critter_try_world_village": (0x70D04A3, "e838e6a1fd"),
    "critter_try_scene_item": (0x70D0532, "e869ee00fd"),
    "generic_try_ihas_tags": (0x70D060A, "e861d167fa"),
    "scene_compare_village_item": (0x70D09E6, "4c8b47108b5b18"),
    "tag_get_gameplay_tag": (0x70D0A32, "33d2488bc8e8a4e8ffff"),
    "tag_tailcall_has_tag": (0x70D0A44, "4883c4205be9927e03fd"),
    "tag_positive_or_default": (0x70CF30A, "837b1400"),
    "has_tag_method": (0x41088E0, "48895c242057"),
}


def require(ok: object, code: str) -> None:
    if not ok:
        raise ValueError("DB01_NATIVE_AREA_ROUTING_" + code)


def digest(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def verify_source_hash(blob: bytes, expected: str, label: str) -> None:
    require(digest(blob) == expected, "SOURCE_SHA_" + label)


def pe_section_rva_bytes(blob: bytes, rva: int, length: int) -> bytes:
    """Read a PE RVA without assuming physical offset = virtual address."""
    require(len(blob) >= 512 and blob[:2] == b"MZ", "PE_DOS_HEADER")
    pe_offset = struct.unpack_from("<I", blob, 0x3C)[0]
    require(0x40 <= pe_offset <= len(blob) - 0x140 and
            blob[pe_offset:pe_offset + 4] == b"PE\x00\x00",
            "PE_SIGNATURE")
    section_count = struct.unpack_from("<H", blob, pe_offset + 6)[0]
    optional_size = struct.unpack_from("<H", blob, pe_offset + 20)[0]
    require(1 <= section_count <= 24 and
            optional_size >= 0x70 and
            struct.unpack_from("<H", blob, pe_offset + 24)[0] == 0x20B and
            struct.unpack_from("<Q", blob, pe_offset + 48)[0] ==
            0x180000000, "PE_64_IMAGE_LAYOUT")
    sections_offset = pe_offset + 24 + optional_size
    require(sections_offset + section_count * 40 <= len(blob),
            "PE_SECTION_TABLE_BOUNDS")
    require(0 <= rva and 0 < length <= 128, "PE_RVA_RANGE")
    for index in range(section_count):
        start = sections_offset + index * 40
        virtual_size, section_rva, raw_size, raw_start = struct.unpack_from(
            "<IIII", blob, start + 8)
        relative = rva - section_rva
        if 0 <= relative and relative + length <= min(virtual_size, raw_size):
            offset = raw_start + relative
            require(offset + length <= len(blob), "PE_SECTION_RAW_BOUNDS")
            return blob[offset:offset + length]
    raise ValueError("DB01_NATIVE_AREA_ROUTING_RVA_NOT_MAPPED")


def audit_instructions(
    blob: bytes,
    anchors: dict[str, tuple[int, str]] = INSTRUCTION_ANCHORS,
) -> int:
    require(bool(anchors), "NO_INSTRUCTION_ANCHORS")
    for name, (rva, hexbytes) in anchors.items():
        expected = bytes.fromhex(hexbytes)
        require(pe_section_rva_bytes(blob, rva, len(expected)) == expected,
                "INSTRUCTION_DRIFT_" + name)
    return len(anchors)


def audit_dump(text: str) -> dict[str, int]:
    rvas = {}
    for name, (rva, declaration) in METHODS.items():
        pattern = (
            r"// RVA: 0x" + format(rva, "X") +
            r" Offset: [^\n]*\n\s+" + re.escape(declaration))
        require(re.search(pattern, text) is not None,
                "IL2CPP_SIGNATURE_DRIFT_" + name)
        rvas[name] = rva
    required = [
        "public CollectionArea CollectionArea; // 0x10",
        "public int GameplayTagID; // 0x14",
        "public int VillageItemID; // 0x18",
        "private CollectionAreaConfig[] _collectionAreaConfigs; // 0x20",
        "private ItemLocationException[] _itemLocationExceptions; // 0x38",
        "public const CritterItemData.LocationTypeOneofCase Location = 6;",
        "public interface IHasTags //",
        "public abstract RepeatedField<int> Tags { get; }",
    ]
    require(all(marker in text for marker in required),
            "NATIVE_FIELDS_OR_CRITTER_DRIFT")
    require(text.count("public const CollectionArea Honeywood = 4097;") == 1,
            "HONEYWOOD_NATIVE_CODE_DRIFT")
    return rvas


def audit(gameassembly: Path, dump: Path) -> dict:
    for path in (gameassembly, dump):
        require(path.is_file() and not path.is_symlink(), "MISSING_SOURCE")
    binary = gameassembly.read_bytes()
    source = dump.read_bytes()
    verify_source_hash(binary, GAMEASSEMBLY_SHA256, "GAMEASSEMBLY")
    verify_source_hash(source, IL2CPP_DUMP_SHA256, "IL2CPP")
    rvas = audit_dump(source.decode("utf-8"))
    verified = audit_instructions(binary)
    return {
        "schema": SCHEMA, "platform": "Steam", "gameVersion": GAME_VERSION,
        "privateOnly": True, "publicationAuthorized": False,
        "gameAssemblySha256": GAMEASSEMBLY_SHA256,
        "il2cppDumpSha256": IL2CPP_DUMP_SHA256,
        "verifiedMethodRvas": {k: hex(v) for k, v in rvas.items()},
        "verifiedMachineInstructionAnchors": verified,
        "nativeRouteControlFlowVerified": True,
        "runtimeTagMembershipEvaluatorReconstructed": False,
        "fullItemToCollectionAreaMembershipVerified": False,
        "critterWorldStateSupplied": False,
        "purchaseFilteringReconstructed": False,
        "allAreaAvailabilityVerified": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gameassembly", type=Path, required=True)
    parser.add_argument("--il2cpp-dump", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.gameassembly, args.il2cpp_dump)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
