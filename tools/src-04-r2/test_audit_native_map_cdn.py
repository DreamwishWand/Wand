import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from PIL import Image
from audit_native_map_cdn import verify, fetch, digest, pixels, USER_AGENT

class NativeCdnAuditTests(unittest.TestCase):
    def fixture(self):
        im=Image.new('RGBA',(2,2),(10,20,30,255))
        b=io.BytesIO();im.save(b,format='WEBP',lossless=True)
        raw=b.getvalue();sha=digest(raw)
        layer={'kind':'texture','imageSha256':sha}
        doc={'schema':'wand.src04.native-cdn-audit-input@1','gameVersion':'1.26.2',
             'privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,
             'sourceIdentityCount':118,'images':{sha:{'width':2,'height':2,'kind':'texture','pixelSha256':pixels(im,'texture')}},
             'maps':[{'id':'MapVillage'+str(i),'locked':[layer],'unlocked':[layer]} for i in range(10)]}
        return doc,raw

    def test_preflight_failure_stops(self):
        doc,raw=self.fixture()
        extra='f'*64
        doc['images'][extra]=next(iter(doc['images'].values())).copy()
        doc['maps'][0]['locked']=[*doc['maps'][0]['locked'],{'kind':'texture','imageSha256':extra}]
        calls=[]
        def reader(sha,budget):
            calls.append(sha)
            raise HTTPError('https://media.dreamwishwand.com',403,'Forbidden',{},None)
        with tempfile.TemporaryDirectory() as d:
            r=verify(doc,Path(d),reader)
            self.assertFalse(r['cdnVerified'])
            self.assertEqual(r['notAttempted'],1)
            self.assertEqual(len(calls),1)
            self.assertTrue((Path(d)/'audit.json').exists())

    def test_success_still_checks_pixels(self):
        doc,raw=self.fixture()
        with tempfile.TemporaryDirectory() as d:
            self.assertTrue(verify(doc,Path(d),lambda s,b:raw)['cdnVerified'])

    def test_identifying_user_agent(self):
        with patch('audit_native_map_cdn.build_opener') as opener:
            opener.return_value.open.side_effect=OSError('test')
            with self.assertRaises(OSError):fetch('a'*64,[100])
            request=opener.return_value.open.call_args.args[0]
            self.assertEqual(request.get_header('User-agent'),USER_AGENT)

if __name__=='__main__':unittest.main()
