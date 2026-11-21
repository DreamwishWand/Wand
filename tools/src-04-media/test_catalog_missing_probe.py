"""Synthetic missing-GUID dependency location checks; no game files needed."""
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from catalog_missing_probe import parse_buckets, parse_key, require


def inspect_synthetic_catalog(buckets, key_data, entry_data, ids, missing):
    """Tiny model of the same exact GUID -> bucket -> dependency -> bundle walk."""
    refs = {}
    for offset, indices in parse_buckets(buckets):
        key = parse_key(key_data, offset)
        if key not in missing:
            continue
        dep = set()
        for idx in indices:
            record = struct.unpack_from('<7i', entry_data, 4 + 28 * idx)
            require(record[2] >= 0, 'BAD_DEPENDENCY_INDEX')
            dep.add(record[2])
        refs[key] = dep
    return refs


class MissingLocationTests(unittest.TestCase):
    def test_exact_guids_have_dependency_groups(self):
        guid_a, guid_b = 'a' * 32, 'b' * 32
        keys = [guid_a, guid_b, 'bundleRef']
        blob = bytearray(struct.pack('<I', len(keys)))
        offsets = []
        for key in keys:
            offsets.append(len(blob))
            blob.extend(b'\0' + struct.pack('<I', len(key)) + key.encode('ascii'))
        buckets = bytearray(struct.pack('<I', 3))
        for i, offset in enumerate(offsets):
            buckets.extend(struct.pack('<iii', offset, 1, i))
        entries = struct.pack('<I', 3) + b''.join(
            struct.pack('<7i', i, 0, 2, 0, 0, 0, 0) for i in range(3))
        refs = inspect_synthetic_catalog(buckets, blob, entries, [], {guid_a})
        self.assertEqual(refs, {guid_a:{2}})
        self.assertEqual(parse_key(blob, offsets[2]), 'bundleRef')

    def test_corrupt_bucket_table_rejected(self):
        with self.assertRaisesRegex(ValueError, 'BUCKET_TRUNCATED'):
            parse_buckets(struct.pack('<I', 1))

    def test_non_guid_keys_are_not_used_as_item_identity(self):
        key = b'Foo_' + b'a' * 32 + b'_Bar'
        blob = struct.pack('<I',1) + b'\0' + struct.pack('<I',len(key)) + key
        self.assertNotEqual(parse_key(blob, 4), 'a' * 32)


if __name__ == '__main__':
    unittest.main()
