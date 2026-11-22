"""Version-bound native ID range audits: full observed coverage, no guessing."""
import hashlib
import tempfile
import unittest
from pathlib import Path

import audit_id_ranges as ranges
import sqlite_store
from test_sqlite_store import fixture,sample


class NativeIdRangeAuditTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name)

    def make_db(self,rows):
        source,_=fixture(self.root,rows=rows)
        db=self.root/'private.sqlite'
        sqlite_store.build(source,db)
        return db,hashlib.sha256(db.read_bytes()).hexdigest()

    def test_unique_prefixes_confirmed_only_for_all_existing_records(self):
        rows=sample()
        rows[1]['itemId']=20_000_001
        db,sha=self.make_db(rows)
        result=ranges.audit(db,sha)
        self.assertEqual(result['status'],'PASS')
        self.assertEqual(result['definitionCount'],2)
        self.assertEqual(result['verifiedPrefixCount'],2)
        self.assertTrue(result['exactForObservedCurrentIds'])
        self.assertFalse(result['safeForUnseenIds'])
        self.assertFalse(result['uiCategoriesVerifiedByPrefix'])
        self.assertEqual(result['verifiedNativeClassPrefixes']['0']['nativeCategory'],'ActivityItem')
        self.assertEqual(result['verifiedNativeClassPrefixes']['2']['nativeCategory'],'Character')

    def test_collision_is_reported_not_assigned(self):
        db,sha=self.make_db(sample())
        result=ranges.audit(db,sha)
        self.assertEqual(result['status'],'AMBIGUOUS')
        self.assertEqual(result['ambiguouslyClassifiedIds'],2)
        self.assertEqual(result['ambiguousPrefixes'],{'0':['ActivityItem','Character']})
        self.assertFalse(result['exactForObservedCurrentIds'])

    def test_bad_independent_sqlite_pin_fails_closed(self):
        db,sha=self.make_db(sample())
        with self.assertRaisesRegex(ValueError,'SQLITE_SHA_MISMATCH'):
            ranges.audit(db,'a'*64)
        with self.assertRaisesRegex(ValueError,'DIVISOR'):
            ranges.audit(db,sha,0)


if __name__=='__main__':
    unittest.main()
