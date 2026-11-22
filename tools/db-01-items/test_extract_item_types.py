"""Synthetic IL2CPP enum extraction: exact source ID => type/subtype evidence."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import extract_item_types as enums
import sqlite_store
from test_sqlite_store import fixture, sample


def sha(source):
    return hashlib.sha256(source).hexdigest()


def dumped(enums_and_values):
    parts=[]
    for name,entries in enums_and_values.items():
        lines=[
            '// Namespace: Definitions.Items',
            'public enum '+name+' // TypeDefIndex: 9000',
            '{','\t// Fields','\tpublic int value__; // 0x0',
        ]
        lines.extend('\tpublic const '+name+' '+key+' = '+str(number)+';'
                     for key,number in entries)
        lines.append('}')
        parts.append('\n'.join(lines))
    return ('\n'.join(parts)+'\n').encode()


class SourceItemTypeTest(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name)
        rows=sample()
        rows[0]['itemId']=30_200_001  # ItemType=ActivityItem(3); subtype Crop(2)
        rows[1]['itemId']=10_000_001  # ItemType=Character(1); subtype unknown
        source,_=fixture(self.root,rows=rows)
        self.sqlite=self.root/'private.sqlite'
        sqlite_store.build(source,self.sqlite)
        self.sqlite_hash=sha(self.sqlite.read_bytes())
        self.dump=self.root/'dump.cs'
        self.out=self.root/'classification'
        self.write_dump({
            'ItemType':[('None',0),('Character',1),('ActivityItem',3),('Tag',200)],
            'ActivityItemType':[('Default',0),('Crop',2),('Fish',10)],
            'TagItemType':[('Universe',5)],
        })

    def write_dump(self,values):
        self.dump.write_bytes(dumped(values))
        self.dump_hash=sha(self.dump.read_bytes())

    def build(self):
        return enums.build(self.sqlite,self.dump,self.out,
                           expected_sqlite_sha256=self.sqlite_hash,
                           expected_dump_sha256=self.dump_hash)

    def test_original_type_subtype_and_unknown_are_distinct(self):
        r=self.build()
        self.assertEqual(r['status'],'PASS')
        self.assertEqual(r['sourceItemTypesVerified'],2)
        self.assertEqual(r['namedSubtypes'],1)
        self.assertEqual(r['unnamedSubtypes'],1)
        manifest=json.loads((self.out/'manifest.json').read_bytes())
        self.assertEqual(manifest['sourceIl2cppDumpSha256'],self.dump_hash)
        self.assertEqual(manifest['sourceItemsSha256'],
            sqlite3.connect(self.sqlite).execute('SELECT items_sha256 FROM catalog').fetchone()[0])
        self.assertEqual(sum(meta['count'] for meta in manifest['files'].values()),2)
        rows=[]
        for file in sorted((self.out/'id').glob('*.json')):
            rows.extend(json.loads(file.read_bytes()))
        by_id={r['itemId']:r for r in rows}
        crop=by_id[30_200_001]
        self.assertEqual((crop['itemTypeCode'],crop['itemTypeName']),(3,'ActivityItem'))
        self.assertEqual((crop['subtypeCode'],crop['subtypeName']),(2,'Crop'))
        self.assertEqual(crop['subtypeEnumName'],'ActivityItemType')
        self.assertTrue(crop['subtypeNameVerified'])
        char=by_id[10_000_001]
        self.assertEqual(char['itemTypeName'],'Character')
        self.assertIsNone(char['subtypeName'])
        self.assertIsNone(char['subtypeEnumName'])
        self.assertFalse(char['subtypeNameVerified'])
        self.assertFalse(char['gameUiCategoryVerified'])
        self.assertFalse(char['dlcOwnershipVerified'])

    def test_bad_source_dump_pin_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'DUMP_SHA_MISMATCH'):
            enums.build(self.sqlite,self.dump,self.out,
                expected_sqlite_sha256=self.sqlite_hash,
                expected_dump_sha256='0'*64)
        self.assertFalse(self.out.exists())

    def test_unmatched_item_type_fails_release_not_labelled_by_guess(self):
        self.write_dump({
            'ItemType':[('None',0),('Character',1),('ActivityItem',4),('Tag',200)],
            'ActivityItemType':[('Crop',2)],
            'TagItemType':[('Universe',5)],
        })
        with self.assertRaisesRegex(ValueError,'NATIVE_ITEM_TYPE_MISMATCH'):
            self.build()
        self.assertFalse(self.out.exists())

    def test_missing_subtype_enum_leaves_unverified_without_failing_itemtype(self):
        self.write_dump({'ItemType':[('Character',1),('ActivityItem',3)],
                         'TagItemType':[('Universe',5)]})
        r=self.build()
        self.assertEqual(r['sourceItemTypesVerified'],2)
        self.assertEqual(r['namedSubtypes'],0)

    def test_duplicate_enum_values_and_missing_main_enum_rejected(self):
        text='''// Namespace: Definitions.Items
public enum ItemType // TypeDefIndex: 22
{
public const ItemType ActivityItem = 3;
public const ItemType Character = 3;
}
// Namespace: Definitions.Items
public enum TagItemType // TypeDefIndex: 2
{
public const TagItemType Universe = 5;
}
'''
        with self.assertRaisesRegex(ValueError,'DUPLICATE_ENUM_ENTRY'):
            enums.decode_enums(text)
        with self.assertRaisesRegex(ValueError,'ITEMTYPE_MISSING'):
            enums.decode_enums(text.replace('ItemType //','NotItemType //').replace(
                'public const ItemType','public const NotItemType'))

    def test_no_overwrite_and_no_private_bytes_to_checkout(self):
        self.build()
        with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE'):
            self.build()


if __name__=='__main__':
    unittest.main()
