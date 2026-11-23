"""No original game binary required for CI: synthetic PE/RVA audit tests."""
import hashlib
import importlib.util
from pathlib import Path
import struct
import unittest

source = Path(__file__).with_name("audit_collection_area_native_routing.py")
spec = importlib.util.spec_from_file_location("db01_native_route_audit", source)
assert spec is not None and spec.loader is not None
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def make_pe() -> bytes:
    """Minimal valid PE32+ with one synthetic il2cpp section."""
    blob = bytearray(0x400 + 0x3000)
    blob[:2] = b"MZ"
    struct.pack_into("<I", blob, 0x3C, 0x80)
    blob[0x80:0x84] = b"PE\x00\x00"
    struct.pack_into("<H", blob, 0x86, 1)       # NumberOfSections
    struct.pack_into("<H", blob, 0x94, 0xF0)    # OptionalHeaderSize
    struct.pack_into("<H", blob, 0x98, 0x20B)   # PE32+
    struct.pack_into("<Q", blob, 0x80 + 48, 0x180000000)
    section = 0x80 + 24 + 0xF0
    blob[section:section + 8] = b"il2cpp\x00\x00"
    struct.pack_into("<IIII", blob, section + 8,
                     0x3000, 0x70D0000, 0x3000, 0x400)
    return bytes(blob)


def fake_dump() -> str:
    blocks = [
        f"// RVA: 0x{rva:X} Offset: 0x123 VA: 0x1800\n  {signature}"
        for rva, signature in audit.METHODS.values()
    ]
    blocks.extend([
        "public CollectionArea CollectionArea; // 0x10",
        "public int GameplayTagID; // 0x14",
        "public int VillageItemID; // 0x18",
        "private CollectionAreaConfig[] _collectionAreaConfigs; // 0x20",
        "private ItemLocationException[] _itemLocationExceptions; // 0x38",
        "public const CritterItemData.LocationTypeOneofCase Location = 6;",
        "public interface IHasTags //",
        "public abstract RepeatedField<int> Tags { get; }",
        "public const CollectionArea Honeywood = 4097;",
    ])
    return "\n".join(blocks)


class NativeAreaBinaryAuditTests(unittest.TestCase):
    def test_pe_rva_sections_map_to_correct_raw_offset(self):
        blob = bytearray(make_pe())
        off = 0x400 + 0x129
        blob[off:off + 5] = bytes.fromhex("e892000000")
        self.assertEqual(
            audit.pe_section_rva_bytes(bytes(blob), 0x70D0129, 5),
            bytes.fromhex("e892000000"))
        self.assertEqual(audit.audit_instructions(bytes(blob), {
            "native_call": (0x70D0129, "e892000000"),
        }), 1)

    def test_instruction_drift_fails_closed(self):
        b = make_pe()
        with self.assertRaisesRegex(ValueError, "INSTRUCTION_DRIFT"):
            audit.audit_instructions(b, {
                "wrong_branch": (0x70D0129, "e892000000"),
            })

    def test_absent_rva_or_corrupted_pe_header_fails(self):
        with self.assertRaisesRegex(ValueError, "RVA_NOT_MAPPED"):
            audit.pe_section_rva_bytes(make_pe(), 0x600000, 4)
        for corrupted in (b"not-pe", bytes(1024)):
            with self.assertRaises(ValueError):
                audit.pe_section_rva_bytes(corrupted, 0x70D0129, 4)

    def test_native_signatures_enums_and_field_offsets_required(self):
        rows = audit.audit_dump(fake_dump())
        self.assertEqual(rows["GetAreaConfigs"], 0x70D01C0)
        self.assertEqual(rows["TagPredicate"], 0x70D0A20)
        self.assertEqual(rows["HasTag"], 0x41088E0)
        for wrong, expected in [
            (fake_dump().replace("Location = 6", "Location = 7"),
             "NATIVE_FIELDS_OR_CRITTER_DRIFT"),
            (fake_dump().replace("GamePlayTag", "GamePlayTag"),
             ""),  # unchanged fixture sanity
        ][:1]:
            with self.assertRaisesRegex(ValueError, expected):
                audit.audit_dump(wrong)
        with self.assertRaisesRegex(ValueError,
                                    "IL2CPP_SIGNATURE_DRIFT_GetAreaTags"):
            audit.audit_dump(fake_dump().replace(
                "GetAreaTags(Item item", "GetAreaTags(int item"))
        with self.assertRaisesRegex(ValueError, "HONEYWOOD_NATIVE_CODE_DRIFT"):
            audit.audit_dump(fake_dump().replace("Honeywood = 4097",
                                                  "Honeywood = 6"))

    def test_original_source_hash_requires_exact_bytes(self):
        b = b"only-synthetic-source"
        digest = hashlib.sha256(b).hexdigest()
        audit.verify_source_hash(b, digest, "MOCK")
        with self.assertRaisesRegex(ValueError, "SOURCE_SHA_MOCK"):
            audit.verify_source_hash(b, hashlib.sha256(b"other").hexdigest(),
                                     "MOCK")


if __name__ == "__main__":
    unittest.main()
