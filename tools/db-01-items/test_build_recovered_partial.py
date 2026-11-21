"""Synthetic tests of the 38/39 SHA-verified recovery normalization contract.

Never bundles owner's extracted game records. A full 33,627-row production
smoke test is performed outside CI against private Drive inputs.
"""
import importlib.util
import json
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

SOURCE = Path(__file__).with_name('build_recovered_partial.py')
spec = importlib.util.spec_from_file_location('db01_recovered_build', SOURCE)
recovered = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovered)

FOUR = sorted(recovered.db01.NATIVE_CATEGORIES)
EXTRA = [
    'ActivityData', 'AvatarFeature', 'BoardGame', 'Building', 'Character',
    'CollectionSet', 'Companion', 'ConditionalEvent', 'Currency', 'Dialogue',
    'Display', 'DutyAch', 'Environment', 'Formula', 'Ftue', 'LootTable',
    'Makeup', 'MemoryShard', 'Mission', 'MountGear', 'PhotoMode',
    'PointOfInterest', 'Preference', 'Profession', 'RecurringEvent', 'Scene',
    'Set', 'Skin', 'Story', 'Tag', 'Tool', 'TouchOfMagic', 'Upgrade',
]


def synthetic_inputs():
    native, extra = [], []
    hashes = {}
    for i, cat in enumerate(FOUR):
        file = f'ddv_Data/StreamingAssets/itemlist/{cat}.json'
        hashes[file] = 'a'*64
        native.append({'itemId':30_000_000+i, 'nativeCategory':cat,
            'rawNameField':f'Native{i}', 'names':dict.fromkeys(recovered.db01.LOCALES),
            'iconGuid':'guid:'+'a'*32,
            'source':{'platform':'Steam','gameVersion':'1.26.2','file':file}})
    for i, cat in enumerate(EXTRA):
        file = f'ddv_Data/StreamingAssets/itemlist/{cat}.json'
        extra.append({'itemId':110_000_000+i, 'nativeCategory':cat,
            'rawNameField':f'Native{i}', 'names':dict.fromkeys(recovered.db01.LOCALES),
            'iconGuid':None, 'source':{'platform':'Steam','gameVersion':'1.26.2',
                                     'file':file, 'sha256':'b'*64}})
    categories = {name+'.json':{'status':'native_wire_verified','count':1,
        'sha256':'b'*64, 'source':f'ddv_Data/StreamingAssets/itemlist/{name}.json'}
        for name in EXTRA}
    categories['ItemCondition.json'] = {'status':'verified_empty','count':0}
    matched = sorted([name+'.json' for name in FOUR+EXTRA]+['ItemCondition.json'])
    extended_manifest = {'schema':'wand.src01.extended@1',
        'platform':'Steam', 'gameVersion':'1.26.2',
        'publicationStatus':'PRIVATE_NOT_APPROVED',
        'probeSha256':recovered.TARGET_PROBE_SHA, 'unresolvedCategories':['Condition'],
        'categories':categories,
        'sourceReuseEvidence':{'schema':'wand.src01.identical-binary-reuse@1',
            'olderBaselineVersion':'1.26.1', 'currentTargetVersion':'1.26.2',
            'olderFullVersionSha256':recovered.OLDER_FULLVERSION_SHA,
            'sameFullBytesSha256Files':matched,
            'categoryFilesNotReusable':['Condition.json']},
        'verifiedCurrentLocalization':{'fullCurrentLocaleMemberCount':0,
            'currentEightLocaleNamedDefinitions':0,
            'currentAnyLocaleNamedDefinitions':0,
            'currentExactNamesByLocale':dict.fromkeys(recovered.db01.LOCALES,0)}}
    native_meta = {'nativeManifest':{'schema':'wand.src01.steam-native@1',
            'gameVersion':'1.26.2'}, 'nativeHash':'a'*64,
            'nativeManifestHash':'e'*64, 'sourceHashes':hashes}
    ext_meta = {'manifest':extended_manifest, 'hash':'b'*64,
        'manifestHash':'f'*64}
    return native, extra, native_meta, ext_meta


class RecoveredPartialBuildTests(unittest.TestCase):
    def setup_patch(self, native, extra, native_meta, ext_meta):
        stack = ExitStack()
        stack.enter_context(mock.patch.object(recovered,'EXPECTED_FOUR',len(native)))
        stack.enter_context(mock.patch.object(recovered,'EXPECTED_EXTRA',len(extra)))
        stack.enter_context(mock.patch.object(recovered,'EXPECTED_COMBINED',len(native)+len(extra)))
        stack.enter_context(mock.patch.object(recovered,'EXPECTED_FULL_LOCALE_MEMBERS',0))
        stack.enter_context(mock.patch.object(recovered,'EXPECTED_EIGHT_LOCALE_NAMED',0))
        stack.enter_context(mock.patch.object(recovered,'EXPECTED_ANY_LOCALE_NAMED',0))
        stack.enter_context(mock.patch.object(recovered.db01,'load_native',return_value=(native,native_meta)))
        stack.enter_context(mock.patch.object(recovered.db01,'load_extended',return_value=(extra,ext_meta)))
        return stack

    def test_private_catalog_build_cache_and_explicit_unresolved_fields(self):
        native,extra,native_meta,ext_meta = synthetic_inputs()
        with self.setup_patch(native,extra,native_meta,ext_meta), tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'native').mkdir();(root/'extended').mkdir()
            out=root/'output'
            result=recovered.make(root/'native',root/'extended',out)
            self.assertEqual(result['definitions'],len(native)+len(extra))
            self.assertEqual(result['currentItemDomain'],4)
            self.assertEqual(result['unclassified'],33)
            manifest=json.loads((out/'manifest.json').read_text())
            self.assertFalse(manifest['fullCorpusParsed'])
            self.assertFalse(manifest['historicalReferenceJoined'])
            self.assertEqual(manifest['unresolvedCategories'],['Condition'])
            self.assertEqual(manifest['publicationStatus'],'PRIVATE_ONLY_NO_PUBLIC_ITEMS')
            rows=list(recovered.db01.json_lines(out/'items.jsonl'))
            self.assertTrue(all(row['historicalReference'] is None for row in rows))
            self.assertTrue(all(row['names']['ja'] is None for row in rows))
            self.assertEqual(recovered.make(root/'native',root/'extended',out)['status'],'unchanged')
            (out/'items.jsonl').write_bytes(b'changed')
            self.assertEqual(recovered.make(root/'native',root/'extended',out)['status'],'built')

    def test_missing_or_wrong_baseline_version_refused(self):
        native,extra,native_meta,ext_meta = synthetic_inputs()
        ext_meta['manifest']['sourceReuseEvidence']['olderBaselineVersion']='1.26.0'
        with self.setup_patch(native,extra,native_meta,ext_meta),tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'n').mkdir();(root/'e').mkdir()
            with self.assertRaisesRegex(ValueError,'INVALID_BINARY_REUSE_PROOF'):
                recovered.make(root/'n',root/'e',root/'out')

    def test_unverified_condition_cannot_be_reintroduced(self):
        native,extra,native_meta,ext_meta=synthetic_inputs()
        ext_meta['manifest']['sourceReuseEvidence']['categoryFilesNotReusable']=[]
        with self.setup_patch(native,extra,native_meta,ext_meta),tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'n').mkdir();(root/'e').mkdir()
            with self.assertRaisesRegex(ValueError,'INVALID_BINARY_REUSE_PROOF'):
                recovered.make(root/'n',root/'e',root/'out')

    def test_cross_source_item_id_collision_refused(self):
        native,extra,native_meta,ext_meta=synthetic_inputs()
        extra[0]['itemId']=native[0]['itemId']
        with self.setup_patch(native,extra,native_meta,ext_meta),tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'n').mkdir();(root/'e').mkdir()
            with self.assertRaisesRegex(ValueError,'DUPLICATE_OR_INVALID_NATIVE_ID'):
                recovered.make(root/'n',root/'e',root/'out')

    def test_forged_locale_count_refused(self):
        native,extra,native_meta,ext_meta=synthetic_inputs()
        ext_meta['manifest']['verifiedCurrentLocalization']['currentExactNamesByLocale']['ja']=1
        with self.setup_patch(native,extra,native_meta,ext_meta),tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'n').mkdir();(root/'e').mkdir()
            with self.assertRaisesRegex(ValueError,'CURRENT_NAME_COUNT_CONFLICT'):
                recovered.make(root/'n',root/'e',root/'out')

    def test_output_overlap_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'native').mkdir();(root/'extended').mkdir()
            with self.assertRaisesRegex(ValueError,'OUTPUT_OVERLAPS_INPUT'):
                recovered.make(root/'native',root/'extended',root/'native'/'out')


if __name__=='__main__': unittest.main()
