"""Synthetic source and ZIP path boundary tests for DB-03 locale payload equivalence."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from locale_payload_bridge import LOCALES, compare, inspect_zip, main

def sha(data):return hashlib.sha256(data).hexdigest()

class LocalePayloadBridgeTests(unittest.TestCase):
    def setUp(self):
        t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup)
        self.root=Path(t.name);self.old=self.root/'old';self.new=self.root/'new'
        self.old.mkdir();self.new.mkdir()
        self.manifest={'schema':'wand.db03.native-guide@1',
                       'target':{'gameVersion':'1.26.1','platform':'Steam'},
                       'localizationSources':{}}
        self.probe={'schema':'wand.src01.format-probe@1',
                    'gameVersion':'1.26.2','platform':'Steam','localization':{}}
        self.source={}
        for locale,suffix in LOCALES.items():
            name='LocDB_'+suffix+'.zip'
            old=self.old/name;new=self.new/name
            self.zip(old,{'quest.locbin':b'some same game text','world.locbin':b'another payload'},1)
            self.zip(new,{'world.locbin':b'another payload','quest.locbin':b'some same game text'},2)
            self.manifest['localizationSources'][locale]={'file':name,'sha256':sha(old.read_bytes())}
            self.probe['localization'][locale]={
                'status':'inspected','source':'ddv_Data/StreamingAssets/Localization/'+name,
                'sha256':sha(new.read_bytes()),'archiveEntries':2}
            self.source[locale]=(old,new)
    @staticmethod
    def zip(file, items, timestamp_marker):
        with zipfile.ZipFile(file,'w',compression=zipfile.ZIP_STORED) as archive:
            for name, data in items.items():
                info=zipfile.ZipInfo(name,date_time=(2026,11,21,0,0,timestamp_marker*2))
                info.compress_type=zipfile.ZIP_DEFLATED if timestamp_marker==2 else zipfile.ZIP_STORED
                archive.writestr(info,data)
    def make(self, **options):
        return compare(self.old,self.new,
                       options.pop('manifest',self.manifest),
                       options.pop('probe',self.probe),
                       sha(b'original manifest'), sha(b'original probe'))
    def test_same_member_payload_different_zip_metadata_can_be_reused(self):
        report=self.make()
        self.assertEqual(report['status'],'PAYLOAD_IDENTICAL_ALL_EIGHT_LOCALES')
        self.assertEqual(report['localeCount'],8)
        self.assertEqual(report['memberComparisons'],16)
        for entry in report['locales'].values():
            self.assertTrue(entry['memberPayloadsIdentical'])
            self.assertFalse(entry['zipContainerBytesIdentical'])
            self.assertEqual(entry['baseline']['memberTreeSha256'],entry['target']['memberTreeSha256'])
    def test_one_changed_source_member_blocks_equivalence(self):
        p=self.new/'LocDB_ja.zip'
        self.zip(p,{'quest.locbin':b'changed text','world.locbin':b'another payload'},2)
        self.probe['localization']['ja']['sha256']=sha(p.read_bytes())
        report=self.make()
        self.assertEqual(report['status'],'PAYLOAD_CHANGED_REEXTRACT_REQUIRED')
        self.assertEqual(report['locales']['ja']['changedMemberPayloads'],1)
        self.assertFalse(report['locales']['ja']['memberPayloadsIdentical'])
        self.assertTrue(report['locales']['en']['memberPayloadsIdentical'])
    def test_added_member_blocks_equivalence_even_when_existing_payloads_same(self):
        p=self.new/'LocDB_de.zip'
        self.zip(p,{'quest.locbin':b'some same game text','world.locbin':b'another payload',
                    'extra.locbin':b'new member'},2)
        self.probe['localization']['de']['sha256']=sha(p.read_bytes())
        self.probe['localization']['de']['archiveEntries']=3
        report=self.make()
        self.assertEqual(report['locales']['de']['addedMembers'],1)
        self.assertEqual(report['status'],'PAYLOAD_CHANGED_REEXTRACT_REQUIRED')
    def test_wrong_target_probe_digest_or_census_rejected(self):
        self.probe['localization']['ja']['sha256']=sha(b'tampered')
        with self.assertRaisesRegex(ValueError,'ZIP_SHA_MISMATCH'):self.make()
        self.probe['localization']['ja']['sha256']=sha(self.source['ja'][1].read_bytes())
        self.probe['localization']['ja']['archiveEntries']=999
        with self.assertRaisesRegex(ValueError,'ZIP_CENSUS_MISMATCH'):self.make()
    def test_missing_platform_and_source_provenance_rejected(self):
        p=copy.deepcopy(self.probe);p['platform']='Switch'
        with self.assertRaisesRegex(ValueError,'VERSION_PROVENANCE'):self.make(probe=p)
        p=copy.deepcopy(self.probe);p['localization']['ja']['source']='other.zip'
        with self.assertRaisesRegex(ValueError,'LOCALE_SOURCE_PROVENANCE'):self.make(probe=p)
        p=copy.deepcopy(self.probe);p['localization'].pop('ja')
        with self.assertRaisesRegex(ValueError,'MISSING_LOCALE_PROVENANCE'):self.make(probe=p)
    def test_duplicate_names_traversal_and_wrong_extension_rejected(self):
        p=self.new/'bad.zip'
        with zipfile.ZipFile(p,'w') as a:
            a.writestr('../other.locbin',b'x')
        with self.assertRaisesRegex(ValueError,'UNSAFE_ZIP_MEMBER_PATH'):
            inspect_zip(p,sha(p.read_bytes()))
        with zipfile.ZipFile(p,'w') as a:
            a.writestr('text.locbin',b'x')
            a.writestr('text.locbin',b'y')
        with self.assertRaisesRegex(ValueError,'DUPLICATE_OR_EMPTY_ZIP_PATH'):
            inspect_zip(p,sha(p.read_bytes()))
        with zipfile.ZipFile(p,'w') as a:
            a.writestr('README.md',b'hello')
        with self.assertRaisesRegex(ValueError,'UNSAFE_ZIP_MEMBER_PATH'):
            inspect_zip(p,sha(p.read_bytes()))
    def test_cli_writes_owner_private_manifest_and_rejects_source_output_overlap(self):
        manifest=self.root/'baseline.json';probe=self.root/'target.json'
        manifest.write_text(json.dumps(self.manifest));probe.write_text(json.dumps(self.probe))
        out=self.root/'reports'/'locale.json'
        args=['--baseline-loc-dir',str(self.old),'--target-loc-dir',str(self.new),
              '--baseline-manifest',str(manifest),'--target-probe',str(probe),
              '--out',str(out)]
        self.assertEqual(main(args),0)
        stored=json.loads(out.read_text())
        self.assertEqual(stored['status'],'PAYLOAD_IDENTICAL_ALL_EIGHT_LOCALES')
        self.assertNotIn('some same game text',out.read_text())
        with self.assertRaisesRegex(ValueError,'OUTPUT_SOURCE_OVERLAP'):
            main(args[:-1]+[str(self.old/'local.json')])

if __name__=='__main__':unittest.main()
