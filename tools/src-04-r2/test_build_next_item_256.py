import json
import unittest
from unittest.mock import patch

from PIL import Image
import build_next_item_256 as next256
import plan_media_update as updater
from migrate_item_thumbnails_256 import make_thumbnail, meta, POLICY, resume
from test_build_next_media_v2 import NextVersionBuildTests
from test_plan_media_update import write_json


class Next256BuildTests(unittest.TestCase):
    def setUp(self):
        self.fx=NextVersionBuildTests(methodName="test_full_reuse_without_unity_decoding")
        self.fx.setUp()
        self.addCleanup(self.fx.temp.cleanup)
        self.fx.write_next_proof(updater.digest(b"bundle0"))

    def build(self):
        f=self.fx
        return next256.build_next(f.old,f.old_scan,f.next_scan,f.next_items,
                                  f.proofs,f.next_game,f.out,
                                  base_items_sha=updater.file_digest(f.old/"source-items"/"items.jsonl"),
                                  base_overlay_sha=updater.file_digest(f.old_index/"manifest.json"))

    def check_resume(self,report):
        f=self.fx
        out=f.out/"item-thumbnails-256"
        objects,paths,summary=resume(f.out,out,version="1.26.3",
            source_sha=report["sourceItemsSha256"],
            overlay_sha=report["privateOverlayManifestSha256"])
        self.assertEqual(len(objects),summary["uniqueImages"])
        self.assertEqual(set(objects),set(paths))
        return summary

    def test_small_original_reused_without_encoding_legacy_thumbnail(self):
        with patch.object(Image.Image,"save",side_effect=AssertionError("unexpected encoding")):
            report=self.build()
            summary=self.check_resume(report)
        self.assertEqual(report["decodedGuidCount"],0)
        self.assertEqual(summary["uniqueImages"],1)
        self.assertEqual(summary["originalsReusedAsThumbnail"],1)
        index=json.loads((self.fx.out/"item-thumbnails-256"/"item-256-index-candidate.json").read_text())
        self.assertEqual(index["gameVersion"],"1.26.3")
        self.assertEqual(index["items"]["1"][0],index["items"]["1"][1])

    def test_verified_large_cache_reused_without_reencoding(self):
        f=self.fx
        shard=f.old_index/"id/01.json"
        value=json.loads(shard.read_text())
        image=value["rows"][0]["image"]
        image["sourceWidth"],image["sourceHeight"]=512,320
        original=Image.new("RGBA",(512,320),(10,20,30,170))
        for kind in ("thumbnail","original"):
            im=original.copy()
            if kind=="thumbnail":
                im.thumbnail((128,128),Image.Resampling.LANCZOS)
            v=image[kind]
            p=f.old/v["path"]
            im.save(p,format="WEBP",lossless=True,exact=True,quality=100,method=6)
            v.update(meta(updater.file_digest(p),p.stat().st_size,*im.size))
        write_json(shard,value)
        man=f.old_index/"manifest.json"
        m=json.loads(man.read_text())
        m["files"]["id/01.json"].update(sha256=updater.file_digest(shard),bytes=shard.stat().st_size)
        write_json(man,m)
        prior=f.old/"item-thumbnails-256"
        o=next256.metadata(image["original"])
        t=make_thumbnail(f.old/image["original"]["path"],o,prior)
        write_json(prior/"item-256-thumbnail-cache.json",{"policy":POLICY,"images":{o["sha256"]:t}})
        with patch.object(Image.Image,"save",side_effect=AssertionError("unexpected encoding")):
            report=self.build()
            summary=self.check_resume(report)
        self.assertEqual(summary["cachedThumbnailsReused"],1)
        self.assertEqual(summary["newlyGeneratedThumbnails"],0)
        self.assertEqual(summary["uniqueImages"],2)
        index=json.loads((f.out/"item-thumbnails-256"/"item-256-index-candidate.json").read_text())
        self.assertEqual(index["items"]["1"],[o["sha256"],t["sha256"]])
        self.assertEqual(max(index["images"][t["sha256"]]["width"],index["images"][t["sha256"]]["height"]),256)


if __name__=="__main__":
    unittest.main()
