"""Synthetic no-game-source tests for the static-only DB-03 ProtoDB bridge."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from protodb_source_bridge import report, main, SCHEMA, STATIC_FAMILIES


def sha(data): return hashlib.sha256(data).hexdigest()

def vi(value):
    value=int(value); out=bytearray()
    while value>127:
        out.append((value & 127)|128);value>>=7
    out.append(value)
    return bytes(out)

def f2(number, data): return vi((number<<3)|2)+vi(len(data))+data

def native_database(name=b'StarPathFTUE', classname=b'Definitions.StarPathFtueConfig'):
    envelope=f2(5,classname)+f2(6,b'\x08\x01')
    entry=f2(1,name)+f2(2,envelope)
    return f2(1,entry)


class ProtoDbBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder=Path(self.temp.name)
        self.old=native_database()
        self.manifest={'schema':'wand.db03.protodb-static@1',
                       'status':'STATIC_SOURCE_ONLY',
                       'target':{'gameVersion':'1.26.1','platform':'Steam'},
                       'source':{'file':'ddv_Data/StreamingAssets/protoDb.bin',
                                 'sha256':sha(self.old),'bytes':len(self.old)},
                       'counts':{k:(1 if k=='starPathFtue' else 0) for k in STATIC_FAMILIES}}

    def call(self, new=None, manifest=None, target_sha=None, old=None, count=1):
        old = self.old if old is None else old
        new = self.old if new is None else new
        manifest = self.manifest if manifest is None else manifest
        return report(old, new, manifest, target_version='1.26.2',
                      target_sha256=sha(new) if target_sha is None else target_sha,
                      expected_entries=count)

    def test_exact_original_source_reuses_only_archived_static_kinds(self):
        r=self.call()
        self.assertEqual(r['schema'],SCHEMA)
        self.assertEqual(r['status'],'IDENTICAL_ARCHIVED_STATIC_SOURCE')
        self.assertTrue(r['proof']['fullOriginalBytesIdentical'])
        self.assertEqual(r['staticFamiliesReusable'],list(STATIC_FAMILIES))
        self.assertEqual(r['target']['protoDbEntries'],1)
        self.assertEqual(r['starPath']['archivedIntroductionDefinitions'],1)
        self.assertEqual(r['starPath']['liveSeasonState'],'NOT_VERIFIED')
        self.assertEqual(r['limits']['publicationAuthorization'],'NOT_GRANTED')

    def test_source_changed_never_reports_static_reuse_or_fake_no_change(self):
        changed=native_database(name=b'OtherPath')
        r=self.call(new=changed)
        self.assertEqual(r['status'],'TARGET_CHANGED_REEXTRACT_REQUIRED')
        self.assertFalse(r['proof']['fullOriginalBytesIdentical'])
        self.assertEqual(r['staticFamiliesReusable'],[])
        self.assertIsNone(r['staticCensusReused'])
        self.assertIsNone(r['starPath']['archivedIntroductionDefinitions'])

    def test_unpinned_target_and_tampered_baseline_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'TARGET_SOURCE_SHA_MISMATCH'):
            self.call(target_sha='f'*64)
        with self.assertRaisesRegex(ValueError,'BASELINE_SOURCE_SHA_MISMATCH'):
            self.call(old=native_database(name=b'Modified'))
        with self.assertRaisesRegex(ValueError,'BASELINE_NATIVE_ENTRY_CENSUS'):
            self.call(count=2)
        with self.assertRaisesRegex(ValueError,'TARGET_PIN_MISSING'):
            self.call(target_sha='bad-sha')

    def test_mixed_version_platform_and_non_native_data_fails(self):
        bad=copy.deepcopy(self.manifest)
        bad['target']['platform']='Switch'
        with self.assertRaisesRegex(ValueError,'VERSION'):
            self.call(manifest=bad)
        bad=copy.deepcopy(self.manifest)
        bad['target']['gameVersion']='1.26.2'
        with self.assertRaisesRegex(ValueError,'VERSION'):
            self.call(manifest=bad)
        bad=copy.deepcopy(self.manifest)
        bad['source']['file']='other'
        with self.assertRaisesRegex(ValueError,'BASELINE_SOURCE'):
            self.call(manifest=bad)
        with self.assertRaises(ValueError):
            self.call(new=b'garbage-no-native-protobuf')

    def test_cli_private_report_and_source_path_collision(self):
        (self.folder/'old.bin').write_bytes(self.old)
        (self.folder/'new.bin').write_bytes(self.old)
        (self.folder/'manifest.json').write_text(json.dumps(self.manifest),encoding='utf-8')
        out=self.folder/'report.json'
        args=['--baseline-protodb',str(self.folder/'old.bin'),
              '--target-protodb',str(self.folder/'new.bin'),
              '--baseline-manifest',str(self.folder/'manifest.json'),
              '--target-version','1.26.2', '--target-sha256',sha(self.old),
              '--expected-entries','1','--out',str(out)]
        self.assertEqual(main(args),0)
        saved=json.loads(out.read_text())
        self.assertEqual(saved['status'],'IDENTICAL_ARCHIVED_STATIC_SOURCE')
        with self.assertRaisesRegex(ValueError,'SOURCE_OUTPUT_COLLISION'):
            main(args[:-1]+[str(self.folder/'old.bin')])


if __name__=='__main__':unittest.main()
