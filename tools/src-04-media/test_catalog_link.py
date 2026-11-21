"""Synthetic contract checks: no game assets required."""
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from catalog_link import link, guid_buckets, read_guid_key


class CatalogLinkTests(unittest.TestCase):
    def fixture(self, root, key, internal, image_path):
        game = root / 'game'
        out = root / 'out'
        catalog = game / 'ddv_Data' / 'StreamingAssets' / 'aa'
        catalog.mkdir(parents=True)
        source = out / 'source-items'
        source.mkdir(parents=True)
        row = (json.dumps({'iconGuid': 'guid:' + key, 'itemId': 123456}) + '\n').encode()
        (source / 'items.jsonl').write_bytes(row)
        (source / 'manifest.json').write_text(json.dumps({
            'itemsSha256': hashlib.sha256(row).hexdigest()}))
        blobs = {
            'keyData': struct.pack('<I', 1) + b'\0' + struct.pack('<I', 32) + key.encode(),
            'bucketData': struct.pack('<Iiii', 1, 4, 1, 0),
            'entryData': struct.pack('<I7i', 1, 0, 0, -1, 0, 0, 0, 1),
            'InternalIds': (internal + '\r\n').encode()
        }
        for name, data in blobs.items():
            (catalog / ('catalog.' + name + '.bin')).write_bytes(data)
        checkpoints = out / 'bundles'
        checkpoints.mkdir()
        image = {'assetId': 'unity:one', 'decodedSha256': 'a' * 64, 'variants': {},
                 'containerPaths': [image_path], 'assetName': 'apple'}
        (checkpoints / 'complete.json').write_text(
            json.dumps({'complete': True, 'images': [image]}))
        return game, out

    def test_links_exact_internal_id(self):
        with tempfile.TemporaryDirectory() as folder:
            game, out = self.fixture(Path(folder), 'a' * 32,
                                     'Assets/icons/apple.png', 'Assets/icons/apple.png')
            report = link(game, out, strict=False)
            self.assertEqual(report['catalogGuidKeys'], 1)
            self.assertEqual(report['linkedItemCount'], 1)
            self.assertTrue(report['complete'])
            self.assertFalse(json.loads(
                (out / 'catalog-links-private.json').read_text())['publicationApproved'])

    def test_no_basename_guessing(self):
        with tempfile.TemporaryDirectory() as folder:
            game, out = self.fixture(Path(folder), 'b' * 32,
                                     'Assets/other/apple.png', 'Assets/icons/apple.png')
            report = link(game, out, strict=False)
            self.assertEqual(report['catalogGuidKeys'], 1)
            self.assertEqual(report['linkedItemCount'], 0)

    def test_refuses_corrupt_bucket_data(self):
        guid = 'e' * 32
        key = struct.pack('<I', 1) + b'\0' + struct.pack('<I', 32) + guid.encode()
        self.assertEqual(read_guid_key(key, 4), guid)
        buckets = struct.pack('<Iiii', 1, 4, 1, 0)
        mapping, _ = guid_buckets(key, buckets, {guid})
        self.assertEqual(mapping[guid], {0})
        with self.assertRaises(ValueError):
            guid_buckets(key, buckets + b'\x01', {guid})


if __name__ == '__main__':
    unittest.main()
