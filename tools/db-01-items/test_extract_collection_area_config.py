"""Synthetic regressions for exact UnityFS CollectionAreaConfig extraction."""
import hashlib
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

SOURCE = Path(__file__).with_name("extract_collection_area_config.py")
_spec = importlib.util.spec_from_file_location("db01_native_area_config", SOURCE)
assert _spec is not None and _spec.loader is not None
area = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(area)


TAGS = {
    2001200028: "IsDreamlightValley",
    2001200029: "IsEternityIsle",
    2001200030: "IsStorybookVale",
    2001200040: "IsWishBlossomMountains",
    2001200066: "isSeaOfSecrets",
    2001200067: "isHoneywood",
}
SCENES = {
    1540000000: "Village!Village04",
    1540000101: "Village!Expansion01",
    1540000119: "Village!Expansion02",
    1540000162: "Village!Expansion03",
    1540000209: "Village!Expansion04",
    1540000210: "Village!VillageWinnieDLC",
}
CONFIGS = [
    (1, 2001200028, 1540000000, "icon_menu_dreamlight"),
    (2, 2001200029, 1540000101, "icon_eternity_isle"),
    (3, 2001200030, 1540000119, "icon_map_travel_theBind"),
    (4, 2001200040, 1540000162, "icon_map_travel_dlc3_biome01"),
    (5, 2001200066, 1540000209, "icon_keepsake_sea"),
    (4097, 2001200067, 1540000210, "icon_map_travel_mini1_honeywood"),
    (0, 0, 0, "icon_map_castle"),
]


def unity_string(value: str, prefix: int) -> bytes:
    encoded = value.encode("ascii")
    result = struct.pack("<I", len(encoded)) + encoded
    return result + b"\x00" * ((-prefix - len(result)) % 4)


def fake_cab(
    records=CONFIGS, exceptions=(31700022, 31700021, 31700032,
                                31700033, 31600011)
) -> bytes:
    # The source record position is 4-byte aligned, like the original Unity CAB.
    buf = bytearray(b"ABCD1234")
    buf += struct.pack("<I", len(records))
    for code, tag, village, sprite in records:
        buf += struct.pack("<iii", code, tag, village)
        for value in ("0123456789abcdef0123456789abcdef", sprite,
                      area.SPRITE_TYPE):
            buf += unity_string(value, len(buf))
    buf += struct.pack("<I", len(exceptions))
    for item_id in exceptions:
        buf += struct.pack("<i", item_id)
    return bytes(buf)


def fake_il2cpp() -> bytes:
    lines = [
        "public class CollectionAreaConfig // TypeDefIndex: 1",
        "public CollectionArea CollectionArea; // 0x10",
        "public int GameplayTagID; // 0x14",
        "public int VillageItemID; // 0x18",
        "public class CollectionsUIConfig : MonoBehaviour",
        "private CollectionAreaConfig[] _collectionAreaConfigs; // 0x20",
        "private ItemLocationException[] _itemLocationExceptions; // 0x38",
        "public HashSet<Item> GetAreaTags(Item item, bool onlyPurchased = False)",
        "public IEnumerable<CollectionAreaConfig> GetAreaConfigs(Item item, bool onlyPurchased = False)",
    ]
    lines += [f"public const CollectionArea {name} = {code};"
              for code, name in area.AREA_NAMES.items()]
    return ("\n".join(lines) + "\n").encode("utf-8")


class OriginalAreaSourceTests(unittest.TestCase):
    def test_bounded_lz4_exact_literals_and_overlapping_copy(self):
        self.assertEqual(area.lz4_block(b"\x30abc", 3), b"abc")
        self.assertEqual(area.lz4_block(b"\x40abcd\x04\x00", 8),
                         b"abcdabcd")
        self.assertEqual(area.lz4_block(b"\x10a\x01\x00", 5),
                         b"aaaaa")

    def test_invalid_lz4_fails_closed(self):
        for src, limit in [
            (b"\x30ab", 3),          # truncated literal
            (b"\x10a\x00\x00", 5),  # zero match distance
            (b"\x10a\x02\x00", 5),  # out-of-range match distance
            (b"\x40abcd\x04", 8),   # truncated match
            (b"\x30abc", 4),        # expected size mismatch
        ]:
            with self.subTest(src=src, expected=limit):
                with self.assertRaises(ValueError):
                    area.lz4_block(src, limit)

    def test_all_current_serialized_area_tags_scenes_and_order(self):
        rows, exceptions = area.extract_serialized_config(
            fake_cab(), TAGS, SCENES)
        self.assertEqual(len(rows), 7)
        self.assertEqual([x["collectionArea"] for x in rows],
                         [1, 2, 3, 4, 5, 4097, 0])
        self.assertEqual([x["gameplayTagId"] for x in rows],
                         [x[1] for x in CONFIGS])
        self.assertEqual([x["villageItemId"] for x in rows],
                         [x[2] for x in CONFIGS])
        self.assertEqual(rows[4]["gameplayTagNativeKey"], "isSeaOfSecrets")
        self.assertEqual(rows[5]["enumName"], "Honeywood")
        self.assertEqual(rows[6]["gameplayTagNativeKey"], None)
        self.assertEqual(rows[6]["iconSubObject"], "icon_map_castle")
        self.assertEqual(exceptions, [
            31700022, 31700021, 31700032, 31700033, 31600011])

    def test_missing_tag_or_scene_cannot_be_inferred(self):
        for tags, scenes in [
            ({**TAGS, 2001200066: "WrongTag"}, SCENES),
            (TAGS, {k: v for k, v in SCENES.items() if k != 1540000209}),
        ]:
            with self.assertRaisesRegex(ValueError, "SOURCE_TAG_SCENE_RELATION"):
                area.extract_serialized_config(fake_cab(), tags, scenes)

    def test_ambiguous_array_and_changed_area_code_fail(self):
        cab = fake_cab()
        with self.assertRaisesRegex(ValueError, "AREA_CONFIG_ARRAY_AMBIGUOUS"):
            area.extract_serialized_config(cab + cab, TAGS, SCENES)
        swapped = list(CONFIGS)
        swapped[1] = (3, *swapped[1][1:])
        with self.assertRaisesRegex(ValueError, "AREA_CODE_ORDER_OR_SOURCE_ID"):
            area.extract_serialized_config(fake_cab(swapped), TAGS, SCENES)

    def test_changed_exception_count_fails(self):
        with self.assertRaisesRegex(
                ValueError, "LOCATION_EXCEPTION_OR_SOURCE_DRIFT"):
            area.extract_serialized_config(
                fake_cab(exceptions=(31700022,)), TAGS, SCENES)

    def test_original_native_field_and_enum_contract_are_pinned(self):
        area.verify_il2cpp(fake_il2cpp())
        with self.assertRaisesRegex(ValueError, "NATIVE_IL2CPP_FIELD_OR_SIGNATURE_DRIFT"):
            area.verify_il2cpp(
                fake_il2cpp().replace(b"GameplayTagID; // 0x14",
                                      b"GameplayTagID; // 0x1C"))
        with self.assertRaisesRegex(ValueError, "NATIVE_COLLECTION_AREA_ENUM_DRIFT"):
            area.verify_il2cpp(
                fake_il2cpp().replace(b"Honeywood = 4097",
                                      b"Honeywood = 6"))

    def test_original_source_sha_is_required(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "original.bin"
            target.write_bytes(b"correct bytes")
            expected = hashlib.sha256(b"correct bytes").hexdigest()
            self.assertEqual(area.read_exact(target, expected, "TEST"),
                             b"correct bytes")
            with self.assertRaisesRegex(ValueError, "SOURCE_SHA_MISMATCH_TEST"):
                area.read_exact(target, hashlib.sha256(b"wrong").hexdigest(),
                                "TEST")


if __name__ == "__main__":
    unittest.main()
