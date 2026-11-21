"""Source-free regressions for the owner-private Guide one-folder packager."""
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from guide_private_bundle import add_zip, digest, exact_file, make_manifest, shard_entries, source_files, ROOT


class GuidePrivateBundleTests(unittest.TestCase):
    def test_synthetic_shard_census_and_exact_names(self):
        entries = [{'file':f'quest-shards/part-{i:02d}.json',
                    'bytes':1 if i < 31 else 98001716 - 31,
                    'sha256':'a'*64} for i in range(32)]
        a={'status':'VERIFIED_COMPLETE_ORIGINAL_SHARDS_AND_FRIENDSHIP',
           'questShards':{'entries':entries,'verifiedSearchQuestRecordDigests':733}}
        resolved=shard_entries(a)
        self.assertEqual(len(resolved),32)
        self.assertEqual(sum(n for n,_ in resolved.values()),98001716)
        with self.assertRaisesRegex(ValueError,'SHARD_NUMBER_CENSUS'):
            bad=json.loads(json.dumps(a));bad['questShards']['entries'][0]['file']='quest-shards/part-32.json'
            shard_entries(bad)
        with self.assertRaisesRegex(ValueError,'SHARD_AUDIT_DUPLICATE_OR_INVALID'):
            bad=json.loads(json.dumps(a));bad['questShards']['entries'][0]['file']=bad['questShards']['entries'][1]['file']
            shard_entries(bad)

    def test_owner_original_files_must_match_full_sha_and_must_not_be_symlinks(self):
        with TemporaryDirectory() as tmp:
            p=Path(tmp)/'data.json';p.write_bytes(b'{"synthetic":true}')
            self.assertEqual(exact_file(p,digest(p.read_bytes())),p.read_bytes())
            with self.assertRaisesRegex(ValueError,'FULL_BYTE_SHA_MISMATCH'):
                exact_file(p,'0'*64)
            with self.assertRaisesRegex(ValueError,'FILE_SIZE'):
                exact_file(p,digest(p.read_bytes()),max_bytes=2)
            link=Path(tmp)/'linked.json';link.symlink_to(p)
            with self.assertRaisesRegex(ValueError,'MISSING_OR_LINKED'):
                exact_file(link,digest(p.read_bytes()))

    def test_zip_uses_relative_private_root_and_validates_roundtrip(self):
        payload={'guide/quest-search.json':b'{"synthetic":"ok"}',
                 'condition-native-index-v2.json':b'no original data'}
        m=json.loads(make_manifest(payload))
        self.assertEqual(m['counts']['originalQuestShards'],32)
        self.assertEqual(m['sourceProvenance']['originalQuestSearchVersion'],'1.26.1')
        self.assertEqual(m['sourceProvenance']['originalQuestOutputsRelabelled'],False)
        self.assertEqual(m['files']['guide/quest-search.json']['sha256'],digest(payload['guide/quest-search.json']))
        with TemporaryDirectory() as tmp:
            path=Path(tmp)/'example.zip'
            with ZipFile(path,'w') as z:
                for key,value in payload.items():add_zip(z,key,value)
            with ZipFile(path) as z:
                for key,value in payload.items():
                    self.assertEqual(z.read(f'{ROOT}/{key}'),value)
                self.assertEqual(len(z.namelist()),2)
                self.assertEqual({i.date_time for i in z.infolist()}, {(2026,11,22,0,0,0)})

    def test_untrusted_nonmatching_manifest_cannot_be_used_as_source(self):
        with TemporaryDirectory() as tmp:
            a=Path(tmp)/'fake_audit.json'
            a.write_text('{"schema":"wand.db03.guide-shard-source-audit@1"}')
            with self.assertRaisesRegex(ValueError,'FULL_BYTE_SHA_MISMATCH'):
                source_files(Path(tmp),Path(tmp),a,a)


if __name__ == '__main__':
    unittest.main()
