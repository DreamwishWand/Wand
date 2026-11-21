import hashlib
import tempfile
import unittest
from pathlib import Path

from verify_native_dump import SCHEMA, NESTED_SCHEMA, DEEP_SCHEMA, inspect_native_fields, inspect_nested_native_fields, read_native_types


SOURCE = """// Namespace: Meta
public sealed class Profile : IMessage<Profile>
{
    // Fields
    public const int FreeTimersFieldNumber = 23;
    // Properties
    public RepeatedField<TimerType> FreeTimers { get; }
    // Methods
}
// Namespace: Meta
public sealed class ProfilePlayer : IMessage<ProfilePlayer>
{
    // Fields
    public const int LevelFieldNumber = 2;
    // Properties
    public int Level { get; set; }
    // Methods
}
// Namespace: Meta
public sealed class ProfileWorld : IMessage<ProfileWorld>
{
    // Fields
    public const int VillagesFieldNumber = 1;
    // Properties
    public RepeatedField<Village> Villages { get; }
    // Methods
}
"""

def manifest(text):
    return {
        'schema': SCHEMA,
        'source': {'sha256': hashlib.sha256(text.encode('utf-8')).hexdigest()},
        'fields': [
            {'path': '/FreeTimers', 'nativeMessage': 'Profile',
             'protobufFieldNumber': 23, 'nativePropertyType': 'RepeatedField<TimerType>',
             'writerAuthorized': False},
            {'path': '/Player/Level', 'nativeMessage': 'ProfilePlayer',
             'protobufFieldNumber': 2, 'nativePropertyType': 'int',
             'writerAuthorized': False},
            {'path': '/World/Villages', 'nativeMessage': 'ProfileWorld',
             'protobufFieldNumber': 1, 'nativePropertyType': 'RepeatedField<Village>',
             'writerAuthorized': False}
        ]
    }


class NativeSourceTests(unittest.TestCase):
    def test_stream_parser_matches_public_native_properties_and_numbers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'dummy-dump.cs'
            path.write_text(SOURCE, encoding='utf-8')
            index = read_native_types(path)
            self.assertEqual(index['Profile']['numbers']['FreeTimers'],23)
            self.assertEqual(index['ProfilePlayer']['types']['Level'],'int')
            receipt = inspect_native_fields(path, manifest(SOURCE))
            self.assertEqual(receipt['registeredFieldCount'],3)
            self.assertEqual(receipt['matchedFieldCount'],3)
            self.assertTrue(receipt['sourceMatchesPinnedDigest'])
            self.assertFalse(receipt['canClaimCurrentGameBuild'])
            self.assertFalse(receipt['writerAuthorized'])

    def test_updated_source_hash_is_review_required_not_a_current_build_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'new-dump.cs'
            path.write_text(SOURCE + '// another version\n', encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'SOURCE_HASH_MISMATCH'):
                inspect_native_fields(path, manifest(SOURCE))
            receipt=inspect_native_fields(path,manifest(SOURCE),allow_new_source=True)
            self.assertFalse(receipt['sourceMatchesPinnedDigest'])
            self.assertEqual(receipt['matchedFieldCount'],3)
            self.assertFalse(receipt['canClaimCurrentGameBuild'])

    def test_missing_or_changed_native_type_fails_conservatively(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'changed-dump.cs'
            path.write_text(SOURCE.replace('public int Level { get; set; }',
                                          'public string Level { get; set; }'),encoding='utf-8')
            report=inspect_native_fields(path,manifest(SOURCE),allow_new_source=True)
            self.assertEqual(report['matchedFieldCount'],2)
            self.assertEqual(report['differentPublicPaths'],['/Player/Level'])

    def test_no_private_save_data_or_unregistered_paths_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'dump.cs'
            path.write_text(SOURCE,encoding='utf-8')
            bad=manifest(SOURCE)
            bad['fields'][1]['path']='/Player/Secret/Other'
            with self.assertRaisesRegex(ValueError,'FIELD_NOT_DIRECT_PROPERTY'):
                inspect_native_fields(path,bad)
            bad=manifest(SOURCE)
            bad['fields'][1]['writerAuthorized']=True
            with self.assertRaisesRegex(ValueError,'FIELD_CONTRACT_INVALID'):
                inspect_native_fields(path,bad)
            bad=manifest(SOURCE)
            bad['fields'].append(dict(bad['fields'][0]))
            with self.assertRaisesRegex(ValueError,'DUPLICATE_NATIVE_FIELD'):
                inspect_native_fields(path,bad)


    def test_nested_direct_protobuf_tag_and_type_against_pinned_source(self):
        extra = """
public sealed class Pet : IMessage<Pet>
{
    // Fields
    public const int LastSelfieDateFieldNumber = 4;
    public const int PetItemIDFieldNumber = 1;
    // Properties
    public Timestamp LastSelfieDate { get; set; }
    public int PetItemID { get; set; }
    // Methods
}
public sealed class FloatingIsland : IMessage<FloatingIsland>
{
    // Fields
    public const int UnlockedFieldNumber = 3;
    // Properties
    public bool Unlocked { get; set; }
    // Methods
}
"""
        with tempfile.TemporaryDirectory() as d:
            source = SOURCE + extra
            path = Path(d) / 'nested.cs'
            path.write_text(source,encoding='utf-8')
            fixture = {
                'schema': NESTED_SCHEMA,
                'source': {'sha256': hashlib.sha256(source.encode()).hexdigest()},
                'fields': [
                    {'path':'/Player/Pets[]/LastSelfieDate','nativeMessage':'Pet',
                     'protobufFieldNumber':4,'nativePropertyType':'Timestamp','writable':False},
                    {'path':'/Player/Pets[]/PetItemID','nativeMessage':'Pet',
                     'protobufFieldNumber':1,'nativePropertyType':'int','writable':False},
                    {'path':'/World/FloatingIslands/{id}/Unlocked','nativeMessage':'FloatingIsland',
                     'protobufFieldNumber':3,'nativePropertyType':'bool','writable':False}
                ]
            }
            valid=inspect_nested_native_fields(path,fixture)
            self.assertEqual(valid['registeredFieldCount'],3)
            self.assertEqual(valid['matchedFieldCount'],3)
            self.assertTrue(valid['sourceMatchesPinnedDigest'])
            self.assertFalse(valid['writerAuthorized'])
            self.assertFalse(valid['currentGameNativeAttested'])
            invalid=fixture.copy()
            invalid['fields']=[dict(x) for x in fixture['fields']]
            invalid['fields'][0]['protobufFieldNumber']=55
            result=inspect_nested_native_fields(path,invalid)
            self.assertEqual(result['matchedFieldCount'],2)
            self.assertEqual(result['differentPublicPaths'], ['/Player/Pets[]/LastSelfieDate'])
            malformed=fixture.copy()
            malformed['fields']=[dict(x) for x in fixture['fields']]
            malformed['fields'][2]['path']='/World/FloatingIslands/99123/Unlocked'
            with self.assertRaisesRegex(ValueError,'NESTED_NATIVE_PATH_INVALID'):
                inspect_nested_native_fields(path,malformed)
            fake=fixture.copy()
            fake['fields']=[dict(x) for x in fixture['fields']]
            fake['fields'][0]['writable']=True
            with self.assertRaisesRegex(ValueError,'NESTED_NATIVE_FIELD_INVALID'):
                inspect_nested_native_fields(path,fake)


    def test_deep_native_qualified_class_name_and_game_source_mismatch(self):
        extra = """
public sealed class House.Types.Room : IMessage<House.Types.Room>
{
    // Fields
    public const int WallGridIDsFieldNumber = 3;
    // Properties
    public MapField<int, uint> WallGridIDs { get; }
    // Methods
}
public sealed class GridObject : IMessage<GridObject>
{
    // Fields
    public const int ItemIDFieldNumber = 2;
    // Properties
    public int ItemID { get; set; }
    // Methods
}
public sealed class Character : IMessage<Character>
{
    // Fields
    public const int LastGiftDateFieldNumber = 8;
    // Properties
    public Timestamp LastGiftDate { get; set; }
    // Methods
}
"""
        source = SOURCE + extra
        fixture = {
            'schema': DEEP_SCHEMA,
            'source': {'sha256':hashlib.sha256(source.encode()).hexdigest()},
            'fields': [
                {'path':'/World/BuildingInfos/{id}/Room/WallGridIDs',
                 'nativeMessage':'House.Types.Room','protobufFieldNumber':3,
                 'nativePropertyType':'MapField<int, uint>','writable':False},
                {'path':'/World/GridCollection/Grids/{id}/Objects/{id}/ItemID',
                 'nativeMessage':'GridObject','protobufFieldNumber':2,
                 'nativePropertyType':'int','writable':False},
                {'path':'/World/Characters[]/LastGiftDate',
                 'nativeMessage':'Character','protobufFieldNumber':8,
                 'nativePropertyType':'Timestamp','writable':False}
            ]
        }
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'source.cs'
            path.write_text(source,encoding='utf-8')
            result=inspect_nested_native_fields(path,fixture)
            self.assertEqual(result['matchedFieldCount'],3)
            self.assertTrue(result['sourceMatchesPinnedDigest'])
            self.assertFalse(result['writerAuthorized'])
            self.assertFalse(result['currentGameNativeAttested'])
            index=read_native_types(path, ['House.Types.Room'])
            self.assertEqual(index['House.Types.Room']['numbers']['WallGridIDs'],3)
            self.assertEqual(index['House.Types.Room']['types']['WallGridIDs'],'MapField<int, uint>')
            mismatched=dict(fixture)
            mismatched['fields']=[dict(row) for row in fixture['fields']]
            mismatched['fields'][1]['protobufFieldNumber']=22
            changed=inspect_nested_native_fields(path,mismatched)
            self.assertEqual(changed['matchedFieldCount'],2)
            self.assertIn('/World/GridCollection/Grids/{id}/Objects/{id}/ItemID',
                          changed['differentPublicPaths'])
            bad=dict(fixture)
            bad['fields']=[dict(row) for row in fixture['fields']]
            bad['fields'][0]['path']='/World/BuildingInfos/secret/Room/WallGridIDs'
            with self.assertRaisesRegex(ValueError,'NESTED_NATIVE_PATH_INVALID'):
                inspect_nested_native_fields(path,bad)
            path.write_text(source+'// new source version\n',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'SOURCE_HASH_MISMATCH'):
                inspect_nested_native_fields(path,fixture)
            accepted=inspect_nested_native_fields(path,fixture,allow_new_source=True)
            self.assertFalse(accepted['sourceMatchesPinnedDigest'])
            self.assertEqual(accepted['matchedFieldCount'],3)


if __name__ == '__main__':
    unittest.main()
