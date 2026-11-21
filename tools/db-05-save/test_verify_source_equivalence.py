import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from verify_source_equivalence import EVIDENCE_SCHEMA, inspect_source_equivalence

SOURCE="""// Namespace: Meta
public sealed class Profile : IMessage<Profile>
{
    // Fields
    public const int FreeTimersFieldNumber = 23;
    // Properties
    public RepeatedField<TimerType> FreeTimers { get; }
    // Methods
}
public sealed class ProfilePlayer : IMessage<ProfilePlayer>
{
    // Fields
    public const int LevelFieldNumber = 2;
    // Properties
    public int Level { get; set; }
    // Methods
}
public sealed class ProfileWorld : IMessage<ProfileWorld>
{
    // Fields
    public const int VillagesFieldNumber = 1;
    // Properties
    public RepeatedField<Village> Villages { get; }
    // Methods
}
public sealed class Pet : IMessage<Pet>
{
    // Fields
    public const int PetItemIDFieldNumber = 1;
    // Properties
    public int PetItemID { get; set; }
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
"""


def evidence_and_registries(source):
    sha=hashlib.sha256(source.encode()).hexdigest()
    e={'schema':EVIDENCE_SCHEMA,'baseline':{'sha256':sha,'bytes':len(source)},
       'candidate':{'sha256':sha,'bytes':len(source)},
       'comparison':{'registeredNativeFieldTemplates':3},
       'scope':{'currentExecutableBytesCompared':False,'writerAuthorized':False}}
    common={'source':{'sha256':sha}}
    first=dict(common,schema='wand.db05.native1261-observed-field-witnesses@1',
        fields=[{'path':'/Player/Level','nativeMessage':'ProfilePlayer',
                 'protobufFieldNumber':2,'nativePropertyType':'int','writerAuthorized':False}])
    second=dict(common,schema='wand.db05.native1261-nested-field-witnesses@1',
        fields=[{'path':'/Player/Pets[]/PetItemID','nativeMessage':'Pet',
                 'protobufFieldNumber':1,'nativePropertyType':'int','writable':False}])
    third=dict(common,schema='wand.db05.native1261-deep-field-witnesses@1',
        fields=[{'path':'/World/GridCollection/Grids/{id}/Objects/{id}/ItemID',
                 'nativeMessage':'GridObject','protobufFieldNumber':2,
                 'nativePropertyType':'int','writable':False}])
    return e,[first,second,third]


class ArchivedNativeSourceTests(unittest.TestCase):
    def test_identical_sources_verify_all_public_field_tags_without_binary_claim(self):
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/'candidate.cs'
            old=Path(d)/'baseline.cs'
            source.write_text(SOURCE,encoding='utf-8')
            old.write_text(SOURCE,encoding='utf-8')
            evidence,registries=evidence_and_registries(SOURCE)
            receipt=inspect_source_equivalence(source,evidence,registries,old)
            self.assertEqual(receipt['classification'],'archived_dump_metadata_unchanged')
            self.assertEqual(receipt['registeredFieldCount'],3)
            self.assertEqual(receipt['nativeFieldsMatched'],3)
            self.assertTrue(receipt['candidateMatchesRecordedDigest'])
            self.assertTrue(receipt['baselineMatchesRecordedDigest'])
            self.assertTrue(receipt['archivedSourceFilesEqualNow'])
            self.assertFalse(receipt['gameExecutableAttested'])
            self.assertFalse(receipt['writerAuthorized'])
            self.assertFalse(receipt['exportAuthorized'])

    def test_one_source_with_pinned_digest_does_not_claim_independent_copy(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'source.cs'
            path.write_text(SOURCE,encoding='utf-8')
            evidence,registries=evidence_and_registries(SOURCE)
            result=inspect_source_equivalence(path,evidence,registries)
            self.assertIsNone(result['archivedSourceFilesEqualNow'])
            self.assertFalse(result['baselineArtifactChecked'])
            self.assertFalse(result['baselineMatchesRecordedDigest'])

    def test_changed_property_type_requires_review_and_reports_only_public_names(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'source.cs'
            altered=SOURCE.replace('public int PetItemID { get; set; }',
                                   'public string PetItemID { get; set; }')
            path.write_text(altered,encoding='utf-8')
            evidence,registries=evidence_and_registries(SOURCE)
            with self.assertRaisesRegex(ValueError,'ARCHIVED_SOURCE_DIGEST_CHANGED'):
                inspect_source_equivalence(path,evidence,registries)
            changed=inspect_source_equivalence(path,evidence,registries,
                                               allow_changed_source=True)
            self.assertEqual(changed['classification'],'review_required')
            self.assertEqual(changed['nativeFieldsMatched'],2)
            self.assertEqual(changed['differentPublicPaths'],['/Player/Pets[]/PetItemID'])
            self.assertNotIn('public string',json.dumps(changed))
            self.assertFalse(changed['writerAuthorized'])

    def test_changed_other_source_content_cannot_claim_full_unchanged_dump(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'source.cs'
            path.write_text(SOURCE+'// unrelated source delta\n',encoding='utf-8')
            evidence,registries=evidence_and_registries(SOURCE)
            result=inspect_source_equivalence(path,evidence,registries,
                                              allow_changed_source=True)
            self.assertEqual(result['nativeFieldsMatched'],3)
            self.assertFalse(result['candidateMatchesRecordedDigest'])
            self.assertEqual(result['classification'],'review_required')
            self.assertFalse(result['completeSaveSchemaAttested'])

    def test_unsafe_flags_or_wrong_registry_provenance_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'source.cs'
            path.write_text(SOURCE,encoding='utf-8')
            evidence,registries=evidence_and_registries(SOURCE)
            wrong=dict(evidence)
            wrong['scope']=dict(evidence['scope'],writerAuthorized=True)
            with self.assertRaisesRegex(ValueError,'UNSAFE_SOURCE_EQUIVALENCE_FLAGS'):
                inspect_source_equivalence(path,wrong,registries)
            bad=[dict(x) for x in registries]
            bad[1]['source']={'sha256':'0'*64}
            with self.assertRaisesRegex(ValueError,'SOURCE_FIELD_REGISTRY_MISMATCH'):
                inspect_source_equivalence(path,evidence,bad)


if __name__=='__main__':
    unittest.main()
