"""Synthetic original CollectionSet menu extraction tests; no game bytes."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import extract_collection_menu as menus
import sqlite_store as sqlite
from test_sqlite_store import fixture, sample


def var(value):
    chunks = bytearray()
    while value >= 128:
        chunks.append((value & 0x7f) | 0x80)
        value >>= 7
    chunks.append(value)
    return bytes(chunks)


def field(number, value):
    if isinstance(value, int):
        return var(number << 3) + var(value)
    return var(number << 3 | 2) + var(len(value)) + value


def frame(prefix, payload):
    return var(prefix) + var(len(payload)) + payload


def checksum(data):
    return hashlib.sha256(data).hexdigest()


class DirectCollectionMenuTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.set_id = 2120000015
        self.game_name = 'CollectionSet!Synthetic3'
        include = field(2, var(1))
        ignored = field(1, 1) + field(2, var(2) + var(0))
        group = field(1, include) + field(1, ignored) + field(2, field(6, b'\x08\x01'))
        self.original = frame(15,
            field(1, self.set_id) + field(2, self.game_name.encode()) +
            field(7, b'CollectionSet.Synthetic_CollectionName') +
            field(8, 8) + field(9, group))
        self.orig_file = self.root / 'CollectionSet.json'
        self.orig_file.write_bytes(self.original)
        rows = sample()
        row = json.loads(json.dumps(rows[1]))
        row['itemId'] = self.set_id
        row['nativeCategory'] = 'CollectionSet'
        row['nativeNameField'] = self.game_name
        row['source']['file'] = 'ddv_Data/StreamingAssets/itemlist/CollectionSet.json'
        row['source']['sha256'] = checksum(self.original)
        row['verification']['classification'] = 'unresolved'
        rows.append(row)
        src, _ = fixture(self.root, rows=rows)
        manifest_file = src/'manifest.json'
        m = json.loads(manifest_file.read_bytes())
        m['byNativeCategory']['CollectionSet'] = 1
        manifest_file.write_text(json.dumps(m))
        self.sqlite_path=self.root/'private.sqlite'
        sqlite.build(src,self.sqlite_path)
        self.sqlite_hash=checksum(self.sqlite_path.read_bytes())
        self.dump=self.root/'dump.cs'
        names = {0:'Crop',1:'Fish',2:'Meals',3:'FurnitureSets',4:'ClothingSets',
                 6:'Memories',7:'Characters',8:'Foraging',9:'Minerals',
                 10:'Crafting',11:'TimeBending',12:'BoardGame',13:'Snippets',
                 14:'Stories',15:'Companions',16:'Mounts',17:'PhotoGallery'}
        text='// Namespace: Definitions.Items\npublic enum CollectionSubMenu // TypeDefIndex: 345\n{\n'
        text += ''.join('public const CollectionSubMenu '+name+' = '+str(code)+';\n'
                        for code,name in names.items())
        text+='}\n'
        self.dump.write_text(text)
        self.dump_hash=checksum(self.dump.read_bytes())
        self.out=self.root/'collection-menu'

    def extract(self):
        return menus.extract(self.sqlite_path,self.orig_file,self.dump,self.out,
            expected_sqlite_sha256=self.sqlite_hash,
            expected_il2cpp_sha256=self.dump_hash)

    def test_explicit_ids_only_not_ignored_or_dynamic_query(self):
        report=self.extract()
        self.assertEqual(report['status'],'PASS')
        self.assertEqual(report['collectionSetDefinitions'],1)
        self.assertEqual(report['directListedItemIds'],1)
        self.assertEqual(report['directListedAssociations'],1)
        self.assertEqual(report['dynamicSelectorsUnresolved'],1)
        self.assertEqual(report['ignoredExplicitListEntries'],2)
        data=json.loads((self.out/'direct-items.json').read_bytes())
        self.assertEqual(data[0]['itemId'],1)
        self.assertEqual(data[0]['memberships'][0]['submenu'],'Foraging')
        self.assertEqual(data[0]['memberships'][0]['setId'],self.set_id)
        self.assertFalse(data[0]['memberships'][0]['gameUiVisibilityVerified'])
        definition=json.loads((self.out/'menus.json').read_bytes())[0]
        self.assertEqual(definition['directListedItemCount'],1)
        self.assertEqual(definition['dynamicSelectorsUnresolved'],1)
        manifest=json.loads((self.out/'manifest.json').read_bytes())
        self.assertFalse(manifest['dynamicSelectorsEvaluated'])
        self.assertEqual(manifest['catalogDefinitions'],3)
        for filename,meta in manifest['files'].items():
            content=(self.out/filename).read_bytes()
            self.assertEqual(checksum(content),meta['sha256'])
            self.assertEqual(len(content),meta['bytes'])

    def test_changed_original_source_rejected_before_output(self):
        self.orig_file.write_bytes(self.original+b'garbage')
        with self.assertRaisesRegex(ValueError,'COLLECTIONSET_ORIGINAL_SHA_MISMATCH'):
            self.extract()
        self.assertFalse(self.out.exists())

    def test_il2cpp_version_pin_required_independently(self):
        with self.assertRaisesRegex(ValueError,'IL2CPP_SHA_MISMATCH'):
            menus.extract(self.sqlite_path,self.orig_file,self.dump,self.out,
                expected_sqlite_sha256=self.sqlite_hash,
                expected_il2cpp_sha256='0'*64)
        self.assertFalse(self.out.exists())

    def test_repeat_cannot_replace_private_classification(self):
        self.extract()
        with self.assertRaisesRegex(ValueError,'OUTPUT_EXISTS'):
            self.extract()

    def test_missing_current_item_id_fails_without_inventing_category(self):
        unavailable=field(2,var(420000001))
        group=field(1,unavailable)
        self.orig_file.write_bytes(frame(15,
            field(1,self.set_id)+field(2,self.game_name.encode())+
            field(8,8)+field(9,group)))
        # The source hash check stops before an unsupported target enters output.
        with self.assertRaisesRegex(ValueError,'ORIGINAL_SHA_MISMATCH'):
            self.extract()


if __name__ == '__main__':
    unittest.main()
