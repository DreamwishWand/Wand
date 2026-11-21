"""End-to-end synthetic DB-01 versioned release, cache and corruption tests."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import audit_shards
import release_pipeline
from test_sqlite_store import fixture, sample, dumps, sha


class ReleasePipelineE2ETests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.src, self.history = fixture(self.root, history=True)
        self.out = self.root / 'private-releases'

    def test_full_build_and_sha_verified_idempotent_noop(self):
        first = release_pipeline.run(self.src, self.out, history=self.history,
                                      expected_version='1.26.2')
        self.assertEqual(first['status'], 'built')
        self.assertEqual(first['definitions'], 2)
        self.assertEqual(first['exactNames'], 1)
        self.assertTrue(first['historicalIncluded'])
        self.assertIn('steam-1.26.2', first['sqlite'])
        audit = json.loads(Path(first['audit']).read_bytes())
        self.assertEqual(audit['status'], 'PASS')
        self.assertEqual(audit['historicalEntries'], 8)
        self.assertFalse(audit['sourceCoverageComplete'])
        self.assertFalse(first['publicationAuthorized'])
        sqlite_before = Path(first['sqlite']).stat().st_mtime_ns
        second = release_pipeline.run(self.src, self.out, history=self.history)
        self.assertEqual(second['status'], 'reused')
        self.assertEqual(first['releaseFingerprint'], second['releaseFingerprint'])
        self.assertEqual(Path(first['sqlite']).stat().st_mtime_ns, sqlite_before)

    def test_source_manifest_and_rows_hash_are_verified_before_outputs(self):
        original = json.loads((self.src/'manifest.json').read_bytes())
        with self.assertRaisesRegex(ValueError, 'VERSION_MISMATCH'):
            release_pipeline.run(self.src,self.out,expected_version='1.27.0')
        with self.assertRaisesRegex(ValueError, 'MANIFEST_SHA_MISMATCH'):
            release_pipeline.run(self.src,self.out,expected_manifest_sha256='0'*64)
        with self.assertRaisesRegex(ValueError, 'TRUSTED_SOURCE_SHA_MISMATCH'):
            release_pipeline.run(self.src,self.out,expected_source_sha256='0'*64)
        (self.src/'items.jsonl').write_bytes(b'[]\n')
        with self.assertRaisesRegex(ValueError, 'SOURCE_ITEMS_SHA_MISMATCH'):
            release_pipeline.run(self.src,self.out)
        self.assertFalse(self.out.exists())
        self.assertEqual(json.loads((self.src/'manifest.json').read_bytes()), original)

    def test_future_version_synthetic_catalog_and_new_revision_coexist(self):
        first = release_pipeline.run(self.src,self.out)
        new_dir=self.root/'next'
        new_dir.mkdir()
        next_src,_=fixture(new_dir, rows=copy.deepcopy(sample()))
        rows = [json.loads(line) for line in (next_src/'items.jsonl').read_text().splitlines()]
        for row in rows:
            row['source']['gameVersion']='1.27.0'
        rows[0]['names']['en']='Synthetic Apple Updated'
        encoded=b''.join(dumps(row) for row in rows)
        (next_src/'items.jsonl').write_bytes(encoded)
        m=json.loads((next_src/'manifest.json').read_bytes())
        m.update({
            'schema':'wand.db01.items@1',
            'gameVersion':'1.27.0',
            'publicationStatus':'private_not_approved_for_public_catalog',
            'inputs':{'nativeManifest':sha(b'next-version-native-manifest'),
                      'native':sha(b'next-version-originals')},
            'counts':{'currentDefinitions':len(rows)},
            'outputSha256':{'items.jsonl':sha(encoded)},
        })
        m.pop('sources')
        m.pop('verifiedCurrentLocalization')
        (next_src/'manifest.json').write_bytes(dumps(m))
        second=release_pipeline.run(next_src,self.out,expected_version='1.27.0')
        self.assertEqual(second['status'],'built')
        self.assertEqual(second['gameVersion'],'1.27.0')
        self.assertNotEqual(first['sqlite'],second['sqlite'])
        self.assertTrue(Path(first['sqlite']).is_file())
        self.assertEqual(json.loads(Path(second['audit']).read_bytes())['gameVersion'],'1.27.0')
        self.assertEqual(release_pipeline.run(next_src,self.out)['status'],'reused')
        # Same version, distinct manifest/source rows must never silently overwrite a release.
        changed=copy.deepcopy(rows)
        changed[0]['names']['en']='Another Synthetic Apple'
        newdata=b''.join(dumps(row) for row in changed)
        (next_src/'items.jsonl').write_bytes(newdata)
        m['outputSha256']['items.jsonl']=sha(newdata)
        (next_src/'manifest.json').write_bytes(dumps(m))
        third=release_pipeline.run(next_src,self.out)
        self.assertNotEqual(second['releaseFingerprint'],third['releaseFingerprint'])
        self.assertTrue(Path(second['sqlite']).is_file())

    def test_corrupt_cached_shard_fails_closed_no_fake_reused_pass(self):
        first=release_pipeline.run(self.src,self.out)
        path=Path(first['shards'])/'id'/'01.json'
        path.write_bytes(b'[]\n')
        with self.assertRaisesRegex(ValueError,'FILE_CONTENT_MISMATCH'):
            release_pipeline.run(self.src,self.out)
        self.assertTrue(Path(first['audit']).is_file())

    def test_public_git_and_source_overlap_rejected(self):
        with self.assertRaisesRegex(ValueError,'OUTPUT_OVERLAPS_INPUT'):
            release_pipeline.run(self.src,self.src/'releases')
        fake=self.root/'source-as-git'
        fake.mkdir()
        (fake/'.git').mkdir()
        with self.assertRaisesRegex(ValueError,'OUTPUT_INSIDE_GIT'):
            release_pipeline.run(self.src,fake/'private')

    def test_real_cli_without_version_specific_archive_and_reference_paths(self):
        cli=Path(release_pipeline.__file__)
        r=subprocess.run([sys.executable,str(cli),'--catalog',str(self.src),
                          '--out',str(self.out),'--expected-version','1.26.2'],
                         capture_output=True,text=True,check=False)
        self.assertEqual(r.returncode,0,r.stderr)
        result=json.loads(r.stdout)
        self.assertEqual(result['status'],'built')
        self.assertTrue(Path(result['audit']).exists())
        again=subprocess.run([sys.executable,str(cli),'--catalog',str(self.src),
                          '--out',str(self.out),'--expected-version','1.26.2'],
                         capture_output=True,text=True,check=False)
        self.assertEqual(again.returncode,0,again.stderr)
        self.assertEqual(json.loads(again.stdout)['status'],'reused')


if __name__=='__main__':
    unittest.main()
