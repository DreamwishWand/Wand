"""No prefix-only observation can be promoted to canonical whole-file evidence."""
import base64
import hashlib
import json
import tempfile
import unittest
import zlib
from pathlib import Path

import probe_prefix
import steam1262


def field(number, wire, value):
    tag = steam1262.encode_varint(number * 8 + wire)
    return tag + (steam1262.encode_varint(value) if wire == 0 else
                  steam1262.encode_varint(len(value)) + value)


def fixture():
    frames, samples = [], []
    for i in (1, 2, 3):
        content = field(1, 0, 123000000 + i) + field(2, 2, f'Object_{i}'.encode()) + \
                  field(3, 2, f'Custom.Object_{i}_DisplayName'.encode())
        frames.append(steam1262.encode_varint(i) + steam1262.encode_varint(len(content)) + content)
        samples.append({'frameKey': i, 'frameBytes': len(content),
                        'fieldProfile': {'fields': [{'field': 1, 'wire': 0, 'integer': 123000000 + i}]}})
    # first 3 complete, last frame truncated exactly at sample limit
    prefix = b''.join(frames)
    padded = prefix + steam1262.encode_varint(4) + steam1262.encode_varint(1000)
    padded += b'\x08' * (512 - len(padded))
    info = {'source': 'ddv_Data/StreamingAssets/itemlist/Custom.json',
            'status': 'binary_structure_probe', 'sha256': 'a' * 64,
            'size': 10000, 'headBase64': base64.b64encode(padded).decode(),
            'frameProbe': {'status': 'candidate_frame_model', 'frames': samples}}
    return padded, info


def loc_table():
    entries = []
    for i in (1, 2, 3):
        binary = field(1, 2, f'Object_{i}_DisplayName'.encode()) + \
                 field(2, 2, f'Official {i}'.encode())
        entries.append(field(1, 2, binary))
    raw = b''.join(entries)
    return {'bytes': len(raw), 'crc32': f'{zlib.crc32(raw) & 0xffffffff:08x}',
            'headBase64': base64.b64encode(raw).decode()}


class TestProbePrefix(unittest.TestCase):
    def test_partial_frame_observations_are_never_fully_verified(self):
        _, spec = fixture()
        rows, source = probe_prefix.source_prefix_records('Custom.json', spec, 512)
        self.assertEqual([row['itemId'] for row in rows], [123000001, 123000002, 123000003])
        self.assertEqual(source['completeFrames'], 3)
        self.assertFalse(source['sourceFullyVerified'])
        self.assertTrue(source['discardedPartialTailBytes'] > 0)
        self.assertTrue(all(row['sampleOnly'] for row in rows))
        self.assertTrue(all(row['source']['fullFileSha256ClaimUnverified'] for row in rows))
        self.assertEqual(source['probePrefixSha256'], hashlib.sha256(base64.b64decode(spec['headBase64'])).hexdigest())

    def test_complete_file_is_excluded(self):
        raw, spec = fixture()
        spec['size'] = len(raw)
        self.assertIsNone(probe_prefix.source_prefix_records('Custom.json', spec, 512))

    def test_mismatched_first_three_rejected(self):
        _, spec = fixture()
        spec['frameProbe']['frames'][0]['frameBytes'] -= 1
        with self.assertRaisesRegex(ValueError, 'PREFIX_SAMPLE_MISMATCH'):
            probe_prefix.source_prefix_records('Custom.json', spec, 512)

    def test_invalid_truncated_source_capture_rejected(self):
        _, spec = fixture()
        spec['headBase64'] = base64.b64encode(b'123').decode()
        with self.assertRaisesRegex(ValueError, 'INVALID_PREFIX_CAPTURE'):
            probe_prefix.source_prefix_records('Custom.json', spec, 512)

    def test_complete_localization_crc_and_exact_key_only(self):
        _, spec = fixture()
        rows, _ = probe_prefix.source_prefix_records('Custom.json', spec, 512)
        loc = loc_table()
        probe = {'localization': {'en': {'source': 'ddv_Data/StreamingAssets/Localization/LocDB_en-US.zip',
                 'sha256': 'b' * 64, 'members': {'Custom': loc}}}}
        counts, evidence = probe_prefix.join_complete_localization(probe, {'Custom': rows})
        self.assertEqual(counts['en'], 3)
        self.assertEqual(rows[0]['names']['en'], 'Official 1')
        self.assertEqual(rows[0]['names']['ja'], None)
        self.assertTrue(evidence['en']['members']['Custom']['memberSha256'])
        probe['localization']['en']['members']['Custom']['crc32'] = 'c' * 8
        with self.assertRaisesRegex(ValueError, 'LOCALIZATION_MEMBER_CRC_MISMATCH'):
            probe_prefix.join_complete_localization(probe, {'Custom': rows})

    def test_placeholder_locdb_values_not_promoted_to_display_names(self):
        _, spec = fixture()
        rows, _ = probe_prefix.source_prefix_records('Custom.json', spec, 512)
        old = loc_table()
        raw = b''.join(field(1, 2, field(1, 2, f'Object_{i}_DisplayName'.encode()) +
                       field(2, 2, ('{LegacyPlaceholder}not UI' if i == 1 else f'Official {i}').encode()))
                       for i in (1, 2, 3))
        old['bytes'] = len(raw)
        old['crc32'] = f'{zlib.crc32(raw) & 0xffffffff:08x}'
        old['headBase64'] = base64.b64encode(raw).decode()
        probe = {'localization': {'ja': {'source': 'ddv_Data/StreamingAssets/Localization/LocDB_ja.zip',
                 'sha256': 'b' * 64, 'members': {'Custom': old}}}}
        counts, _ = probe_prefix.join_complete_localization(probe, {'Custom': rows})
        self.assertEqual(counts['ja'], 2)
        self.assertIsNone(rows[0]['names']['ja'])
        self.assertEqual(rows[0]['locdbNonDisplayValues']['ja'], '{LegacyPlaceholder}not UI')
        self.assertEqual(rows[1]['names']['ja'], 'Official 2')

    def test_build_reports_private_sample_only_dataset(self):
        _, spec = fixture()
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            probe = {'schema': 'wand.src01.format-probe@1', 'platform': 'Steam',
                     'gameVersion': '1.26.2', 'sampleBytesPerEntry': 512,
                     'itemlistCandidates': {'Custom.json': spec,
                       'Empty.json': {'source': 'ddv_Data/StreamingAssets/itemlist/Empty.json',
                                      'size': 0, 'sha256': hashlib.sha256(b'').hexdigest(),
                                      'headBase64': '', 'status': 'empty'}},
                     'localization': {}}
            (root / 'probe.json').write_text(json.dumps(probe))
            result = probe_prefix.build(root / 'probe.json', root / 'out')
            self.assertEqual(result['sampleOnlyCount'], 3)
            manifest = json.loads((root / 'out/manifest.json').read_text())
            self.assertFalse(manifest['mergeIntoCanonicalPermitted'])
            self.assertEqual(manifest['fullSourcesExcluded'], ['Empty.json'])
            self.assertEqual(manifest['status'], 'SOURCE_PREFIX_SAMPLES_ONLY_NOT_CANONICAL')


if __name__ == '__main__':
    unittest.main()