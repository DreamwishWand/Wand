"""Synthetic release-gate tests: every output shard is independently checked."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import audit_shards as auditor
import export_shards
import sqlite_store
from test_sqlite_store import fixture


def sha(data):
    return hashlib.sha256(data).hexdigest()


class PrivateReleaseAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source, self.history = fixture(self.root, history=True)
        self.db = self.root / 'catalog.sqlite'
        sqlite_store.build(self.source, self.db, self.history)
        self.shards = self.root / 'shards'
        export_shards.export(self.db, self.shards, include_historical=True)
        self.source_sha = sha((self.source / 'items.jsonl').read_bytes())

    def assert_bad(self, code):
        with self.assertRaisesRegex(ValueError, f'DB01_AUDIT_{code}'):
            auditor.audit(self.db, self.shards, expected_source_items_sha256=self.source_sha)

    def test_exact_current_and_history_all_shards_pass(self):
        result = auditor.audit(self.db, self.shards,
            expected_source_items_sha256=self.source_sha,
            expected_sqlite_sha256=auditor.digest(self.db),
            expected_manifest_sha256=auditor.digest(self.shards / 'manifest.json'))
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(result['allShardFilesVerified'], 522)
        self.assertEqual(result['definitions'], 2)
        self.assertEqual(result['exactNames'], 1)
        self.assertEqual(result['historicalEntries'], 8)
        self.assertFalse(result['publicationAuthorized'])
        self.assertFalse(result['sourceCoverageComplete'])

    def test_no_history_export_passes_without_promoting_old_names(self):
        path = self.root / 'no-history'
        export_shards.export(self.db, path, include_historical=False)
        result = auditor.audit(self.db, path, expected_source_items_sha256=self.source_sha)
        self.assertEqual(result['allShardFilesVerified'], 266)
        self.assertFalse(result['historicalIncluded'])
        self.assertEqual(result['historicalEntries'], 0)

    def test_wrong_source_and_sqlite_pin_fail_early(self):
        with self.assertRaisesRegex(ValueError, 'SOURCE_ITEMS_SHA_MISMATCH'):
            auditor.audit(self.db, self.shards, expected_source_items_sha256='a'*64)
        with self.assertRaisesRegex(ValueError, 'SQLITE_SHA_MISMATCH'):
            auditor.audit(self.db, self.shards, expected_sqlite_sha256='a'*64)
        with self.assertRaisesRegex(ValueError, 'MANIFEST_SHA_MISMATCH'):
            auditor.audit(self.db, self.shards, expected_manifest_sha256='a'*64)

    def test_corrupt_unchanged_file_size_is_detected(self):
        path = self.shards / 'id/01.json'
        data = path.read_bytes()
        path.write_bytes(data.replace(b'Synthetic Apple', b'Synthetic Peach'))
        self.assert_bad('FILE_CONTENT_MISMATCH')

    def test_stale_shard_rehashed_in_manifest_still_rejected(self):
        path = self.shards / 'locale/en.json'
        path.write_bytes(b'[[1,"Bogus title"]]\n')
        manifest_path = self.shards / 'manifest.json'
        manifest = json.loads(manifest_path.read_bytes())
        manifest['files']['locale/en.json'] = {
            'sha256': sha(path.read_bytes()), 'bytes':path.stat().st_size, 'count':1}
        manifest_path.write_text(json.dumps(manifest))
        self.assert_bad('FILE_LEDGER_MISMATCH')

    def test_foreign_or_missing_shard_fails_before_audit_pass(self):
        extra = self.shards / 'id' / 'old-version.json'
        extra.write_text('[]\n')
        self.assert_bad('UNEXPECTED_OR_MISSING_FILES')
        extra.unlink()
        (self.shards / 'id' / '00.json').unlink()
        self.assert_bad('UNEXPECTED_OR_MISSING_FILES')

    def test_mislabeled_version_and_wrong_catalog_count_fail(self):
        path = self.shards / 'manifest.json'
        m = json.loads(path.read_bytes())
        m['gameVersion'] = '1.26.3'
        path.write_text(json.dumps(m))
        self.assert_bad('SOURCE_LEDGER_GAMEVERSION')
        m['gameVersion'] = '1.26.2'
        m['definitions'] = 3
        path.write_text(json.dumps(m))
        self.assert_bad('SOURCE_LEDGER_DEFINITIONS')

    def test_manifest_duplicate_keys_fail_not_silently_overwritten(self):
        p = self.shards / 'manifest.json'
        text = p.read_text()
        self.assertTrue(text.startswith('{'))
        p.write_text('{"schema":"forged",'+text[1:])
        self.assert_bad('DUPLICATE_MANIFEST_KEY')

    def test_report_is_private_atomic_idempotent_and_conflicts_fail(self):
        result = auditor.audit(self.db, self.shards, expected_source_items_sha256=self.source_sha)
        output = self.root / 'audit.json'
        auditor.save_report(result, output, sqlite_path=self.db, shards_path=self.shards)
        self.assertEqual(output.stat().st_mode & 0o777, 0o600)
        original = output.read_bytes()
        auditor.save_report(result, output, sqlite_path=self.db, shards_path=self.shards)
        self.assertEqual(output.read_bytes(), original)
        with self.assertRaisesRegex(ValueError, 'REPORT_STALE_OR_CONFLICT'):
            auditor.save_report({**result, 'definitions':999}, output, sqlite_path=self.db, shards_path=self.shards)
        with self.assertRaisesRegex(ValueError, 'REPORT_OVERLAP_OR_OVERWRITE'):
            auditor.save_report(result, self.shards / 'audit.json', sqlite_path=self.db, shards_path=self.shards)

    def test_symlink_shard_forbidden_even_when_bytes_match(self):
        path = self.shards / 'id/03.json'
        data = path.read_bytes()
        saved = self.root / 'outside.json'
        saved.write_bytes(data)
        path.unlink()
        path.symlink_to(saved)
        self.assert_bad('FILE_MISSING_OR_SYMLINK')

    def test_current_name_change_in_sqlite_without_shard_update_rejected(self):
        # Running a complete audit is necessary: manifest hashes alone cannot
        # detect a new valid DB with stale indexes.
        with sqlite3.connect(self.db) as con:
            con.execute("UPDATE exact_name SET value='Updated Official' WHERE item_id=1 AND locale='en'")
        self.assert_bad('EXACT_NAME_SOURCE')


if __name__ == '__main__':
    unittest.main()