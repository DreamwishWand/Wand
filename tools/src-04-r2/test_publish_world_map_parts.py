import unittest
import tempfile
import hashlib
from pathlib import Path
from PIL import Image
from publish_world_map_parts import prepare, split, activate, EVIDENCE

class MapPartsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        pixel = "b"*64
        rel = f"images/maps/original/bb/{pixel}.webp"
        path = self.root/rel
        path.parent.mkdir(parents=True)
        Image.new("RGBA",(30,20),(15,30,50,200)).save(path, "WEBP", lossless=True)
        self.sha = hashlib.sha256(path.read_bytes()).hexdigest()
        self.k = f"images/{self.sha}.webp"
        self.part = {"imagePath":rel,"imageSha256":self.sha,
                     "imageToCanvas":[1,0,0,1,3,4],"renderMode":"native_pixel_copy",
                     "layoutEvidence":{"componentEnabled":True,"mapping":EVIDENCE}}
        self.world = {"prefab":"MapA","worldCandidate":"valley","width":100,"height":100,
                      "worldPlacementVerified":False,"status":"incomplete_ocean_not_rendered",
                      "parts":[self.part,{**self.part,"imageToCanvas":[-1,0,0,1,40,0]}]}
        self.report = {"schema":"wand.src04.world-map-repair@3","gameVersion":"1.26.2",
                       "publicationAuthorized":False,"worlds":[self.world]}

    def test_reuse_original_and_preserve_order(self):
        candidate, assets, paths = prepare(self.report,self.root)
        self.assertEqual(len(assets),1)
        self.assertEqual(candidate["images"][self.sha]["width"],30)
        self.assertEqual(candidate["maps"][0]["parts"][1],[self.sha,[-1,0,0,1,40,0]])
        self.assertTrue(candidate["maps"][0]["oceanMissing"])
        self.assertTrue(candidate["maps"][0]["visualReviewRequired"])
        self.assertFalse(candidate["maps"][0]["worldPlacementVerified"])
        self.assertNotIn("imagePath",str(candidate))
        self.assertNotIn("layoutEvidence",str(candidate))
        self.assertEqual(split(assets,{}),({},assets))
        receipt={self.k:assets[self.k]["bytes"]}
        self.assertEqual(split(assets,receipt),(assets,{}))
        release=activate(candidate,assets,receipt)
        self.assertEqual(release["state"],"published")
        self.assertTrue(release["canonicalMetadataVerified"])
        self.assertEqual(candidate["state"],"unpublished")
        with self.assertRaises(ValueError):
            activate(candidate,assets,{})
        with self.assertRaises(ValueError):
            split(assets,{self.k:0})

    def test_unverified_bytes_or_layout_rejected(self):
        for patch in [{"imagePath":"../bad.webp"},{"imageSha256":"a"*64},
                      {"imageToCanvas":[0,0,0,1,0,0]},
                      {"layoutEvidence":{"componentEnabled":False,"mapping":EVIDENCE}}]:
            self.world["parts"]=[{**self.part,**patch}]
            with self.assertRaises(ValueError):
                prepare(self.report,self.root)

if __name__=="__main__":
    unittest.main()
