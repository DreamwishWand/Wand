"""Synthetic SRC-04 next-version private v2 builder tests, no real game files."""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image
import build_next_media_v2 as builder
import plan_media_update as updater
from test_plan_media_update import make_scan, make_items, make_overlay, write_json


def make_proofs(path, next_scan, items, sha, bundle, unity_id):
    doc={
      "schema":updater.PROOF_SCHEMA,"privateOnly":True,
      "publicationAuthorized":False,"complete":True,
      "gameVersion":next_scan["version"],
      "sourceScanSha256":next_scan["sha256"],
      "sourceItemsSha256":items["sha256"],
      "links":[{
         "iconGuid":"guid:"+"a"*32,"bundlePath":bundle,
         "sourceBundleSha256":sha,"unityAssetId":unity_id,
         "identityEvidence":updater.EVIDENCE
      }]
    }
    write_json(path,doc)


class NextVersionBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name)
        self.old=root/"old"
        self.next=root/"next"
        self.old.mkdir()
        self.next.mkdir()
        self.old_scan,self.old_game=make_scan(self.old,"1.26.2",b"catalog",b"bundle0")
        self.next_scan,self.next_game=make_scan(self.next,"1.26.3",b"catalog",b"bundle0")
        self.old_items=make_items(self.old)
        (self.old/"source-items").mkdir(exist_ok=True)
        shutil.copyfile(self.old_items,self.old/"source-items"/"items.jsonl")
        self.next_items=make_items(self.next)
        self.old_index,_=make_overlay(self.old,updater.digest(b"bundle0"),self.old_items)
        self.bundle="ddv_Data/StreamingAssets/aa/win/ui-images-generatedicons_assets_assets/food_1234.bundle"
        # Existing WebPs must actually match their SHA-256 metadata.
        shard=self.old_index/"id/01.json"
        value=json.loads(shard.read_text())
        for kind in ("thumbnail","original"):
            im=Image.new("RGBA",(150,95),(10,20,30,170))
            if kind=="thumbnail":
                im.thumbnail((128,128),Image.Resampling.LANCZOS)
            variant=value["rows"][0]["image"][kind]
            path=self.old/variant["path"]
            path.parent.mkdir(parents=True,exist_ok=True)
            im.save(path,format="WEBP",lossless=True,exact=True,method=4)
            variant["sha256"]=updater.file_digest(path)
            variant["bytes"]=path.stat().st_size
            variant["width"],variant["height"]=im.size
        write_json(shard,value)
        manpath=self.old_index/"manifest.json"
        manifest=json.loads(manpath.read_text())
        manifest["files"]["id/01.json"]["sha256"]=updater.file_digest(shard)
        manifest["files"]["id/01.json"]["bytes"]=shard.stat().st_size
        write_json(manpath,manifest)
        self.proofs=self.next/"exact-proofs.json"
        self.out=root/"new-output"
    def write_next_proof(self, bundle_sha,asset_id=None):
        next_scan=updater.read_scan(self.next_scan)
        items=updater.read_items(self.next_items)
        make_proofs(self.proofs,next_scan,items,bundle_sha,self.bundle,
                    asset_id or f"unity:{bundle_sha}:CAB-123:42:Sprite")
    def build(self):
        return builder.build(self.old,self.old_scan,self.next_scan,
                             self.next_items,self.proofs,self.next_game,self.out)
    def test_full_reuse_without_unity_decoding(self):
        self.write_next_proof(updater.digest(b"bundle0"))
        report=self.build()
        self.assertEqual(report["reusedGuidCount"],1)
        self.assertEqual(report["decodedGuidCount"],0)
        self.assertEqual(report["distinctMediaFiles"],2)
        self.assertFalse(report["publicationApproved"])
        self.assertTrue(report["complete"])
        index=updater.read_overlay(self.out/"private-media-overlay-v2-latest")
        self.assertEqual(len(index["rows"]),1)
        for kind in ("thumbnail","original"):
            variant=index["rows"][1][1][kind]
            self.assertEqual(builder.file_digest(self.out/variant["path"]),variant["sha256"])
    def test_changed_bundle_only_decodes_exact_object(self):
        self.next_scan,self.next_game=make_scan(self.next,"1.26.3",b"catalog",b"bundle1")
        sha=updater.digest(b"bundle1")
        self.write_next_proof(sha)
        im=Image.new("RGBA",(150,95),(244,0,0,160))
        obj=SimpleNamespace(
            type=SimpleNamespace(name="Sprite"),path_id=42,
            assets_file=SimpleNamespace(name="CAB-123"),
            read=lambda:SimpleNamespace(image=im))
        fake=SimpleNamespace(load=lambda _:SimpleNamespace(objects=[obj]))
        with patch.dict(sys.modules,{"UnityPy":fake}):
            report=self.build()
        self.assertEqual(report["decodedGuidCount"],1)
        self.assertEqual(report["newPixelEncodedCount"],1)
        overlay=updater.read_overlay(self.out/"private-media-overlay-v2-latest")
        image=overlay["rows"][1][1]
        self.assertEqual(image["sourceBundleSha256"],sha)
        self.assertEqual(builder.webp_lossless_dimensions(
            self.out/image["original"]["path"]),(150,95))
        self.assertFalse(report["publicationApproved"])
    def test_unresolved_guid_cannot_create_partial_overlay(self):
        # New catalog invalidates old GUID linkage, so an empty proof cannot pass.
        self.next_scan,self.next_game=make_scan(self.next,"1.26.3",b"updated-catalog",b"bundle0")
        self.write_next_proof(updater.digest(b"bundle0"))
        evidence=json.loads(self.proofs.read_text())
        evidence["complete"]=False
        evidence["links"]=[]
        write_json(self.proofs,evidence)
        with self.assertRaisesRegex(ValueError,"UNRESOLVED_GUIDS_REMAIN"):
            self.build()
        self.assertFalse(self.out.exists())
    def test_tampered_new_game_bytes_cannot_reuse_old(self):
        self.write_next_proof(updater.digest(b"bundle0"))
        (self.next_game/self.bundle).write_bytes(b"wrong")
        with self.assertRaisesRegex(ValueError,"TARGET_SOURCE_HASH_CHANGED"):
            self.build()
        self.assertFalse(self.out.exists())
    def test_existing_target_does_not_get_overwritten(self):
        self.write_next_proof(updater.digest(b"bundle0"))
        self.out.mkdir()
        sentinel=self.out/"sentinel.txt"
        sentinel.write_text("don't touch")
        with self.assertRaisesRegex(ValueError,"OUTPUT_MUST_NOT_EXIST"):
            self.build()
        self.assertEqual(sentinel.read_text(),"don't touch")


if __name__=="__main__":
    unittest.main()
