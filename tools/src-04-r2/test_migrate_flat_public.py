import unittest
from migrate_flat_public import Budget, build_plan, apply_plan, canonical_sha, PUBLIC_BUCKET, PRIVATE_BUCKET, SOURCE_PREFIX
from plan_public_upload import image_key, PUBLIC_CACHE_CONTROL
A="a"*64
B="b"*64
C="c"*64
REL="images-v2/original/aa/"+A+".webp"
FILES={REL:(A,100,128,64,"original")}
class Fake:
    def __init__(self):
        self.objects={(PRIVATE_BUCKET,SOURCE_PREFIX+"/"+REL):self.obj(A,100),
                      (PUBLIC_BUCKET,"media/shared/original/bb/"+B+".webp"):self.obj(B,200),
                      (PUBLIC_BUCKET,image_key(C)):self.obj(C,300,True),
                      (PUBLIC_BUCKET,"unrelated.json"):self.obj(C,10)}
        self.copies=[]
    def obj(self,sha,size,canonical=False):
        return {"ContentLength":size,"ContentType":"image/webp","Metadata":{"sha256":sha},
                "ETag":'"'+sha+'"',"CacheControl":PUBLIC_CACHE_CONTROL if canonical else "private, no-store"}
    def list_objects_v2(self,Bucket,Prefix,MaxKeys):
        return {"IsTruncated":False,"Contents":[{"Key":k,"Size":v["ContentLength"]}
                 for (b,k),v in self.objects.items() if b==Bucket and k.startswith(Prefix)]}
    def head_object(self,Bucket,Key):
        return self.objects[Bucket,Key]
    def copy_object(self,**kw):
        dest=(kw["Bucket"],kw["Key"])
        assert dest not in self.objects
        source=self.objects[kw["CopySource"]["Bucket"],kw["CopySource"]["Key"]]
        assert kw["CopySourceIfMatch"]==source["ETag"]
        assert kw["MetadataDirective"]=="REPLACE"
        self.objects[dest]=self.obj(kw["Metadata"]["sha256"],source["ContentLength"],True)
        self.copies.append(dest)
class MigrationTests(unittest.TestCase):
    def test_plan_and_resume(self):
        f=Fake()
        p=build_plan(f,FILES,Budget(50,50,1000))
        self.assertEqual(p["copyCount"],2)
        self.assertEqual(p["reuseCount"],1)
        self.assertEqual(p["unclassifiedPublicObjects"],1)
        self.assertEqual(f.copies,[])
        r=apply_plan(f,p,FILES,Budget(50,50,1000))
        self.assertEqual(set(r),{image_key(A),image_key(B),image_key(C)})
        self.assertEqual(len(f.copies),2)
        self.assertEqual(apply_plan(f,p,FILES,Budget(50,50,0)),r)
        self.assertEqual(len(f.copies),2)
    def test_budget_stops_before_copy(self):
        f=Fake()
        p=build_plan(f,FILES,Budget(50,50,1000))
        with self.assertRaisesRegex(ValueError,"MIGRATION_BUDGET"):
            apply_plan(f,p,FILES,Budget(50,50,299))
        self.assertEqual(f.copies,[])
    def test_unapproved_private_source_is_rejected(self):
        f=Fake()
        p=build_plan(f,FILES,Budget(50,50,1000))
        p["objects"][0]["sourceKey"]="private/save.webp"
        with self.assertRaisesRegex(ValueError,"MIGRATION_PRIVATE_SCOPE"):
            apply_plan(f,p,FILES,Budget(50,50,1000))
        self.assertEqual(f.copies,[])
    def test_prefix_mismatch(self):
        self.assertIsNone(canonical_sha("media/shared/original/aa/"+B+".webp"))
if __name__=="__main__":
    unittest.main()
