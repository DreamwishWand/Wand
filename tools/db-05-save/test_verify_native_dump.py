import hashlib
import tempfile
import unittest
from pathlib import Path

from verify_native_dump import SCHEMA, inspect_native_fields, read_native_types


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


if __name__ == '__main__':
    unittest.main()
