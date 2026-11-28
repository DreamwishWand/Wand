import json
import unittest
from import_premium_bundles import PRIVATE_SCHEMA
from append_premium_weekly_cache import append_cache

class WeeklyCacheTests(unittest.TestCase):
    def fixture(self, quantity, active=True):
        offer = {'Id':'NewBundle','Data':{'OnlineId':'NewBundle','Language':'en-US','Active':active,
            'Contents':[{'ItemId':12,'Quantity':quantity}], 'Price':123}}
        snap = {'OnlineId':'ShopExample','Language':'en-US','Categories':[{'Title':'Featured',
            'Data':{'Featured':{'Bundles':[offer], 'Stores':[{'Id':'Store','Data':{'BundleContents':[offer]}}]}}}]}
        return json.dumps({'Data':{'ShopExample':json.dumps(snap)}}).encode()
    def test_append_idempotent_and_no_server_promotion(self):
        base={'schema':PRIVATE_SCHEMA,'privateOnly':True,'publicationAuthorized':False,'bundles':{},'serverDefinitions':{}}
        a=append_cache(base,self.fixture(1),'2026-11-27T10:40:01+09:00','Switch',None)
        self.assertEqual(a,append_cache(a,self.fixture(1),'2026-11-27T10:40:01+09:00','Switch',None))
        b=append_cache(a,self.fixture(2,False),'2026-11-28T10:40:01+09:00','Switch',None)
        self.assertEqual(len(b['weeklyCache']['captures']),2)
        self.assertEqual(len(b['weeklyCache']['byBundle']['NewBundle']),4)
        self.assertEqual([r[3] for r in b['weeklyCache']['byItem']['12']],[1,1,2,2])
        self.assertEqual(b['serverDefinitions'],{})
        self.assertEqual(b['bundles'],{})
        self.assertNotIn('weeklyCache',base)
    def test_reject_naive_date(self):
        with self.assertRaises(ValueError):
            append_cache({'schema':PRIVATE_SCHEMA,'privateOnly':True,'publicationAuthorized':False},self.fixture(1),'2026-11-28T10:40:01','Steam','1.26.2')
