import copy
import json
import unittest
from publish_item_256_index import prepare, BUCKET, pin

class NextIndexTests(unittest.TestCase):
    def fixture(self):
        a,b='a'*64,'b'*64
        index={'schema':'wand.media.item-index@256-v1','gameVersion':'1.27.0',
               'thumbnailPolicy':'lossless-webp-lanczos-256-v1','maxThumbnailLongEdge':256,
               'items':{'257':[a,b],'2':[b,b]},
               'images':{a:{'sha256':a,'width':512,'height':256,'bytes':100},
                         b:{'sha256':b,'width':256,'height':128,'bytes':50}}}
        receipt={'schema':'wand.media.item-256-publication-receipt@1','bucket':BUCKET,
                 'canonicalMetadataVerified':True,'objects':{'images/'+a+'.webp':100,'images/'+b+'.webp':50}}
        return index,receipt

    def test_future_index_exact_pin_and_version(self):
        index,receipt=self.fixture()
        payloads,p=prepare(index,receipt,version='steam-1.27.0')
        self.assertEqual(len(payloads),257)
        doc=json.loads(payloads['manifest.json'])
        self.assertEqual(doc['gameVersion'],'steam-1.27.0')
        self.assertEqual(doc['totalItems'],2)
        self.assertEqual(doc['files']['id/01.json']['sha256'],pin(payloads['id/01.json'])['sha256'])
        self.assertEqual(prepare(index,receipt,version='steam-1.27.0',expected_manifest=p['sha256'])[1],p)
        with self.assertRaisesRegex(ValueError,'manifest hash'):
            prepare(index,receipt,version='steam-1.27.0',expected_manifest='0'*64)

    def test_reject_wrong_release_or_incomplete_receipt(self):
        index,receipt=self.fixture()
        with self.assertRaisesRegex(ValueError,'Unexpected index'):
            prepare(index,receipt,version='steam-1.28.0')
        bad=copy.deepcopy(receipt)
        bad['objects'].pop(next(iter(bad['objects'])))
        with self.assertRaisesRegex(ValueError,'Receipt/index mismatch'):
            prepare(index,bad,version='steam-1.27.0')

    def test_reject_noncanonical_small_original_and_oversized_thumbnail(self):
        index,receipt=self.fixture()
        index['images']['b'*64]['width']=257
        with self.assertRaisesRegex(ValueError,'Thumbnail policy'):
            prepare(index,receipt,version='steam-1.27.0')

if __name__=='__main__':
    unittest.main()
