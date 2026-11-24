import unittest
from publish_bundle_thumbnails import plan,key
class PlanTests(unittest.TestCase):
    def test_public_scope_and_reuse(self):
        a,b,c,d=[x*64 for x in "abcd"]
        o=lambda sha:{"sha256":sha,"width":1200,"height":600,"bytes":100}
        t=lambda sha:{"sha256":sha,"width":512,"height":256,"bytes":20}
        pairs={a:(o(a),t(c)),b:(o(b),t(d))}
        thumbs={key(c):t(c),key(d):t(d)}
        existing,pending,skipped=plan(pairs,thumbs,{a:{100},b:{99}},{key(c):20})
        self.assertEqual(list(existing),[key(c)])
        self.assertFalse(pending)
        self.assertEqual(skipped,1)
        existing,pending,skipped=plan(pairs,thumbs,{a:{100},b:{100}},{})
        self.assertEqual(len(pending),2)
        self.assertEqual(skipped,0)
if __name__=="__main__":
    unittest.main()
