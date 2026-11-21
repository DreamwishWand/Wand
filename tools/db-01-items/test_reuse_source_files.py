"""Synthetic source scans prove only exact unchanged original bytes are reused."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import reuse_source_files as reuse


def sha(data):
    return hashlib.sha256(data).hexdigest()


class PrivateSourceReuseTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.prior=self.root/'prior-steam'
        self.prior.mkdir()
        self.out=self.root/'private-reuse'
        self.target=self.root/'source-manifest.json'
        self.a='ddv_Data/StreamingAssets/itemlist/ActivityItem.json'
        self.b='ddv_Data/StreamingAssets/itemlist/Condition.json'
        self.c='ddv_Data/StreamingAssets/Localization/LocDB_en-US.zip'
        self.expected={
            self.a:b'unchanged native activity original bytes',
            self.b:b'changed target Condition original bytes',
            self.c:b'unchanged current localization ZIP bytes',
        }
        self.write_prior(self.a,self.expected[self.a])
        self.write_prior(self.b,b'prior version Condition')
        self.write_prior(self.c,self.expected[self.c])
        self.write_scan()

    def write_prior(self,relative,value):
        target=self.prior/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(value)

    def write_scan(self,records=None):
        files=[{'path':key,'size':len(data),'sha256':sha(data),'hash_source':'calculated'}
               for key,data in self.expected.items()]
        files.append({'path':'GameAssembly.dll','size':1,'sha256':sha(b'X'),'hash_source':'calculated'})
        if records is not None:
            files=records
        manifest={
            'schema_version':1,'platform':{'value':'steam','status':'verified_from_files'},
            'game_version':{'value':'1.27.0','status':'verified_from_file'},
            'status':'complete','files':files,
        }
        self.target.write_text(json.dumps(manifest),encoding='utf-8')

    def test_reuse_only_byte_identical_current_targets_and_replay_from_cache(self):
        first=reuse.run(self.target,self.prior,self.out)
        self.assertEqual(first['candidateFiles'],3)
        self.assertEqual(first['reusedFiles'],2)
        self.assertEqual(first['copiedFiles'],2)
        self.assertEqual(first['needsCurrentSource'],1)
        self.assertFalse(first['publicationAuthorized'])
        workspace=Path(first['workspace'])
        self.assertEqual((workspace/self.a).read_bytes(),self.expected[self.a])
        self.assertEqual((workspace/self.c).read_bytes(),self.expected[self.c])
        self.assertFalse((workspace/self.b).exists())
        report=json.loads(Path(first['report']).read_bytes())
        self.assertEqual(report['needsCurrentSource'],
                         [{'path':self.b,'status':'needs_current_source'}])
        second=reuse.run(self.target,self.prior,self.out)
        self.assertEqual(second['copiedFiles'],0)
        self.assertEqual(second['cachedFiles'],2)
        self.assertEqual(second['status'],'reused')
        self.assertEqual(Path(second['report']).read_bytes(),Path(first['report']).read_bytes())

    def test_wrong_trusted_scan_pin_fails_before_creating_private_outputs(self):
        with self.assertRaisesRegex(ValueError,'TARGET_SCAN_SHA_MISMATCH'):
            reuse.run(self.target,self.prior,self.out,expected_scan_sha256='0'*64)
        self.assertFalse(self.out.exists())

    def test_unsafe_scan_paths_and_symlink_sources_never_copied(self):
        record={'path':'ddv_Data/StreamingAssets/itemlist/../outside.json',
                'size':1,'sha256':sha(b'X')}
        self.write_scan(records=[record])
        with self.assertRaisesRegex(ValueError,'BAD_RELATIVE_PATH'):
            reuse.run(self.target,self.prior,self.out)
        self.write_scan()
        (self.prior/self.a).unlink()
        (self.prior/self.a).symlink_to(self.prior/self.c)
        result=reuse.run(self.target,self.prior,self.out)
        self.assertEqual(result['reusedFiles'],1)
        self.assertEqual(result['needsCurrentSource'],2)

    def test_rejects_stale_cached_output_and_source_tree_overlap(self):
        with self.assertRaisesRegex(ValueError,'OUTPUT_OVERLAPS_SOURCE'):
            reuse.run(self.target,self.prior,self.prior/'copied')
        original=reuse.run(self.target,self.prior,self.out)
        copied=Path(original['workspace'])/self.a
        copied.write_bytes(b'malicious replacement')
        with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE_OR_STALE_CACHE'):
            reuse.run(self.target,self.prior,self.out)

    def test_changed_scan_fingerprint_makes_new_private_workspace(self):
        first=reuse.run(self.target,self.prior,self.out)
        self.expected[self.b]=b'prior version Condition'
        self.write_scan()
        second=reuse.run(self.target,self.prior,self.out)
        self.assertNotEqual(first['workspace'],second['workspace'])
        self.assertEqual(second['reusedFiles'],3)
        self.assertTrue((Path(first['workspace'])/self.a).exists())


if __name__=='__main__':
    unittest.main()
