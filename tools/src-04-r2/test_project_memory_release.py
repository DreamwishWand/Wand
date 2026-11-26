import unittest
from project_memory_release import project,BUCKET

class MemoryReleaseTests(unittest.TestCase):
    def fixture(self):
        a,b,c,d=(s*64 for s in "abcd")
        g,m="e"*32,"f"*32
        images={sha:{"sha256":sha,"width":w,"height":h,"bytes":n}
                for sha,w,h,n in [(a,1024,576,100),(b,512,288,50),(c,1024,576,20),(d,1024,576,30)]}
        doc={"schema":"wand.media.memory-index@2","gameVersion":"1.27.0","thumbnailPolicy":"lossless-webp-lanczos-512-v1",
             "maxThumbnailLongEdge":512,"pieceBitMappingVerified":False,
             "images":images,"items":{"130000001":[g,m,10]},"references":{g:{"Image":a,"Thumbnail":b},m:{"Mask":c,"Outline":d}}}
        receipt={"schema":"wand.media.memory-publication-receipt@1","bucket":BUCKET,"canonicalMetadataVerified":True,
                 "objects":{"images/"+sha+".webp":v["bytes"] for sha,v in images.items()}}
        return doc,receipt
    def test_project_preserves_native_roles_and_no_guid(self):
        doc,receipt=self.fixture()
        release=project(doc,receipt,"1.27.0")
        self.assertEqual(release["items"]["130000001"],[s*64 for s in "abcd"]+[10])
        self.assertFalse(release["pieceBitMappingVerified"])
        self.assertNotIn("references",release)
        self.assertEqual(release["state"],"published")
    def test_unverified_or_partial_receipt_fails(self):
        doc,receipt=self.fixture()
        receipt["canonicalMetadataVerified"]=False
        with self.assertRaisesRegex(ValueError,"receipt required"):
            project(doc,receipt,"1.27.0")
        receipt["canonicalMetadataVerified"]=True
        receipt["objects"].pop(next(iter(receipt["objects"])))
        with self.assertRaisesRegex(ValueError,"Receipt/index mismatch"):
            project(doc,receipt,"1.27.0")
    def test_wrong_thumbnail_fails(self):
        doc,receipt=self.fixture()
        doc["images"]["b"*64]["width"]=513
        with self.assertRaisesRegex(ValueError,"Thumbnail policy"):
            project(doc,receipt,"1.27.0")
if __name__=="__main__":
    unittest.main()
