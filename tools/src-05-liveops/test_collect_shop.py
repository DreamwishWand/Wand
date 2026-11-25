import json
import tempfile
import unittest
from pathlib import Path
from collect_shop import connect, ingest, catalog, export, parse, summary, inputs

def cache(key="Shop20260923", oid="Bundle_Test", quantity=2, locale="en-US", title="Example", active=True):
    offer = {"Id": oid, "Data": {"OnlineId": oid, "Title": title, "Language": locale,
             "Active": active, "Contents": [{"ItemId": 42, "Quantity": quantity, "Price": 12}],
             "Image": "guid:" + "a"*32, "ImageAdjustment": {"Scale": 0}}}
    s = {"OnlineId": key, "Language": locale, "Active": active, "StartDate": {"Date":"2026-09-23T13:00:00Z"},
         "Categories": [{"Title": "Featured", "Data": {"Featured": {"Stores": [
             {"Id": "ExampleStore", "Data": {"BundleContents": [offer]}}]}}}]}
    return json.dumps({"Data": {key: json.dumps(s)}}).encode()

class CollectorTest(unittest.TestCase):
    def test_incremental_and_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = connect(root / "catalog.sqlite")
            a = root / "stores.dat"
            a.write_bytes(cache())
            self.assertTrue(ingest(db, a, "1.25.0"))
            self.assertFalse(ingest(db, a, "1.25.0"))
            a.write_bytes(cache(key="Shop20260930", quantity=3))
            self.assertTrue(ingest(db, a, "1.25.0"))
            a.write_bytes(cache(key="Shop20261007", oid="Bundle_Other"))
            self.assertTrue(ingest(db, a))
            a.write_bytes(cache(key="Shop20260923", locale="ja", title="テスト"))
            self.assertTrue(ingest(db, a))
            c = catalog(db)
            self.assertEqual(c["summary"]["offers"], 2)
            self.assertEqual(c["summary"]["nativeRevisions"], 4)
            self.assertEqual(c["summary"]["snapshots"], 3)
            self.assertEqual(c["itemToOffers"], {"42": ["Bundle_Other", "Bundle_Test"]})
            self.assertEqual(len(c["offers"]["Bundle_Test"]), 3)
            self.assertEqual({r["nativeOffer"]["Data"]["Contents"][0]["Quantity"]
                              for r in c["offers"]["Bundle_Test"]}, {2, 3})
            self.assertTrue(all(not r["saleVerified"] and r["currentlyAvailable"] is None
                                for r in c["observations"]))
            self.assertFalse(c["historicalCompletenessVerified"])
            self.assertFalse(c["publicationAuthorized"])
            out = root / "catalog.json"
            export(db, out)
            self.assertEqual(json.loads(out.read_text(encoding="utf-8")), c)
            with self.assertRaises(FileExistsError):
                export(db, out)
            db.close()

    def test_invalid_cache_has_no_partial_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = connect(root / "catalog.sqlite")
            a = root / "stores.dat"
            a.write_bytes(cache(quantity=0))
            with self.assertRaises(ValueError):
                ingest(db, a)
            self.assertEqual(summary(db)["sources"], 0)
            a.write_bytes(cache(quantity=True))
            with self.assertRaises(ValueError):
                ingest(db, a)
            self.assertEqual(summary(db)["offers"], 0)
            db.close()

    def test_input_discovery_and_git_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "stores.dat.bak").write_bytes(cache())
            (root / "profile.json").write_text("{}")
            self.assertEqual(inputs([], [root]), [root / "stores.dat.bak"])
            (root / ".git").mkdir()
            with self.assertRaises(ValueError):
                connect(root / "catalog.sqlite")

    def test_duplicate_json_rejected(self):
        with self.assertRaises(ValueError):
            parse(b'{"Data":{},"Data":{}}')

if __name__ == "__main__":
    unittest.main()
