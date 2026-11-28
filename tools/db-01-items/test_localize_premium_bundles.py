import unittest
from localize_premium_bundles import enrich, attach_component_texts, LOCALES, PUBLIC_SCHEMA

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

    def test_current_uses_explicit_same_bundle_legacy_alias_only_on_exact_english(self):
        tables = {l: {'Alias_Title': 'Exact' if l == 'en' else 'Exact-' + l,
                      'Alias_Description': 'Old description'} for l in LOCALES}
        catalog = {'schema': PUBLIC_SCHEMA, 'definitions': [
            {'bundleId': 'Bundle', 'current': {'language': 'en-US', 'title': 'Exact', 'description': 'Changed'},
             'legacy': {'titleKey': 'Liveops.Alias_Title', 'descriptionKey': 'Liveops.Alias_Description'}},
            {'bundleId': 'Other', 'current': {'language': 'en-US', 'title': 'Exact'}, 'legacy': None},
            {'bundleId': 'Renamed', 'current': {'language': 'en-US', 'title': 'Different'},
             'legacy': {'titleKey': 'Liveops.Alias_Title'}}]}
        a, b, c = enrich(catalog, tables)['definitions']
        self.assertEqual(a['current']['localizedText']['ja'], {'title': 'Exact-ja'})
        self.assertNotIn('localizedText', b['current'])
        self.assertNotIn('localizedText', c['current'])

    def test_component_text_locale_consensus_never_selects_ambiguous_translation(self):
        a = ('Liveops.locbin', 'Exact')
        b = ('ProtoDB/ShopConfigs_Global.locbin', 'Generic')
        tables = {l: {a: 'Same' if l == 'en' else 'Text-' + l,
                      b: 'Same' if l == 'en' else 'Text-' + l} for l in LOCALES}
        tables['ja'][b] = 'Different'
        del tables['de'][b]
        catalog = {'source': {'bundleLocalization': {}}, 'definitions': [
            {'current': {'language': 'en-US', 'components': [
                {'description': 'Same'}, {'description': 'Same'}, {'description': 'Unmatched'}]}},
            {'current': {'language': 'fr', 'components': [{'description': 'Other'}]}}]}
        rows = attach_component_texts(catalog, tables)['componentDescriptionTexts']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], 'Same')
        self.assertEqual(rows[0][2]['en'], 'Same')
        self.assertEqual(rows[0][2]['fr'], 'Text-fr')
        self.assertNotIn('ja', rows[0][2])
        self.assertNotIn('de', rows[0][2])
