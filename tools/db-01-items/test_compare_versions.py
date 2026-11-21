"""Coverage-safe, source-verified version comparisons; no synthetic game facts."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('db01_compare', Path(__file__).with_name('compare_versions.py'))
compare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(compare)


def fake_row(item_id, category='ActivityItem', *, name=None, icon='a', source='b'):
    names = {code: (name if code == 'en' else None) for code in compare.LOCALES}
    evidence = {code: ('exact_locdb_join' if names[code] else 'unresolved') for code in compare.LOCALES}
    return {
        'itemId': item_id, 'nativeCategory': category,
        'catalogDomain': 'item' if category in compare.CATEGORIES else 'definition_unclassified',
        'nativeNameField': f'RawNative{item_id}',
        'names': names, 'category': None, 'subcategory': None, 'worlds': None,
        'universes': None, 'expansions': None, 'attributes': None,
        'image': {'iconGuid': f'guid:{icon * 32}' if category in compare.CATEGORIES else None},
        'source': {'file': f'ddv_Data/StreamingAssets/itemlist/{category}.json',
                   'platform': 'Steam', 'gameVersion': '1.26.2', 'sha256': source * 64},
        'verification': {'itemId': 'native_frame_verified', 'nativeCategory': 'native_file_verified',
                         'currentVersionObserved': True, 'names': evidence,
                         'iconGuid': 'native_wire_verified' if category in compare.CATEGORIES else 'unresolved'},
    }


def fixture(folder, rows, version='1.26.2'):
    folder.mkdir()
    rows = [{**row, 'source': {**row['source'], 'gameVersion': version}} for row in rows]
    raw = ''.join(json.dumps(row, sort_keys=True, ensure_ascii=False) + '\n' for row in rows).encode('utf-8')
    (folder / 'items.jsonl').write_bytes(raw)
    categories = {}
    for row in rows:
        categories[row['nativeCategory']] = categories.get(row['nativeCategory'], 0) + 1
    native = sum(count for cat, count in categories.items() if cat in compare.CATEGORIES)
    manifest = {
        'schema':compare.CANONICAL, 'publicationStatus':'private_not_approved_for_public_catalog',
        'platform':'Steam', 'gameVersion':version, 'byNativeCategory':categories,
        'counts':{'currentDefinitions':len(rows),'verifiedFourNativeItems':native,
                  'additionalDefinitionRecords':len(rows)-native},
        'inputs':{'nativeManifest':'a'*64,'referenceIndex':'b'*64},
        'outputSha256':{'items.jsonl':hashlib.sha256(raw).hexdigest()},
    }
    (folder / 'manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    return folder


def fixture_recovered_v3(folder):
    """Entirely synthetic 38/39 evidence shape for expanded coverage tests."""
    categories = ['ActivityItem', 'Clothing', 'Furniture', 'Trimming',
        'ActivityData', 'AvatarFeature', 'BoardGame', 'Building', 'Character',
        'CollectionSet', 'Companion', 'ConditionalEvent', 'Currency', 'Dialogue',
        'Display', 'DutyAch', 'Environment', 'Formula', 'Ftue', 'LootTable',
        'Makeup', 'MemoryShard', 'Mission', 'MountGear', 'PhotoMode',
        'PointOfInterest', 'Preference', 'Profession', 'RecurringEvent', 'Scene',
        'Set', 'Skin', 'Story', 'Tag', 'Tool', 'TouchOfMagic', 'Upgrade']
    rows = [fake_row(31, 'ActivityItem'), fake_row(91,'BoardGame')]
    for i in range(504):
        category = categories[i % len(categories)]
        rows.append(fake_row(110000000+i, category))
    for i,row in enumerate(rows):
        if i < 241:
            for loc in compare.LOCALES:
                row['names'][loc] = f'Synthetic {i} {loc}'
                row['verification']['names'][loc] = 'exact_locdb_join'
        elif i < 506:
            row['names']['en'] = f'Synthetic {i} en'
            row['verification']['names']['en'] = 'exact_locdb_join'
    fixture(folder, rows)
    man = json.loads((folder/'manifest.json').read_text())
    allfiles = [cat+'.json' for cat in categories]
    man.update({'schema':compare.RECOVERED,
        'publicationStatus':'PRIVATE_ONLY_NO_PUBLIC_ITEMS',
        'status':'private_38_of_39_full_native_source_evidence',
        'fullCorpusParsed':False, 'count':len(rows),
        'historicalReferenceJoined':False, 'sourceFilesFullyShaVerified':38,
        'sourceFilesTotal':39, 'unresolvedCategories':['Condition'],
        'catalogDomains':{'collectionItem':sum(r['catalogDomain']=='item' for r in rows),
            'unclassifiedDefinition':sum(r['catalogDomain']!='item' for r in rows)},
        'verifiedCurrentLocalization':{'fullCurrentLocaleMemberCount':53,
            'currentEightLocaleNamedDefinitions':241,
            'currentAnyLocaleNamedDefinitions':506,
            'currentExactNamesByLocale':{loc:sum(bool(r['names'][loc]) for r in rows)
                for loc in compare.LOCALES}},
        'sources':[
            {'schema':'wand.src01.steam-native@1','manifestSha256':'a'*64,
             'verifiedCategories':categories[:4]},
            {'schema':'wand.src01.extended@1','manifestSha256':'b'*64,
             'probeSha256':compare.RECOVERED_TARGET_PROBE_SHA,
             'fullSourceBytesShaVerifiedCategories':sorted(allfiles[4:]+['ItemCondition.json']),
             'reuseEvidence':{'schema':'wand.src01.identical-binary-reuse@1',
                 'olderBaselineVersion':'1.26.1','currentTargetVersion':'1.26.2',
                 'olderFullVersionSha256':compare.RECOVERED_OLDER_VERSION_SHA,
                 'categoryFilesNotReusable':['Condition.json'],
                 'sameFullBytesSha256Files':sorted(allfiles+['ItemCondition.json'])}}]})
    (folder/'manifest.json').write_text(json.dumps(man),encoding='utf-8')
    return folder


class VersionDifferenceTests(unittest.TestCase):
    def test_empty_changes_are_not_game_wide_assertions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = fixture(root/'old',[fake_row(31),fake_row(32)])
            new = fixture(root/'new',[fake_row(31),fake_row(32)],version='1.26.3')
            result = compare.compare(old,new)
            self.assertEqual(result['counts']['sharedItemIds'],2)
            self.assertEqual(result['coverage']['comparableCategories'], ['ActivityItem'])
            self.assertIsNone(result['gameWideRemovedIds'])
            self.assertIsNone(result['gameWideAddedIds'])
            self.assertIsNone(result['itemSemanticChanges'])
            self.assertFalse(result['coverage']['gameWideComplete'])

    def test_verified_changes_and_missing_are_scoped(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = fixture(root/'old',[fake_row(31,name='Amethyst'),fake_row(32),fake_row(33)])
            new = fixture(root/'new',[fake_row(31,name='New Amethyst',icon='c',source='c'),
                                      fake_row(32,source='c'),fake_row(34,source='c')],version='1.26.3')
            result = compare.compare(old,new)
            self.assertEqual(result['observedNewInComparableCategories'],[34])
            self.assertEqual(result['absentInCurrentComparableCategory'],[33])
            self.assertEqual(result['sourceChangedCategories'],['ActivityItem'])
            self.assertEqual(result['verifiedNameChanges'][0]['locale'],'en')
            self.assertEqual(result['verifiedIconGuidChanges'][0]['itemId'],31)
            self.assertEqual(result['newlyVerifiedNamesByLocale']['en'],0)

    def test_loss_of_class_coverage_not_misreported_as_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old=fixture(root/'old',[fake_row(31),fake_row(91,'BoardGame')])
            new=fixture(root/'new',[fake_row(31),fake_row(51,'Currency')],version='1.26.3')
            result=compare.compare(old,new)
            self.assertEqual(result['lostCategoryCoverageIds'],[91])
            self.assertEqual(result['newlyCoveredCategoryIds'],[51])
            self.assertEqual(result['absentInCurrentComparableCategory'],[])
            self.assertEqual(result['observedNewInComparableCategories'],[])
            self.assertEqual(result['coverage']['previousOnlyCategories'],['BoardGame'])
            self.assertEqual(result['coverage']['currentOnlyCategories'],['Currency'])

    def test_disjoint_categories_have_no_shared_comparison(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old=fixture(root/'old',[fake_row(91,'BoardGame')])
            new=fixture(root/'new',[fake_row(51,'Currency')],version='1.26.3')
            result=compare.compare(old,new)
            self.assertFalse(result['coverage']['verifiedSameCategoryComparison'])
            self.assertEqual(result['coverage']['comparableCategories'],[])
            self.assertEqual(result['lostCategoryCoverageIds'],[91])
            self.assertEqual(result['newlyCoveredCategoryIds'],[51])

    def test_common_id_category_move_is_not_game_addition(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old=fixture(root/'old',[fake_row(31),fake_row(33,'BoardGame')])
            new=fixture(root/'new',[fake_row(31),fake_row(33,'Currency')],version='1.26.3')
            result=compare.compare(old,new)
            self.assertEqual(result['categoryMoves'],[{'itemId':33,'oldCategory':'BoardGame','newCategory':'Currency'}])
            self.assertEqual(result['counts']['sharedItemIds'],2)
            self.assertEqual(result['counts']['observedNewInComparableCategories'],0)

    def test_new_locale_evidence_does_not_claim_name_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old=fixture(root/'old',[fake_row(31)])
            new=fixture(root/'new',[fake_row(31,name='Amethyst')])
            result=compare.compare(old,new)
            self.assertEqual(result['verifiedNameChanges'],[])
            self.assertEqual(result['newlyVerifiedNamesByLocale']['en'],1)

    def test_integrity_tamper_fails_before_compare(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            folder=fixture(root/'old',[fake_row(31)])
            (folder/'items.jsonl').write_bytes((folder/'items.jsonl').read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'ITEMS_DIGEST_MISMATCH'):
                compare.load_private_version(folder)

    def test_non_display_name_even_with_valid_hash_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            folder=fixture(root/'old',[fake_row(31,name='{DoNotTranslate}junk')])
            with self.assertRaisesRegex(ValueError,'UNVERIFIED_LOCALE_NAME'):
                compare.load_private_version(folder)

    def test_wrong_source_category_fails_even_if_hash_matches(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            row=fake_row(31)
            row['source']['file']='ddv_Data/StreamingAssets/itemlist/Furniture.json'
            folder=fixture(root/'old',[row])
            with self.assertRaisesRegex(ValueError,'UNVERIFIED_CURRENT_SOURCE'):
                compare.load_private_version(folder)

    def test_cross_platform_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old=fixture(root/'old',[fake_row(31)])
            new=fixture(root/'new',[fake_row(31)])
            man=json.loads((new/'manifest.json').read_text())
            man['platform']='Nintendo Switch'
            (new/'manifest.json').write_text(json.dumps(man))
            with self.assertRaisesRegex(ValueError,'TARGET_NOT_STEAM_SEMVER'):
                compare.compare(old,new)

    def test_incremental_report_is_private_and_hash_pinned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old=fixture(root/'old',[fake_row(31)])
            new=fixture(root/'new',[fake_row(31)],version='1.26.3')
            result=compare.build(old,new,root/'out')
            self.assertEqual(result['sharedItemIds'],1)
            manifest=json.loads((root/'out'/'manifest.json').read_text())
            self.assertEqual(manifest['reportSha256'],compare.sha(root/'out'/'version-diff.json'))
            self.assertFalse(manifest['gameWideRemovalInferred'])
            self.assertEqual(manifest['publicationStatus'],'private_not_approved_for_public_catalog')
            with self.assertRaisesRegex(ValueError,'OUTPUT_OVERLAPS_SOURCE'):
                compare.build(old,new,old/'out')

    def test_recovered_v3_version_expansion_is_coverage_not_game_added(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old=fixture(root/'old',[fake_row(31),fake_row(91,'BoardGame')])
            new=fixture_recovered_v3(root/'new')
            result=compare.compare(old,new)
            self.assertEqual(result['counts']['sharedItemIds'],2)
            self.assertEqual(result['counts']['newlyCoveredCategoryIds'],
                sum(row['nativeCategory'] not in ('ActivityItem','BoardGame')
                    for row in compare.load_private_version(new)['items'].values()))
            self.assertEqual(result['coverage']['previousOnlyCategories'],[])
            self.assertFalse(result['coverage']['gameWideComplete'])
            self.assertIsNone(result['gameWideAddedIds'])
            self.assertIsNone(result['gameWideRemovedIds'])
            self.assertEqual(result['newlyVerifiedNamesByLocale']['ja'],2)

    def test_recovered_v3_source_proof_tampering_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=fixture_recovered_v3(root/'v3')
            m=json.loads((folder/'manifest.json').read_text())
            m['sources'][1]['reuseEvidence']['categoryFilesNotReusable']=[]
            (folder/'manifest.json').write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError,'RECOVERED_VERSION_PROVENANCE_REQUIRED'):
                compare.load_private_version(folder)

    def test_recovered_v3_false_locale_count_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=fixture_recovered_v3(root/'v3')
            m=json.loads((folder/'manifest.json').read_text())
            m['verifiedCurrentLocalization']['currentExactNamesByLocale']['ja']=242
            (folder/'manifest.json').write_text(json.dumps(m))
            with self.assertRaisesRegex(ValueError,'RECOVERED_LOCALE_COUNT_MISMATCH'):
                compare.load_private_version(folder)

    def test_partial_v2_source_coverage_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            folder=fixture(root/'old',[fake_row(31)])
            manifest=json.loads((folder/'manifest.json').read_text())
            manifest.update({'schema':compare.PARTIAL,
                'publicationStatus':'PRIVATE_ONLY_NO_PUBLIC_ITEMS',
                'count':1, 'status':'partial_verified_native_plus_six_full_probe_classes',
                'fullCorpusParsed':False,'byNativeCategory':{'ActivityItem':1,'Furniture':0,'Clothing':0,'Trimming':0},
                'catalogDomains':{'collectionItem':1,'unclassifiedDefinition':0},
                'sources':[{'schema':'wand.src01.steam-native@1','manifestSha256':'a'*64,
                            'verifiedCategories':list(compare.CATEGORIES)},
                           {'schema':'wand.src01.extended@1','manifestSha256':'b'*64,
             'probeSha256':compare.RECOVERED_TARGET_PROBE_SHA,
                            'fullSourceBytesShaVerifiedCategories':[]}]})
            # Manifest with explicit zero-record categories is allowed and must match the input rows.
            (folder/'manifest.json').write_text(json.dumps(manifest))
            result=compare.load_private_version(folder)
            self.assertEqual(result['categories']['ActivityItem'],1)


if __name__ == '__main__':
    unittest.main()
