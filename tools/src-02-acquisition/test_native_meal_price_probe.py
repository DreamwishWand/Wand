#!/usr/bin/env python3
"""Synthetic-only CI tests for the read-only DB02 IL2CPP PE/RVA probe."""
import hashlib
import io
from pathlib import Path
import struct
import tempfile
import unittest

import native_meal_price_probe as probe


def synthetic_dump():
    """Never copy proprietary metadata into public test fixtures."""
    parts = []
    owners = []
    for owner, method in probe.TARGETS:
        if owner not in owners:
            parts += [
                "// Namespace: Synthetic.Price",
                "public class " + owner + " // TypeDefIndex: 42",
                "{",
            ]
            owners.append(owner)
        index = len([x for x in parts if x.startswith("// RVA")]) + 1
        rva = 0x2000 + 0x100 * index
        parts += [
            "// RVA: " + hex(rva) + " Offset: " + hex(rva - 0x200) +
            " VA: " + hex(0x180000000 + rva),
            "public int " + method + "(int x) { }",
        ]
    return "\n".join(parts) + "\n"


def synthetic_pe(executable=True, pe64=True):
    """Small hand-constructed PE64 header; contains no real game code."""
    data = bytearray(4096)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 0x3C, 0x80)
    data[0x80:0x84] = b"PE\x00\x00"
    struct.pack_into("<HHIIIHH", data, 0x84,
                     probe.MACHINE_AMD64, 1, 0, 0, 0, 0xF0, 0)
    opt = 0x98
    struct.pack_into("<H", data, opt, probe.PE32_PLUS if pe64 else 0x10B)
    struct.pack_into("<Q", data, opt + 24, 0x180000000)
    struct.pack_into("<I", data, opt + 56, 0x3000)
    sec = opt + 0xF0
    data[sec:sec+8] = b".text\x00\x00\x00"
    struct.pack_into("<IIII", data, sec+8,
                     0x400, 0x1000, 0x400, 0x400)
    struct.pack_into("<I", data, sec+36,
                     0x60000020 if executable else 0x40000040)
    data[0x410:0x420] = b"\x90" * 16
    return bytes(data)


class NativeMealPriceProbeTests(unittest.TestCase):
    def test_synthetic_dump_owner_qualified_targets(self):
        targets = probe.extract_target_methods(synthetic_dump())
        self.assertEqual(len(targets), len(probe.TARGETS))
        self.assertEqual(targets[0]["name"],
                         "ItemPriceDatabases.GetSoftCurrencySellPrice")
        self.assertEqual(targets[-1]["name"],
                         "MealItemData.<>c.<GetSellPrice>b__146_1")
        self.assertTrue(all(x["rva"] > 0 for x in targets))
        self.assertNotIn("methodBody", targets[0])

    def test_target_incomplete_and_rva_pin_failure(self):
        text = synthetic_dump()
        with self.assertRaisesRegex(ValueError, "TARGET_METHODS_INCOMPLETE"):
            probe.extract_target_methods(text.split("// RVA", 1)[0])
        with self.assertRaisesRegex(ValueError, "PINNED_RVA_MISMATCH"):
            probe.extract_target_methods(text, probe.EXPECTED_1261_RVAS)

    def test_source_is_sha_pinned_and_version_label_is_explicit(self):
        with tempfile.TemporaryDirectory() as td:
            filename = Path(td) / "synthetic_dump.cs"
            filename.write_text(synthetic_dump(), encoding="utf-8")
            actual = hashlib.sha256(filename.read_bytes()).hexdigest()
            result = probe.source_method_plan(filename, "1.26.2", actual)
            self.assertEqual(result["targetMethodCount"], 13)
            self.assertFalse(result["metadataContainsExecutableBodies"])
            self.assertFalse(result["actualPriceFormulaVerified"])
            with self.assertRaisesRegex(ValueError, "NEW_DUMP_REQUIRES_OWNER_SHA"):
                probe.source_method_plan(filename, "1.26.2", None)
            with self.assertRaisesRegex(ValueError, "DUMP_SHA_MISMATCH"):
                probe.source_method_plan(filename, "1.26.2", "0"*64)
            with self.assertRaisesRegex(ValueError, "DUMP_SHA_MISMATCH"):
                probe.source_method_plan(filename, "1.26.1", None)
            with self.assertRaisesRegex(ValueError, "UNSUPPORTED_DUMP_VERSION"):
                probe.source_method_plan(filename, "1.27.0", actual)

    def test_amd64_pe_rva_maps_to_executable_section_only(self):
        content = synthetic_pe()
        image_base, image_size, sections = probe.parse_pe_headers(
            io.BytesIO(content), len(content))
        self.assertEqual(image_base, 0x180000000)
        self.assertEqual(image_size, 0x3000)
        self.assertEqual(probe.map_executable_rva(0x1010, sections,
                         len(content), 16), (0x410, ".text"))
        with self.assertRaisesRegex(ValueError, "RVA_UNMAPPED_OR_AMBIGUOUS"):
            probe.map_executable_rva(0x2FFF, sections, len(content), 16)
        with self.assertRaisesRegex(ValueError, "RVA_OUTSIDE_RAW_CODE"):
            probe.map_executable_rva(0x13FF, sections, len(content), 256)
        with self.assertRaisesRegex(ValueError, "NONEXECUTABLE_METHOD_RVA"):
            probe.map_executable_rva(
                0x1010, probe.parse_pe_headers(
                    io.BytesIO(synthetic_pe(executable=False)),
                    len(content))[2], len(content), 16)

    def test_malformed_pe_is_never_accepted_as_code(self):
        src = bytearray(synthetic_pe())
        src[0:2] = b"NO"
        with self.assertRaisesRegex(ValueError, "PE_DOS_MAGIC"):
            probe.parse_pe_headers(io.BytesIO(src), len(src))
        with self.assertRaisesRegex(ValueError, "PE_NOT_64_BIT"):
            probe.parse_pe_headers(io.BytesIO(synthetic_pe(pe64=False)),
                                   len(src))

    def test_cross_version_dll_rejected_before_access(self):
        plan = {"dumpVersionClaim": "1.26.1", "methods": []}
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaisesRegex(ValueError, "CROSS_VERSION_RVA_FORBIDDEN"):
                probe.probe_dll(plan, Path(td)/"missing.dll", "1.26.2",
                                "0"*64, Path(td))

    def test_public_checkout_output_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / ".git").mkdir()
            (root / "nested").mkdir()
            with self.assertRaisesRegex(ValueError,
                                        "PUBLIC_GIT_CHECKOUT_OUTPUT_FORBIDDEN"):
                probe.private_output_dir(root / "nested")


if __name__ == "__main__":
    unittest.main()
