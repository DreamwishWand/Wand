import json
import tempfile
import unittest
from pathlib import Path

from discover_native_shapes import (
    DISCOVERY_SCHEMA, canonical_public_template, discover,
    native_child, output_is_outside_git, parse_native_messages, run,
)

DUMP = """// Namespace: Meta
public sealed class Profile : IMessage<Profile>
{
    // Fields
    public const int PlayerFieldNumber = 1;
    public const int WorldFieldNumber = 2;
    public const int ExpansionPackOwnershipByPlatformFieldNumber = 3;
    // Properties
    public ProfilePlayer Player { get; }
    public ProfileWorld World { get; }
    public MapField<int, int> ExpansionPackOwnershipByPlatform { get; }
    // Methods
}
public sealed class ProfilePlayer : IMessage<ProfilePlayer>
{
    // Fields
    public const int InventoryFieldNumber = 1;
    public const int LevelFieldNumber = 2;
    public const int AccountTokenFieldNumber = 3;
    // Properties
    public MapField<int, ItemBag> Inventory { get; }
    public int Level { get; set; }
    public string AccountToken { get; }
    // Methods
}
public sealed class ProfileWorld : IMessage<ProfileWorld>
{
    // Fields
    public const int AreasFieldNumber = 1;
    // Properties
    public RepeatedField<VillageArea> Areas { get; }
    // Methods
}
public sealed class ItemBag : IMessage<ItemBag>
{
    // Fields
    public const int AmountFieldNumber = 1;
    public const int NoteFieldNumber = 2;
    // Properties
    public int Amount { get; set; }
    public string Note { get; }
    // Methods
}
public sealed class VillageArea : IMessage<VillageArea>
{
    // Fields
    public const int UnlockedFieldNumber = 1;
    // Properties
    public bool Unlocked { get; }
    // Methods
}
"""

def docs(n):
    return {
        'Player': {
            'Level': 5+n,
            'Inventory': {
                f'998{n}': {'Amount': n+1, 'Note': 'DO_NOT_EXPORT_PRIVATE_SAVE_VALUE'},
                f'PRIVATE_MAP_KEY_{n}': {'Amount': n+2,'Note':'PRIVATE_TEXT_CONTENT'}
            },
            'AccountToken': 'SECRET_TOKEN_VALUE',
        },
        'World': {'Areas':[{'Unlocked':bool(n%2)}]},
        'ExpansionPackOwnershipByPlatform': {'PRIVATE_PLATFORM_ID':5}
    }


class NativeDiscoveryTests(unittest.TestCase):
    def native(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'dump.cs'
            path.write_text(DUMP,encoding='utf-8')
            return parse_native_messages(path)

    def test_native_csharp_parser_and_repeated_or_map_wrappers(self):
        native=self.native()
        self.assertEqual(len(native),5)
        self.assertIn(('Inventory',1,'MapField<int, ItemBag>'),native['ProfilePlayer'])
        self.assertIn(('Areas',1,'RepeatedField<VillageArea>'),native['ProfileWorld'])
        self.assertEqual(native_child('MapField<int, ItemBag>'),('ItemBag','/{id}'))
        self.assertEqual(native_child('RepeatedField<VillageArea>'),('VillageArea','[]'))
        self.assertEqual(native_child('MapField<int, MapField<string, ItemBag>>'),
                         ('MapField<string, ItemBag>','/{id}'))
        self.assertEqual(canonical_public_template('/Player/Inventory/{containerId}/Amount'),
                         '/Player/Inventory/{id}/Amount')

    def test_two_samples_reveal_native_names_and_types_only(self):
        result=discover(self.native(),[docs(1),docs(2)])
        self.assertEqual(result['schema'],DISCOVERY_SCHEMA)
        paths={r['path'] for r in result['candidates']}
        self.assertIn('/Player/Inventory/{id}/Amount',paths)
        self.assertIn('/Player/Inventory/{id}/Note',paths)
        self.assertIn('/World/Areas[]/Unlocked',paths)
        self.assertIn('/Player/Level',paths)
        self.assertNotIn('/Player/AccountToken',paths)
        self.assertNotIn('/ExpansionPackOwnershipByPlatform',paths)
        self.assertGreater(result['diagnostics']['sensitive_paths_excluded'],0)
        self.assertEqual(result['security']['safeForPublicRepository'],False)
        self.assertEqual(result['security']['writerAuthorized'],False)
        self.assertEqual(result['security']['actualMapKeysExported'],False)
        text=json.dumps(result)
        for private in ('9981','9982','PRIVATE_MAP_KEY','PRIVATE_TEXT_CONTENT',
                        'SECRET_TOKEN_VALUE','DO_NOT_EXPORT_PRIVATE_SAVE_VALUE',
                        'PRIVATE_PLATFORM_ID'):
            self.assertNotIn(private,text)

    def test_existing_public_registry_fields_are_de_duplicated(self):
        known=['/Player/Inventory/{routeId}/Amount',
               '/World/Areas[]/Unlocked']
        result=discover(self.native(),[docs(1),docs(2)],known_paths=known)
        paths={x['path'] for x in result['candidates']}
        self.assertNotIn('/Player/Inventory/{id}/Amount',paths)
        self.assertNotIn('/World/Areas[]/Unlocked',paths)
        self.assertIn('/Player/Inventory/{id}/Note',paths)
        self.assertEqual(result['diagnostics']['already_registered'],2)

    def test_missing_witness_is_not_imputed(self):
        x=docs(1);y=docs(2)
        del y['Player']['Level']
        result=discover(self.native(),[x,y])
        paths={x['path'] for x in result['candidates']}
        self.assertNotIn('/Player/Level',paths)
        self.assertGreater(result['diagnostics']['not_observed_in_all_samples'],0)

    def test_bounded_wildcard_sampling_is_explicit(self):
        x=docs(1);y=docs(2)
        for i in range(8):
            x['Player']['Inventory'][str(600000+i)]={'Amount':i,'Note':'SECRET'}
            y['Player']['Inventory'][str(700000+i)]={'Amount':i,'Note':'SECRET'}
        result=discover(self.native(),[x,y],wildcard_limit=2)
        item=next(x for x in result['candidates'] if x['path']=='/Player/Inventory/{id}/Amount')
        self.assertTrue(item['sampled'])
        self.assertGreater(result['diagnostics']['sampled'],0)
        self.assertEqual(result['security']['codecRoundTripVerified'],False)

    def test_outside_git_and_disjoint_output_enforced(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d)
            project=base/'repo'
            project.mkdir()
            (project/'.git').mkdir()
            self.assertFalse(output_is_outside_git(project/'private.json'))
            self.assertTrue(output_is_outside_git(base/'private.json'))
            source=base/'native.cs'
            source.write_text(DUMP,encoding='utf-8')
            input1=base/'a.json';input2=base/'b.json'
            input1.write_text(json.dumps(docs(1)),encoding='utf-8')
            input2.write_text(json.dumps(docs(2)),encoding='utf-8')
            directory=base/'public'
            directory.mkdir()
            for name in ('legacy626-fields.v1.json','common626643-fields.v1.json',
                         'native1261-observed-fields.v1.json','native1261-nested-fields.v1.json',
                         'native1261-deep-fields.v1.json'):
                (directory/name).write_text('{"fields":[]}',encoding='utf-8')
            result=run(source,[input1,input2],base/'summary.json',directory)
            self.assertEqual(result['sampledCandidateCount'],0)
            self.assertTrue(result['reviewRequired'])
            output=json.loads((base/'summary.json').read_text())
            self.assertEqual(output['source']['sha256'],
                             __import__('hashlib').sha256(DUMP.encode()).hexdigest())
            self.assertEqual(output['sampleCount'],2)
            self.assertTrue(output['security']['safeForPublicRepository'] is False)
            with self.assertRaisesRegex(ValueError,'MUST_BE_NEW_AND_OUTSIDE_GIT'):
                run(source,[input1,input2],project/'private.json',directory)
            with self.assertRaisesRegex(ValueError,'MUST_BE_NEW_AND_OUTSIDE_GIT'):
                run(source,[input1,input2],base/'summary.json',directory)


if __name__=='__main__':
    unittest.main()
