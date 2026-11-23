"""Synthetic PE32+/IL2CPP-v31 method-pointer resolver tests (NO game assets)."""
import json
import struct
import tempfile
import unittest
from pathlib import Path

from native_method_pointers import resolve_native_grid_methods
from native_pe_evidence import capture_native_pe, validate_private_report
from disassemble_native_pe import disassemble_private_windows

try:
    import capstone
except ImportError:
    capstone = None


class NativeMethodPointerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.dll = self.root / "GameAssembly.dll"
        self.metadata = self.root / "global-metadata.dat"
        (self.root / "FullVersion.txt").write_text(
            "releases_1.26ex-v1.26.2-test\n", encoding="utf-8")
        self._make_original_sources()

    def tearDown(self):
        self.temp.cleanup()

    def _make_original_sources(self):
        binary = bytearray(0x2500)
        binary[:2] = b"MZ"
        struct.pack_into("<I", binary, 0x3c, 0x80)
        binary[0x80:0x84] = b"PE\x00\x00"
        struct.pack_into("<HHIIIHH", binary, 0x84,
                         0x8664, 3, 0, 0, 0, 240, 0x2022)
        binary[0x98:0x9a] = b"\x0b\x02"
        struct.pack_into("<Q", binary, 0x98 + 24, 0x180000000)
        struct.pack_into("<II", binary, 0x98 + 112 + 3 * 8,
                         0x3000, 4 * 12)
        sections = (
            (b".text", 0x1000, 0x800, 0x400, 0x60000020),
            (b".rdata", 0x2000, 0x800, 0xc00, 0x40000040),
            (b".pdata", 0x3000, 0x800, 0x1400, 0x40000040),
        )
        for index, (name, va, size, offset, flags) in enumerate(sections):
            row = 0x98 + 240 + index * 40
            binary[row:row + len(name)] = name
            struct.pack_into("<IIII", binary, row + 8,
                             size, va, size, offset)
            struct.pack_into("<I", binary, row + 36, flags)
        # Independently specified native code and PE unwind entry ranges.
        for index, rva in enumerate((0x1020, 0x1060, 0x10a0, 0x10e0)):
            file_offset = 0x400 + rva - 0x1000
            binary[file_offset:file_offset + 64] = (
                b"\x90" * 63 + b"\xc3")
            struct.pack_into("<III", binary, 0x1400 + index * 12,
                             rva, rva + 64, 0x3020)
            struct.pack_into("<Q", binary, 0xd00 + index * 8,
                             0x180000000 + rva)
        module = b"Meta.Definitions.dll\x00"
        binary[0xc20:0xc20 + len(module)] = module
        struct.pack_into("<QQQ", binary, 0xc80,
                         0x180002020, 4, 0x180002100)
        self.dll.write_bytes(binary)

        # Minimal v31 metadata: one original type, one image, 4 methods.
        strings = [
            "GridData", "Definitions.Grid", "Meta.Definitions.dll",
            "get_Item", "set_Item",
            "Definitions.Util.IProtobufOnBinarize.OnBinarize",
            "GetNumberOfBitsPerPosition",
        ]
        raw_strings = b""
        names = {}
        for name in strings:
            names[name] = len(raw_strings)
            raw_strings += name.encode("utf-8") + b"\x00"
        strings_offset = 256
        methods_offset = strings_offset + len(raw_strings)
        types_offset = methods_offset + 4 * 36
        images_offset = types_offset + 88
        metadata = bytearray(images_offset + 40)
        struct.pack_into("<II", metadata, 0, 0xfab11baf, 31)
        for pair, (offset, length) in {
            6: (strings_offset, len(raw_strings)),
            12: (methods_offset, 4 * 36),
            40: (types_offset, 88),
            42: (images_offset, 40),
        }.items():
            struct.pack_into("<II", metadata, pair * 4, offset, length)
        metadata[strings_offset:methods_offset] = raw_strings
        methods = [
            ("get_Item", 2), ("set_Item", 3),
            ("Definitions.Util.IProtobufOnBinarize.OnBinarize", 0),
            ("GetNumberOfBitsPerPosition", 0),
        ]
        for index, (name, params) in enumerate(methods):
            off = methods_offset + index * 36
            struct.pack_into("<II", metadata, off, names[name], 0)
            struct.pack_into("<I", metadata, off + 24, 0x06000001 + index)
            struct.pack_into("<HH", metadata, off + 32, 0xffff, params)
        struct.pack_into("<II", metadata, types_offset,
                         names["GridData"], names["Definitions.Grid"])
        struct.pack_into("<I", metadata, types_offset + 36, 0)
        struct.pack_into("<H", metadata, types_offset + 64, 4)
        struct.pack_into("<IIII", metadata, images_offset,
                         names["Meta.Definitions.dll"], 0, 0, 1)
        self.metadata.write_bytes(metadata)

    def test_original_source_token_resolves_exact_native_method_starts(self):
        result = resolve_native_grid_methods(self.dll, self.metadata)
        self.assertEqual(result["metadataVersion"], 31)
        self.assertEqual(result["moduleName"], "Meta.Definitions.dll")
        self.assertEqual(result["moduleMethodPointerCount"], 4)
        self.assertEqual(len(result["methods"]), 4)
        self.assertEqual([m["tokenRid"] for m in result["methods"]],
                         [1, 2, 3, 4])
        self.assertEqual([m["rva"] for m in result["methods"]],
                         [0x1020, 0x1060, 0x10a0, 0x10e0])
        self.assertFalse(result["nativeCodeBodyVerified"])
        self.assertFalse(result["nativeMethodIdentityVerified"])

    def test_dump_independent_capture_and_provenance(self):
        result = capture_native_pe(
            self.root, metadata_file=self.metadata, window_bytes=64)
        self.assertEqual(
            result["status"], "original_metadata_v31_native_method_windows_captured")
        self.assertEqual(len(result["methodWindows"]), 4)
        self.assertEqual(result["methodWindows"][0]["fileOffset"], 0x420)
        self.assertEqual(result["methodWindows"][0]["tokenRid"], 1)
        self.assertEqual(result["methodWindows"][0]["rawWindowHex"][-2:], "c3")
        self.assertTrue(result["originalMethodTokenPointerCorroborated"])
        self.assertTrue(result["sourceRvaMappingVerified"])
        self.assertFalse(result["nativeCodeBodyVerified"])
        validate_private_report(result, game_version="1.26.2")

        altered = json.loads(json.dumps(result))
        altered["originalMetadataVersion"] = 29
        with self.assertRaisesRegex(ValueError, "metadata pointer evidence"):
            validate_private_report(altered)
        altered = json.loads(json.dumps(result))
        altered["methodWindows"][0]["tokenRid"] = 2
        with self.assertRaisesRegex(ValueError, "token-to-method"):
            validate_private_report(altered)

    def test_wrong_pe_pointer_or_metadata_identity_rejected(self):
        original = bytearray(self.dll.read_bytes())
        struct.pack_into("<Q", original, 0xd00 + 8,
                         0x180001070)  # interior of second .pdata function
        self.dll.write_bytes(original)
        with self.assertRaisesRegex(ValueError, "pointer table unavailable"):
            resolve_native_grid_methods(self.dll, self.metadata)
        self._make_original_sources()
        raw = bytearray(self.metadata.read_bytes())
        raw[4:8] = (29).to_bytes(4, "little")
        self.metadata.write_bytes(raw)
        with self.assertRaisesRegex(ValueError, "unsupported original"):
            resolve_native_grid_methods(self.dll, self.metadata)

    def test_explicit_metadata_signature_resolver_reuses_source_pdata(self):
        single = resolve_native_grid_methods(
            self.dll, self.metadata, namespace="Definitions.Grid",
            type_name="GridData",
            requested_methods=[("GetNumberOfBitsPerPosition", 0)])
        self.assertEqual(single["methods"][0]["rva"], 0x10e0)
        self.assertEqual(len(single["methods"]), 1)
        self.assertFalse(single["nativeMethodIdentityVerified"])
        self.assertFalse(single["nativeCodeBodyVerified"])
        with self.assertRaisesRegex(ValueError, "missing/overloaded"):
            resolve_native_grid_methods(
                self.dll, self.metadata, namespace="Definitions.Grid",
                type_name="GridData",
                requested_methods=[("GetHashCode", 0)])
        with self.assertRaisesRegex(ValueError, "duplicate"):
            resolve_native_grid_methods(
                self.dll, self.metadata,
                requested_methods=[("get_Item", 2), ("get_Item", 2)])

    @unittest.skipUnless(capstone is not None, "optional Capstone not installed")
    def test_metadata_token_captured_windows_can_be_disassembled(self):
        result = capture_native_pe(
            self.root, metadata_file=self.metadata, window_bytes=64)
        asm = disassemble_private_windows(result)
        self.assertEqual(len(asm["methodWindows"]), 4)
        self.assertEqual(asm["totalInstructions"], 256)
        self.assertEqual(
            asm["methodWindows"][0]["instructions"][-1]["mnemonic"], "ret")
        self.assertFalse(asm["nativeFunctionBoundaryVerified"])


if __name__ == "__main__":
    unittest.main()
