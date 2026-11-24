import unittest
from plan_public_upload import image_key,plan_upload
class UploadPlanTests(unittest.TestCase):
    def test_reuse_all_versions_and_variants(self):
        a,b,c="a"*64,"b"*64,"c"*64
        self.assertEqual(image_key(a),"images/"+a+".webp")
        files={"one":(a,100,128,64,"original"),"two":(a,100,128,64,"thumbnail"),
               "three":(b,200,256,128,"original")}
        r=plan_upload(files,{image_key(b):200,image_key(c):50})
        self.assertEqual(r["uniqueImages"],2)
        self.assertEqual(r["newUploads"],1)
        self.assertEqual(r["reusedImages"],1)
        self.assertEqual(r["newBytes"],100)
        self.assertEqual(r["objects"][0]["key"],image_key(a))
        self.assertEqual(r["networkRequests"],0)
        self.assertEqual(plan_upload(files,{image_key(a):100,image_key(b):200})["newUploads"],0)
    def test_conflicting_receipt_or_dimensions_rejected(self):
        a="a"*64
        files={"one":(a,100,128,64,"original")}
        with self.assertRaisesRegex(ValueError,"PUBLIC_INVENTORY_SIZE_CONFLICT"):
            plan_upload(files,{image_key(a):99})
        with self.assertRaisesRegex(ValueError,"PUBLIC_HASH_CONFLICT"):
            plan_upload({**files,"two":(a,100,64,64,"thumbnail")},{})
        with self.assertRaisesRegex(ValueError,"PUBLIC_INVENTORY_RECORD"):
            plan_upload(files,{"original/aa/"+a+".webp":100})
if __name__=="__main__":
    unittest.main()
