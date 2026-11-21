"""Synthetic tests only: never require or commit the private Steam game bytes."""
import hashlib
import base64
import zlib
import json
import tempfile
import unittest
from pathlib import Path

import recover_unchanged1262 as recover


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')


def fixtures(root):
    """132 synthetic current rows; exact 8-locale archives and seven source categories."""
    probe = root / 'format-probe.json'
    localization = {locale: {'sha256': hex(i + 1)[2:].zfill(64)}
                    for i, locale in enumerate(recover.localize1262.LOCALES)}
    write_json(probe, {'schema':'wand.src01.format-probe@1',
                       'gameVersion':'1.26.2', 'localization':localization})
    complete = root / 'complete'
    complete.mkdir()
    categories = ['BoardGame', 'Currency', 'Display', 'Environment', 'ItemCondition',
                  'PhotoMode', 'Profession']
    originals = {}
    rows = []
    for i in range(132):
        category = 'BoardGame' if i < 35 else 'PhotoMode'
        names = {loc: None for loc in localization}
        if i == 0: names['ja'] = 'テスト名'
        item_id = 180000000+i if category == 'BoardGame' else 190000000+i
        item = {'itemId':item_id, 'nativeCategory':category,
                'rawNameField':f'Example{i}', 'localizationKey':f'{category}.Example{i}_DisplayName',
                'imageGuidField4Candidate':None,
                'source':{'sha256':'b'*64},'names':names}
        rows.append(item)
        originals[item_id] = {**item,'names':{loc:None for loc in localization}}
    jsonl = complete / 'definitions.jsonl'
    with jsonl.open('w',encoding='utf-8') as out:
        for row in rows:out.write(json.dumps(row,sort_keys=True,ensure_ascii=False)+'\n')
    archive_evidence = {}
    for locale,suffix in recover.localize1262.LOCALES.items():
        archive_evidence[locale] = {'archive':f'LocDB_{suffix}.zip',
                                    'sha256':localization[locale]['sha256'],
                                    'members':{c:{'entry':f'{c}.locbin','entrySha256':'c'*64}
                                               for c in ('BoardGame','PhotoMode')}}
    write_json(complete / 'manifest.json',{
        'schema':'wand.src01.extended@1','gameVersion':'1.26.2','platform':'Steam',
        'probeSha256':recover.sha(probe),'definitionCount':132,
        'itemsSha256':recover.sha(jsonl),
        'categories':{c+'.json':{'status':'verified_empty' if c=='ItemCondition' else 'native_wire_verified'}
                      for c in categories},
        'localizationEvidence':archive_evidence,
    })
    return complete,probe,originals


def synthetic_member_probe(names_by_locale):
    """Synthetic full ZIP-member bytes in exactly the current probe format."""
    encode = recover.extend1262.steam1262.encode_varint
    def field(number, value):
        data = value.encode('utf-8')
        return encode((number << 3) | 2)+encode(len(data))+data
    archives, prior = {}, {}
    for i,(locale,suffix) in enumerate(recover.localize1262.LOCALES.items()):
        name = names_by_locale.get(locale, 'Example name')
        entry = field(1,'Example0_DisplayName')+field(2,name)
        raw = b'\x0a'+encode(len(entry))+entry
        crc = f'{zlib.crc32(raw) & 0xffffffff:08x}'
        archives[locale] = {'source': f'ddv_Data/StreamingAssets/Localization/LocDB_{suffix}.zip',
            'sha256':f'{i+1:064x}',
            'members':{'BoardGame':{'bytes':len(raw),'crc32':crc,
                                    'headBase64':base64.b64encode(raw).decode()}}}
        prior[locale] = {'sha256':archives[locale]['sha256'],
                         'archive':f'LocDB_{suffix}.zip','members':{}}
    return {'sampleBytesPerEntry':8192,'localization':archives},prior


class TestReuseExactBytes(unittest.TestCase):
    def test_full_sha_match_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'ActivityData.json'; path.write_bytes(b'original full bytes')
            digest=recover.sha(path)
            self.assertTrue(recover.verified_same_file(path,digest))
            self.assertFalse(recover.verified_same_file(path,'a'*64,allow_changed=True))
            with self.assertRaisesRegex(ValueError,'BASELINE_SOURCE_NOT_CURRENT'):
                recover.verified_same_file(path,'a'*64)
            path.write_bytes(b'original full bytez')
            self.assertFalse(recover.verified_same_file(path,digest,allow_changed=True))

    def test_invalid_expected_digest_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'ActivityData.json'; path.write_bytes(b'content')
            with self.assertRaisesRegex(ValueError,'BAD_EXPECTED_SOURCE_DIGEST'):
                recover.verified_same_file(path,'x'*64)

    def test_full_current_locale_members_promote_exact_names(self):
        probe, old = synthetic_member_probe({'ja':'日本語名'})
        item = {'itemId':180000000,'nativeCategory':'BoardGame',
                'localizationKey':'BoardGame.Example0_DisplayName',
                'names':dict.fromkeys(recover.localize1262.LOCALES)}
        evidence,counts = recover.join_complete_current_locbin_members(probe,{180000000:item},old)
        self.assertEqual(item['names']['en'],'Example name')
        self.assertEqual(item['names']['ja'],'日本語名')
        self.assertEqual(counts['currentEightLocaleNamedDefinitions'],1)
        self.assertEqual(counts['fullCurrentLocaleMemberCount'],8)
        self.assertEqual(len(evidence['ja']['members']),1)

    def test_truncated_member_never_promoted_to_official_name(self):
        probe, old = synthetic_member_probe({})
        member = probe['localization']['ja']['members']['BoardGame']
        member['bytes'] = 9000
        member['headBase64'] = base64.b64encode(b'x'*8192).decode()
        item = {'itemId':180000000,'nativeCategory':'BoardGame',
                'localizationKey':'BoardGame.Example0_DisplayName',
                'names':dict.fromkeys(recover.localize1262.LOCALES)}
        evidence,counts = recover.join_complete_current_locbin_members(probe,{180000000:item},old)
        self.assertIsNone(item['names']['ja'])
        self.assertEqual(counts['currentEightLocaleNamedDefinitions'],0)
        self.assertNotIn('BoardGame',evidence['ja']['members'])

    def test_current_member_crc_mismatch_refused(self):
        probe, old=synthetic_member_probe({})
        probe['localization']['ja']['members']['BoardGame']['crc32']='badc0ded'
        item = {'itemId':180000000,'nativeCategory':'BoardGame',
                'localizationKey':'BoardGame.Example0_DisplayName',
                'names':dict.fromkeys(recover.localize1262.LOCALES)}
        with self.assertRaisesRegex(ValueError,'CURRENT_LOCBIN_FULL_MEMBER_CRC_MISMATCH'):
            recover.join_complete_current_locbin_members(probe,{180000000:item},old)

    def test_current_member_conflicting_original_name_refused(self):
        probe, old=synthetic_member_probe({})
        names=dict.fromkeys(recover.localize1262.LOCALES)
        names['ja']='Different prior verified name'
        item = {'itemId':180000000,'nativeCategory':'BoardGame',
                'localizationKey':'BoardGame.Example0_DisplayName','names':names}
        with self.assertRaisesRegex(ValueError,'CURRENT_PROBE_EXACT_NAME_CONFLICT'):
            recover.join_complete_current_locbin_members(probe,{180000000:item},old)

    def test_control_marker_is_not_user_display_name(self):
        probe, old=synthetic_member_probe({'ja':'{Placeholder}DoNotShow'})
        item = {'itemId':180000000,'nativeCategory':'BoardGame',
                'localizationKey':'BoardGame.Example0_DisplayName',
                'names':dict.fromkeys(recover.localize1262.LOCALES)}
        _,counts=recover.join_complete_current_locbin_members(probe,{180000000:item},old)
        self.assertIsNone(item['names']['ja'])
        self.assertEqual(counts['currentEightLocaleNamedDefinitions'],0)

    def test_symlink_rejected_even_if_hash_matches(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); real=root/'real.json';real.write_bytes(b'content')
            link=root/'other.json'
            try: link.symlink_to(real)
            except OSError: self.skipTest('symlinks unavailable')
            with self.assertRaisesRegex(ValueError,'SOURCE_FILE_NOT_REGULAR'):
                recover.verified_same_file(link,recover.sha(real))

    def test_reuse_matches_entire_current_probe_row(self):
        with tempfile.TemporaryDirectory() as tmp:
            complete, probe, originals=fixtures(Path(tmp))
            localization=recover.load_current_complete_probe(complete,probe,originals,
                {'BoardGame.json','Currency.json','Display.json','Environment.json',
                 'ItemCondition.json','PhotoMode.json','Profession.json'})
            self.assertEqual(len(localization),8)
            self.assertEqual(originals[180000000]['names']['ja'],'テスト名')
            self.assertIsNone(originals[190000036]['names']['en'])

    def test_refuse_mismatched_native_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            complete,probe,originals=fixtures(Path(tmp))
            originals[180000000]['rawNameField']='DifferentMeaning'
            with self.assertRaisesRegex(ValueError,'ROW_CONFLICT'):
                recover.load_current_complete_probe(complete,probe,originals,
                    {c+'.json' for c in ('BoardGame','Currency','Display','Environment',
                                         'ItemCondition','PhotoMode','Profession')})

    def test_refuse_tampered_completed_probe_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            complete,probe,originals=fixtures(Path(tmp))
            with (complete/'definitions.jsonl').open('a') as file:file.write(' ')
            with self.assertRaisesRegex(ValueError,'INVALID_CURRENT_PROBE_MANIFEST'):
                recover.load_current_complete_probe(complete,probe,originals,
                    {c+'.json' for c in ('BoardGame','Currency','Display','Environment',
                                         'ItemCondition','PhotoMode','Profession')})

    def test_refuse_archive_hash_not_in_current_probe(self):
        with tempfile.TemporaryDirectory() as tmp:
            complete,probe,originals=fixtures(Path(tmp))
            manifest=json.loads((complete/'manifest.json').read_text())
            manifest['localizationEvidence']['ja']['sha256']='f'*64
            write_json(complete/'manifest.json',manifest)
            with self.assertRaisesRegex(ValueError,'CURRENT_ZIP_PROBE_HASH_CONFLICT'):
                recover.load_current_complete_probe(complete,probe,originals,
                    {c+'.json' for c in ('BoardGame','Currency','Display','Environment',
                                         'ItemCondition','PhotoMode','Profession')})

    def test_reject_sentinel_even_in_current_complete_probe(self):
        with tempfile.TemporaryDirectory() as tmp:
            complete,probe,originals=fixtures(Path(tmp))
            path=complete/'definitions.jsonl'
            rows=[json.loads(x) for x in path.read_text().splitlines()]
            rows[0]['names']['ja']='{DoNotTranslate}test'
            path.write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in rows))
            manifest=json.loads((complete/'manifest.json').read_text())
            manifest['itemsSha256']=recover.sha(path)
            write_json(complete/'manifest.json',manifest)
            with self.assertRaisesRegex(ValueError,'CURRENT_PROBE_NONDISPLAY_NAME'):
                recover.load_current_complete_probe(complete,probe,originals,
                    {c+'.json' for c in ('BoardGame','Currency','Display','Environment',
                                         'ItemCondition','PhotoMode','Profession')})


if __name__=='__main__': unittest.main()