"""Synthetic, offline checks for SHA-pinned SRC-04 missing-object planning."""
import json
import unittest

from missing_plan import build


def fixture():
    names = ['unique_%03d.bundle' % i for i in range(220)]
    source = {'status': 'complete', 'files': [
        {'path': 'ddv_Data/StreamingAssets/aa/win/' + name,
         'size': i+1, 'sha256': ('%064x' % (i+1))}
        for i,name in enumerate(names)]}
    guids = []
    for i in range(358):
        guids.append({'iconGuid': 'guid:' + ('%032x' % i),
            'bundleFilenames': [names[i%220], 'shaders_assets_all.bundle'],
            'itemCount': 1, 'categories': {'Trimming': 1}})
    for i in range(358,360):
        guids.append({'iconGuid': 'guid:' + ('%032x' % i),
            'bundleFilenames': ['placeholder_%03d.bundle' % n for n in range(51)],
            'itemCount': 1, 'categories': {'Trimming': 1}})
    missing = {'schema': 'wand.src04.missing-locations@1',
        'publicationApproved': False, 'complete': True,
        'unresolvedGuidCount': 360, 'catalogLocatedGuidCount': 360,
        'unresolvedItemCount': 2416, 'sourceItemsSha256': 'a'*64, 'guids': guids}
    return missing, source


class MissingPlanTests(unittest.TestCase):
    def test_builds_only_non_shared_pinned_bundles(self):
        missing, source = fixture()
        result = build(json.dumps(missing).encode(), json.dumps(source).encode())
        self.assertEqual(len(result['bundles']), 220)
        self.assertEqual(len(result['skippedBroadGuids']), 2)
        self.assertEqual(len({g for b in result['bundles'] for g in b['guids']}), 358)
        self.assertEqual(sum(x['size'] for x in result['bundles']), 24310)
        self.assertTrue(all(b['path'].endswith('.bundle') for b in result['bundles']))
        self.assertFalse(result['publicationApproved'])

    def test_duplicate_guid_fails_closed(self):
        missing, source = fixture()
        missing['guids'][1]['iconGuid'] = missing['guids'][0]['iconGuid']
        with self.assertRaisesRegex(ValueError, 'INVALID_OR_DUPLICATE_GUID'):
            build(json.dumps(missing).encode(), json.dumps(source).encode())

    def test_source_traversal_fails_closed(self):
        missing, source = fixture()
        source['files'][0]['path'] = 'ddv_Data/StreamingAssets/aa/win/../bad.bundle'
        with self.assertRaisesRegex(ValueError,'BAD_SOURCE_FILE'):
            build(json.dumps(missing).encode(), json.dumps(source).encode())


if __name__ == '__main__':
    unittest.main()
