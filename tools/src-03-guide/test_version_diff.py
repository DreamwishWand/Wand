"""Version-diff guards: missing source cannot become fabricated removals."""
import json
import tempfile
import unittest
from pathlib import Path
from version_diff import compare_snapshots


class VersionComparisonTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.old=self.root/'old';self.new=self.root/'new'
        self.old.mkdir();self.new.mkdir()

    def write(self,folder,manifest,**files):
        (folder/'manifest.json').write_text(json.dumps(manifest))
        for file,records in files.items():
            path=folder/'guide'/file
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(json.dumps({'records':records}))

    def base_manifest(self,version,quests=True,static=False):
        return {'schema':'wand.db03.native-guide@1',
           'target':{'platform':'Steam','gameVersion':version},
           'sources':{'quests':{'sha256':'1'*64}} if quests else {},
           'protoDbStatic':{'status':'STATIC_SOURCE_ONLY' if static else 'not_present'},
           'friendshipRewardSource':None}

    def mission(self,digest='a'*64,translation='Hello',derived=None):
        return {'id':'2070000001','nativeWireSha256':digest,
                'localizedText':{'name':{'en':translation}},
                'steps':[{'localizedText':{'S':{'ja':'案内'}}}],
                'structured':derived or {}}

    def test_derived_schema_changes_do_not_look_like_game_diff(self):
        self.write(self.old,self.base_manifest('1.26.1'),**{'quests.json':[self.mission()]})
        self.write(self.new,self.base_manifest('1.26.2'),**{'quests.json':[
            self.mission(derived={'itemTargets':[{'itemId':'30000031'}]})]})
        d=compare_snapshots(self.old,self.new)
        self.assertEqual(d['status'],'COMPARED')
        self.assertEqual(d['changed'],[])
        self.assertEqual(d['comparedFamilies'],['quests'])

    def test_wire_and_localization_changes_detected(self):
        self.write(self.old,self.base_manifest('1.26.1'),**{'quests.json':[self.mission()]})
        self.write(self.new,self.base_manifest('1.26.2'),**{'quests.json':[
            self.mission(translation='New text')]})
        self.assertEqual(compare_snapshots(self.old,self.new)['changed'],
                         [{'family':'quests','id':'2070000001'}])
        self.write(self.new,self.base_manifest('1.26.2'),**{'quests.json':[
            self.mission(digest='b'*64)]})
        self.assertEqual(compare_snapshots(self.old,self.new)['changed'],
                         [{'family':'quests','id':'2070000001'}])

    def test_missing_new_native_source_skipped_not_removed(self):
        self.write(self.old,self.base_manifest('1.26.1'),**{'quests.json':[self.mission()]})
        self.write(self.new,self.base_manifest('1.26.2',quests=False),
                   **{'quests.json':[]})
        d=compare_snapshots(self.old,self.new)
        self.assertEqual(d['removed'],[])
        self.assertEqual(d['changed'],[])
        self.assertEqual(d['status'],'PARTIAL_COMPARISON')
        self.assertEqual(d['uncomparedFamilies'][0]['reason'],
                         'source_absent_from_current_snapshot')

    def test_proto_static_diff_without_live_claim(self):
        old=self.base_manifest('1.26.1',quests=False,static=True)
        new=self.base_manifest('1.26.2',quests=False,static=True)
        original={'id':'DreamSnap_X','source':{'nativeWireSha256':'a'*64},
                  'text':{'title':{'localizedText':{'en':'X'}}}}
        updated={**original,'source':{'nativeWireSha256':'b'*64}}
        self.write(self.old,old,**{'design-challenges.json':[original],
                                    'starpath-ftue.json':[]})
        self.write(self.new,new,**{'design-challenges.json':[updated],
                                    'starpath-ftue.json':[]})
        d=compare_snapshots(self.old,self.new)
        self.assertEqual(d['status'],'COMPARED')
        self.assertEqual(d['changed'],[{'family':'designChallenges','id':'DreamSnap_X'}])
        self.assertIn('starPathFtue',d['comparedFamilies'])

    def test_old_projection_without_wire_sha_not_comparable(self):
        old=self.base_manifest('1.26.1')
        new=self.base_manifest('1.26.2')
        self.write(self.old,old,**{'quests.json':[{'id':'2070000001','localizedText':{}}]})
        self.write(self.new,new,**{'quests.json':[self.mission()]})
        d=compare_snapshots(self.old,self.new)
        self.assertEqual(d['status'],'PARTIAL_COMPARISON')
        self.assertEqual(d['added'],[])
        self.assertEqual(d['uncomparedFamilies'][0]['reason'],
                         'native_wire_fingerprint_unavailable')

    def test_cross_platform_diff_rejected(self):
        old=self.base_manifest('1.26.1')
        new=self.base_manifest('1.26.2')
        new['target']['platform']='Switch'
        self.write(self.old,old,**{'quests.json':[self.mission()]})
        self.write(self.new,new,**{'quests.json':[self.mission()]})
        with self.assertRaises(ValueError):compare_snapshots(self.old,self.new)

    def test_same_directory_rejected(self):
        self.write(self.old,self.base_manifest('1.26.1'))
        with self.assertRaises(ValueError):compare_snapshots(self.old,self.old)


if __name__=='__main__':unittest.main()
