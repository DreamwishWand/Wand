"""Production SQLite diff source adapter and reuse of canonical DB-01 diff semantics."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import compare_versions as compare
import sqlite_store
from sqlite_version_reader import load_sqlite_version
from test_sqlite_store import fixture, sample, dumps


def sha(value):
    return hashlib.sha256(value).hexdigest()


def version_database(root: Path, game_version: str = '1.26.2', *,
                     changed_name: bool = False, changed_native_key: bool = False,
                     historical: bool = False):
    root.mkdir()
    rows = sample()
    for row in rows:
        row['source']['gameVersion'] = game_version
    if changed_name:
        rows[0]['names']['en'] = 'New Synthetic Apple'
    if changed_native_key:
        rows[1]['nativeNameField'] = 'Character!NewSynthetic'
    catalog, history = fixture(root, rows=rows, history=historical and game_version == '1.26.2')
    if game_version != '1.26.2':
        manifest_path = catalog / 'manifest.json'
        manifest = json.loads(manifest_path.read_bytes())
        manifest['schema'] = 'wand.db01.items@1'
        manifest['publicationStatus'] = 'private_not_approved_for_public_catalog'
        manifest['gameVersion'] = game_version
        manifest['inputs'] = {'nativeManifest': sha(b'canonical-source-manifest'),
                              'native': sha(b'canonical-source-items')}
        manifest['counts'] = {'currentDefinitions':len(rows)}
        manifest.pop('sources', None)
        manifest.pop('verifiedCurrentLocalization', None)
        manifest_path.write_bytes(dumps(manifest))
    database = root / 'catalog.sqlite'
    sqlite_store.build(catalog, database, history)
    return database


class SqliteVersionSourceTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.old = version_database(self.root/'old', historical=True)
        self.new = version_database(self.root/'new','1.26.3',changed_name=True,changed_native_key=True)

    def test_sqlite_loader_source_counts_and_current_not_historical_names(self):
        result = load_sqlite_version(self.old, sha(self.old.read_bytes()))
        self.assertEqual(result['manifest']['gameVersion'], '1.26.2')
        self.assertEqual(result['categories'], {'ActivityItem':1,'Character':1})
        self.assertEqual(len(result['items']),2)
        self.assertEqual(result['items'][1]['names']['en'],'Synthetic Apple')
        self.assertIsNone(result['items'][2]['names']['en'])
        self.assertTrue(result['independentlyPinnedSqlite'])
        self.assertEqual(result['manifest']['fullCorpusParsed'],False)

    def test_existing_comparator_reused_for_sqlite_versions(self):
        result = compare.compare(self.old,self.new,sqlite_input=True,
            old_sqlite_sha256=sha(self.old.read_bytes()),
            new_sqlite_sha256=sha(self.new.read_bytes()))
        self.assertEqual(result['counts']['sharedItemIds'],2)
        self.assertEqual(result['counts']['observedNewInComparableCategories'],0)
        self.assertEqual(result['counts']['absentInCurrentComparableCategory'],0)
        self.assertEqual(result['verifiedNameChanges'][0]['current'],'New Synthetic Apple')
        self.assertEqual(result['nativeNameFieldChangedIds'],[2])
        self.assertEqual(result['coverage']['sourceKind'],'final_private_sqlite_v2')
        self.assertTrue(result['coverage']['sqliteInputsIndependentlyPinned'])
        self.assertFalse(result['coverage']['gameWideComplete'])
        self.assertIsNone(result['gameWideRemovedIds'])
        self.assertIsNone(result['itemSemanticChanges'])

    def test_cli_report_retains_independent_sqlite_hashes(self):
        out=self.root/'diff'
        summary=compare.build(self.old,self.new,out,sqlite_input=True,
            old_sqlite_sha256=sha(self.old.read_bytes()),
            new_sqlite_sha256=sha(self.new.read_bytes()))
        self.assertEqual(summary['sharedItemIds'],2)
        report=json.loads((out/'version-diff.json').read_bytes())
        manifest=json.loads((out/'manifest.json').read_bytes())
        self.assertEqual(report['from']['sqliteSha256'],sha(self.old.read_bytes()))
        self.assertEqual(report['to']['sqliteSha256'],sha(self.new.read_bytes()))
        self.assertTrue(manifest['sqliteInputsIndependentlyPinned'])
        self.assertEqual(manifest['inputSqliteSha256']['new'],sha(self.new.read_bytes()))
        self.assertFalse(manifest['gameWideRemovalInferred'])

    def test_sqlite_identity_and_exact_name_tamper_rejected(self):
        with sqlite3.connect(self.old) as con:
            con.execute('UPDATE exact_name SET value=? WHERE item_id=? AND locale=?',
                        ('Forged Current Name',1,'en'))
        with self.assertRaisesRegex(ValueError,'CURRENT_NAME_SQLITE_MISMATCH'):
            load_sqlite_version(self.old)

    def test_sqlite_raw_record_mismatch_rejected(self):
        with sqlite3.connect(self.old) as con:
            con.execute('UPDATE definition SET native_key=? WHERE item_id=?',('Changed!Key',1))
        with self.assertRaisesRegex(ValueError,'DEFINITION_SOURCE_MISMATCH'):
            load_sqlite_version(self.old)

    def test_independent_hash_prevents_self_consistent_substitution(self):
        with self.assertRaisesRegex(ValueError,'INDEPENDENT_SOURCE_HASH_MISMATCH'):
            load_sqlite_version(self.old,'0'*64)

    def test_no_unsafe_db_symlink_or_mutating_comparison(self):
        link=self.root/'alias.sqlite'
        link.symlink_to(self.old)
        with self.assertRaisesRegex(ValueError,'INPUT_REGULAR_PRIVATE_SQLITE_REQUIRED'):
            load_sqlite_version(link)
        old=sha(self.old.read_bytes())
        compare.compare(self.old,self.new,sqlite_input=True)
        self.assertEqual(old,sha(self.old.read_bytes()))

    def test_comparing_same_source_does_not_infer_removed_items_or_names(self):
        result=compare.compare(self.old,self.old,sqlite_input=True)
        self.assertEqual(result['verifiedNameChanges'],[])
        self.assertEqual(result['sourceChangedCategories'],[])
        self.assertEqual(result['counts']['sharedItemIds'],2)
        self.assertFalse(result['coverage']['sqliteInputsIndependentlyPinned'])
        self.assertFalse(result['coverage']['gameWideComplete'])


if __name__ == '__main__':
    unittest.main()