"""Small synthetic regression tests; no private game bytes in GitHub."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name("extract_scope_evidence.py")
spec = importlib.util.spec_from_file_location("collection_scope_evidence", MODULE)
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


class NativeScopeEvidenceTests(unittest.TestCase):
    def test_framed_protobuf_reader(self):
        raw = bytes((8, 5, 18, 3)) + b"ABC"
        frame = scope._src01.encode_varint(12) + scope._src01.encode_varint(len(raw)) + raw
        self.assertEqual(list(scope.frames(frame)), [(12, raw)])
        self.assertEqual(list(scope.fields(raw)), [(1, 0, 5), (2, 2, b"ABC")])

    def test_truncated_and_duplicate_frames_fail_closed(self):
        with self.assertRaises(ValueError):
            list(scope.frames(bytes((1, 9, 8, 2))))
        raw = bytes((1, 1, 0, 1, 1, 0))
        with self.assertRaises(ValueError):
            list(scope.frames(raw))

    def test_packed_world_tags_must_resolve_entire_field(self):
        known = {2001200028, 2001200029, 2000500001}
        pack = b"".join(scope._src01.encode_varint(x) for x in (2001200028, 2000500001))
        self.assertEqual(scope.packed_tags(pack, known), [2001200028, 2000500001])
        self.assertEqual(scope.packed_tags(pack+b"\\x07", known), [])
        self.assertEqual(scope.packed_tags(b"guid:untrusted", known), [])

    def test_universe_set_identifier_uses_exact_native_prefix(self):
        self.assertEqual(scope.SET_NAME.match("01_Mickey!f_Mickey_Set04").groups(), ("Mickey", "Mickey"))
        self.assertEqual(scope.SET_NAME.match("52_Winnie!c_Winnie_Update24").groups(), ("Winnie", "Winnie"))
        self.assertIsNone(scope.SET_NAME.match("TouchOfMagic"))

    def test_original_hash_required(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "Tag.json").write_bytes(b"not original data")
            with self.assertRaisesRegex(ValueError, "SOURCE_SHA_MISMATCH_Tag"):
                scope.source_bytes(Path(directory), "Tag")

    def test_never_write_private_output_inside_repository(self):
        self.assertTrue(scope.PRIVATE_SCHEMA.endswith(".private@1"))
        self.assertEqual(sum(scope.EXPECTED.values()), 13202)
        self.assertEqual(len(scope.WORLD_TAGS), 6)


if __name__ == "__main__":
    unittest.main()
