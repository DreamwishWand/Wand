"""Synthetic full-source tests for Collection Set -> Universe predicate joins."""
import hashlib
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path

import resolve_collection_universes as resolver
import sqlite_store
from test_sqlite_store import fixture, sample


def enc(value):
    data=bytearray()
    while value>=128:
        data.append((value&127)|128)
        value>>=7
    data.append(value)
    return bytes(data)


def field(number,value):
    if isinstance(value,int):
        return enc(number<<3)+enc(value)
    return enc((number<<3)|2)+enc(len(value))+value


def frame(index,payload):
    return enc(index)+enc(len(payload))+payload


def digest(data):
    return hashlib.sha256(data).hexdigest()


class UniverseSourceJoinTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        self.original=self.root/'original'
        self.original.mkdir()
        tag=2000500001
        set_id=2040000009
        set_def=field(1,set_id)+field(2,b'Set!Mickey')+field(6,enc(tag))
        tags=field(1,tag)+field(2,b'Mickey')
        furniture=[
            (40000047,field(1,40000047)+field(2,b'Furn!Excluded')+field(8,set_id)),
            (40000048,field(1,40000048)+field(2,b'Furn!Included')+field(8,set_id)),
        ]
        clothing=[(50700002,field(1,50700002)+field(2,b'Cloth!Included')+field(8,set_id))]
        exclude=field(1,1)+field(2,enc(40000047))
        sel_furniture=field(3,field(2,tag))
        sel_clothing=field(4,field(2,tag))
        unhandled=field(7,field(1,tag))
        group=field(1,exclude)+field(2,sel_furniture)+field(2,sel_clothing)+field(2,unhandled)
        collection=field(1,2120000024)+field(2,b'CollectionSet!Mickey')+field(8,3)+field(9,group)
        content={
            'Tag':frame(1,tags),
            'Set':frame(2,set_def),
            'Furniture':b''.join(frame(i,row) for i,(_,row) in enumerate(furniture,1)),
            'Clothing':frame(1,clothing[0][1]),
            'CollectionSet':frame(1,collection),
        }
        ids={
            'Tag':[(tag,'Mickey')],
            'Set':[(set_id,'Set!Mickey')],
            'Furniture':[(id,('Furn!Excluded' if id==40000047 else 'Furn!Included'))
                        for id,_ in furniture],
            'Clothing':[(50700002,'Cloth!Included')],
            'CollectionSet':[(2120000024,'CollectionSet!Mickey')],
        }
        rows=[]
        for category,contents in content.items():
            (self.original/(category+'.json')).write_bytes(contents)
            for id,key in ids[category]:
                row=json.loads(json.dumps(sample()[0 if category in ('Furniture','Clothing') else 1]))
                row['itemId']=id
                row['nativeCategory']=category
                row['nativeNameField']=key
                row['source']={'file':'ddv_Data/StreamingAssets/itemlist/'+category+'.json',
                               'platform':'Steam','gameVersion':'1.26.2','sha256':digest(contents)}
                row['localizationKey']=None
                row['names']={loc:None for loc in sqlite_store.LOCALES}
                row['verification']['names']={loc:'unresolved' for loc in sqlite_store.LOCALES}
                rows.append(row)
        src,_=fixture(self.root,rows=rows)
        manifest=json.loads((src/'manifest.json').read_bytes())
        manifest['byNativeCategory']=dict(Counter(r['nativeCategory'] for r in rows))
        manifest['verifiedCurrentLocalization']['currentExactNamesByLocale']={
            loc:0 for loc in sqlite_store.LOCALES}
        (src/'manifest.json').write_text(json.dumps(manifest))
        self.sqlite=self.root/'private.sqlite'
        sqlite_store.build(src,self.sqlite)
        self.sqlite_hash=digest(self.sqlite.read_bytes())
        self.dump=self.root/'dump.cs'
        spec={
            'CollectionItemType':{'FurnitureFieldNumber':3,'ClothingFieldNumber':4,'IgnoreFieldNumber':1},
            'CollectionFurniture':{'UniverseFieldNumber':2},
            'CollectionClothing':{'UniverseFieldNumber':2},
            'CollectionGroup':{'CollectionsByTypeFieldNumber':2,'CollectionsByItemFieldNumber':1},
            'CollectionSetItemData':{'GroupsFieldNumber':9,'SubmenuFieldNumber':8},
            'FurnitureItemData':{'SetItemIDFieldNumber':8},
            'ClothingItemData':{'SetItemIDFieldNumber':8},
            'SetItemData':{'TagsFieldNumber':6},
        }
        self.dump.write_text(''.join(
            '// Namespace: Definitions.Items\npublic sealed class '+cls+
            ' : IItemData // TypeDefIndex: 10\n{\n'+
            ''.join('public const int '+label+' = '+str(no)+';\n'
                    for label,no in fields.items())+'}\n'
            for cls,fields in spec.items()))
        self.dump_hash=digest(self.dump.read_bytes())
        self.out=self.root/'result'

    def resolve(self):
        return resolver.produce(self.sqlite,self.original,self.dump,self.out,
            expected_sqlite_sha256=self.sqlite_hash,
            expected_il2cpp_sha256=self.dump_hash)

    def test_exact_current_set_and_universe_source_relations_with_exclusions(self):
        summary=self.resolve()
        self.assertEqual(summary['sourceDefinitionCount'],6)
        self.assertEqual(summary['dynamicSelectorCount'],3)
        self.assertEqual(summary['resolvedSourcePredicateSelectors'],2)
        self.assertEqual(summary['unresolvedDynamicSelectors'],1)
        self.assertEqual(summary['candidateItemIds'],2)
        self.assertEqual(summary['candidateMemberships'],2)
        self.assertEqual(summary['explicitIgnoreMatches'],1)
        manifest=json.loads((self.out/'manifest.json').read_text())
        self.assertFalse(manifest['gameRuntimeMembershipVerified'])
        self.assertFalse(manifest['gameUiVisibilityComplete'])
        self.assertFalse(manifest['dlcOwnershipVerified'])
        ids=[]
        for path,info in manifest['files'].items():
            raw=(self.out/path).read_bytes()
            self.assertEqual(digest(raw),info['sha256'])
            if path.startswith('id/'):
                ids.extend(json.loads(raw))
        self.assertEqual({r['itemId'] for r in ids},{40000048,50700002})
        for row in ids:
            rel=row['memberships'][0]
            self.assertEqual(rel['sourceSetItemId'],2040000009)
            self.assertEqual(rel['universeTagId'],2000500001)
            self.assertEqual(rel['universeTagKey'],'Mickey')
            self.assertTrue(rel['sourcePredicateMatched'])
            self.assertFalse(rel['gameUiMembershipVerified'])

    def test_reject_wrong_original_source_file_even_if_file_shape_is_valid(self):
        p=self.original/'Set.json'
        p.write_bytes(p.read_bytes()+b'\x00')
        with self.assertRaisesRegex(ValueError,'SOURCE_SHA_Set'):
            self.resolve()
        self.assertFalse(self.out.exists())

    def test_independent_il2cpp_digest_pin_and_source_schema_mismatch(self):
        with self.assertRaisesRegex(ValueError,'IL2CPP_SHA'):
            resolver.produce(self.sqlite,self.original,self.dump,self.out,
                expected_sqlite_sha256=self.sqlite_hash,
                expected_il2cpp_sha256='0'*64)
        self.dump.write_text(self.dump.read_text().replace(
            'public const int SetItemIDFieldNumber = 8;',
            'public const int SetItemIDFieldNumber = 999;'))
        self.dump_hash=digest(self.dump.read_bytes())
        with self.assertRaisesRegex(ValueError,'IL2CPP_FIELD'):
            self.resolve()

    def test_never_replace_existing_private_output(self):
        self.resolve()
        with self.assertRaisesRegex(ValueError,'INPUT_OR_OUTPUT_PATH'):
            self.resolve()


if __name__=='__main__':
    unittest.main()
