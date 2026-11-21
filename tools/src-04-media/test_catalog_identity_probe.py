"""Offline synthetic contract checks for exact Unity metadata identity linking."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from catalog_identity_probe import (
    exact_guid_from_key,
    normalize_container,
    ptr_id,
    resolve_guid_images,
)


class P:
    def __init__(self, path_id):
        self.path_id = path_id


class Entry:
    def __init__(self, key, asset):
        self.first = key
        self.second = type('Value', (), {'asset': asset})()


class MetadataTests(unittest.TestCase):
    def test_exact_guid_token_and_allowlist(self):
        good = 'a' * 32
        bad = 'b' * 32
        self.assertEqual(exact_guid_from_key('icons/guid:' + good + '.png', {good}), {good})
        self.assertEqual(exact_guid_from_key('X' + good + 'Y', {good}), set())
        self.assertEqual(exact_guid_from_key('guid:' + bad, {good}), set())

    def test_unwrap_unity_asset_info_pointer(self):
        rows = list(normalize_container(
            [Entry('guid:' + 'a' * 32, P(417))], owner='foo.assets'))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][2], 'foo.assets')
        self.assertEqual(ptr_id(rows[0][1]), 417)

    def test_no_guessed_path(self):
        rows = list(normalize_container({'Assets/guid:' + 'e' * 32: P(111)}))
        self.assertEqual(len(rows), 1)
        self.assertIsNone(ptr_id(object()))


class IdentityTests(unittest.TestCase):
    @staticmethod
    def row(kind, asset_id):
        return {'assetClass': kind, 'assetId': asset_id,
                'decodedSha256': 'a' * 64, 'variants': {},
                'sourceWidth': 128, 'sourceHeight': 128}

    def test_sprite_texture_pair_is_not_conflict(self):
        sprite = self.row('Sprite', 'asset:sprite:5')
        texture = self.row('Texture2D', 'asset:texture:7')
        result, reason = resolve_guid_images([texture, sprite])
        self.assertIsNone(reason)
        self.assertEqual(result['assetId'], sprite['assetId'])
        self.assertEqual(result['counterpartAssetId'], texture['assetId'])
        self.assertEqual(result['pointerObjectCount'], 2)

    def test_texture_only_is_valid(self):
        texture = self.row('Texture2D', 'asset:texture:7')
        result, reason = resolve_guid_images([texture])
        self.assertIsNone(reason)
        self.assertEqual(result['assetClass'], 'Texture2D')
        self.assertIsNone(result['counterpartAssetId'])

    def test_two_distinct_sprites_are_ambiguous(self):
        a = self.row('Sprite', 'asset:sprite:1')
        b = self.row('Sprite', 'asset:sprite:2')
        result, reason = resolve_guid_images([a, b])
        self.assertIsNone(result)
        self.assertEqual(reason, 'multiple_distinct_objects_of_same_class')

    def test_duplicate_pointer_is_not_conflict(self):
        a = self.row('Sprite', 'asset:sprite:1')
        result, reason = resolve_guid_images([a, a])
        self.assertIsNone(reason)
        self.assertEqual(result['pointerObjectCount'], 1)


if __name__ == '__main__':
    unittest.main()
