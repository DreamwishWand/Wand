"""Synthetic-only coverage for the owner-private native source index crosscheck."""
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location(
    "native_catalog_crosscheck",HERE/"native_catalog_crosscheck.py"
)
native=importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def stable_bytes(value):
    return json.dumps(value,ensure_ascii=False,separators=(",",":")).encode("utf-8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def synthetic_archive(dest, corrupt=None):
    entries={
        "ActivityItem":[(321001,"item"),(321002,"item")],
        "Furniture":[(400111,"item"),(400222,"item")],
        "DutyAch":[(211010,"definition_unclassified")],
        "Mission":[(207010,"definition_unclassified")],
        "Scene":[(154010,"definition_unclassified")],
    }
    categories=list(entries)
    source_files={}
    shard_manifest={
        "definitions":sum(len(x) for x in entries.values()),
        "categories":categories,"files":{}
    }
    data={}
    for category, records in entries.items():
        source_file="ddv_Data/StreamingAssets/itemlist/"+category+".json"
        source_sha=sha(("synthetic-original-"+category).encode())
        source_files[source_file]={"sha256":source_sha}
        rows=[
            {"itemId":id,"catalogDomain":domain,"nativeCategory":category,
             "sourceSha256":source_sha,"nativeKey":"PRIVATE_DONT_LEAK"}
            for id,domain in records
        ]
        content=stable_bytes(rows)
        path="shards/category/"+category+".json"
        data[path]=content
        shard_manifest["files"]["category/"+category+".json"]={
            "bytes":len(content),"count":len(records),"sha256":sha(content)
        }
    release_count=sum(map(len,entries.values()))
    source_catalog={
        "schema":"wand.db01.items@1","gameVersion":"1.26.2",
        "platform":"Steam","publicationAuthorized":False,
        "sourceFilesFullyShaVerified":len(categories),
        "sourceFilesTotal":len(categories),
        "fullCorpusParsed":True,
        "counts":{"currentDefinitions":release_count},
        "source":{"individualOriginalFileHashes":source_files},
        "byNativeCategory":{k:len(v) for k,v in entries.items()}
    }
    data["catalog/manifest.json"]=stable_bytes(source_catalog)
    data["shards/manifest.json"]=stable_bytes(shard_manifest)
    release={
        "schema":"wand.db01.private-release-acceptance@1",
        "status":"PASS","privateOnly":True,
        "publicationAuthorized":False,"itemlistFilesVerified":len(categories),
        "definitionCount":release_count,"version":"1.26.2",
        "platform":"Steam",
        "sourceCatalogSha256":sha(data["catalog/manifest.json"]),
        "shardsManifestSha256":sha(data["shards/manifest.json"])
    }
    data["release-acceptance.json"]=stable_bytes(release)
    if corrupt=="shard":
        data["shards/category/ActivityItem.json"]=b'[{"tampered":true}]'
    elif corrupt=="manifest":
        data["catalog/manifest.json"]=b'{}'
    with zipfile.ZipFile(dest,"w",compression=zipfile.ZIP_DEFLATED) as z:
        for path,blob in data.items():
            z.writestr(path,blob)
    return sha(dest.read_bytes())


def save(version=643):
    return {
        "GameInfo":{"Version":version,"LastSaveDeviceInfo":{
            "deviceType":"DeviceType_Switch",
            "deviceID":"PRIVATE_ID_DO_NOT_LEAK"
        }},
        "Player":{
            "Name":"PRIVATE_PLAYER_NAME",
            "ListInventories":{
                "1":{"Inventory":{"321001":{"Amount":2}}}
            },
            "ContainerInventories":{
                "0":{"ParentItemID":None,"Inventory":[
                    {"ItemID":321002,"Amount":5}]},
                "1":{"ParentItemID":400111,"Inventory":[]}
            },
            "CollectionSets":[{"GroupData":[{
                "GroupsCollectionItems":{"400111":False,"321001":True}
            }]}],
            "AchievementsData":[{"AchievementID":211010}],
            "Mounts":[]
        },
        "World":{
            "GridCollection":{
                "Grids":{"11":{"GridDataPath":"PRIVATE_PATH",
                    "Objects":{"100":{"ItemID":400222}}}},
                "DiffGrids":{"11":{"ModifiedObjects":{
                    "101":{"ItemID":400222}
                }}}
            },
            "MissionSlots":{"1":{"Slots":[{"MissionId":207010}]}},
            "Villages":[{"SceneItemId":154010}]
        }
    }


class NativeCatalogTest(unittest.TestCase):
    def test_pin_release_and_provenance(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"release.zip"
            pin=synthetic_archive(path)
            catalog=native.check_source_release(path,pin)
            self.assertEqual(catalog["definitions"],7)
            self.assertEqual(catalog["shardsVerified"],5)
            self.assertEqual(catalog["version"],"1.26.2")
            self.assertEqual(len(catalog["index"]),7)
            with self.assertRaisesRegex(ValueError,"ARCHIVE_SHA_MISMATCH"):
                native.check_source_release(path,"0"*64)
            with self.assertRaisesRegex(ValueError,"EXPECTED_CATALOG_SHA_REQUIRED"):
                native.check_source_release(path,"not-sha")

    def test_corrupt_shard_or_manifest_never_falls_back(self):
        with tempfile.TemporaryDirectory() as root:
            for corruption in ("shard","manifest"):
                path=Path(root)/f"{corruption}.zip"
                pin=synthetic_archive(path,corruption)
                with self.assertRaisesRegex(
                    ValueError,"CATALOG_SHARD_HASH_MISMATCH|CATALOG_RELEASE_PROVENANCE_INVALID"
                ):
                    native.check_source_release(path,pin)

    def test_all_ten_native_families_nullable_parent_and_grid_path_unverified(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"release.zip"
            cat=native.check_source_release(path,synthetic_archive(path))
            original=save()
            before=stable_bytes(original)
            result=native.scan(original,cat)
            self.assertEqual(stable_bytes(original),before)
            self.assertEqual(result["schema"],native.REPORT_SCHEMA)
            self.assertEqual(result["catalog"]["definitionRecords"],7)
            self.assertEqual(result["status"],
                "all_observed_non_sentinel_references_catalogued")
            self.assertEqual(result["totals"]["observed"],11)
            self.assertEqual(result["totals"]["matchedSourceDefinitions"],10)
            self.assertEqual(result["totals"]["nullSentinels"],1)
            self.assertEqual(result["totals"]["unindexedInSuppliedDb01Catalog"],0)
            self.assertEqual(result["gridSources"]["observed"],1)
            self.assertFalse(result["gridSources"]["db04NativePathIndexSupplied"])
            self.assertTrue(result["save"]["switchDeviceTypeObserved"])
            self.assertFalse(result["save"]["saveBuildIndependentlyMatchedToSteamBuild"])
            self.assertFalse(result["claims"]["editorWriterAuthorized"])
            self.assertFalse(result["claims"]["itemOwnershipVerified"])
            report=json.dumps(result)
            for private in ("PRIVATE","321001","321002","400111","211010",
                            "207010","154010","400222"):
                self.assertNotIn(private,report)

    def test_category_mismatch_not_treated_as_missing_definition(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"release.zip"
            cat=native.check_source_release(path,synthetic_archive(path))
            root_save=save(999)
            root_save["Player"]["AchievementsData"][0]["AchievementID"]=400111
            result=native.scan(root_save,cat)
            rule={x["id"]:x for x in result["families"]}["achievement_duty_id"]
            self.assertEqual(rule["matchedSourceDefinitions"],1)
            self.assertEqual(rule["expectedNativeCategoryMismatch"],1)
            self.assertEqual(result["status"],
                "partial_or_inconclusive_native_id_coverage")
            self.assertFalse(result["claims"]["questCompletionVerified"])

    def test_optional_missions_and_missing_world_records_are_not_corruption(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"release.zip"
            cat=native.check_source_release(path,synthetic_archive(path))
            altered=save()
            altered["World"].pop("MissionSlots")
            altered["World"]["GridCollection"]["DiffGrids"]={}
            altered["Player"].pop("AchievementsData")
            result=native.scan(altered,cat)
            self.assertEqual(result["totals"]["unindexedInSuppliedDb01Catalog"],0)
            self.assertEqual(result["totals"]["matchedSourceDefinitions"],7)
            self.assertFalse(result["claims"]["editorWriterAuthorized"])

    def test_500_collection_entries_not_capped_at_old_256_reference_limit(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/"release.zip"
            cat=native.check_source_release(path,synthetic_archive(path))
            root_save=save()
            root_save["Player"]["CollectionSets"][0]["GroupData"][0][
                "GroupsCollectionItems"
            ]={str(400111+i):False for i in range(500)}
            result=native.scan(root_save,cat)
            rule={x["id"]:x for x in result["families"]}["collection_item_key"]
            self.assertEqual(rule["observed"],500)
            self.assertEqual(
                rule["matchedSourceDefinitions"]+
                rule["unindexedInSuppliedDb01Catalog"],500
            )
            self.assertEqual(rule["unindexedInSuppliedDb01Catalog"],498)
            self.assertEqual(rule["matchedSourceDefinitions"],2)
            self.assertFalse(result["claims"]["allGameContentCovered"])

    def test_duplicate_key_unsafe_json_and_nonfinite_rejected(self):
        samples=(
            b'{"a":1,"a":2}',
            b'{"a":9007199254740993}',
            b'{"a":NaN}',
        )
        for source in samples:
            with self.assertRaises(ValueError):
                native.strict_json(source)


if __name__=="__main__":
    unittest.main()
