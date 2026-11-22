"""DB-05 synthetic-only native DB-04 source completion tests."""
from pathlib import Path
import hashlib
import json
import tempfile
import unittest
import zipfile

import db04_observed_grid_completion as completion
from test_db04_grid_path_audit import (
    build_zip, profile, PATH_MISSING, PATH_A, PATH_B,
)

def sample_native_binary():
    # Native GridData protobuf: 2x2, palette [0,4] fixed32,
    # one packed MSB-first palette index byte.
    return bytes.fromhex("08021002220800000000040000002a0150")

class ObservedGridExtensionTest(unittest.TestCase):
    def make_source(self,root,body=None):
        path=root/"GridData"/"OffGridBuildings"/"Expansion04"/"MissingNative.json"
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(body if body is not None else sample_native_binary())
        return path

    def test_completed_observed_save_merges_real_native_grid_parser(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            partial=root/"base.zip"
            pin=build_zip(partial)
            native=root/"native"
            new=self.make_source(native)
            s=profile()
            original=json.dumps(s,sort_keys=True)
            report,zipbytes=completion.create_extension(s,partial,pin,native)
            self.assertEqual(original,json.dumps(s,sort_keys=True))
            self.assertEqual(report["schema"],completion.SCHEMA)
            self.assertEqual(report["counts"]["saveGridRecords"],4)
            self.assertEqual(report["counts"]["distinctSaveGridDataPaths"],3)
            self.assertEqual(report["counts"]["previousDb04PartialGridDefinitions"],2)
            self.assertEqual(report["counts"]["previouslyMatchedObservedPaths"],2)
            self.assertEqual(report["counts"]["newGridDefinitionFilesVerified"],1)
            self.assertEqual(report["counts"]["newGridReferenceObservations"],1)
            self.assertEqual(report["counts"]["totalCombinedDb04GridDefinitions"],3)
            self.assertEqual(report["counts"]["observedPathsNowIndexed"],3)
            self.assertEqual(report["counts"]["observedPathsUnindexed"],0)
            self.assertEqual(report["counts"]["newSourceProtobufBinary"],1)
            self.assertEqual(report["counts"]["newCompactedGridDefinitions"],1)
            self.assertEqual(report["counts"]["newNativeGridCells"],4)
            self.assertFalse(report["safety"]["fullNativeGameWorldIndexed"])
            self.assertFalse(report["safety"]["editorWriterAuthorized"])
            self.assertFalse(report["provenance"]["individualNewSourceHashesExternallyPinnedBeforeRun"])
            from io import BytesIO
            with zipfile.ZipFile(BytesIO(zipbytes)) as z:
                files=set(z.namelist())
                self.assertEqual(files,{
                    "extended-grids.json","new-source-provenance.json",
                    "manifest.json","report.json"
                })
                m=json.loads(z.read("manifest.json"))
                rows=json.loads(z.read("extended-grids.json"))
                sources=json.loads(z.read("new-source-provenance.json"))
                self.assertEqual(m["totalDefinitions"],3)
                self.assertFalse(m["fullOriginalGameGridIndex"])
                self.assertFalse(m["originalGameFilesEmbedded"])
                self.assertFalse(m["originalSaveEmbedded"])
                for f,h in m["memberSha256"].items():
                    self.assertEqual(hashlib.sha256(z.read(f)).hexdigest(),h)
                self.assertEqual([r["gridId"] for r in rows],
                    sorted([PATH_A,PATH_B,PATH_MISSING]))
                new_row=next(r for r in rows if r["gridId"]==PATH_MISSING)
                self.assertEqual(new_row["sizeX"],2)
                self.assertEqual(new_row["sizeY"],2)
                self.assertEqual(new_row["nativeFloorTypePalette"],[0,4])
                self.assertTrue(new_row["nativeFloorIndexToLocalXYCorroborated"])
                self.assertEqual(sources[0]["sha256"],
                    hashlib.sha256(new.read_bytes()).hexdigest())
                self.assertNotIn("SECRET_PLAYER",str(report))
                self.assertNotIn("SECRET_PROFILE",str(report))
                self.assertNotIn("GridData/",json.dumps(report))

    def test_direct_original_json_grid_is_parsed_without_synthetic_protobuf(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            base=root/"base.zip"
            pin=build_zip(base)
            source=root/"native"
            self.make_source(source,
                b'{"SizeX":2,"SizeY":2,"FloorTypes":[0,4,4,0]}')
            report,content=completion.create_extension(
                profile(),base,pin,source)
            self.assertEqual(report["counts"]["newSourceDirectJson"],1)
            self.assertEqual(report["counts"]["newDirectFloorValueGridDefinitions"],1)
            self.assertEqual(report["counts"]["newSourceProtobufBinary"],0)

    def test_missing_original_corrupt_blob_or_bad_pin_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            base=root/"base.zip"
            pin=build_zip(base)
            source=root/"native"
            source.mkdir()
            with self.assertRaisesRegex(ValueError,"NATIVE_SOURCE_FILE_MISSING_OR_OVERSIZED"):
                completion.create_extension(profile(),base,pin,source)
            path=self.make_source(source,b"not a protobuf document")
            with self.assertRaisesRegex(ValueError,"ORIGINAL_NATIVE_GRID_PARSER_REJECTED_SOURCE"):
                completion.create_extension(profile(),base,pin,source)
            path.write_bytes(sample_native_binary())
            with self.assertRaisesRegex(ValueError,"ARCHIVE_PIN_MISMATCH"):
                completion.create_extension(profile(),base,"0"*64,source)

    def test_symlink_for_source_file_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            base=root/"base.zip"
            pin=build_zip(base)
            source=root/"native"
            actual=root/"outside-native.json"
            actual.write_bytes(sample_native_binary())
            name=source/PATH_MISSING
            name.parent.mkdir(parents=True)
            name.symlink_to(actual)
            with self.assertRaisesRegex(ValueError,"SOURCE_SYMLINK_FORBIDDEN"):
                completion.create_extension(profile(),base,pin,source)

    def test_no_clobber_atomic_zip_and_report_pair(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            report=root/"report.json"
            zipname=root/"private.zip"
            report.write_bytes(b"EXISTING_PRIVATE_REPORT")
            with self.assertRaisesRegex(ValueError,"OUTPUT_PARENT_OR_OVERWRITE_INVALID"):
                completion.save_without_clobber(report,zipname,{},b"ZIP")
            self.assertEqual(report.read_bytes(),b"EXISTING_PRIVATE_REPORT")
            self.assertFalse(zipname.exists())
            report.unlink()
            completion.save_without_clobber(report,zipname,{"schema":completion.SCHEMA},b"ZIP")
            self.assertEqual(zipname.read_bytes(),b"ZIP")
            with self.assertRaisesRegex(ValueError,"OUTPUT_PARENT_OR_OVERWRITE_INVALID"):
                completion.save_without_clobber(report,zipname,{},b"ZIP")
            self.assertEqual(zipname.read_bytes(),b"ZIP")

if __name__=="__main__":
    unittest.main()
