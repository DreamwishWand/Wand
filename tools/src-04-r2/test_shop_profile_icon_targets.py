import unittest
from shop_profile_icon_targets import select

def catalog(components):
    return {"schema":"wand.item-master.premium-bundle-source@1","source":{"steam":{"platform":"Steam","gameVersion":"1.26.2"}},"counts":{"publicDefinitions":1},"definitions":[{"bundleId":"test","current":{"gameVersion":"1.26.2","components":components}}]}
class ProfileIconTargets(unittest.TestCase):
    def test_selection_and_evolved_targets(self):
        a,b,c,d,e=["guid:"+x*32 for x in "abcde"]
        items={50000001:(a,b,[50000002]),50000002:(c,d,[]),50000003:(e,e,[])}
        doc=catalog([{"itemId":50000001,"image":a},{"itemId":50000003,"image":None},{"itemId":50000003,"image":None}])
        ids,bundles,targets=select(doc,items)
        self.assertEqual(ids,{50000002,50000003})
        self.assertEqual(bundles,{"test"})
        self.assertEqual(targets,{d[5:]})
        doc["definitions"][0]["current"]["components"][0]["image"]=None
        self.assertEqual(select(doc,items)[2],{b[5:],d[5:]})
    def test_wrong_version_or_missing_item(self):
        doc=catalog([{"itemId":50000001,"image":None}])
        with self.assertRaises(ValueError):select(doc,{})
        doc["source"]["steam"]["gameVersion"]="1.26.3"
        with self.assertRaises(ValueError):select(doc,{})
if __name__=="__main__":unittest.main()
