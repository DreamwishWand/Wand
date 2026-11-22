"""Native IL2CPP protobuf contracts use synthetic byte fixtures only."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).parent))
from guide_native_activation_fields import (
    decode_native_scalar_fields, digest, encode_varint,
    enrich_quest_condition, original_quests, wire_fields)


def n(field,value):
    return encode_varint(field<<3)+encode_varint(value)


def b(field,value):
    if isinstance(value,str): value=value.encode('utf-8')
    return encode_varint(field<<3|2)+encode_varint(len(value))+value


def oneof(tag,payload):
    return b(2,b(tag,payload))


def listed(kind,payload):
    from guide_native_activation_fields import wire_fields
    return {'type':kind,'protobufField':{'Date':105,'CharacterSkin':60,'Timestamp':465,
        'StoreFront':440,'Expansion':140}[kind],
        'nativeWireSha256':digest(payload),
        'nativePayloadFields':sorted(n for n,w,v in wire_fields(payload))}


class NativeSourceScalarTests(unittest.TestCase):
    def test_explicit_date_and_local_time_are_distinct(self):
        payload=n(1,5)+b(2,n(1,1790121600))+n(3,1)
        row=decode_native_scalar_fields('Date',payload)
        self.assertEqual(row['dateUtc'],'2026-09-23T00:00:00Z')
        self.assertEqual(row['dateSeconds'],1790121600)
        self.assertEqual(row['comparisonOperator'],'GreaterThanOrEqual')
        self.assertIs(row['localTime'],True)

    def test_explicit_character_skin_and_apple_arcade_platform(self):
        self.assertEqual(decode_native_scalar_fields('CharacterSkin',n(1,170000021)+n(2,3)),
            {'skinId':'170000021','skinConditionCode':3,'skinCondition':'Unlocked'})
        self.assertEqual(decode_native_scalar_fields('StoreFront',n(1,1)+n(2,12)),
            {'equalOperatorCode':1,'equalOperator':'NotEqual',
             'storeFrontCode':12,'storeFront':'AppleArcade'})

    def test_explicit_elapsed_seconds_and_reset_count_are_oneof(self):
        payload=b(1,'3e43f6a5-9567-4a7f-97eb-e8342b8784b2')+n(2,5)+b(3,n(1,86400))
        row=decode_native_scalar_fields('Timestamp',payload)
        self.assertEqual(row['elapsedSeconds'],86400)
        self.assertEqual(row['comparisonOperator'],'GreaterThanOrEqual')
        self.assertEqual(decode_native_scalar_fields('Timestamp',b(1,'key')+n(4,3))['numberOfResets'],3)

    def test_sha_source_path_and_nested_condition_provenance(self):
        payload=n(1,5)+b(2,n(1,1790121600))+n(3,1)
        one=oneof(105,payload)
        ff=[(20,2,one)]
        source=list(wire_fields(payload))
        row=listed('Date',payload)
        self.assertEqual(enrich_quest_condition(ff,'availableConditions.conditions[0]',row)['dateUtc'],
                         '2026-09-23T00:00:00Z')
        wrong={**row,'nativeWireSha256':'0'*64}
        with self.assertRaisesRegex(ValueError,'SHA256_MISMATCH'):
            enrich_quest_condition(ff,'availableConditions.conditions[0]',wrong)
        # Nested ConditionsList (oneof SubConditions at tag 10).
        nested_one=oneof(10,oneof(10,one))
        root=[(20,2,nested_one)]
        path='availableConditions.conditions[0].nested.conditions[0].nested.conditions[0]'
        self.assertEqual(enrich_quest_condition(root,path,row)['dateSeconds'],1790121600)

    def test_empty_native_payloads_remain_empty_and_wrong_wire_fails(self):
        self.assertEqual(decode_native_scalar_fields('Expansion',b''),{})
        with self.assertRaisesRegex(ValueError,'UNSUPPORTED_TYPED_PREDICATE_FIELD'):
            decode_native_scalar_fields('Date',b(1,'not a varint'))
        with self.assertRaisesRegex(ValueError,'DUPLICATE_NATIVE_PREDICATE_FIELD'):
            decode_native_scalar_fields('StoreFront',n(1,0)+n(1,1))
        with self.assertRaisesRegex(ValueError,'UNVERIFIED_ORIGINAL_MISSION'):
            original_quests(b'not a pinned original')

if __name__ == '__main__':unittest.main()