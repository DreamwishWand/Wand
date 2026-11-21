"""No licensed source fixtures: source-typed regression tests for Cond 1.26.2."""
import hashlib
import tempfile
import unittest
from pathlib import Path

from condition_semantic_delta import (
    SCHEMA, source_records, decode_condition, step_info, common_condition_dependents,
    validate_probe, read_original, require,
    OLD_CONDITION_SHA, CURRENT_CONDITION_SHA, MISSION_SHA,
)


def vi(n):
    out=bytearray()
    while n >= 128:
        out.append((n & 127) | 128);n >>= 7
    out.append(n)
    return bytes(out)


def f0(n, value): return vi(n<<3)+vi(value)
def f2(n, body): return vi((n<<3)|2)+vi(len(body))+body
def frame(offset, content): return vi(offset)+vi(len(content))+content


def condition(native_id, name, leaves):
    root=b''.join(f2(2,oneof) for oneof in leaves)
    return (f0(1,native_id)+f2(2,name.encode('utf8'))+f2(6,root))


def step_oneof(quest, step, status, *, extra=b''):
    raw=f0(1,quest)+f0(2,step)+f0(3,status)+extra
    return f2(285,raw)


def dialogue_oneof(dialogue): return f2(130,f0(1,dialogue)+f0(2,1))
def common_oneof(ref):return f2(5,f0(1,ref))


class ConditionSemanticTests(unittest.TestCase):
    def test_source_frames_and_verified_mission_step_status(self):
        b=condition(2130006145,'Mission!Synthetic',[
            step_oneof(2070001661,6,4),dialogue_oneof(2030501628)])
        data=frame(6145,b)
        entries=source_records(data)
        decoded=decode_condition(entries['2130006145'])
        self.assertEqual(decoded['sourceId'],'2130006145')
        self.assertEqual(decoded['booleanOperator'],'AND')
        self.assertEqual(decoded['leaves'][0]['kind'],'MissionStepStatus')
        self.assertEqual(decoded['leaves'][0]['stepId'],6)
        self.assertEqual(decoded['leaves'][0]['status'],'Completed')
        self.assertEqual(decoded['leaves'][0]['missionId'],'2070001661')
        self.assertEqual(decoded['leaves'][1]['kind'],'DialogueFlag')
        self.assertNotIn('inversed',decoded['leaves'][1])
        self.assertRegex(decoded['leaves'][1]['sourceWireSha256'],r'^[a-f0-9]{64}$')

    def test_old_to_new_leaf_semantics_not_confused_with_status_code(self):
        old=decode_condition(source_records(frame(6145,condition(2130006145,'A',[
            step_oneof(2070001661,6,4),dialogue_oneof(2030501628)])))['2130006145'])
        new=decode_condition(source_records(frame(6145,condition(2130006145,'A',[
            step_oneof(2070001661,9,4),dialogue_oneof(2030501628)])))['2130006145'])
        extra=decode_condition(source_records(frame(7038,condition(2130007038,'B',[
            step_oneof(2070001661,12,2)])))['2130007038'])
        self.assertEqual(old['leaves'][0]['status'],new['leaves'][0]['status'])
        self.assertNotEqual(old['leaves'][0]['stepId'],new['leaves'][0]['stepId'])
        self.assertEqual(old['leaves'][1],new['leaves'][1])
        self.assertEqual(extra['leaves'][0]['status'],'OnGoing')
        self.assertEqual(extra['leaves'][0]['stepId'],12)

    def test_mission_step_id_is_not_the_array_index(self):
        mission={'fields':[
            (40,2,f0(15,6)+f2(16,b'Group06')),
            (40,2,f0(15,9)+f2(16,b'Group10')),
            (40,2,f0(15,12)+f2(16,b'Group11'))]}
        self.assertEqual(step_info(mission,9)['sourceStepIndex'],1)
        self.assertEqual(step_info(mission,12)['sourceStepName'],'Group11')
        with self.assertRaisesRegex(ValueError,'MISSION_STEP_NOT_UNIQUE_OR_MISSING'):
            step_info(mission,8)
        mission['fields'].append((40,2,f0(15,9)+f2(16,b'Again')))
        with self.assertRaisesRegex(ValueError,'MISSION_STEP_NOT_UNIQUE_OR_MISSING'):
            step_info(mission,9)

    def test_common_condition_scan_is_typed_not_arbitrary_integer(self):
        target='2130006145'
        registry=source_records(frame(5,condition(2130000005,'pointer',[
            common_oneof(int(target))]))+
            frame(6,condition(2130000006,'other',[
            step_oneof(2070001661,9,4)])))
        edges=common_condition_dependents(registry,{target})
        self.assertEqual(edges,[{'fromConditionId':'2130000005','toConditionId':target}])
        self.assertEqual(common_condition_dependents(registry,{'2130007038'}),[])

    def test_unknown_leaf_stays_opaque(self):
        entry=source_records(frame(1,condition(2130000001,'unknown',[
            f2(777,b'\x08\x02')])))['2130000001']
        row=decode_condition(entry)['leaves'][0]
        self.assertEqual(row['kind'],'Unknown')
        self.assertEqual(row['fieldNumber'],777)
        self.assertNotIn('missionId',row)
        self.assertNotIn('stepId',row)

    def test_unverified_mission_step_payload_shape_rejected(self):
        for body in [f0(1,2070001661)+f0(2,9),
                     f0(1,2070001661)+f0(2,9)+f0(3,4)+f0(4,1)]:
            entry=source_records(frame(1,condition(2130000001,'bad',[
                f2(285,body)])))['2130000001']
            with self.assertRaisesRegex(ValueError,'MISSION_STEP_UNVERIFIED_SHAPE'):
                decode_condition(entry)

    def test_target_probe_must_pin_version_and_both_file_hashes(self):
        def member(name,sha):return {'status':'binary_structure_probe',
                'source':'ddv_Data/StreamingAssets/itemlist/'+name,
                'size':100,'isJsonText':False,'sha256':sha}
        probe={'schema':'wand.src01.format-probe@1','gameVersion':'1.26.2',
               'platform':'Steam','itemlistCandidates':{
                 'Condition.json':member('Condition.json',CURRENT_CONDITION_SHA),
                 'Mission.json':member('Mission.json',MISSION_SHA)}}
        validate_probe(probe)
        probe['gameVersion']='1.26.3'
        with self.assertRaisesRegex(ValueError,'TARGET_PROBE_VERSION'):
            validate_probe(probe)
        probe['gameVersion']='1.26.2'
        probe['itemlistCandidates']['Condition.json']['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'INDEPENDENT_PROBE_Condition_json'):
            validate_probe(probe)

    def test_missing_source_symlinks_and_unbounded_inputs_fail_closed(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root)/'missing.bin'
            with self.assertRaisesRegex(ValueError,'SOURCE_MISSING'):
                read_original(p)
            p.write_bytes(b'hello')
            self.assertEqual(read_original(p),b'hello')
            l=Path(root)/'linked.bin';l.symlink_to(p)
            with self.assertRaisesRegex(ValueError,'SOURCE_MISSING'):
                read_original(l)


if __name__=='__main__':unittest.main()
