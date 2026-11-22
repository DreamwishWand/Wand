"""Compare legacy Switch 1.25 Collection labels to current Steam source tags.

The old Collection is a hypothesis source, NOT an authority for Steam 1.26.2
UI taxonomy, owned DLC or obtainable worlds. All output is owner-private.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import tempfile
from collections import Counter
from pathlib import Path

import build as compiler
import extract_classification as tags


def require(ok, code):
    if not ok:
        raise ValueError('DB01_SWITCH_COMPARE_' + code)


def file_sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compare(sqlite_path: Path, overlay: Path, switch_folder: Path,
            output: Path, *, expected_sqlite_sha256: str,
            expected_switch_index_sha256: str | None = None) -> dict:
    sqlite_path=sqlite_path.expanduser().resolve()
    overlay=overlay.expanduser().resolve()
    switch_folder=switch_folder.expanduser().resolve()
    output=output.expanduser().resolve()
    require(sqlite_path.is_file() and overlay.is_dir() and
            switch_folder.is_dir() and not output.exists(), 'PATH')
    for root in (sqlite_path.parent,overlay,switch_folder):
        require(output!=root and output not in root.parents and
                root not in output.parents, 'OVERLAP')
    for parent in (output,*output.parents):
        require(not (parent / '.git').exists() and not
                ((parent / 'package.json').exists() and
                 (parent / 'src').is_dir()), 'OUTPUT_INSIDE_REPOSITORY')
    actual=file_sha(sqlite_path)
    require(actual==expected_sqlite_sha256 and
            tags.SHA.fullmatch(expected_sqlite_sha256), 'SQLITE_PIN')
    manifest_path=overlay/'manifest.json'
    m=json.loads(manifest_path.read_bytes())
    require(m.get('schema')==tags.SCHEMA and
            m.get('sourceSqliteSha256')==actual and
            m.get('publicationAuthorized') is False and
            m.get('bucketCount')==256, 'OVERLAY_SOURCE')
    with sqlite3.connect('file:'+sqlite_path.as_posix()+'?mode=ro&immutable=1',
                         uri=True) as con:
        game,items_sha,definition_count=con.execute(
            'SELECT game_version,items_sha256,definition_count FROM catalog WHERE id=1'
        ).fetchone()
        require(m.get('gameVersion')==game and
                m.get('sourceItemsSha256')==items_sha and
                m.get('definitionCount')==definition_count,
                'SOURCE_VERSION')
        current={}
        for item_id,raw in con.execute('SELECT item_id,record_json FROM definition'):
            current[item_id]=json.loads(raw)
    source={}
    for index in range(256):
        name=f'id/{index:02x}.json'
        info=m['files'][name]
        content=(overlay/name).read_bytes()
        require(len(content)==info['bytes'] and
                hashlib.sha256(content).hexdigest()==info['sha256'],
                'OVERLAY_SHARD_SHA')
        rows=json.loads(content)
        require(len(rows)==info['count'], 'OVERLAY_SHARD_COUNT')
        for row in rows:
            id=row['itemId']
            require(id not in source and id in current and id % 256==index and
                    row['nativeCategory']==current[id]['nativeCategory'] and
                    row['nativeKey']==current[id]['nativeNameField'] and
                    row['sourceSha256']==current[id]['source']['sha256'],
                    'OVERLAY_IDENTITY')
            source[id]=row
    require(len(source)==len(current), 'OVERLAY_COVERAGE')
    index_path=switch_folder/'index.json'
    old_index_sha=file_sha(index_path)
    require(expected_switch_index_sha256 is None or
            (tags.SHA.fullmatch(expected_switch_index_sha256) and
             expected_switch_index_sha256==old_index_sha), 'SWITCH_INDEX_PIN')
    old,source_meta=compiler.reference_collection(switch_folder)
    require(source_meta['target']['platform']=='Nintendo Switch' and
            source_meta['target']['gameVersion']=='1.25.0',
            'NOT_SWITCH_125')
    candidates=[]
    by_category=Counter()
    with_matching_names=with_matching_universe=with_matching_world=0
    for id,previous in sorted(old.items()):
        if id not in current:
            continue
        current_name=current[id]['names']
        same=[locale for locale,value in previous['names'].items()
              if value is not None and current_name.get(locale)==value]
        different=[locale for locale,value in previous['names'].items()
                   if value is not None and current_name.get(locale) is not None and
                   value!=current_name[locale]]
        overlay_facets=source[id]['facets']
        src_universes=set(overlay_facets.get('disneyUniverse',[]))
        src_worlds=set(overlay_facets.get('worldContextTag',[]))
        supported_universes=sorted(set(previous['universes']) & src_universes)
        supported_worlds=sorted(set(previous['worlds']) & src_worlds)
        # Preserve original Switch fields as historical candidates. No
        # unverified UI category, world, DLC or Universe is promoted.
        candidates.append({
            'itemId':id,'sourceGameVersion':'1.25.0',
            'targetGameVersion':game, 'historicalCategoryCandidate':previous['category'],
            'historicalWorldCandidates':previous['worlds'],
            'historicalUniverseCandidates':previous['universes'],
            'historicalExpansionCandidates':previous['expansions'],
            'sameExactCurrentNameLocales':same,
            'differentExactCurrentNameLocales':different,
            'currentOriginalUniverseTagMatches':supported_universes,
            'currentOriginalWorldContextTagMatches':supported_worlds,
            'candidateOnly':True,'canPromoteLegacyCategory':False,
            'canPromoteLegacyDlc':False,'canPromoteWorldAvailability':False,
        })
        by_category[previous['category']]+=1
        with_matching_names+=bool(same)
        with_matching_universe+=bool(supported_universes)
        with_matching_world+=bool(supported_worlds)
    report={
        'schema':'wand.db01.switch125-classification-comparison@1',
        'publicationAuthorized':False,
        'historicalGameVersion':'1.25.0','currentGameVersion':game,
        'sqliteSha256':actual,'currentItemsSha256':items_sha,
        'overlayManifestSha256':file_sha(manifest_path),
        'switchIndexSha256':old_index_sha,
        'historicalRows':len(old),'currentDefinitions':len(current),
        'sameItemIds':len(candidates),
        'oldNotObservedNotConfirmedRemoved':len(old)-len(candidates),
        'currentNotInHistoricalNotConfirmedNew':len(current)-len(candidates),
        'withExactNameAgreement':with_matching_names,
        'withCurrentOriginalUniverseTagAgreement':with_matching_universe,
        'withCurrentOriginalWorldContextTagAgreement':with_matching_world,
        'sameItemIdByHistoricalCategory':dict(sorted(by_category.items())),
        'classificationPromotions':0,
        'note':'Historical fields remain candidates even when original source tags agree.',
    }
    output.mkdir(parents=True,exist_ok=False)
    tags.write_atomic(output/'historical-classification-candidates.jsonl',
        b''.join(tags.packed_json(row) for row in candidates))
    tags.write_atomic(output/'report.json',tags.packed_json(report))
    return report


def main():
    parser=argparse.ArgumentParser(description='Private Switch 1.25 / Steam original Tag comparison')
    parser.add_argument('--sqlite',type=Path,required=True)
    parser.add_argument('--overlay',type=Path,required=True)
    parser.add_argument('--switch-reference',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--expected-sqlite-sha256',required=True)
    parser.add_argument('--expected-switch-index-sha256')
    args=parser.parse_args()
    try:
        result=compare(args.sqlite,args.overlay,args.switch_reference,args.out,
            expected_sqlite_sha256=args.expected_sqlite_sha256,
            expected_switch_index_sha256=args.expected_switch_index_sha256)
    except (OSError,ValueError,sqlite3.Error,KeyError,TypeError) as exc:
        parser.exit(1,'DB-01 Switch comparison failed: '+str(exc)+'\n')
    print(json.dumps(result,ensure_ascii=False,sort_keys=True))


if __name__=='__main__':
    main()
