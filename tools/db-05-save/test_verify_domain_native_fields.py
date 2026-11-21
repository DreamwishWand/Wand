import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from verify_domain_native_fields import (
    SCHEMA, native_field_chain, verify_domain_source,
)
from discover_native_shapes import parse_native_messages

DUMP="""// Namespace: Meta
public sealed class Profile : IMessage<Profile>
{
    // Fields
    public const int PlayerFieldNumber = 1;
    public const int WorldFieldNumber = 2;
    // Properties
    public ProfilePlayer Player { get; }
    public ProfileWorld World { get; }
    // Methods
}
public sealed class ProfilePlayer : IMessage<ProfilePlayer>
{
    // Fields
    public const int MountsFieldNumber = 73;
    // Properties
    public RepeatedField<Mount> Mounts { get; }
    // Methods
}
public sealed class ProfileWorld : IMessage<ProfileWorld>
{
    // Fields
    public const int PlayerHousesFieldNumber = 2;
    public const int GridCollectionFieldNumber = 42;
    // Properties
    public RepeatedField<House> PlayerHouses { get; }
    public GridCollection GridCollection { get; }
    // Methods
}
public sealed class Mount : IMessage<Mount>
{
    // Fields
    public const int BondingLevelFieldNumber = 6;
    // Properties
    public int BondingLevel { get; set; }
    // Methods
}
public sealed class House : IMessage<House>
{
    // Fields
    public const int FloorsFieldNumber = 1;
    // Properties
    public RepeatedField<House.Types.Floor> Floors { get; }
    // Methods
}
public sealed class House.Types.Floor : IMessage<House.Types.Floor>
{
    // Fields
    public const int RoomsFieldNumber = 1;
    // Properties
    public MapField<int, House.Types.Room> Rooms { get; }
    // Methods
}
public sealed class House.Types.Room : IMessage<House.Types.Room>
{
    // Fields
    public const int FlooringFieldNumber = 5;
    // Properties
    public int Flooring { get; set; }
    // Methods
}
public sealed class GridCollection : IMessage<GridCollection>
{
    // Fields
    public const int GridsFieldNumber = 1;
    // Properties
    public MapField<uint, Grid> Grids { get; }
    // Methods
}
public sealed class Grid : IMessage<Grid>
{
    // Fields
    public const int ObjectsFieldNumber = 5;
    // Properties
    public MapField<uint, GridObject> Objects { get; }
    // Methods
}
public sealed class GridObject : IMessage<GridObject>
{
    // Fields
    public const int StateFieldNumber = 6;
    // Properties
    public GridState State { get; set; }
    // Methods
}
public sealed class GridState : IMessage<GridState>
{
    // Fields
    public const int StorageFieldNumber = 11;
    // Properties
    public StorageGridData Storage { get; set; }
    // Methods
}
public sealed class StorageGridData : IMessage<StorageGridData>
{
    // Fields
    public const int ContainerInventoryIDFieldNumber = 1;
    // Properties
    public uint ContainerInventoryID { get; set; }
    // Methods
}
"""

ROWS=[
    ('/Player/Mounts[]/BondingLevel','Mount',6,'int'),
    ('/World/PlayerHouses[]/Floors[]/Rooms/{id}/Flooring','House.Types.Room',5,'int'),
    ('/World/GridCollection/Grids/{id}/Objects/{id}/State/Storage/ContainerInventoryID',
     'StorageGridData',1,'uint')
]


def manifest(source=DUMP):
    return {'schema':SCHEMA,
            'source':{'sourceHash':hashlib.sha256(source.encode()).hexdigest()},
            'fields':[dict(path=path,nativeMessage=name,protobufFieldNumber=number,
                           nativePropertyType=typ,writable=False)
                      for path,name,number,typ in ROWS]}


class DomainSourceTests(unittest.TestCase):
    def test_recursive_native_protobuf_chain_verification(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'native.cs'
            path.write_text(DUMP,encoding='utf-8')
            native=parse_native_messages(path)
            self.assertEqual(len(native),12)
            self.assertEqual(native_field_chain(native,ROWS[1][0]),
                             ('House.Types.Room','Flooring',5,'int'))
            self.assertEqual(native_field_chain(native,ROWS[2][0]),
                             ('StorageGridData','ContainerInventoryID',1,'uint'))
            result=verify_domain_source(path,manifest())
            self.assertEqual(result['registeredFieldCount'],3)
            self.assertEqual(result['matchedFieldCount'],3)
            self.assertTrue(result['sourceMatchesPinnedHash'])
            self.assertFalse(result['gameExecutableAttested'])
            self.assertFalse(result['writerAuthorized'])

    def test_numeric_and_textual_actual_map_keys_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'native.cs'
            path.write_text(DUMP,encoding='utf-8')
            native=parse_native_messages(path)
            for bad in (
                '/World/PlayerHouses[]/Floors[]/Rooms/99232/Flooring',
                '/World/PlayerHouses[]/Floors[]/Rooms/secret-owner/Flooring',
                '/World/GridCollection/Grids/{id}/Objects/2/State/Storage/ContainerInventoryID',
                '/World/GridCollection/Grids/PRIVATE/Objects/{id}/State/Storage/ContainerInventoryID',
            ):
                with self.assertRaises(ValueError):
                    native_field_chain(native,bad)
            with self.assertRaisesRegex(ValueError,'UNRECOGNIZED_NATIVE_PROPERTY'):
                native_field_chain(native,'/Player/Mounts[]/PrivateOwnerNote')
            with self.assertRaisesRegex(ValueError,'UNBACKED_MAP_PLACEHOLDER'):
                native_field_chain(native,'/Player/{id}/Mounts[]/BondingLevel')

    def test_changed_source_is_review_required_not_writer_authorized(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'native.cs'
            changed=DUMP.replace('public int BondingLevel { get; set; }',
                                 'public uint BondingLevel { get; set; }')
            path.write_text(changed,encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'SOURCE_HASH_MISMATCH'):
                verify_domain_source(path,manifest())
            result=verify_domain_source(path,manifest(),allow_new_source=True)
            self.assertEqual(result['matchedFieldCount'],2)
            self.assertEqual(result['changedPublicPaths'],['/Player/Mounts[]/BondingLevel'])
            self.assertEqual(result['classification'],'review_required')
            self.assertFalse(result['exportAuthorized'])

    def test_manifest_rejects_false_write_permission_and_duplicated_path(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'native.cs'
            path.write_text(DUMP,encoding='utf-8')
            edited=manifest()
            edited['fields'][0]['writable']=True
            with self.assertRaisesRegex(ValueError,'READONLY_FIELD_REQUIRED'):
                verify_domain_source(path,edited)
            edited=manifest()
            edited['fields'].append(dict(edited['fields'][0]))
            with self.assertRaisesRegex(ValueError,'DUPLICATE_PUBLIC_TEMPLATE'):
                verify_domain_source(path,edited)

    def test_real_repository_manifest_is_strictly_source_pinned_and_readonly(self):
        path=Path(__file__).resolve().parents[2]/'data/ddv/save/native1262-domain-fields.v1.json'
        data=json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(data['schema'],SCHEMA)
        self.assertEqual(data['source']['sourceHash'],
                         '0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08')
        self.assertEqual(len(data['fields']),132)
        self.assertEqual(sum(x['sampledAtLeastOneOriginal'] for x in data['fields']),77)
        self.assertEqual(sum(x['domain']=='player' for x in data['fields']),40)
        self.assertEqual(sum(x['domain']=='world' for x in data['fields']),92)
        self.assertEqual(len({x['path'] for x in data['fields']}),132)
        self.assertTrue(all(x['writable'] is False for x in data['fields']))
        self.assertTrue(all(len(x['observedIn'])==3 for x in data['fields']))
        self.assertFalse(data['policy']['strictCodecRoundTripVerified'])
        self.assertFalse(data['policy']['writerAuthorized'])


if __name__=='__main__':
    unittest.main()
