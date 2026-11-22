"""Synthetic DB-04 partial native source GridDataPath tests. No owner saves."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

import db04_grid_path_audit as grid

def serial(o): return json.dumps(o,separators=(",",":"),ensure_ascii=False).encode()
def sha(b): return hashlib.sha256(b).hexdigest()

PATH_A="GridData/Villages/Village04-MeadowLevel-GridData.json"
PATH_B="GridData/Furniture/Mission/NativeGrid-Two.json"
PATH_MISSING="GridData/OffGridBuildings/Expansion04/MissingNative.json"

def build_zip(destination, attack=None):
    rows=[
        {"gridId":PATH_A,
         "source":{"path":"ddv_Data/StreamingAssets/"+PATH_A}},
        {"gridId":PATH_B,
         "source":{"path":"ddv_Data/StreamingAssets/"+PATH_B}},
    ]
    originals=[
        {"path":"ddv_Data/StreamingAssets/"+p,
         "bytes":64,"sha256":sha(("original-"+p).encode())}
        for p in (PATH_A,PATH_B)
    ]
    if attack=="grid_source_conflict":
        rows[1]["source"]["path"]="ddv_Data/StreamingAssets/"+PATH_A
    if attack=="duplicate_grid":
        rows[1]["gridId"]=PATH_A
        rows[1]["source"]["path"]="ddv_Data/StreamingAssets/"+PATH_A
    content={"grids.json":serial(rows),"report.json":serial({
        "schema":"wand.db04.world@1","status":"native_partial_world_extraction_preview"
    })}
    manifest={
        "schema":"wand.db04.world@1",
        "platform":"Steam","gameVersion":"1.26.2",
        "status":"partial_game_native_evidence",
        "sourceSubsetOnly":True,"sourceScopeVerified":False,
        "worldHierarchyComplete":False,"placementRulesComplete":False,
        "sources":originals,
        "outputSha256":{k:sha(v) for k,v in content.items()},
    }
    if attack=="catalog_complete":
        manifest["sourceSubsetOnly"]=False
        manifest["sourceScopeVerified"]=True
    content["manifest.json"]=serial(manifest)
    if attack=="tampered_grids":
        content["grids.json"]=serial(rows[:1])
    with zipfile.ZipFile(destination,"w",compression=zipfile.ZIP_DEFLATED) as z:
        for k,v in content.items():z.writestr(k,v)
    return sha(Path(destination).read_bytes())

def profile():
    return {
        "GameInfo":{"Version":643,"ProfileUID":"SECRET_PROFILE_NEVER_LEAK"},
        "Player":{"Name":"SECRET_PLAYER"},
        "World":{"GridCollection":{
            "Grids":{
                "100":{"ID":100,"GridDataPath":PATH_A,"Objects":{"4000":{"ItemID":1}}},
                "200":{"ID":200,"GridDataPath":PATH_A,"Objects":{}},
                "300":{"ID":300,"GridDataPath":PATH_B,"Objects":{}},
                "400":{"ID":400,"GridDataPath":PATH_MISSING,"Objects":{}},
            },
            "DiffGrids":{"100":{"ModifiedObjects":{}}}
        }}
    }

class PartialGridAudit(unittest.TestCase):
    def test_pinned_archive_and_redacted_coverage(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/"db04.zip"
            source=grid.load_partial_archive(file,build_zip(file))
            self.assertEqual(source["definitionCount"],2)
            self.assertEqual(source["verifiedArchiveEntries"],2)
            before=serial(profile())
            report=grid.scan_grid_paths(profile(),source)
            self.assertEqual(before,serial(profile()))
            self.assertEqual(report["save"]["totalGridRecords"],4)
            self.assertEqual(report["save"]["distinctValidPaths"],3)
            self.assertEqual(report["join"]["matchedObservations"],3)
            self.assertEqual(report["join"]["matchedDistinctPaths"],2)
            self.assertEqual(report["join"]["notInPartialDb04Observations"],1)
            self.assertEqual(report["join"]["notInPartialDb04DistinctPaths"],1)
            self.assertEqual(report["status"],"partial_source_path_coverage")
            self.assertFalse(report["join"]["numericSaveGridIdUsedAsSourceKey"])
            self.assertFalse(report["claims"]["editorWriterAuthorized"])
            self.assertFalse(report["claims"]["sourceAndSaveExecutableBuildJointlyVerified"])
            self.assertFalse(report["nativeDb04"]["nativeSourceOriginalBytesIndependentlyRehashedHere"])
            text=json.dumps(report)
            for key in ["SECRET_PLAYER","SECRET_PROFILE","4000","GridData/",
                        "MeadowLevel","MissingNative","100"]:
                self.assertNotIn(key,text,key)
            with self.assertRaisesRegex(ValueError,"ARCHIVE_PIN_MISMATCH"):
                grid.load_partial_archive(file,"f"*64)

    def test_manifest_and_shard_tamper_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            for kind,reason in [
                ("catalog_complete","PARTIAL_PROVENANCE_INVALID"),
                ("tampered_grids","OUTPUT_HASH_MISMATCH"),
                ("duplicate_grid","GRID_PATH_DUPLICATE_OR_INVALID"),
                ("grid_source_conflict","GRID_ORIGINAL_FILE_WITNESS_INVALID"),
            ]:
                path=Path(folder)/(kind+".zip")
                pin=build_zip(path,kind)
                with self.assertRaisesRegex(ValueError,reason):
                    grid.load_partial_archive(path,pin)

    def test_missing_world_grid_and_invalid_path_are_not_classified_as_corruption(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"db04.zip"
            cat=grid.load_partial_archive(path,build_zip(path))
            p=profile()
            p["World"]["GridCollection"]["Grids"]["300"]["GridDataPath"]=17
            p["World"]["GridCollection"]["Grids"]["200"]["GridDataPath"]="GridData/../../PRIVATE"
            d=grid.scan_grid_paths(p,cat)
            self.assertEqual(d["save"]["malformedGridPathOrRecord"],2)
            self.assertEqual(d["join"]["matchedObservations"],1)
            self.assertEqual(d["join"]["notInPartialDb04Observations"],1)
            self.assertTrue(d["join"]["missingInPartialCatalogIsNotSaveCorruption"])
            self.assertFalse(d["claims"]["exportAuthorized"])
            del p["World"]["GridCollection"]["Grids"]
            with self.assertRaisesRegex(ValueError,"SAVE_GRID_MAP_INVALID"):
                grid.scan_grid_paths(p,cat)

    def test_empty_initial_grid_valid_and_no_autofix(self):
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/"db04.zip"
            cat=grid.load_partial_archive(file,build_zip(file))
            s=profile()
            s["World"]["GridCollection"]["Grids"]={}
            result=grid.scan_grid_paths(s,cat)
            self.assertEqual(result["save"]["totalGridRecords"],0)
            self.assertEqual(result["join"]["matchedObservations"],0)
            self.assertFalse(result["claims"]["originalSaveModified"])

    def test_duplicate_json_keys_and_unsafe_numbers_refused_by_shared_parser(self):
        from native_catalog_crosscheck import strict_json
        for raw in (
            b'{"GridDataPath":1,"GridDataPath":2}',
            b'{"id":9007199254740993}',
            b'{"GridDataPath":NaN}'
        ):
            with self.assertRaises(ValueError):
                strict_json(raw)

if __name__=="__main__":unittest.main()
