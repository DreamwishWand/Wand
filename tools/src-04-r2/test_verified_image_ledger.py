import unittest
from verified_image_ledger import build,index,lookup,delta,SCHEMA,PROFILE

class TestVerifiedLedger(unittest.TestCase):
    def setUp(self):
        self.s='a'*64
        self.h='b'*64
        self.m={'width':2,'height':3,'kind':'texture','pixelSha256':'c'*64}
        self.plan={'schema':'wand.src04.native-map-lossless-plan@1','gameVersion':'1.26.2',
            'images':{self.s:{'sourceSha256':self.s,'sha256':self.h,'bytes':100,'witness':self.m}},
            'totalBytes':100,'sourceIdentityCount':1}
        self.audit={'schema':'wand.src04.native-cdn-audit-input@1','gameVersion':'1.26.2','images':{self.h:self.m}}
        self.pub={'schema':'wand.src04.native-map-publication-plan@1','gameVersion':'1.26.2',
                  'canonicalMetadataVerified':True,'objects':{'images/'+self.h+'.webp':100}}
        self.cdn={'cdnVerified':True,'errors':{},'verified':{self.h:{'bytes':100,'width':2,'height':3}}}

    def test_reuse_without_local_files(self):
        doc=build(self.plan,self.audit,self.pub,self.cdn)
        prior=index(doc)
        reused=lookup(prior,'d'*64,self.m)
        self.assertEqual(reused['sha256'],self.h)
        self.assertTrue(reused['reusedPublished'])
        changed={**self.m,'pixelSha256':'e'*64}
        self.assertIsNone(lookup(prior,self.s,changed))
        self.assertEqual(delta(prior,{self.s:self.m,'d'*64:changed})['needsLocalPreparation'],1)

    def test_reject_incomplete_cdn(self):
        self.cdn['verified']={}
        with self.assertRaises(ValueError):build(self.plan,self.audit,self.pub,self.cdn)

    def test_reject_unverified_metadata(self):
        self.pub['canonicalMetadataVerified']=False
        with self.assertRaises(ValueError):build(self.plan,self.audit,self.pub,self.cdn)

    def test_preserve_old_release(self):
        doc=build(self.plan,self.audit,self.pub,self.cdn)
        self.plan['gameVersion']=self.audit['gameVersion']=self.pub['gameVersion']='1.27.0'
        new=build(self.plan,self.audit,self.pub,self.cdn,doc)
        self.assertEqual(len(new['images']),1)
        self.assertEqual(set(new['releases']),{'1.26.2','1.27.0'})

if __name__=='__main__':unittest.main()
