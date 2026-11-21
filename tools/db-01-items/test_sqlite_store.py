"""Synthetic integrity tests for the permanent SQLite+TypeScript DB-01 pipeline."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import sqlite_store as store
import export_shards as shards


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dumps(data):
    return (json.dumps(data, separators=(',', ':'), ensure_ascii=False, sort_keys=True) + '\n').encode('utf-8')


def sample():
    out=[]
    for i,(cat,domain) in enumerate([('ActivityItem','item'),('Character','definition_unclassified')], 1):
        names={loc:None for loc in store.LOCALES}
        status={loc:'unresolved' for loc in store.LOCALES}
        if i == 1: names['en']='Synthetic Apple';status['en']='exact_locdb_join'
        out.append({'itemId':i,'nativeCategory':cat,'catalogDomain':domain,
                    'localizationKey':cat+'.Test', 'source':{'file':f'ddv_Data/StreamingAssets/itemlist/{cat}.json',
                    'platform':'Steam','gameVersion':'1.26.2','sha256':sha(cat.encode())},
                    'names':names,'verification':{'currentVersionObserved':True,
                    'itemId':'native_frame_verified','nativeCategory':'native_file_verified',
                    'classification':'unresolved','relationships':'unresolved',
                    'iconGuid':('native_wire_verified' if domain=='item' else 'unresolved'),'names':status},
                    'image':{'iconGuid':('guid:'+'1'*32 if domain=='item' else None),'mediaExtracted':False},
                    'category':None,'worlds':None,'expansions':None,'adventurePacks':None,
                    'historicalReference':None})
    return out


def fixture(root:Path, rows=None, history=False):
    src=root/'input';src.mkdir()
    rows = rows or sample()
    data=b''.join(dumps(row) for row in rows)
    (src/'items.jsonl').write_bytes(data)
    m={'schema':'wand.db01.partial-manifest@3','platform':'Steam','gameVersion':'1.26.2',
       'publicationStatus':'PRIVATE_ONLY_NO_PUBLIC_ITEMS','fullCorpusParsed':False,
       'sourceFilesFullyShaVerified':38,'sourceFilesTotal':39,'unresolvedCategories':['Condition'],
       'count':len(rows),'byNativeCategory':{'ActivityItem':1,'Character':1},
       'verifiedCurrentLocalization':{'currentExactNamesByLocale':{loc:(1 if loc=='en' else 0) for loc in store.LOCALES}},
       'outputSha256':{'items.jsonl':sha(data)},
       'sources':[{'schema':'wand.src01.steam-native@1','manifestSha256':sha(b'native-m'),'itemsSha256':sha(b'native-items')},
                  {'schema':'wand.src01.extended@1','manifestSha256':sha(b'ext-m'),'itemsSha256':sha(b'ext-items'),
                   'reuseEvidence':{'schema':'wand.src01.identical-binary-reuse@1',
                    'categoryFilesNotReusable':['Condition.json'],'currentTargetVersion':'1.26.2',
                    'sameFullBytesSha256Files':[f'Synthetic{i}.json' for i in range(38)]}}]}
    (src/'manifest.json').write_bytes(dumps(m))
    hist=None
    if history:
        hist=root/'history';hist.mkdir()
        candidate={'itemId':2,'targetGameVersion':'1.26.2','baselineGameVersion':'1.26.1',
                   'mergeIntoCanonicalPermitted':False,'nativeCategory':'Character',
                   'namesHistorical':{locale:'Old Character' for locale in store.LOCALES}}
        raw=dumps(candidate)
        (hist/'historical-locale-candidates.jsonl').write_bytes(raw)
        hm={'schema':store.HISTORY_SCHEMA,'historicalGameVersion':'1.26.1',
            'sourceCatalog':{'itemsSha256':sha(data),'items':len(rows)},
            'outputSha256':{'historical-locale-candidates.jsonl':sha(raw)},
            'counts':{'candidateDefinitions':1}}
        (hist/'manifest.json').write_bytes(dumps(hm))
    return src,hist


class SqliteStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.src,self.hist=fixture(self.root,history=True)

    def test_build_joins_current_and_historical_but_never_promotes(self):
        target=self.root/'private.sqlite'
        result=store.build(self.src,target,self.hist)
        self.assertEqual(result['definitions'],2)
        self.assertEqual(result['exactNames'],1)
        self.assertEqual(result['historicalCandidates'],1)
        with sqlite3.connect(target) as c:
            self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(c.execute('SELECT count(*) FROM exact_name').fetchone()[0],1)
            self.assertEqual(c.execute('SELECT count(*) FROM historical_name_candidate').fetchone()[0],8)
            self.assertEqual(c.execute('SELECT publication_authorized FROM catalog').fetchone()[0],0)
            self.assertIsNone(c.execute("SELECT value FROM exact_name WHERE item_id=2 AND locale='en'").fetchone())
            self.assertEqual(c.execute("SELECT value FROM historical_name_candidate WHERE item_id=2 AND locale='en'").fetchone()[0], 'Old Character')
        self.assertEqual(target.stat().st_mode & 0o777,0o600)

    def test_export_emits_on_demand_hash_bound_shards_without_promoting_history(self):
        target=self.root/'private.sqlite';store.build(self.src,target,self.hist)
        export=self.root/'shards'
        result=shards.export(target,export,include_historical=True)
        self.assertEqual(result['definitions'],2)
        self.assertEqual(result['historicalEntries'],8)
        manifest=json.loads((export/'manifest.json').read_bytes())
        self.assertTrue(manifest['privateOnly'])
        self.assertFalse(manifest['publicationAuthorized'])
        self.assertEqual(manifest['bucketCount'],256)
        self.assertEqual(len(manifest['files']), 256*2+2+8)
        self.assertEqual(json.loads((export/'locale/ja.json').read_bytes()),[])
        self.assertEqual(json.loads((export/'locale/en.json').read_bytes()),[[1,'Synthetic Apple']])
        self.assertEqual(json.loads((export/'historical/02.json').read_bytes()),[[2,'de','Old Character','1.26.1'],[2,'en','Old Character','1.26.1'],[2,'es-ES','Old Character','1.26.1'],[2,'fr','Old Character','1.26.1'],[2,'it','Old Character','1.26.1'],[2,'ja','Old Character','1.26.1'],[2,'pt-BR','Old Character','1.26.1'],[2,'zh-CN','Old Character','1.26.1']])
        for name,meta in list(manifest['files'].items())[:5]:
            self.assertEqual(sha((export/name).read_bytes()),meta['sha256'])
        with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE'): shards.export(target,export)

    def test_export_no_historical_opt_in(self):
        target=self.root/'private.sqlite';store.build(self.src,target,self.hist)
        shards.export(target,self.root/'private-assets')
        manifest=json.loads((self.root/'private-assets/manifest.json').read_bytes())
        self.assertFalse(manifest['historicalCandidatesIncluded'])
        self.assertFalse(any(path.startswith('historical/') for path in manifest['files']))

    def test_reject_modification_of_sha_checked_rows(self):
        lines=(self.src/'items.jsonl').read_bytes().splitlines()
        modified=json.loads(lines[0]);modified['itemId']=999
        (self.src/'items.jsonl').write_bytes(dumps(modified)+lines[1]+b'\n')
        with self.assertRaisesRegex(ValueError,'ITEMS_HASH_MISMATCH'):
            store.build(self.src,self.root/'private.sqlite')
        self.assertFalse((self.root/'private.sqlite').exists())

    def test_reject_unverified_name_even_with_recomputed_checksum(self):
        lines=(self.src/'items.jsonl').read_bytes().splitlines()
        modified=json.loads(lines[0]);modified['verification']['names']['en']='unresolved'
        data=dumps(modified)+lines[1]+b'\n'
        (self.src/'items.jsonl').write_bytes(data)
        manifest=json.loads((self.src/'manifest.json').read_bytes())
        manifest['outputSha256']['items.jsonl']=sha(data)
        (self.src/'manifest.json').write_bytes(dumps(manifest))
        with self.assertRaisesRegex(ValueError,'UNVERIFIED_NAME'):
            store.build(self.src,self.root/'private.sqlite')

    def test_bad_historical_candidate_never_reaches_store(self):
        candidate=json.loads((self.hist/'historical-locale-candidates.jsonl').read_bytes())
        candidate['namesHistorical']['en']='{DoNotTranslate}Bad'
        raw=dumps(candidate)
        (self.hist/'historical-locale-candidates.jsonl').write_bytes(raw)
        m=json.loads((self.hist/'manifest.json').read_bytes());m['outputSha256']['historical-locale-candidates.jsonl']=sha(raw)
        (self.hist/'manifest.json').write_bytes(dumps(m))
        with self.assertRaisesRegex(ValueError,'HISTORY_NAME'):
            store.build(self.src,self.root/'private.sqlite',self.hist)

    def test_never_overwrites_source_or_output(self):
        target=self.root/'private.sqlite';store.build(self.src,target)
        before=target.read_bytes()
        with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE'):
            store.build(self.src,target)
        self.assertEqual(before,target.read_bytes())
        with self.assertRaisesRegex(ValueError,'OUTPUT_SOURCE_OVERLAP'):
            store.build(self.src,self.src/'subdir'/'private.sqlite')

    def test_canonical_future_version_uses_same_sqlite_contract_without_1262_pins(self):
        m=json.loads((self.src/'manifest.json').read_bytes())
        m['schema']='wand.db01.items@1'
        m['publicationStatus']='private_not_approved_for_public_catalog'
        m['inputs']={'nativeManifest':sha(b'new-native-manifest'),'native':sha(b'new-native-items')}
        m['counts']={'currentDefinitions':2}
        m.pop('sources');m.pop('verifiedCurrentLocalization')
        (self.src/'manifest.json').write_bytes(dumps(m))
        result=store.build(self.src,self.root/'future.sqlite')
        self.assertEqual(result['definitions'],2)
        with sqlite3.connect(self.root/'future.sqlite') as c:
            self.assertEqual(c.execute('SELECT native_source_manifest_sha256 FROM catalog').fetchone()[0],m['inputs']['nativeManifest'])
            self.assertEqual(c.execute('SELECT full_corpus_parsed FROM catalog').fetchone()[0],0)

    def test_reject_game_classification_and_source_hash_forgery(self):
        rows=sample();rows[0]['catalogDomain']='definition_unclassified'
        root=self.root/'other';root.mkdir()
        source,_=fixture(root,rows=rows)
        with self.assertRaisesRegex(ValueError,'UNVERIFIED_DOMAIN'):
            store.build(source,root/'private.sqlite')


if __name__=='__main__': unittest.main()