"""Synthetic protobuf fixtures for the source-validated static ProtoDB projector."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).parent))
import native_guide as n
from protodb_static import project_protodb, LiveopsResolver


def vf(number, value):
    return n.encode_varint((number<<3)|0)+n.encode_varint(value)

def sf(number, value):
    if isinstance(value,str): value=value.encode('utf-8')
    return n.encode_varint((number<<3)|2)+n.encode_varint(len(value))+value

def item(name, group, cls, fields):
    envelope=(sf(2,group)+sf(3,name)+sf(4,group+'.'+name+'.proto.json')+
              sf(5,cls)+sf(6,fields))
    return sf(1, sf(1,name)+sf(2,envelope))

def localized(key, value=None):
    inner=sf(1,key)
    if value is not None:inner+=sf(2,value)
    return sf(1,inner)

class ProtoDbStaticTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name)
        self.origin=self.root/'StreamingAssets'
        self.origin.mkdir()
        (self.origin/'Localization').mkdir()
        self.out=self.root/'output'
        design=(sf(2,'Liveops.DreamSnapX_Title')+
                sf(3,'Liveops.DreamSnapX_Description')+
                sf(4,'Liveops.DreamSnapX_ShortDescription')+
                sf(5,'1.26')+vf(9,1)+vf(7,31400069)+
                sf(11,vf(1,1)+vf(2,123)))
        ftue=(sf(1,'Liveops.StarPathFTUE_Title')+vf(6,3)+vf(7,6)+
              vf(13,2070001657)+sf(9,b'first')+sf(9,b'second'))
        (self.origin/'protoDb.bin').write_bytes(
            item('DreamSnapX','Liveops/Online/DesignChallenges',
                 'Definitions.DesignChallengeData',design)+
            item('StarPathFTUE','StarPathFtue',
                 'Definitions.StarPathFtueConfig',ftue))
        for loc,title in [('en-US','The Dream'),('ja','夢のチャレンジ')]:
            with zipfile.ZipFile(self.origin/'Localization'/f'LocDB_{loc}.zip','w') as z:
                z.writestr('Liveops.locbin',
                    localized('UnusedNoValue')+
                    localized('DreamSnapX_Title',title)+
                    localized('DreamSnapX_Description','A challenge')+
                    localized('DreamSnapX_ShortDescription','Description')+
                    localized('StarPathFTUE_Title','Start path'))

    def run_static(self):
        loc=n.LocaleResolver(self.origin/'Localization')
        try:
            return project_protodb(self.origin,self.out,
                 {'platform':'Steam','gameVersion':'1.26.1'},loc,n.wire_fields,
                 n.text_field,n.int_field,n.sha,n.source_data,n.save,n.plain_display,
                 {'2070001657'})
        finally:
            loc.close()

    def test_static_design_and_starpath_and_missing_locales(self):
        report=self.run_static()
        self.assertEqual(report['designChallenges'],1)
        self.assertEqual(report['starPathFtue'],1)
        rows=json.loads((self.out/'guide/design-challenges.json').read_text())['records']
        self.assertEqual(rows[0]['text']['title']['plainText']['ja'],'夢のチャレンジ')
        self.assertEqual(rows[0]['nativeRewardIds']['decorReward'],'31400069')
        self.assertTrue(rows[0]['staticActiveFlag'])
        self.assertEqual(len(rows[0]['staticDatePayloads']),1)
        star=json.loads((self.out/'guide/starpath-ftue.json').read_text())['records'][0]
        self.assertEqual(star['ftueQuestLinkStatus'],'resolved')
        self.assertEqual(len(star['rewardPagePayloadSha256']),2)
        self.assertEqual(len(star['text']['title']['plainText']),2)
        self.assertEqual(json.loads((self.out/'protodb-static-manifest.json').read_text())['status'],
                         'STATIC_SOURCE_ONLY')

    def test_key_only_localization_does_not_invent_text(self):
        loc=n.LocaleResolver(self.origin/'Localization')
        try:
            reader=LiveopsResolver(loc,n.wire_fields)
            values,_=reader.resolve('Liveops.UnusedNoValue')
            self.assertEqual(values,{})
        finally:
            loc.close()

    def test_malformed_entry_rejected(self):
        (self.origin/'protoDb.bin').write_bytes(sf(3,b'Invalid'))
        with self.assertRaises(ValueError):
            self.run_static()

if __name__=='__main__':
    unittest.main()
