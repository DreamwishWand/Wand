import hashlib
import json
import tempfile
import unittest
from pathlib import Path
import importlib.util

spec = importlib.util.spec_from_file_location("db01_build", Path(__file__).with_name("build.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def make_fixture(root):
    native, reference, out = (root / x for x in ("native", "catalog", "out"))
    native.mkdir()
    reference.mkdir()
    old_names = ["Old Amethyst"] * 8
    rows = [[30000031, 0, 0, 0, [0], [0], [0], old_names],
            [10000001, 0, 0, 0, [0], [0], [0], ["Old-only"] * 8]]
    data = {"s": "wand.collection.records@1", "offset": 0, "count": 2, "r": rows}
    blob = json.dumps(data, ensure_ascii=False).encode()
    (reference / "records-00.json").write_bytes(blob)
    ref_index = {"s": "wand.collection.runtime@1", "l": list(module.REFERENCE_LOCALES),
                 "t": {"platform": "Nintendo Switch", "gameVersion": "1.25.0", "buildID": "test"},
                 "f": ["Gems"], "c": ["TRACKED"], "m": ["QUANTITY_STOCK"],
                 "w": ["Valley"], "u": ["Base"], "e": ["Base"], "n": 2,
                 "shards": [{"file": "records-00.json", "count": 2, "offset": 0,
                             "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest()}]}
    write_json(reference / "index.json", ref_index)
    def new_row(item_id, category, name):
        file = f"ddv_Data/StreamingAssets/itemlist/{category}.json"
        return {"itemId": item_id, "nativeCategory": category, "rawNameField": name,
                "iconGuid": "guid:" + "a" * 32, "names": dict.fromkeys(module.LOCALES),
                "source": {"platform": "Steam", "gameVersion": "1.26.2", "file": file}}
    items = [new_row(30000031, "ActivityItem", "Amethyst"),
             new_row(40000001, "Furniture", "Chair")]
    source_files = [{"path": r["source"]["file"], "sha256": "a" * 64} for r in items]
    module.save_jsonl(native / "items.jsonl", items)
    write_json(native / "manifest.json", {"schema": "wand.src01.steam-native@1",
                "platform": "Steam", "gameVersion": "1.26.2", "status": "partial_native_extraction",
                "itemCount": 2, "itemsSha256": module.digest(native / "items.jsonl"),
                "sourceFiles": source_files})
    return native, reference, out


class TestDb01(unittest.TestCase):
    def test_build_diff_and_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            native, old, out = make_fixture(Path(tmp))
            result = module.build(native, old, out)
            self.assertEqual(result["status"], "built")
            self.assertEqual((result["currentDefinitions"], result["oldNotObserved"], result["newOnly"]), (2, 1, 1))
            self.assertEqual(module.build(native, old, out)["status"], "unchanged")
            diff = module.read_json(out / "diff.json")
            self.assertIsNone(diff["removedIds"])
            self.assertEqual(diff["oldNotObservedIds"], [10000001])
            rows = list(module.json_lines(out / "items.jsonl"))
            self.assertEqual(rows[0]["historicalReference"]["category"], "Gems")
            self.assertIsNone(rows[0]["category"])
            self.assertIsNone(rows[0]["worlds"])
            self.assertEqual(rows[0]["source"]["platform"], "Steam")
            (out / "diff.json").write_text("{}")
            self.assertEqual(module.build(native, old, out)["status"], "built")

    def test_unlocalized_native_names_must_remain_null(self):
        with tempfile.TemporaryDirectory() as tmp:
            native, old, out = make_fixture(Path(tmp))
            rows = list(module.json_lines(native / "items.jsonl"))
            rows[0]["names"]["en"] = "Unverified invented label"
            module.save_jsonl(native / "items.jsonl", rows)
            manifest = module.read_json(native / "manifest.json")
            manifest["itemsSha256"] = module.digest(native / "items.jsonl")
            write_json(native / "manifest.json", manifest)
            with self.assertRaisesRegex(ValueError, "UNTRUSTED_NATIVE_ROW"):
                module.build(native, old, out)

    def test_localized_names_require_exact_archive_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            native, old, out = make_fixture(Path(tmp))
            rows = list(module.json_lines(native / "items.jsonl"))
            for row in rows:
                row["localizationKey"] = row["rawNameField"] + "_DisplayName"
            rows[0]["names"]["ja"] = "アメジスト"
            module.save_jsonl(native / "items-localized.jsonl", rows)
            manifest = {"schema": "wand.src01.localized-names@1", "gameVersion": "1.26.2",
                        "platform": "Steam", "sourceItemSha256": module.digest(native / "items.jsonl"),
                        "itemsSha256": module.digest(native / "items-localized.jsonl"),
                        "localizedAtLeastOneCount": 1, "localizedAllEightCount": 0,
                        "localizationEvidence": {}}
            write_json(native / "localization-manifest.json", manifest)
            with self.assertRaisesRegex(ValueError, "LOCALIZATION_EVIDENCE_MISSING"):
                module.build(native, old, out)
            manifest["localizationEvidence"] = {
                "ja": {"archive": "LocDB_ja.zip", "sha256": "a" * 64,
                       "categories": {"ActivityItem": {"entry": "ActivityItem.locbin",
                                                    "entrySha256": "b" * 64}}}}
            write_json(native / "localization-manifest.json", manifest)
            self.assertEqual(module.build(native, old, out)["status"], "built")
            normalized = list(module.json_lines(out / "items.jsonl"))
            self.assertEqual(normalized[0]["verification"]["names"]["ja"], "exact_locdb_join")
            self.assertEqual(module.build(native, old, out)["status"], "unchanged")
            manifest["localizationEvidence"]["ja"]["categories"]["ActivityItem"]["entrySha256"] = "c" * 64
            write_json(native / "localization-manifest.json", manifest)
            self.assertEqual(module.build(native, old, out)["status"], "built")

    def test_extended_provenance_and_unverified_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            native, old, out = make_fixture(Path(tmp))
            ext = Path(tmp) / "extended"
            ext.mkdir()
            sha = "c" * 64
            row = {"itemId": 110000001, "nativeCategory": "Tool", "rawNameField": "Shovel",
                   "localizationKey": "Tool.Shovel_DisplayName",
                   "names": dict.fromkeys(module.LOCALES), "iconGuid": None,
                   "imageGuidField4Candidate": "guid:" + "e" * 32,
                   "source": {"platform": "Steam", "gameVersion": "1.26.2",
                              "file": "ddv_Data/StreamingAssets/itemlist/Tool.json", "sha256": sha}}
            module.save_jsonl(ext / "definitions.jsonl", [row])
            meta = {"schema": "wand.src01.extended@1", "gameVersion": "1.26.2",
                    "platform": "Steam", "definitionCount": 1, "probeSha256": "b" * 64,
                    "itemsSha256": module.digest(ext / "definitions.jsonl"),
                    "categories": {"Tool.json": {"count": 1, "status": "native_wire_verified",
                         "sha256": sha, "source": "ddv_Data/StreamingAssets/itemlist/Tool.json"}},
                    "localizationEvidence": {}, "unresolvedCategories": ["Building"]}
            write_json(ext / "manifest.json", meta)
            self.assertEqual(module.build(native, old, out, ext)["additionalDefinitionRecords"], 1)
            extra = list(module.json_lines(out / "items.jsonl"))[-1]
            self.assertEqual(extra["catalogDomain"], "definition_unclassified")
            self.assertIsNone(extra["image"]["iconGuid"])
            row["names"]["en"] = "Shovel"
            module.save_jsonl(ext / "definitions.jsonl", [row])
            meta["itemsSha256"] = module.digest(ext / "definitions.jsonl")
            write_json(ext / "manifest.json", meta)
            with self.assertRaisesRegex(ValueError, "LOCALIZATION_EVIDENCE_MISSING"):
                module.build(native, old, out, ext)
            meta["localizationEvidence"] = {"en": {"archive": "LocDB_en-US.zip",
                "sha256": "d" * 64, "members": {"Tool": {"entry": "Tool.locbin",
                                                        "entrySha256": "e" * 64}}}}
            write_json(ext / "manifest.json", meta)
            self.assertEqual(module.build(native, old, out, ext)["additionalDefinitionRecords"], 1)
            row["source"]["sha256"] = "f" * 64
            module.save_jsonl(ext / "definitions.jsonl", [row])
            meta["itemsSha256"] = module.digest(ext / "definitions.jsonl")
            write_json(ext / "manifest.json", meta)
            with self.assertRaisesRegex(ValueError, "UNTRUSTED_EXTENDED_ROW"):
                module.build(native, old, out, ext)

    def test_non_display_locale_marker_refused_even_with_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            native, old, out = make_fixture(Path(tmp))
            rows = list(module.json_lines(native / 'items.jsonl'))
            for row in rows:
                row['localizationKey'] = row['rawNameField'] + '_DisplayName'
            rows[0]['names']['ja'] = '{DoNotTranslate}not a display name'
            module.save_jsonl(native / 'items-localized.jsonl', rows)
            manifest = {'schema': 'wand.src01.localized-names@1', 'gameVersion': '1.26.2',
                'platform': 'Steam', 'sourceItemSha256': module.digest(native / 'items.jsonl'),
                'itemsSha256': module.digest(native / 'items-localized.jsonl'),
                'localizedAtLeastOneCount': 1, 'localizedAllEightCount': 0,
                'localizationEvidence': {'ja': {'archive': 'LocDB_ja.zip',
                    'sha256': 'a'*64, 'categories': {'ActivityItem': {
                        'entry': 'ActivityItem.locbin', 'entrySha256': 'b'*64}}}}}
            write_json(native / 'localization-manifest.json', manifest)
            with self.assertRaisesRegex(ValueError, 'LOCALIZATION_ROW_MISMATCH'):
                module.build(native, old, out)

    def test_tampered_shard_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            native, old, out = make_fixture(Path(tmp))
            (old / "records-00.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "HASH_MISMATCH"):
                module.build(native, old, out)

    def test_tampered_native_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            native, old, out = make_fixture(Path(tmp))
            with (native / "items.jsonl").open("a") as stream:
                stream.write('{"itemId":900}\n')
            with self.assertRaisesRegex(ValueError, "MODIFIED_NATIVE"):
                module.build(native, old, out)

    def test_duplicate_native_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            native, old, out = make_fixture(Path(tmp))
            rows = list(module.json_lines(native / "items.jsonl"))
            module.save_jsonl(native / "items.jsonl", rows + [rows[0]])
            meta = module.read_json(native / "manifest.json")
            meta["itemsSha256"] = module.digest(native / "items.jsonl")
            meta["itemCount"] = 3
            write_json(native / "manifest.json", meta)
            with self.assertRaisesRegex(ValueError, "DUPLICATE_ITEM_ID"):
                module.build(native, old, out)


if __name__ == "__main__":
    unittest.main()