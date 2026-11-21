"""Synthetic DB-03 Condition native wire delta checks; no DDV game bytes."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from native_guide import encode_varint
from condition_native_diff import build_report, main, record_digests


def sha(value): return hashlib.sha256(value).hexdigest()


def number(field, value):
    return encode_varint((field << 3) | 0) + encode_varint(value)


def text(field, value):
    raw = value.encode('utf-8')
    return encode_varint((field << 3) | 2) + encode_varint(len(raw)) + raw


def records(data, base=2130000000):
    result = bytearray()
    for offset, name in data:
        payload = number(1, base + offset) + text(2, name)
        result += encode_varint(offset) + encode_varint(len(payload)) + payload
    return bytes(result)


class ConditionNativeDiffTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.old = records([(0, 'old-one'), (1, 'removed'), (2, 'before-change')])
        self.new = records([(0, 'old-one'), (2, 'after-change'), (3, 'added')])
        self.probe = {
            'schema':'wand.src01.format-probe@1',
            'platform':'Steam', 'gameVersion':'1.26.2',
            'itemlistCandidates':{'Condition.json':{
                'status':'binary_structure_probe', 'isJsonText':False,
                'source':'ddv_Data/StreamingAssets/itemlist/Condition.json',
                'size':len(self.new), 'sha256':sha(self.new)
            }}
        }

    def build(self, **kw):
        old = kw.pop('old', self.old)
        return build_report(old, kw.pop('probe', self.probe),
            baseline_version=kw.pop('old_version', '1.26.1'),
            baseline_sha256=kw.pop('old_sha', sha(self.old)),
            probe_sha256=sha(b'probe'),
            target_raw=kw.pop('new', self.new),
            expected_baseline_count=kw.pop('count', 3))

    def test_source_verified_added_removed_changed_and_unchanged(self):
        report = self.build()
        self.assertEqual(report['status'],'COMPARED_NATIVE_DEFINITIONS_ONLY')
        self.assertEqual(report['source'],'ddv_Data/StreamingAssets/itemlist/Condition.json')
        self.assertEqual(report['baseline']['nativeRecords'],3)
        self.assertEqual(report['target']['nativeRecords'],3)
        comparison=report['comparison']
        self.assertEqual(comparison['addedIds'],['2130000003'])
        self.assertEqual(comparison['removedIds'],['2130000001'])
        self.assertEqual([x['id'] for x in comparison['changed']],['2130000002'])
        self.assertEqual(comparison['unchangedCount'],1)
        self.assertEqual(comparison['addedCount'],1)
        self.assertEqual(comparison['removedCount'],1)
        self.assertEqual(comparison['changedCount'],1)
        self.assertNotIn('recordBody',json.dumps(report))
        self.assertNotIn('prerequisiteIds',json.dumps(report))

    def test_missing_target_never_becomes_zero_diff_or_current_source(self):
        report = self.build(new=None)
        self.assertEqual(report['status'],'TARGET_BYTES_NOT_AVAILABLE')
        self.assertIsNone(report['comparison'])
        self.assertIsNone(report['target']['nativeRecords'])
        self.assertEqual(report['limits']['conditionSemanticChanges'],'NOT_EVALUATED')

    def test_exact_same_source_bytes_produce_no_false_changes(self):
        self.probe['itemlistCandidates']['Condition.json'].update(
            size=len(self.old),sha256=sha(self.old))
        report=self.build(new=self.old)
        self.assertEqual(report['comparison']['unchangedCount'],3)
        self.assertEqual(report['comparison']['changedCount'],0)
        self.assertEqual(report['comparison']['addedCount'],0)
        self.assertEqual(report['comparison']['removedCount'],0)

    def test_target_probe_mismatch_rejected(self):
        bad = self.new + b'\0'
        with self.assertRaisesRegex(ValueError,'TARGET_BYTES_NOT_MATCHING_INDEPENDENT_PROBE'):
            self.build(new=bad)
        p=copy.deepcopy(self.probe)
        p['itemlistCandidates']['Condition.json']['size']=len(self.new)+1
        with self.assertRaisesRegex(ValueError,'TARGET_BYTES_NOT_MATCHING_INDEPENDENT_PROBE'):
            self.build(probe=p)

    def test_untrusted_baseline_and_version_rejected(self):
        with self.assertRaisesRegex(ValueError,'BASELINE_SHA_MISMATCH'):
            self.build(old_sha=sha(b'not source'))
        with self.assertRaisesRegex(ValueError,'BASELINE_CENSUS_MISMATCH'):
            self.build(count=99)
        for version in ('1.26.2',''):
            with self.assertRaisesRegex(ValueError,'VERSION_OR_PLATFORM'):
                self.build(old_version=version)
        p=copy.deepcopy(self.probe);p['platform']='Switch'
        with self.assertRaisesRegex(ValueError,'VERSION_OR_PLATFORM'):
            self.build(probe=p)
        p=copy.deepcopy(self.probe)
        p['itemlistCandidates']['Condition.json']['status']='truncated'
        with self.assertRaisesRegex(ValueError,'Condition.json'):
            self.build(probe=p)

    def test_native_framing_and_duplicate_id_validation(self):
        with self.assertRaises(ValueError):
            record_digests(b'\x01\x04bad')
        # Repeated frame offsets are rejected by the underlying native parser
        # even before a duplicate native ID could enter the projection.
        with self.assertRaisesRegex(ValueError,'INVALID_NATIVE_FRAME'):
            record_digests(records([(0,'a'),(1,'b')])+records([(0,'c')]))
        with self.assertRaisesRegex(ValueError,'ZERO_NATIVE_RECORDS'):
            record_digests(b'')

    def test_offline_cli_owner_private_report(self):
        (self.dir/'old.bin').write_bytes(self.old)
        (self.dir/'target.bin').write_bytes(self.new)
        (self.dir/'probe.json').write_text(json.dumps(self.probe),encoding='utf-8')
        output=self.dir/'report.json'
        args=['--baseline-condition',str(self.dir/'old.bin'),
              '--baseline-version','1.26.1',
              '--baseline-sha256',sha(self.old),
              '--target-probe',str(self.dir/'probe.json'),
              '--expected-baseline-count','3',
              '--out',str(output)]
        self.assertEqual(main(args),0)
        self.assertIsNone(json.loads(output.read_text())['comparison'])
        self.assertEqual(main(args+['--target-condition',str(self.dir/'target.bin')]),0)
        self.assertEqual(json.loads(output.read_text())['comparison']['changedCount'],1)
        with self.assertRaisesRegex(ValueError,'SOURCE_OUTPUT_COLLISION'):
            main(args[:-1]+[str(self.dir/'old.bin')])


if __name__=='__main__':
    unittest.main()
