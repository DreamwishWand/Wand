"""Synthetic private overlay exporter tests; no game files required."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from export_private_overlay import export


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json.dumps(value, sort_keys=True).encode())


def fixture(folder):
    folder = Path(folder)
    source_items = folder / 'input' / 'items.jsonl'
    source_manifest = folder / 'input' / 'manifest.json'
    mapping = folder / 'input' / 'map.jsonl'
    report = folder / 'input' / 'join.json'
    source_items.parent.mkdir(parents=True)
    source = []
    mappings = []
    for n in range(1, 257):
        guid = 'guid:' + f'{n:032x}'
        source.append({'itemId':n, 'iconGuid':guid, 'nativeCategory':'Furniture'})
        image = None
        if n % 2:
            h = f'{n:064x}'
            image = {
                'assetClass':'Sprite','assetId':'unity:fixture:'+str(n)+':Sprite',
                'counterpartAssetId': 'unity:fixture:'+str(n)+':Texture2D',
                'identityEvidence':'exact_catalog_key_and_serialized_bundle_path_id',
                'decodedSha256':h,
                'variants':{
                    'detail':{'path':f'images/detail/{h[:2]}/{h}.webp',
                              'sha256':'a'*64,'width':200,'height':200},
                    'thumbnail':{'path':f'images/thumbnail/{h[:2]}/{h}.webp',
                                 'sha256':'b'*64,'width':128,'height':128},
                }
            }
        mappings.append({'itemId':n,'nativeCategory':'Furniture',
                         'iconGuid':guid,'status':'verified' if image else 'unresolved',
                         'image':image})
    original = ('\n'.join(json.dumps(row) for row in source)+'\n').encode()
    joined = ('\n'.join(json.dumps(row) for row in mappings)+'\n').encode()
    source_items.write_bytes(original)
    mapping.write_bytes(joined)
    put(source_manifest,{'schema':'wand.src01.steam-native@1',
                         'platform':'Steam','gameVersion':'1.26.2',
                         'itemsSha256':sha(original),'itemCount':256})
    put(report,{'schema':'wand.src04.item-icon-join@1',
                'publicationApproved':False,
                'source':{'sourceItemSha256':sha(original)},
                'files':{'itemMapJsonl':{'sha256':sha(joined)}},
                'totals':{'itemCount':256,'verifiedItemCount':128,
                          'unresolvedItemCount':128,'uniqueGuidCount':256,
                          'verifiedGuidCount':128,'unresolvedGuidCount':128}})
    return source_items,source_manifest,mapping,report


class PrivateOverlayTests(unittest.TestCase):
    def test_256_hash_pinned_buckets_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            inputs=fixture(tmp)
            out=Path(tmp)/'private-overlay'
            result=export(*inputs, out)
            self.assertEqual(result['coverage']['verifiedItems'],128)
            self.assertEqual(len(result['files']),256)
            self.assertFalse(result['publicationAuthorized'])
            self.assertFalse(result['coverage']['complete'])
            for relative,meta in result['files'].items():
                raw=(out/relative).read_bytes()
                self.assertEqual(meta['sha256'],sha(raw))
                self.assertEqual(meta['count'],1)
            with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE'):
                export(*inputs,out)

    def test_input_digest_mismatch_rejected_without_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            inputs=fixture(tmp)
            inputs[2].write_bytes(inputs[2].read_bytes()+b'corrupted')
            out=Path(tmp)/'private-overlay'
            with self.assertRaisesRegex(ValueError,'JOIN_DIGEST'):
                export(*inputs,out)
            self.assertFalse(out.exists())

    def test_unsafe_image_path_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            inputs=fixture(tmp)
            rows=[json.loads(line) for line in inputs[2].read_bytes().splitlines()]
            rows[0]['image']['variants']['thumbnail']['path']='../../invalid.webp'
            changed=('\n'.join(json.dumps(row) for row in rows)+'\n').encode()
            inputs[2].write_bytes(changed)
            report=json.loads(inputs[3].read_text())
            report['files']['itemMapJsonl']['sha256']=sha(changed)
            put(inputs[3],report)
            out=Path(tmp)/'private-overlay'
            with self.assertRaisesRegex(ValueError,'VARIANT_PATH'):
                export(*inputs,out)
            self.assertFalse(out.exists())


if __name__=='__main__':
    unittest.main()
