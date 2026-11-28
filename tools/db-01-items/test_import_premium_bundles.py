import unittest
from unittest.mock import patch

import import_premium_bundles as importer


class PremiumObservationHistoryTests(unittest.TestCase):
    def fixture(self, label, time, bundle_id, item_id):
        digest = label * 64
        rev = str(item_id) * 64
        meta = {'sourceSha256': digest, 'capturedUnixSeconds': time,
                'detailCaptureSha256': digest, 'gameVersion': '1.26.2'}
        observation = {'revisionSha256': rev, 'capturedUnixSeconds': time,
                       'detailCaptureSha256': digest, 'gameVersion': '1.26.2'}
        revision = {'bundleId': bundle_id, 'components': [{'itemId': item_id, 'quantity': 1}]}
        rows = [{'kind': 'detail', 'status': 'found', 'revisionSha256s': [rev]},
                {'kind': 'probe', 'status': 'not_found', 'revisionSha256s': []}]
        return meta, {bundle_id: observation}, {rev: revision}, rows

    def merge(self, fixture, previous=None):
        with patch.object(importer, 'steam_source', return_value=fixture), \
                patch.object(importer, 'legacy_source', return_value={}):
            return importer.merge(b'steam', b'report', b'legacy', previous)

    def test_partial_capture_retains_prior_positive_and_observation_history(self):
        a = self.fixture('a', 1, 'First', 1)
        b = self.fixture('b', 2, 'Second', 2)
        first = self.merge(a)
        second = self.merge(b, first)
        self.assertEqual(set(second['serverDefinitions']), {'First', 'Second'})
        self.assertEqual(second['steamObservationsBySource'], {'a'*64: a[3], 'b'*64: b[3]})
        self.assertEqual(second['missingSteamObservationSourceSha256s'], [])
        self.assertEqual(self.merge(b, second), second)

    def test_revision_change_keeps_old_membership_in_history_only(self):
        a = self.fixture('a', 1, 'Bundle', 1)
        b = self.fixture('b', 2, 'Bundle', 2)
        second = self.merge(b, self.merge(a))
        self.assertEqual(set(second['items']), {'2'})
        self.assertEqual(set(second['historicalSteamItems']), {'1', '2'})
        self.assertEqual(len(second['steamObservationsBySource']), 2)

    def test_old_private_ledger_marks_missing_observations(self):
        a = self.fixture('a', 1, 'First', 1)
        b = self.fixture('b', 2, 'Second', 2)
        first = self.merge(a)
        del first['steamObservationsBySource']
        del first['missingSteamObservationSourceSha256s']
        second = self.merge(b, first)
        self.assertEqual(second['missingSteamObservationSourceSha256s'], ['a'*64])
        self.assertEqual(second['steamObservationsBySource'], {'b'*64: b[3]})


if __name__ == '__main__':
    unittest.main()
