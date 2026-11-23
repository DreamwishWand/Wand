"""Synthetic source-exact Tag-ID classification extraction tests."""
import copy
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import extract_classification as tags
import sqlite_store as db
from test_sqlite_store import fixture, sample


def var(value):
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    result.append(value)
    return bytes(result)


def field(number, value):
    if isinstance(value, int):
        return var(number << 3) + var(value)
    return var(number << 3 | 2) + var(len(value)) + value


def frame(key, *fields):
    payload = b''.join(fields)
    return var(key) + var(len(payload)) + payload


def sha(value):
    return hashlib.sha256(value).hexdigest()


class NativeTagClassificationTest(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.root = Path(root.name)
        self.raw = self.root / 'original'
        self.raw.mkdir()
        tagged_defs = [
            (2000100009, 'Coat'),
            (2000300006, 'Storage'),
            (2000500001, 'Mickey'),
            (2000500002, 'BeautyBeast'),
            (2001200028, 'IsDreamlightValley'),
            (2001400014, 'Vegetable'),
        ]
        self.tag_data = b''.join(
            frame(i, field(1,i), field(2,name.encode('utf-8')))
            for i,name in tagged_defs
        )
        (self.raw / 'Tag.json').write_bytes(self.tag_data)
        self.item_data = frame(1,field(1,1),field(2,b'ActivityItem!Synthetic1'),
                               field(11,2001400014),field(30,var(2001200028)))
        self.character_data = frame(2,field(1,2),field(2,b'Character!Synthetic2'),
                                    field(12,var(2000500001)+var(2000500002)+var(2001200028)))
        (self.raw / 'ActivityItem.json').write_bytes(self.item_data)
        (self.raw / 'Character.json').write_bytes(self.character_data)
        rows = sample()
        rows[0]['source']['sha256'] = sha(self.item_data)
        rows[1]['source']['sha256'] = sha(self.character_data)
        self.catalog, _ = fixture(self.root, rows=rows)
        self.sqlite_path = self.root / 'private.sqlite'
        db.build(self.catalog, self.sqlite_path)
        self.sqlite_sha = sha(self.sqlite_path.read_bytes())
        self.out = self.root / 'classified'

    def build(self):
        return tags.build(self.sqlite_path,self.raw,self.out,
                          expected_sqlite_sha256=self.sqlite_sha,
                          expected_tag_sha256=sha(self.tag_data))

    def test_exact_tag_keys_preserve_many_universes_and_world_context(self):
        result=self.build()
        self.assertEqual(result['status'],'PASS')
        self.assertEqual(result['definitions'],2)
        self.assertEqual(result['tagDefinitions'],6)
        self.assertEqual(result['taggedDefinitions'],2)
        self.assertEqual(result['shards'],256)
        rows=[]
        for file in sorted((self.out / 'id').glob('*.json')):
            rows.extend(json.loads(file.read_bytes()))
        self.assertEqual(len(rows),2)
        ids={row['itemId']:row for row in rows}
        self.assertEqual(ids[1]['facets']['ingredientKind'],['Vegetable'])
        self.assertEqual(ids[1]['facets']['worldContextTag'],['IsDreamlightValley'])
        self.assertEqual(ids[2]['facets']['disneyUniverse'],['Mickey','BeautyBeast'])
        self.assertEqual(ids[2]['facets']['worldContextTag'],['IsDreamlightValley'])
        self.assertFalse(ids[1]['worldAvailabilityVerified'])
        self.assertFalse(ids[2]['gameUiCategoryVerified'])
        m=json.loads((self.out / 'manifest.json').read_bytes())
        self.assertEqual(sum(v['count'] for v in m['files'].values()),2)
        self.assertEqual(m['sourceSqliteSha256'],self.sqlite_sha)
        self.assertEqual(m['tagOriginalSha256'],sha(self.tag_data))
        self.assertFalse(m['publicationAuthorized'])
        self.assertEqual(self.build_failure_code_on_repeat(),'REFUSE_OVERWRITE')

    def build_failure_code_on_repeat(self):
        with self.assertRaises(ValueError) as cm:
            self.build()
        return str(cm.exception).split('DB01_TAG_')[-1]

    def test_changed_tag_dictionary_requires_explicit_independent_sha(self):
        with self.assertRaisesRegex(ValueError,'UNTRUSTED_TAG_SOURCE'):
            tags.build(self.sqlite_path,self.raw,self.out,
                       expected_sqlite_sha256=self.sqlite_sha)
        with self.assertRaisesRegex(ValueError,'UNTRUSTED_TAG_SOURCE'):
            tags.build(self.sqlite_path,self.raw,self.out,
                       expected_sqlite_sha256=self.sqlite_sha,
                       expected_tag_sha256='a'*64)
        self.assertFalse(self.out.exists())

    def test_changed_original_item_fails_before_publication(self):
        (self.raw / 'Character.json').write_bytes(self.character_data+b'Z')
        with self.assertRaisesRegex(ValueError,'ORIGINAL_SHA_MISMATCH_Character'):
            self.build()
        self.assertFalse(self.out.exists())

    def test_bad_sqlite_pin_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'SQLITE_SHA_MISMATCH'):
            tags.build(self.sqlite_path,self.raw,self.out,
                       expected_sqlite_sha256='0'*64,
                       expected_tag_sha256=sha(self.tag_data))
        self.assertFalse(self.out.exists())

    def test_rejects_unknown_tags_and_does_not_infer_numeric_item_range(self):
        self.assertEqual(tags.tag_refs('ActivityItem',
            [(11,0,30000000)], {30000000:'FakeRange'}),
            [{'tagId':30000000,'tagKey':'FakeRange','wireField':11,'facet':'otherTag'}])
        self.assertEqual(tags.tag_refs('ActivityItem',
            [(11,0,2001400014)], {2000500001:'Mickey'}), [])
        self.assertEqual(tags.tag_group(2001200028,'IsDreamlightValley'),'worldContextTag')
        self.assertEqual(tags.tag_group(2001200064,'IsWishingWell'),'otherTag')

    def test_furniture_alternate_field7_packed_tag_references(self):
        dictionary={
            2000500001:'Mickey',
            2001200028:'IsDreamlightValley',
            2000300006:'Storage',
        }
        refs=tags.tag_refs('Furniture',[
            (7,2,var(2000500001)+var(2001200028)),
            (9,2,var(2000300006)),
            (7,0,3), # a source numeric subtype is NOT itself a Tag ID
        ], dictionary)
        self.assertEqual(
            {(r['wireField'],r['tagKey'],r['facet']) for r in refs},
            {(7,'Mickey','disneyUniverse'),
             (7,'IsDreamlightValley','worldContextTag'),
             (9,'Storage','furnitureKind')},
        )
        self.assertFalse(any(r['tagId']==3 for r in refs))

    def test_original_furniture_blocker_field14_is_a_real_source_tag(self):
        # Steam 1.26.2 FurnitureBlockerItemData.TagsFieldNumber=14.
        # The older overlay omitted 19 real field-14 tags. The unrelated
        # tool/blocker nested messages at fields 7/8 are NOT Tag arrays.
        dictionary={
            2000500006:'ToyStory',2000500023:'DreamlightValley',
            2001200070:'IsCraftable',2001200028:'IsDreamlightValley',
        }
        refs=tags.tag_refs('Furniture',[
            (7,2,b'\\x08\\x01'),
            (14,2,var(2000500023)),
        ], dictionary)
        self.assertEqual(refs,[{
            'tagId':2000500023,'tagKey':'DreamlightValley',
            'wireField':14,'facet':'disneyUniverse',
        }])
        self.assertEqual(tags.tag_refs('Furniture',[
            (14,2,var(2001200070)),
        ], dictionary),[{
            'tagId':2001200070,'tagKey':'IsCraftable',
            'wireField':14,'facet':'otherTag',
        }])
        # Incomplete protobuf, arbitrary IDs or a nested message must never
        # be interpreted as source-native IHasTags membership.
        self.assertEqual(tags.tag_refs('Furniture',[
            (14,2,b'\\x80'),(14,2,var(999999999)),
        ],dictionary),[])

    def test_wire_decoder_rejects_duplicate_ids_and_truncation(self):
        with self.assertRaisesRegex(ValueError,'DUPLICATE_OR_BROKEN_FRAME'):
            list(tags.source_frames(self.item_data+self.item_data))
        with self.assertRaisesRegex(ValueError,'TRUNCATED_FIELD'):
            tags.fields(b'\x12\x08abc')
        self.assertEqual(tags.packed_ids(var(2000500001)+var(2000500002)),
                         [2000500001,2000500002])


if __name__=='__main__':
    unittest.main()
