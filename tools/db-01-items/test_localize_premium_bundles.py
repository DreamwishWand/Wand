import unittest
from localize_premium_bundles import enrich, LOCALES, PUBLIC_SCHEMA

class PremiumLocalizationTests(unittest.TestCase):
    def test_current_exact_text_and_legacy_exact_key_are_independent(self):
        tables = {l: {'Bundle_Title': 'New' if l == 'en' else 'New-' + l,
                      'Bundle_Description': 'Not the same',
                      'Old_Title': 'Old-' + l,
                      'Old_Description': '{Placeholder} hidden'} for l in LOCALES}
        catalog = {'schema': PUBLIC_SCHEMA, 'definitions': [
            {'bundleId': 'Bundle', 'current': {'language': 'en-US', 'title': 'New', 'description': 'Changed'},
             'legacy': {'titleKey': 'Liveops.Old_Title', 'descriptionKey': 'Liveops.Old_Description'}},
            {'bundleId': 'Other', 'current': {'language': 'en-US', 'title': 'New'}, 'legacy': None}
        ]}
        a, b = enrich(catalog, tables)['definitions']
        self.assertEqual(a['current']['localizedText']['ja'], {'title': 'New-ja'})
        self.assertEqual(a['legacy']['localizedText']['ja'], {'title': 'Old-ja'})
        self.assertNotIn('localizedText', b['current'])
