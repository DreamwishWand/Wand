"""Synthetic source originals for the final Collection activity/craft selectors."""
import hashlib
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path

import resolve_collection_remaining as remaining
import sqlite_store
from test_sqlite_store import fixture, sample


def integer(value):
    buf=bytearray()
    while value>=128:
        buf.append((value&127)|128)
        value >>= 7
    buf.append(value)
    return bytes(buf)

def field(number,value):
    if isinstance(value,int):
        return integer(number<<3)+integer(value)
    return integer(number<<3|2)+integer(len(value))+value

def framed(offset,*parts):
    encoded=b''.join(parts)
    return integer(offset)+integer(len(encoded))+encoded

def sha(data):
    return hashlib.sha256(data).hexdigest()

class ActivityAndCraftingTest(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name)
        self.original=self.root/'original'
        self.original.mkdir()
        self.fruit=30200001
        self.meal=30300001
        self.seafood=31100001
        self.refined=31700001
        self.recipe=2050300001
        self.tags={
            2001200013:'IsFruit',
            2001500000:'Dessert',
            2001400001:'SeaFood',
            2001100001:'RefinedMaterial',
        }
        definitions={
            'Tag':[(tag,name,framed(i,field(1,tag),field(2,name.encode())))
                   for i,(tag,name) in enumerate(self.tags.items(),1)],
            'ActivityItem':[
                (self.fruit,'Fruit!Synthetic',
                 framed(1,field(1,self.fruit),field(2,b'Fruit!Synthetic'),
                        field(30,integer(2001200013)))),
                (self.meal,'Meal!Synthetic',
                 framed(2,field(1,self.meal),field(2,b'Meal!Synthetic'),
                        field(15,2001500000))),
                (self.seafood,'Ingredient!Synthetic',
                 framed(3,field(1,self.seafood),field(2,b'Ingredient!Synthetic'),
                        field(8,2001400001))),
                (self.refined,'CraftMaterial!Synthetic',
                 framed(4,field(1,self.refined),field(2,b'CraftMaterial!Synthetic'))),
            ],
            'ActivityData':[
                (self.recipe,'Recipe!Refined',
                 framed(1,field(1,self.recipe),field(2,b'Recipe!Refined'),
                        field(6,field(1,self.refined)),
                        field(8,2001100001))),
            ],
        }
        a_fruit=field(6,field(8,2001200013))
        a_meal=field(6,field(2,field(1,2001500000)))
        a_ingredient=field(6,field(5,2001400001))
        a_material=field(6,field(6,b''))
        c_refined=field(8,field(2,2001100001))
        c_refined_neg=field(1,1)+c_refined
        self.sets=[
            (2120000001,'CollectionSet!Fruit',
             [field(2,a_fruit)]),
            (2120000002,'CollectionSet!Meals',
             [field(2,a_meal)]),
            (2120000003,'CollectionSet!Seafood',
             [field(2,a_ingredient)]),
            (2120000004,'CollectionSet!ForagingCraftMaterial',
             [field(2,a_material)+field(2,c_refined_neg)]),
            (2120000005,'CollectionSet!CraftRefined',
             [field(2,c_refined)]),
        ]
        definitions['CollectionSet']=[
            (id,name,framed(i,field(1,id),field(2,name.encode()),
                            field(9,b''.join(groups))))
            for i,(id,name,groups) in enumerate(self.sets,1)]
        rows=[]
        for cat,values in definitions.items():
            content=b''.join(v[2] for v in values)
            (self.original/(cat+'.json')).write_bytes(content)
            for item_id,name,_ in values:
                example=json.loads(json.dumps(sample()[0 if cat=='ActivityItem' else 1]))
                example['itemId']=item_id
                example['nativeCategory']=cat
                example['nativeNameField']=name
                example['source']={
                    'file':'ddv_Data/StreamingAssets/itemlist/'+cat+'.json',
                    'platform':'Steam','gameVersion':'1.26.2','sha256':sha(content)}
                example['names']={loc:None for loc in sqlite_store.LOCALES}
                example['verification']['names']={loc:'unresolved'
                                                 for loc in sqlite_store.LOCALES}
                rows.append(example)
        source,_=fixture(self.root,rows=rows)
        manifest=json.loads((source/'manifest.json').read_bytes())
        manifest['byNativeCategory']=dict(Counter(
            item['nativeCategory'] for item in rows))
        manifest['verifiedCurrentLocalization']['currentExactNamesByLocale']={
            locale:0 for locale in sqlite_store.LOCALES}
        (source/'manifest.json').write_text(json.dumps(manifest))
        self.sqlite=self.root/'private.sqlite'
        sqlite_store.build(source,self.sqlite)
        self.sqlite_sha=sha(self.sqlite.read_bytes())
        declarations=''.join(
            '// Namespace: Definitions.Items\npublic sealed class '+name+
            ' : IMessage // TypeDefIndex: 100\n{\n'+
            ''.join('public const int '+label+' = '+str(number)+';\n'
                    for label,number in fields.items())+'}\n'
            for name,fields in remaining.EXPECTED_FIELDS.items())
        for enum,values in [
            ('ActivityItemType',remaining.ACTIVITY_ENUM),
            ('ActivityDataItemType',{'CraftingRecipe':3}),
            ('ItemType',{'ActivityItem':3,'ActivityData':205}),
        ]:
            declarations+='// Namespace: Definitions.Items\npublic enum '+enum+' // TypeDefIndex: 1\n{\n'
            declarations+=''.join('public const '+enum+' '+label+' = '+str(number)+';\n'
                                  for label,number in values.items())
            declarations+='}\n'
        self.dump=self.root/'dump.cs'
        self.dump.write_text(declarations)
        self.dump_sha=sha(self.dump.read_bytes())
        self.output=self.root/'result'

    def produce(self):
        return remaining.produce(self.sqlite,self.original,self.dump,self.output,
            expected_sqlite_sha256=self.sqlite_sha,
            expected_il2cpp_sha256=self.dump_sha,
            expected_selector_counts=(4,2))

    def test_source_join_returns_positive_activity_and_crafting_and_negative_exclusion(self):
        result=self.produce()
        self.assertEqual(result['sourceSelectorCount'],6)
        self.assertEqual(result['resolvedActivitySelectors'],4)
        self.assertEqual(result['resolvedCraftingSelectors'],2)
        self.assertEqual(result['sourceMatchedPositiveItemIds'],4)
        self.assertEqual(result['sourceMatchedNegativeItemIds'],1)
        self.assertEqual(result['positiveAssociations'],4)
        self.assertEqual(result['negativeAssociations'],1)
        self.assertEqual(result['sameGroupActivityPositiveSuppressed'],1)
        manifest=json.loads((self.output/'manifest.json').read_bytes())
        self.assertFalse(manifest['gameRuntimeMembershipVerified'])
        self.assertFalse(manifest['dlcOwnershipVerified'])
        verified={}
        for file,info in manifest['files'].items():
            content=(self.output/file).read_bytes()
            self.assertEqual(sha(content),info['sha256'])
            self.assertEqual(len(content),info['bytes'])
            if file.startswith('id/'):
                verified.update({rec['itemId']:rec for rec in json.loads(content)})
        self.assertEqual(set(verified),{self.fruit,self.meal,self.seafood,self.refined})
        self.assertEqual(len(verified[self.refined]['positive']),1)
        self.assertEqual(len(verified[self.refined]['negative']),1)
        self.assertEqual(verified[self.refined]['positive'][0]['sourceRecipeItemId'],
                         self.recipe)
        self.assertEqual(verified[self.refined]['negative'][0]['collectionSetId'],
                         self.sets[3][0])

    def test_wrong_independent_original_digest_fails_before_output(self):
        path=self.original/'ActivityData.json'
        path.write_bytes(path.read_bytes()+b'not-original')
        with self.assertRaisesRegex(ValueError,'SOURCE_SHA_ActivityData'):
            self.produce()
        self.assertFalse(self.output.exists())

    def test_il2cpp_field_map_mismatch_fails_closed(self):
        self.dump.write_text(self.dump.read_text().replace(
            'public const int RecipeTypeFieldNumber = 8;',
            'public const int RecipeTypeFieldNumber = 99;'))
        self.dump_sha=sha(self.dump.read_bytes())
        with self.assertRaisesRegex(ValueError,'FIELD_MISMATCH_CraftingRecipeItemData'):
            self.produce()
        self.assertFalse(self.output.exists())

    def test_never_overwrites_private_result(self):
        self.produce()
        with self.assertRaisesRegex(ValueError,'PATH'):
            self.produce()


if __name__=='__main__':
    unittest.main()
