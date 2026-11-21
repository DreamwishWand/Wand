"""Synthetic safety tests for final DB-01 ⇄ DB-04 source-exact overlay."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

import corroborate_world_objects as bridge


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fixture(root, *, source_match=True, id_match=True, name_match=True,
            label_match=True, bad_grid=False, missing=False, tamper_ledger=False):
    sql = root / 'input.sqlite'
    conn = sqlite3.connect(sql)
    conn.executescript('''
      CREATE TABLE catalog(id INTEGER PRIMARY KEY, store_schema TEXT, platform TEXT,
        game_version TEXT, items_sha256 TEXT, definition_count INTEGER,
        full_corpus_parsed INTEGER, publication_authorized INTEGER);
      CREATE TABLE definition(item_id INTEGER PRIMARY KEY, native_category TEXT,
        native_key TEXT, localization_key TEXT, source_sha256 TEXT);
    ''')
    cats = {'Furniture': sha(b'original-furniture'), 'Building': sha(b'original-building')}
    conn.execute('INSERT INTO catalog VALUES(1,?,?,?,?,?,?,?)',
                 (bridge.DB01_SCHEMA,'Steam','1.26.2',sha(b'private-catalog'),2,0,0))
    conn.executemany('INSERT INTO definition VALUES(?,?,?,?,?)', [
        (4000047,'Furniture','Mickey!Chair',None,cats['Furniture']),
        (2000006,'Building','Mickey_House','Building.Mickey_House_DisplayName',cats['Building']),
    ])
    conn.commit();conn.close()
    footprint = {'sizeX':2,'sizeY':2,'layerValues':[16,16,16,16],
                 'acceptedFloorTypesFlag':2048,'cellIndexToXYVerified':False,
                 'layerMaskSemanticsVerified':False}
    if bad_grid:footprint['layerValues']=[16,16,16]
    objects = [
        {'itemId':4000047 if id_match else 4000048,'nativeType':'Furniture',
         'nativeName':'Mickey!Chair' if name_match else 'Mickey!Wrong',
         'localizationKey':'Furniture.Mickey!Chair_DisplayName',
         'source':{'path':bridge.SOURCE_PREFIX+'Furniture.json'},'footprint':footprint},
        {'itemId':2000006,'nativeType':'Building', 'nativeName':'Mickey_House',
         'localizationKey':('Building.Mickey_House_DisplayName' if label_match else 'Bad'),
         'source':{'path':bridge.SOURCE_PREFIX+'Building.json'},'footprint':None},
    ]
    if missing:objects=objects[:1]
    raw=bridge.canonical(objects)
    src=[{'path':bridge.SOURCE_PREFIX+k+'.json',
          'sha256': v if source_match or k!='Furniture' else sha(b'changed-furniture')}
         for k,v in cats.items()]
    manifest={'schema':bridge.DB04_SCHEMA,'status':'partial_game_native_evidence',
              'platform':'Steam','gameVersion':'1.26.1',
              'sources':src,'outputSha256':{'objects.json':sha(raw) if not tamper_ledger else sha(b'old')}}
    zip_path=root/'world.zip'
    with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json',bridge.canonical(manifest))
        z.writestr('objects.json',raw)
    return {'sqlite':sql,'world':zip_path,'sql_sha':bridge.file_sha(sql),
            'world_sha':bridge.file_sha(zip_path)}


def run(root, config):
    return bridge.build(config['sqlite'],config['world'],root/'out',
        expected_sqlite_sha256=config['sql_sha'],
        expected_world_archive_sha256=config['world_sha'])


class NativeWorldJoinTests(unittest.TestCase):
    def setUp(self):
        ctx=tempfile.TemporaryDirectory();self.addCleanup(ctx.cleanup)
        self.root=Path(ctx.name)

    def test_success_corroborates_cross_version_only_by_exact_source_bytes(self):
        data=fixture(self.root)
        report=run(self.root,data)
        self.assertEqual(report['items'],2)
        self.assertEqual(report['localizationKeysRecovered']['Furniture'],1)
        self.assertEqual(report['nativeFootprints']['Furniture'],1)
        manifest=json.loads((self.root/'out/manifest.json').read_bytes())
        self.assertEqual(manifest['worldGameVersion'],'1.26.1')
        self.assertEqual(manifest['db01GameVersion'],'1.26.2')
        self.assertFalse(manifest['placementLegalityVerified'])
        self.assertEqual(len(manifest['files']),256)
        rows=[r for f in (self.root/'out').glob('[0-9a-f][0-9a-f].json')
              for r in json.loads(f.read_bytes())]
        self.assertEqual(len(rows),2)
        r=next(r for r in rows if r['nativeCategory']=='Furniture')
        self.assertEqual(r['localizationKey'],'Furniture.Mickey!Chair_DisplayName')
        self.assertFalse(r['footprint']['placementLegalityVerified'])
        self.assertEqual(r['footprint']['sizeX'],2)
        with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE'):
            run(self.root,data)

    def test_independently_pinned_db01_and_world_originals_are_mandatory(self):
        data=fixture(self.root)
        data['sql_sha']=sha(b'forged-db')
        with self.assertRaisesRegex(ValueError,'SQLITE_PIN_MISMATCH'):run(self.root,data)
        data['sql_sha']=bridge.file_sha(data['sqlite'])
        data['world_sha']=sha(b'forged-world')
        with self.assertRaisesRegex(ValueError,'WORLD_ARCHIVE_PIN_MISMATCH'):run(self.root,data)

    def test_old_world_original_changes_block_even_for_unchanged_ids(self):
        data=fixture(self.root,source_match=False)
        with self.assertRaisesRegex(ValueError,'GAME_SOURCE_BYTES_DIFFER'):run(self.root,data)

    def test_world_identity_changed_cannot_be_joined(self):
        data=fixture(self.root,name_match=False)
        with self.assertRaisesRegex(ValueError,'DB01_WORLD_NATIVE_IDENTITY_MISMATCH'):run(self.root,data)

    def test_world_id_mismatch_blocks_join(self):
        data=fixture(self.root,id_match=False)
        with self.assertRaisesRegex(ValueError,'WORLD_ITEM_IDENTITY'):run(self.root,data)

    def test_building_nonnull_localization_key_cannot_be_overridden(self):
        data=fixture(self.root,label_match=False)
        with self.assertRaisesRegex(ValueError,'DB01_WORLD_NATIVE_IDENTITY_MISMATCH'):run(self.root,data)

    def test_missing_objects_are_not_a_complete_bridge(self):
        data=fixture(self.root,missing=True)
        with self.assertRaisesRegex(ValueError,'MISSING_OR_EXTRA_WORLD_DEFINITIONS'):run(self.root,data)

    def test_unsafe_candidate_grid_is_not_verified_as_placement(self):
        data=fixture(self.root,bad_grid=True)
        with self.assertRaisesRegex(ValueError,'FOOTPRINT_NOT_NATIVE_EVIDENCE'):run(self.root,data)

    def test_object_ledger_rehash_without_actual_bytes_is_not_admitted(self):
        data=fixture(self.root,tamper_ledger=True)
        with self.assertRaisesRegex(ValueError,'WORLD_OBJECT_LEDGER_MISMATCH'):run(self.root,data)

    def test_no_private_export_inside_git_checkout(self):
        data=fixture(self.root)
        parent=self.root/'git'; parent.mkdir(); (parent/'.git').mkdir()
        with self.assertRaisesRegex(ValueError,'OUTPUT_INSIDE_REPOSITORY'):
            bridge.build(data['sqlite'],data['world'],parent/'private',
                expected_sqlite_sha256=data['sql_sha'],
                expected_world_archive_sha256=data['world_sha'])


if __name__=='__main__':unittest.main()