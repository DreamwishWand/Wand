"""Synthetic evidence tests; tests never need licensed game bytes."""
import base64
import hashlib
import json
import tempfile
import unittest
import zlib
import zipfile
from pathlib import Path
from unittest.mock import patch

import build_correlated_names as corr


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


def varint(value):
    result = bytearray()
    while value > 127:
        result.append((value & 127)|128)
        value >>= 7
    result.append(value)
    return bytes(result)


def entry(key, value):
    def string(field, text):
        raw = text.encode()
        return varint(field*8+2)+varint(len(raw))+raw
    row=string(1,key)+string(2,value)
    return b'\x0a'+varint(len(row))+row


class TestCorrelate(unittest.TestCase):
    def test_native_and_extended_exact_localization_keys(self):
        self.assertEqual(corr.source_key({'nativeCategory':'ActivityItem','nativeNameField':'Gem'}),
                         'Gem_DisplayName')
        self.assertEqual(corr.source_key({'nativeCategory':'Building',
            'localizationKey':'Building.Palace_DisplayName'}),'Palace_DisplayName')
        self.assertIsNone(corr.source_key({'nativeCategory':'Building','localizationKey':None}))
        with self.assertRaisesRegex(ValueError,'INVALID_EXTENDED_NAME_KEY'):
            corr.source_key({'nativeCategory':'Building','localizationKey':'Character.Palace_DisplayName'})

    def test_clean_name_keeps_actual_text_and_excludes_control_markers(self):
        self.assertEqual(corr.clean_name('<nobr>アメジスト</nobr>'),'アメジスト')
        for value in ('{Placeholder}','{LegacyPlaceholder}Other','{DoNotTranslate}',
                      '<nobr>{placeholder}bad</nobr>',''):
            self.assertIsNone(corr.clean_name(value))

    def test_zip_member_match_checks_all_three_criteria(self):
        with tempfile.TemporaryDirectory() as tmp:
            zpath=Path(tmp)/'old.zip'
            raw=entry('Gem_DisplayName','Gem')
            with zipfile.ZipFile(zpath,'w') as z: z.writestr('ActivityItem.locbin',raw)
            spec={'bytes':len(raw),'crc32':f'{zlib.crc32(raw)&0xffffffff:08x}',
                  'headBase64':base64.b64encode(raw).decode()}
            with zipfile.ZipFile(zpath) as z:
                names,meta=corr.observe_member(z,'en','ActivityItem',spec,8192)
                self.assertEqual(names['Gem_DisplayName'],'Gem')
                self.assertTrue(meta['currentFullMemberSha256Verified'])
                tampered={**spec,'crc32':'00000000'}
                with self.assertRaisesRegex(ValueError,'MEMBER_NOT_CORRELATED'):
                    corr.observe_member(z,'en','ActivityItem',tampered,8192)
                tampered={**spec,'headBase64':base64.b64encode(b'X'*len(raw)).decode()}
                with self.assertRaisesRegex(ValueError,'MEMBER_NOT_CORRELATED'):
                    corr.observe_member(z,'en','ActivityItem',tampered,8192)
                tampered={**spec,'bytes':len(raw)+1}
                with self.assertRaisesRegex(ValueError,'BAD_CURRENT_MEMBER_PREFIX_SIZE|MEMBER_NOT_CORRELATED'):
                    corr.observe_member(z,'en','ActivityItem',tampered,8192)

    def test_old_full_member_correlated_with_truncated_current_probe_is_not_sha_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            zpath=Path(tmp)/'old.zip'
            raw=b''.join(entry(f'Gem{i}_DisplayName','Gem') for i in range(600))
            with zipfile.ZipFile(zpath,'w') as z: z.writestr('ActivityItem.locbin',raw)
            spec={'bytes':len(raw),'crc32':f'{zlib.crc32(raw)&0xffffffff:08x}',
                  'headBase64':base64.b64encode(raw[:8192]).decode()}
            with zipfile.ZipFile(zpath) as z:
                names,proof=corr.observe_member(z,'en','ActivityItem',spec,8192)
            self.assertEqual(names['Gem0_DisplayName'],'Gem')
            self.assertFalse(proof['currentFullMemberSha256Verified'])
            self.assertEqual(proof['comparison'],'full_baseline_member_vs_current_size_crc32_prefix')

    def synthetic_sources(self, root, current_name='Gem', old_name='Gem'):
        baseline=root/'old'
        zfolder=baseline/'ddv_Data'/'StreamingAssets'/'Localization'
        zfolder.mkdir(parents=True)
        (baseline/'FullVersion.txt').write_text('test-v1.26.1-build',encoding='utf-8')
        probe={'schema':corr.SOURCE_SCHEMA,'gameVersion':'1.26.2','platform':'Steam',
               'sampleBytesPerEntry':8192,'localization':{}}
        old_hashes={}
        categories=['ActivityItem','Furniture','Clothing','Trimming','AvatarFeature',
                    'BoardGame','Building','Character','Companion','Makeup','MountGear',
                    'PhotoMode','Skin','Tool','Upgrade']
        assert len(categories)==corr.MEMBERS_PER_LOCALE
        for locale,suf in corr.localize1262.LOCALES.items():
            zpath=zfolder/f'LocDB_{suf}.zip'
            member_map={}
            with zipfile.ZipFile(zpath,'w') as z:
                for cat in categories:
                    raw=entry('Gem_DisplayName',old_name)
                    z.writestr(f'{cat}.locbin',raw)
                    member_map[cat]={'bytes':len(raw),
                                      'crc32':f'{zlib.crc32(raw)&0xffffffff:08x}',
                                      'headBase64':base64.b64encode(raw).decode()}
            old_hashes[suf]=corr.digest_file(zpath)
            probe['localization'][locale]={
               'source':f'ddv_Data/StreamingAssets/Localization/LocDB_{suf}.zip',
               'sha256':'a'*64,'members':member_map}
        probe_path=root/'probe.json';json_write(probe_path,probe)
        row={'itemId':30000031,'nativeCategory':'ActivityItem','nativeNameField':'Gem',
             'names':{locale:current_name for locale in corr.LOCALES}}
        manifest={'schema':corr.compare_versions.RECOVERED,'gameVersion':'1.26.2',
                  'count':33627,'byNativeCategory':{c:1 for c in categories},
                  'unresolvedCategories':['Condition']}
        current={'manifest':manifest,'items':{row['itemId']:row},
                 'manifestSha256':'b'*64,'dataSha256':'c'*64}
        return baseline,probe_path,old_hashes,current

    def test_full_pipeline_validates_original_version_archive_and_current_name_consistency(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old,probe,hashes,current=self.synthetic_sources(root)
            with patch.object(corr,'BASELINE_FULLVERSION_SHA',corr.digest_file(old/'FullVersion.txt')),\
                 patch.object(corr,'TARGET_PROBE_SHA',corr.digest_file(probe)),\
                 patch.object(corr,'BASELINE_ARCHIVES_SHA',hashes),\
                 patch.object(corr.compare_versions,'load_private_version',return_value=current):
                result=corr.correlate(root/'current',old,probe,root/'output')
                self.assertEqual(result['candidateDefinitions'],1)
                self.assertEqual(result['allEightHistoricalNames'],1)
                self.assertEqual(result['currentOfficialValuesAgree'],8)
                self.assertEqual(result['membersCorrelated'],120)
                manifest=json.loads((root/'output'/'manifest.json').read_text())
                self.assertFalse(manifest['mergeIntoCanonicalPermitted'])
                self.assertEqual(manifest['sourceCatalog']['itemsSha256'],'c'*64)
                rows=[json.loads(s) for s in (root/'output'/'historical-locale-candidates.jsonl').read_text().splitlines()]
                self.assertEqual(rows[0]['namesHistorical']['ja'],'Gem')
                self.assertEqual(len(rows[0]['currentExactSourceVerifiedLocales']),8)

    def test_official_current_disagreement_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old,probe,hashes,current=self.synthetic_sources(root,current_name='NewName')
            with patch.object(corr,'BASELINE_FULLVERSION_SHA',corr.digest_file(old/'FullVersion.txt')),\
                 patch.object(corr,'TARGET_PROBE_SHA',corr.digest_file(probe)),\
                 patch.object(corr,'BASELINE_ARCHIVES_SHA',hashes),\
                 patch.object(corr.compare_versions,'load_private_version',return_value=current):
                with self.assertRaisesRegex(ValueError,'CURRENT_OFFICIAL_NAME_CONFLICT'):
                    corr.correlate(root/'current',old,probe,root/'output')

    def test_wrong_version_or_probe_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            old,probe,hashes,current=self.synthetic_sources(root)
            with patch.object(corr.compare_versions,'load_private_version',return_value=current):
                with self.assertRaisesRegex(ValueError,'WRONG_BASELINE_VERSION'):
                    corr.correlate(root/'current',old,probe,root/'output')
            with patch.object(corr,'BASELINE_FULLVERSION_SHA',corr.digest_file(old/'FullVersion.txt')),\
                 patch.object(corr.compare_versions,'load_private_version',return_value=current):
                with self.assertRaisesRegex(ValueError,'WRONG_TARGET_PROBE'):
                    corr.correlate(root/'current',old,probe,root/'output')

    def test_output_cannot_write_into_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for p in ('old','current'):(root/p).mkdir()
            with self.assertRaisesRegex(ValueError,'OUTPUT_INPUT_OVERLAP'):
                corr.correlate(root/'current',root/'old',root/'probe.json',root/'current'/'overwrite')

if __name__ == '__main__':unittest.main()