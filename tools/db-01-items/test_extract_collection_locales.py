"""Synthetic, public-data-free tests for current original Collection labels."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZIP_DEFLATED, ZipFile

from extract_collection_locales import extract, LOCALES, SCHEMA
from localize1262 import make_varint


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def locbin(rows: dict[str, str]) -> bytes:
    result = bytearray()
    for key, value in rows.items():
        entry = bytearray()
        for number, text in ((1, key), (2, value)):
            payload = text.encode("utf-8")
            entry += make_varint((number << 3) | 2)
            entry += make_varint(len(payload))
            entry += payload
        result += make_varint(10) + make_varint(len(entry)) + entry
    return bytes(result)


def zipped(path: Path, files: dict[str, bytes]) -> str:
    with ZipFile(path, "w", ZIP_DEFLATED) as z:
        for name, value in files.items():
            z.writestr(name, value)
    return digest(path.read_bytes())


def synthetic(folder: Path) -> tuple[Path, Path, str, dict[str, str]]:
    menu_path = folder / "menu.zip"
    locdb_dir = folder / "locale"
    locdb_dir.mkdir()
    menus = [{
        "setId": i + 2120000000,
        "setKey": "OriginalSet" + str(i),
        "collectionLabelKey": "CollectionSet.OriginalSet" + str(i) +
                              "_CollectionName",
        "gameUiVisibilityVerified": False,
    } for i in range(305)]
    source_bytes = (json.dumps(menus, sort_keys=True) + "\n").encode()
    manifest = {
        "schema": "wand.db01.collection-menu-direct@1",
        "platform": "Steam", "gameVersion": "1.26.2",
        "privateOnly": True, "publicationAuthorized": False,
        "collectionSetDefinitions": 305, "catalogDefinitions": 39067,
        "dynamicSelectorsUnresolved": 262,
        "sourceItemsSha256": "a" * 64,
        "sourceCollectionSetSha256": "b" * 64,
        "files": {"menus.json": {"sha256": digest(source_bytes),
                                 "bytes": len(source_bytes), "count": 305}},
    }
    menu_pin = zipped(menu_path, {
        "manifest.json": json.dumps(manifest).encode(),
        "menus.json": source_bytes,
        "direct-items.json": b"{}",
    })
    locale_pins = {}
    for locale, suffix in LOCALES.items():
        set_labels = {
            "OriginalSet" + str(i) + "_CollectionName":
                "{DoNotTranslate}hidden" if i == 304 else
                locale + "-set-" + str(i)
            for i in range(305)
        }
        collection = {
            **{"tab_title_" + str(i): locale + "-tab-" + str(i)
               for i in range(21)},
            **{"area_title_" + str(i): locale + "-area-" + str(i)
               for i in range(7)},
        }
        path = locdb_dir / ("LocDB_" + suffix + ".zip")
        locale_pins[locale] = zipped(path, {
            "CollectionSet.locbin": locbin(set_labels),
            "collection.locbin": locbin(collection),
        })
    return menu_path, locdb_dir, menu_pin, locale_pins


class CollectionLocaleExtractorTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.menu, self.locale_dir, self.menu_pin, self.pins = synthetic(self.base)

    def run_extraction(self, *, out: str = "out.json", **overrides):
        return extract(overrides.get("menu", self.menu),
                       overrides.get("locale_dir", self.locale_dir),
                       overrides.get("menu_pin", self.menu_pin),
                       overrides.get("pins", self.pins),
                       self.base / out)

    def test_all_eight_source_names_tabs_and_areas(self):
        status = self.run_extraction()
        result = json.loads((self.base / "out.json").read_text())
        self.assertEqual(result["schema"], SCHEMA)
        self.assertEqual(result["coverage"]["sourceLocalizedSetsAllEight"], 304)
        self.assertEqual(result["coverage"]["originalCollectionTabTitles"], 21)
        self.assertEqual(result["coverage"]["originalCollectionAreaTitles"], 7)
        self.assertEqual(len(result["sets"]), 305)
        self.assertEqual(result["sets"][0]["names"]["ja"], "ja-set-0")
        self.assertEqual(result["sets"][304]["names"]["ja"], None)
        self.assertEqual(result["tabTitles"][0]["names"]["en"], "en-tab-0")
        self.assertFalse(result["sourceSubmenuToUiTabMappingVerified"])
        self.assertFalse(result["actualCollectionUiMembershipVerified"])
        self.assertEqual(status["sha256"],
                         digest((self.base / "out.json").read_bytes()))
        self.assertEqual((self.base / "out.json").stat().st_mode & 0o777, 0o600)

    def test_duplicate_output_is_never_overwritten(self):
        self.run_extraction()
        with self.assertRaisesRegex(ValueError, "PRIVATE_NEW_OUTPUT"):
            self.run_extraction()
        self.assertEqual(json.loads((self.base / "out.json").read_text())
                         ["coverage"]["sourceLocalizedSetsAllEight"], 304)

    def test_missing_or_wrong_private_archive_pins_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "ZIP_SOURCE_SHA256_MISMATCH"):
            self.run_extraction(menu_pin="f" * 64)
        pins = dict(self.pins)
        pins["ja"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "ZIP_SOURCE_SHA256_MISMATCH"):
            self.run_extraction(pins=pins)
        pins.pop("ja")
        with self.assertRaisesRegex(ValueError, "EIGHT_INDEPENDENT_LOCALE_SHA_PINS"):
            self.run_extraction(pins=pins)
        self.assertFalse((self.base / "out.json").exists())

    def test_localization_key_missing_in_verified_zip_fails(self):
        path = self.locale_dir / "LocDB_ja.zip"
        with ZipFile(path) as z:
            data = z.read("collection.locbin")
        wrong = {
            "OriginalSet" + str(i) + "_CollectionName": "ja-" + str(i)
            for i in range(304)
        }
        pin = zipped(path, {"CollectionSet.locbin": locbin(wrong),
                            "collection.locbin": data})
        pins = dict(self.pins)
        pins["ja"] = pin
        with self.assertRaisesRegex(ValueError, "CURRENT_LOCALE_SET_KEYS"):
            self.run_extraction(pins=pins)

    def test_new_source_tab_keys_require_current_explicit_census(self):
        path = self.locale_dir / "LocDB_en-US.zip"
        with ZipFile(path) as z:
            data = z.read("CollectionSet.locbin")
        wrong = {
            **{"tab_title_" + str(i): "test" for i in range(20)},
            **{"area_title_" + str(i): "test" for i in range(7)},
        }
        pin = zipped(path, {"CollectionSet.locbin": data,
                            "collection.locbin": locbin(wrong)})
        pins = dict(self.pins)
        pins["en"] = pin
        with self.assertRaisesRegex(ValueError, "CURRENT_COLLECTION_TAB_AREA_NAMES"):
            self.run_extraction(pins=pins)


if __name__ == "__main__":
    unittest.main()
