"""SRC-04 cross-version image delta planner tests, fully synthetic/no Unity or R2."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import plan_media_update as updater


def write_json(path, obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=(json.dumps(obj,sort_keys=True)+"\n").encode()
    path.write_bytes(raw)
    return updater.digest(raw)


def make_scan(root,version,catalog,bundle):
    game=root/"game"
    paths={
        "ddv_Data/StreamingAssets/aa/catalog.json":catalog,
        "ddv_Data/StreamingAssets/aa/win/ui-images-generatedicons_assets_assets/food_1234.bundle":bundle,
    }
    rows=[]
    for name,content in paths.items():
        p=game/name
        p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(content)
        rows.append({"path":name,"size":len(content),"sha256":updater.digest(content),
                     "hash_source":"reused"})
    scan={
      "schema_version":1,"status":"complete","errors":[],
      "platform":{"value":"steam","status":"verified_from_files"},
      "game_version":{"value":version,"status":"verified_from_file"},
      "files":rows
    }
    path=root/"source-manifest.json"
    write_json(path,scan)
    return path,game


def make_items(root, guid="guid:"+"a"*32):
    item=root/"items.jsonl"
    item.parent.mkdir(parents=True,exist_ok=True)
    row={"itemId":1,"iconGuid":guid,"nativeCategory":"ActivityItem"}
    item.write_bytes((json.dumps(row)+"\n").encode())
    return item


def make_overlay(root,bundle_sha,items_path):
    index=root/"private-media-overlay-v2-latest"
    guid="guid:"+"a"*32
    pixel="f"*64
    asset=f"unity:{bundle_sha}:CAB-123:42:Sprite"
    image={
      "unityAssetId":asset,"textureAssetId":f"unity:{bundle_sha}:CAB-123:43:Texture2D",
      "decodedSha256":pixel,"sourceBundleSha256":bundle_sha,
      "sourceWidth":150,"sourceHeight":95,
      "identityEvidence":updater.EVIDENCE,
      "thumbnail":{"path":f"images-v2/thumbnail/ff/{pixel}.webp",
                   "sha256":"b"*64,"bytes":1234,"width":128,"height":81},
      "original":{"path":f"images-v2/original/ff/{pixel}.webp",
                  "sha256":"c"*64,"bytes":4321,"width":150,"height":95}
    }
    metas={}
    for i in range(256):
        bucket=f"{i:02x}"
        rows=[{"itemId":1,"iconGuid":guid,"status":"verified","image":image}] if i==1 else []
        entry=f"id/{bucket}.json"
        blob={
          "schema":updater.SHARD_SCHEMA,"bucket":bucket,"rows":rows
        }
        checksum=write_json(index/entry,blob)
        metas[entry]={"sha256":checksum,
                      "bytes":(index/entry).stat().st_size,"count":len(rows)}
    write_json(index/"manifest.json",{
      "schema":updater.MANIFEST_SCHEMA,"bucketCount":256,"privateOnly":True,
      "publicationAuthorized":False,"imageByteVerification":True,
      "files":metas,"coverage":{"totalItems":1,"verifiedItems":1,"unresolvedItems":0},
      "source":{"sourceItemsSha256":updater.digest(items_path.read_bytes())}
    })
    return index,asset


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root=Path(self.temp.name)
        self.old=root/"old"
        self.new=root/"new"
        self.old.mkdir()
        self.new.mkdir()
        self.old_scan_path,self.old_game=make_scan(self.old,"1.26.2",b"catalog0",b"bundle0")
        self.new_scan_path,self.new_game=make_scan(self.new,"1.26.3",b"catalog0",b"bundle0")
        self.old_items_path=make_items(self.old)
        self.new_items_path=make_items(self.new)
        self.overlay_path,self.old_id=make_overlay(
            self.old,updater.digest(b"bundle0"),self.old_items_path)
        self.reload()
    def reload(self):
        self.old_scan=updater.read_scan(self.old_scan_path)
        self.new_scan=updater.read_scan(self.new_scan_path)
        self.old_items=updater.read_items(self.old_items_path)
        self.new_items=updater.read_items(self.new_items_path)
        self.overlay=updater.read_overlay(self.overlay_path)
    def plan(self,**kwargs):
        return updater.plan(self.old_scan,self.old_items,self.overlay,
                            self.new_scan,self.new_items,**kwargs)
    def proof(self,bundle_data=b"bundle0",asset=None):
        sha=updater.digest(bundle_data)
        bundle_path=[p for p in self.new_scan["files"] if p.endswith(".bundle")][0]
        obj={
            "schema":updater.PROOF_SCHEMA,
            "privateOnly":True,"publicationAuthorized":False,
            "complete":True,
            "gameVersion":self.new_scan["version"],
            "sourceScanSha256":self.new_scan["sha256"],
            "sourceItemsSha256":self.new_items["sha256"],
            "links":[{"iconGuid":"guid:"+"a"*32,
                      "bundlePath":bundle_path,"sourceBundleSha256":sha,
                      "unityAssetId":asset or f"unity:{sha}:CAB-123:42:Sprite",
                      "identityEvidence":updater.EVIDENCE}]
        }
        file=self.new/"exact-links.json"
        write_json(file,obj)
        return file
    def test_unchanged_catalog_and_bundle_reuses(self):
        p=self.plan(target_game=self.new_game)
        self.assertEqual(p["classification"],{"reused_verified":1})
        self.assertFalse(p["catalogChanged"])
        self.assertTrue(p["targetGameRelevantFilesRehashed"])
        self.assertEqual(p["bundlesChanged"],0)
        self.assertFalse(p["complete"])
        self.assertFalse(p["publicationAuthorized"])
    def test_unverified_source_scan_does_not_assert_reuse(self):
        p=self.plan()
        self.assertEqual(p["classification"],{"needs_source_rehash":1})
    def test_changed_catalog_requires_exact_proof_even_for_same_bundle(self):
        make_scan(self.new,"1.26.3",b"changed-catalog",b"bundle0")
        self.reload()
        p=self.plan(target_game=self.new_game)
        self.assertTrue(p["catalogChanged"])
        self.assertEqual(p["classification"],{"needs_exact_guid_relink":1})
        proofs=updater.read_proofs(self.proof(),self.new_scan,self.new_items)
        p=self.plan(target_game=self.new_game,proofs=proofs)
        self.assertEqual(p["classification"],{"reused_verified":1})
    def test_changed_bundle_needs_decode_after_exact_proof(self):
        make_scan(self.new,"1.26.3",b"catalog0",b"bundle1")
        self.reload()
        p=self.plan(target_game=self.new_game)
        self.assertEqual(p["classification"],{"needs_exact_guid_relink":1})
        target_sha=updater.digest(b"bundle1")
        proofs=updater.read_proofs(
          self.proof(bundle_data=b"bundle1",asset=f"unity:{target_sha}:CAB-123:42:Sprite"),
          self.new_scan,self.new_items)
        p=self.plan(target_game=self.new_game,proofs=proofs)
        self.assertEqual(p["classification"],{"needs_decode":1})
        self.assertEqual(p["bundlesChanged"],1)
    def test_target_hash_mismatch_is_rejected(self):
        (self.new_game/
         "ddv_Data/StreamingAssets/aa/win/ui-images-generatedicons_assets_assets/food_1234.bundle"
         ).write_bytes(b"forged!")
        with self.assertRaisesRegex(ValueError,"TARGET_SOURCE_HASH_CHANGED"):
            self.plan(target_game=self.new_game)
    def test_inconsistent_proof_sha_is_rejected(self):
        f=self.proof(bundle_data=b"wrong")
        with self.assertRaisesRegex(ValueError,"PROOF_INVALID"):
            updater.read_proofs(f,self.new_scan,self.new_items)
    def test_changed_item_guid_is_not_guessed(self):
        make_items(self.new,"guid:"+"b"*32)
        self.reload()
        p=self.plan(target_game=self.new_game)
        self.assertEqual(p["classification"],{"needs_exact_guid_relink":1})
        self.assertEqual(p["guidCounts"]["new"],1)
        self.assertEqual(p["itemCounts"]["changedOrAdded"],1)
    def test_removals_are_not_claimed_from_incomplete_extraction(self):
        self.new_items_path.write_bytes(
            (json.dumps({"itemId":2,"iconGuid":"guid:"+"a"*32})+"\n").encode())
        self.reload()
        p=self.plan(target_game=self.new_game)
        self.assertEqual(p["itemCounts"]["missingFromNewExtractionNotConfirmedRemoved"],1)
        self.assertEqual(p["itemCounts"]["changedOrAdded"],1)


if __name__=="__main__":
    unittest.main()
