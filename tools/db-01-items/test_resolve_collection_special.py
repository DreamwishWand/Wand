"""Synthetic, fully-source-pinned collection character/memory/pet selector tests."""
from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path

import resolve_collection_special as special
import sqlite_store
from test_sqlite_store import fixture, sample


def variable(value):
    result=bytearray()
    while value>=128:
        result.append(value&127|128)
        value>>=7
    result.append(value)
    return bytes(result)


def field(number,value):
    if isinstance(value,int):
        return variable(number<<3)+variable(value)
    return variable(number<<3|2)+variable(len(value))+value


def frame(index,content):
    return variable(index)+variable(len(content))+content


def digest(content):
    return hashlib.sha256(content).hexdigest()


class SourceSpecialSelectorTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)
        self.original=self.root/'original'
        self.original.mkdir()
        universe=2000500001
        subtype=2001300012
        self.families={
            'Tag':[
                (universe,'Mickey',field(1,universe)+field(2,b'Mickey')),
                (subtype,'DalmatiansJournal',field(1,subtype)+field(2,b'DalmatiansJournal')),
            ],
            'Character':[
                (10000001,'Character!Normal',
                 field(1,10000001)+field(2,b'Character!Normal')+
                 field(12,variable(universe))),
                (10000002,'Character!Sidekick',
                 field(1,10000002)+field(2,b'Character!Sidekick')+
                 field(12,variable(universe))+field(15,1)),
            ],
            'MemoryShard':[
                (31500001,'Memory!Included',
                 field(1,31500001)+field(2,b'Memory!Included')+
                 field(8,universe)),
                (31500002,'Memory!Excluded',
                 field(1,31500002)+field(2,b'Memory!Excluded')+
                 field(8,universe)+field(10,subtype)),
            ],
            'BoardGame':[
                (215000001,'Board!Mickey',
                 field(1,215000001)+field(2,b'Board!Mickey')+
                 field(13,variable(universe))),
            ],
            'Companion':[
                (120000001,'Pet!Normal',
                 field(1,120000001)+field(2,b'Pet!Normal')),
                (120000002,'Pet!Notable',
                 field(1,120000002)+field(2,b'Pet!Notable')+field(8,1)),
            ],
        }
        make=lambda kind,blob,ignored=False: (
            (field(1,1) if ignored else b'')+field(kind,blob))
        group0=b''.join(field(2,v) for v in [
            make(2,universe),
            make(7,field(1,universe)),
            make(7,field(2,subtype),ignored=True),
            make(9,field(1,universe)),
            make(10,b''),
            make(11,universe),
        ])
        group1=field(2,make(10,field(1,1)))
        set_id=2120000001
        set_row=(field(1,set_id)+field(2,b'CollectionSet!Synthetic')+
                 field(8,7)+field(9,group0)+field(9,group1))
        self.families['CollectionSet']=[
            (set_id,'CollectionSet!Synthetic',set_row),
        ]
        rows=[]
        synthetic=sample()
        for cat,definitions in self.families.items():
            bytes_=b''.join(frame(i,blob) for i,(_,_,blob) in enumerate(definitions,1))
            (self.original/(cat+'.json')).write_bytes(bytes_)
            for item_id,key,_ in definitions:
                row=json.loads(json.dumps(synthetic[1]))
                row['itemId']=item_id
                row['nativeCategory']=cat
                row['nativeNameField']=key
                row['source']={
                    'file':f'ddv_Data/StreamingAssets/itemlist/{cat}.json',
                    'platform':'Steam','gameVersion':'1.26.2',
                    'sha256':digest(bytes_),
                }
                row['names']={locale:None for locale in sqlite_store.LOCALES}
                row['verification']['names']={
                    locale:'unresolved' for locale in sqlite_store.LOCALES}
                rows.append(row)
        src,_=fixture(self.root,rows=rows)
        m=json.loads((src/'manifest.json').read_bytes())
        m['byNativeCategory']=dict(Counter(r['nativeCategory'] for r in rows))
        m['verifiedCurrentLocalization']['currentExactNamesByLocale']={
            loc:0 for loc in sqlite_store.LOCALES}
        (src/'manifest.json').write_text(json.dumps(m))
        self.sqlite_path=self.root/'complete.sqlite'
        sqlite_store.build(src,self.sqlite_path)
        self.sqlite_sha=digest(self.sqlite_path.read_bytes())
        fields=special.WIRE_FIELDS
        dump=''.join(
            '// Namespace: Definitions.Items\npublic sealed class '+name+
            ' : IMessage // TypeDefIndex: 1\n{\n'+
            ''.join('public const int '+key+' = '+str(number)+';\n'
                    for key,number in mapping.items())+'}\n'
            for name,mapping in fields.items())
        dump+=('''// Namespace: Definitions.Items
public enum CompanionItemType // TypeDefIndex: 2
{
public const CompanionItemType Pet = 0;
public const CompanionItemType Critter = 1;
}
''')
        self.dump=self.root/'dump.cs'
        self.dump.write_text(dump)
        self.dump_sha=digest(self.dump.read_bytes())
        self.output=self.root/'computed'

    def run_build(self):
        return special.produce(
            self.sqlite_path,self.original,self.dump,self.output,
            expected_sqlite_sha256=self.sqlite_sha,
            expected_il2cpp_sha256=self.dump_sha)

    def test_source_exact_family_matches_and_negative_memory_filters(self):
        r=self.run_build()
        self.assertEqual(r['totalDynamicSelectors'],7)
        self.assertEqual(r['handledSourceSelectors'],7)
        self.assertEqual(r['unresolvedDynamicSelectors'],0)
        self.assertEqual(r['negativeSelectorsHandled'],1)
        self.assertEqual(r['candidateItemIds'],6)
        self.assertEqual(r['candidateMemberships'],7)
        self.assertEqual(r['explicitOrNegativeExcludedCount'],1)
        manifest=json.loads((self.output/'manifest.json').read_bytes())
        self.assertFalse(manifest['gameRuntimeMembershipVerified'])
        self.assertFalse(manifest['dlcOwnershipVerified'])
        self.assertEqual(manifest['definitionCount'],10)
        actual={}
        for name,meta in manifest['files'].items():
            blob=(self.output/name).read_bytes()
            self.assertEqual(meta['sha256'],digest(blob))
            if name.startswith('id/'):
                actual.update({row['itemId']:row for row in json.loads(blob)})
        self.assertEqual(set(actual),{
            10000001,10000002,31500001,215000001,120000001,120000002})
        self.assertEqual(len(actual[10000002]['memberships']),2)
        self.assertNotIn(31500002,actual)
        self.assertFalse(actual[31500001]['memberships'][0]['gameUiMembershipVerified'])
        self.assertEqual(actual[120000001]['memberships'][0]['criterion'],0)
        self.assertEqual(actual[120000002]['memberships'][0]['criterion'],1)
        selectors=json.loads((self.output/'selectors.json').read_bytes())
        negatives=[row for row in selectors if row['negative']]
        self.assertEqual(len(negatives),1)
        self.assertEqual(negatives[0]['candidateIncludedCount'],0)

    def test_changed_original_hash_blocks_reconciliation(self):
        p=self.original/'MemoryShard.json'
        p.write_bytes(p.read_bytes()+b'garbage')
        with self.assertRaisesRegex(ValueError,'SOURCE_SHA_MemoryShard'):
            self.run_build()
        self.assertFalse(self.output.exists())

    def test_il2cpp_field_schema_and_version_must_match(self):
        self.dump.write_text(self.dump.read_text().replace(
            'public const int IsNotableFieldNumber = 8;',
            'public const int IsNotableFieldNumber = 99;'))
        self.dump_sha=digest(self.dump.read_bytes())
        with self.assertRaisesRegex(ValueError,'IL2CPP_FIELD_PetItemData'):
            self.run_build()
        self.assertFalse(self.output.exists())

    def test_readonly_release_never_overwrites_candidate(self):
        self.run_build()
        with self.assertRaisesRegex(ValueError,'INPUT_OR_OUTPUT_PATH'):
            self.run_build()


if __name__=='__main__':
    unittest.main()
