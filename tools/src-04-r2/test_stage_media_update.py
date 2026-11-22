"""Private R2 delta staging tests; no real Cloudflare or user game files."""
import io
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image

import stage_media_update as stage
import plan_media_update as updater
from test_build_next_media_v2 import NextVersionBuildTests
from test_plan_media_update import make_scan


class FakePaginator:
    def paginate(self, **kwargs):
        yield {"Contents":[]}


class FakeR2:
    def __init__(self):
        self.data={}
    def get_paginator(self,name):
        assert name=="list_objects_v2"
        return FakePaginator()
    def put_object(self,**kwargs):
        key=kwargs["Key"]
        assert kwargs["IfNoneMatch"]=="*"
        assert key not in self.data
        data=kwargs["Body"].read()
        self.data[key]={"bytes":data,"sha":kwargs["Metadata"]["sha256"]}
    def head_object(self,Bucket,Key):
        item=self.data[Key]
        return {"ContentLength":len(item["bytes"]),
                "Metadata":{"sha256":item["sha"]},
                "ContentType":"image/webp"}


class UpdateR2Tests(unittest.TestCase):
    def setUp(self):
        fixture=NextVersionBuildTests(methodName="test_full_reuse_without_unity_decoding")
        fixture.setUp()
        self.addCleanup(fixture.temp.cleanup)
        self.fx=fixture
        self.fx.write_next_proof(updater.digest(b"bundle0"))
        self.old=fixture.old
        self.next=fixture.out
        self.bucket=stage.PRIVATE_BUCKET
        # The generic R2 reader expects the full v2 provenance and coverage contract.
        manifest_path=fixture.old_index/"manifest.json"
        manifest=json.loads(manifest_path.read_text())
        manifest["source"]["variantPolicy"]="thumbnail_128_lossless_webp_plus_original_native_lossless_webp"
        manifest["coverage"]["verifiedGuids"]=1
        manifest["coverage"]["unresolvedGuids"]=0
        for shard_meta in manifest["files"].values():
            shard_meta["verified"]=shard_meta["count"]
        write_json_local=(json.dumps(manifest,sort_keys=True)+"\n").encode()
        manifest_path.write_bytes(write_json_local)
        self.old_overlay_sha=updater.file_digest(manifest_path)
        prefix="private/staging/src04/steam-v1.26.2/"+self.old_overlay_sha[:16]
        self.patch_sha=patch.object(stage,"V1262_OVERLAY_SHA",self.old_overlay_sha)
        self.patch_prefix=patch.object(stage,"V1262_STAGE_PREFIX",prefix)
        self.patch_sha.start()
        self.patch_prefix.start()
        self.addCleanup(self.patch_sha.stop)
        self.addCleanup(self.patch_prefix.stop)
        self.old_source_files=2
        report={
          "schema":"wand.src04.r2-stage@1","complete":True,
          "status":"private_staging_uploaded",
          "publicationApproved":False,"uploadedToPublic":False,
          "remote":{"bucket":self.bucket,"prefix":prefix,
                    "totalVerified":self.old_source_files}
        }
        (self.old/"src04-r2-stage-report.json").write_text(json.dumps(report))
    def test_unchanged_images_require_zero_r2_uploads(self):
        self.fx.build()
        outcome=stage.prepare(self.old,self.next)
        self.assertEqual(outcome["summary"]["reusedPriorPaths"],2)
        self.assertEqual(outcome["summary"]["newUniqueUploads"],0)
        self.assertEqual(outcome["candidate"]["status"],"planned_not_uploaded")
        self.assertTrue(all(x["remoteKey"].startswith(stage.V1262_STAGE_PREFIX)
                            for x in outcome["candidate"]["objects"]))
        cloud=FakeR2()
        remote=stage.sync_r2(cloud,outcome,self.next,apply=True,jobs=2)
        self.assertEqual(remote["uploaded"],0)
        self.assertFalse(cloud.data)
    def test_changed_encoded_bytes_upload_only_new_objects(self):
        self.fx.next_scan,self.fx.next_game=make_scan(
            self.fx.next,"1.26.3",b"catalog",b"bundle1")
        sha=updater.digest(b"bundle1")
        self.fx.write_next_proof(sha)
        image=Image.new("RGBA",(150,95),(200,40,10,130))
        obj=SimpleNamespace(type=SimpleNamespace(name="Sprite"),path_id=42,
                            assets_file=SimpleNamespace(name="CAB-123"),
                            read=lambda:SimpleNamespace(image=image))
        mock=SimpleNamespace(load=lambda _:SimpleNamespace(objects=[obj]))
        with patch.dict(sys.modules,{"UnityPy":mock}):
            self.fx.build()
        plan=stage.prepare(self.old,self.next)
        self.assertEqual(plan["summary"]["newUniqueUploads"],2)
        self.assertEqual(plan["summary"]["reusedPriorPaths"],0)
        cloud=FakeR2()
        staged=stage.sync_r2(cloud,plan,self.next,apply=True,jobs=2)
        self.assertEqual(staged["uploaded"],2)
        self.assertEqual(staged["totalNewVerified"],2)
        self.assertEqual(len(cloud.data),2)
        self.assertTrue(all(k.startswith(plan["prefix"]) for k in cloud.data))
    def test_unverified_prior_report_blocks_reuse(self):
        self.fx.build()
        f=self.old/"src04-r2-stage-report.json"
        doc=json.loads(f.read_text())
        doc["remote"]["totalVerified"]=0
        f.write_text(json.dumps(doc))
        with self.assertRaisesRegex(ValueError,"PRIOR_PRIVATE_UPLOAD_UNVERIFIED"):
            stage.prepare(self.old,self.next)
    def test_output_map_is_private_and_never_implicitly_published(self):
        self.fx.build()
        plan=stage.prepare(self.old,self.next)
        doc=plan["candidate"]
        self.assertFalse(doc["publicationApproved"])
        self.assertTrue(doc["privateOnly"])
        self.assertEqual(doc["bucket"],self.bucket)
        self.assertEqual(len(doc["objects"]),2)


if __name__=="__main__":
    unittest.main()
