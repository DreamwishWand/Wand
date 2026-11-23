import json
import struct
import tempfile
import unittest
from pathlib import Path

from native_diffgrid_hash_discovery import (
    discover_native_diffgrid_hash_methods,
    resolve_selected_hash_method,
)
from native_method_pointers import resolve_native_grid_methods


def synthetic_metadata():
    strings = ["GridCollection", "Definitions.Grid", "GetHashCode",
               "ComputeDefaultGridDataHashCode", "get_Item",
               "String", "System", "Meta.Definitions.dll"]
    data = bytearray()
    names = {}
    for value in strings:
        names[value] = len(data)
        data.extend(value.encode() + b"\0")
    strings_offset = 256
    methods_offset = strings_offset + len(data)
    types_offset = methods_offset + 4 * 36
    images_offset = types_offset + 2 * 88
    raw = bytearray(images_offset + 40)
    struct.pack_into("<II", raw, 0, 0xfab11baf, 31)
    for index, start, size in [
        (6, strings_offset, len(data)),
        (12, methods_offset, 4 * 36),
        (40, types_offset, 2 * 88),
        (42, images_offset, 40)
    ]:
        struct.pack_into("<II", raw, index * 4, start, size)
    raw[strings_offset:methods_offset] = data
    for ix,(method,owner,params) in enumerate([
        ("GetHashCode",0,0),("ComputeDefaultGridDataHashCode",0,1),
        ("get_Item",0,2),("GetHashCode",1,0)]):
        off=methods_offset+ix*36
        struct.pack_into("<II", raw, off, names[method], owner)
        struct.pack_into("<I", raw, off+24, 0x06000001+ix)
        struct.pack_into("<HH", raw, off+32, 0xffff, params)
    for ix,(name,namespace,first,count) in enumerate([
        ("GridCollection","Definitions.Grid",0,3),
        ("String","System",3,1)
    ]):
        off=types_offset+ix*88
        struct.pack_into("<II", raw, off, names[name], names[namespace])
        struct.pack_into("<I", raw, off+36, first)
        struct.pack_into("<H", raw, off+64, count)
    struct.pack_into("<IIII", raw, images_offset,
                     names["Meta.Definitions.dll"],0,0,2)
    return raw


class OriginalDiffHashDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        root=Path(self.tmp.name)
        self.meta=root/"global-metadata.dat"
        self.version=root/"FullVersion.txt"
        self.meta.write_bytes(synthetic_metadata())
        self.version.write_text("releases_1.26ex-v1.26.2-test\n")
    def tearDown(self):
        self.tmp.cleanup()

    def test_exact_source_metadata_candidate_methods_not_algorithm_claim(self):
        value=discover_native_diffgrid_hash_methods(self.meta,self.version)
        self.assertEqual(value["candidateMethodCount"],2)
        self.assertEqual(value["sourceGameVersion"],"1.26.2")
        self.assertEqual(
            [c["methodName"] for c in value["candidates"]],
            ["ComputeDefaultGridDataHashCode","GetHashCode"])
        self.assertEqual(
            sorted(c["token"] for c in value["candidates"]),
            ["0x06000001","0x06000002"])
        self.assertEqual(value["metadataVersion"],31)
        self.assertFalse(value["originalMethodAlgorithmVerified"])
        self.assertFalse(value["nativeDefaultGridDataHashCodeComputed"])
        self.assertFalse(value["diffGridIdentityVerified"])
        self.assertTrue(all(not c["originalNativeBodyCorrelated"] for c
                            in value["candidates"]))
        self.assertEqual(json.loads(json.dumps(value))["schema"],
                         "wand.db04.native-diff-hash-method-discovery@1")

    def test_no_guess_when_metadata_version_or_tokens_invalid(self):
        wrong=bytearray(self.meta.read_bytes())
        struct.pack_into("<I", wrong, 4, 30)
        self.meta.write_bytes(wrong)
        with self.assertRaisesRegex(ValueError, "unsupported"):
            discover_native_diffgrid_hash_methods(self.meta,self.version)
        self.meta.write_bytes(synthetic_metadata())
        wrong=bytearray(self.meta.read_bytes())
        # MethodDeclaringType is corrupted for one apparent hash candidate.
        strings_len=len(self.meta.read_bytes())
        methods_offset=struct.unpack_from("<I",wrong,12*4)[0]
        struct.pack_into("<I",wrong,methods_offset+4,1)
        self.meta.write_bytes(wrong)
        with self.assertRaisesRegex(ValueError, "DECLARING_TYPE_MISMATCH"):
            discover_native_diffgrid_hash_methods(self.meta,self.version)

    def test_unknown_native_code_pointer_is_not_fabricated(self):
        found=discover_native_diffgrid_hash_methods(self.meta,self.version)
        with self.assertRaisesRegex(ValueError,"UNKNOWN_OR_AMBIGUOUS"):
            resolve_selected_hash_method(
                found,self.meta,self.meta,"0x06000004")
        with self.assertRaisesRegex(ValueError,"INVALID_CANDIDATE_TOKEN"):
            resolve_selected_hash_method(
                found,self.meta,self.meta,"0x01000001")
        # No test DLL was provided; never infer algorithm from metadata.
        self.assertTrue(all(c["methodHashSemanticsVerified"] is False
                            for c in found["candidates"]))

    def test_full_version_is_required_to_avoid_mixed_source_binaries(self):
        self.version.write_text("1.26.1 and 1.26.2")
        with self.assertRaisesRegex(ValueError,"AMBIGUOUS_GAME_VERSION"):
            discover_native_diffgrid_hash_methods(self.meta,self.version)


if __name__=="__main__":
    unittest.main()
