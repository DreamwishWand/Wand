import base64
import hashlib
import json
import tempfile
import unittest
import zlib
from pathlib import Path

import probe_locprefix
import steam1262


def field(index, content):
    return steam1262.encode_varint(index * 8 + 2) + steam1262.encode_varint(len(content)) + content


def entry(key, value):
    return field(1, field(1, key.encode('utf-8')) + field(2, value.encode('utf-8')))


class TestLocalePrefix(unittest.TestCase):
    def test_partial_locbin_entries_exclude_cutoff_frame(self):
        full = entry('Apple_DisplayName', 'Apple') + entry('Pear_DisplayName', 'Pear')
        prefix = full + field(1, b'longer incomplete')[:4]
        observed, used = probe_locprefix.entries_in_locbin_prefix(prefix)
        self.assertEqual(observed, {'Apple_DisplayName': 'Apple', 'Pear_DisplayName': 'Pear'})
        self.assertEqual(used, len(full))

    def test_duplicate_keys_rejected(self):
        data = entry('Apple_DisplayName', 'Apple') * 2
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_LOCALIZATION_PREFIX_KEY'):
            probe_locprefix.entries_in_locbin_prefix(data)

    def test_full_member_crc_matters(self):
        raw = entry('Apple_DisplayName', 'Apple')
        meta = {'bytes': len(raw), 'headBase64': base64.b64encode(raw).decode(),
                'crc32': f'{zlib.crc32(raw) & 0xffffffff:08x}'}
        values, evidence = probe_locprefix.member_prefix_spec(meta, 512, 'en', 'ActivityItem')
        self.assertEqual(values['Apple_DisplayName'], 'Apple')
        self.assertTrue(evidence['memberCrcVerified'])
        meta['crc32'] = 'badbadba'
        with self.assertRaisesRegex(ValueError, 'COMPLETE_MEMBER_CRC_MISMATCH'):
            probe_locprefix.member_prefix_spec(meta, 512, 'en', 'ActivityItem')

    def test_truncated_member_never_promoted_to_crc_verified(self):
        raw = entry('Apple_DisplayName', 'Apple')
        raw += field(1, b'oversized entry' * 60)[:512-len(raw)]
        self.assertEqual(len(raw), 512)
        meta = {'bytes': 1024, 'headBase64': base64.b64encode(raw).decode(),
                'crc32': 'b' * 8}
        values, evidence = probe_locprefix.member_prefix_spec(meta, 512, 'ja', 'ActivityItem')
        self.assertEqual(values, {'Apple_DisplayName': 'Apple'})
        self.assertFalse(evidence['memberCrcVerified'])
        self.assertEqual(evidence['verification'], 'prefix_observation_only')

    def test_partial_member_size_mismatch_rejected(self):
        raw = entry('Apple_DisplayName', 'Apple')
        meta = {'bytes': 1024, 'headBase64': base64.b64encode(raw).decode(),
                'crc32': 'a'*8}
        with self.assertRaisesRegex(ValueError, 'INCONSISTENT_MEMBER_PREFIX_SIZE'):
            probe_locprefix.member_prefix_spec(meta, 512, 'en', 'ActivityItem')

    def test_output_overlap_prohibited(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)
            (path / 'probe.json').write_text('{}')
            (path / 'native').mkdir()
            with self.assertRaisesRegex(ValueError, 'OUTPUT_OVERLAPS_INPUT'):
                probe_locprefix.build(path / 'probe.json', path / 'native', path / 'native' / 'out')


if __name__ == '__main__':
    unittest.main()