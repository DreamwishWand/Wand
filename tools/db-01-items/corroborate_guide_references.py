"""Build PRIVATE, exact-Mission-source DB-01 ↔ DB-03 item-reference lookup.

Only static native quest references. No game-wide availability, reward guarantee,
player progression, entitlement, save writing, or public publishing is inferred.
Uses existing verified DB-01 SQLite v2 and independently pinned DB-03 sources.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

SCHEMA = 'wand.db01.db03-item-quest-references@1'
BINS = 256
SHA = re.compile(r'[0-9a-f]{64}\Z')
WIRE_PATH = re.compile(r'protobuf\.[A-Za-z0-9_.\[\]]+\Z')
OBJECTIVE_ROLES = {'direct', 'alternative'}
FLOW_ROLES = {'additional_reward_loot_candidate', 'intro_item_grant_candidate',
              'post_mission_cleanup_reference', 'substep_handoff_definition'}


def fail(reason):
    raise ValueError('DB01_DB03_' + reason)


def require(ok, reason):
    if not ok:
        fail(reason)


def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as inp:
        for chunk in iter(lambda:inp.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()


def packed(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)+'\n').encode('utf-8')


def unique_json(data):
    def reject_duplicates(kv):
        o={}
        for key,val in kv:
            require(key not in o,'DUPLICATE_JSON_KEY')
            o[key]=val
        return o
    return json.loads(data, object_pairs_hook=reject_duplicates)


def u64(value):
    return (not isinstance(value, bool) and
            (type(value) is int or isinstance(value,str) and value.isdecimal()) and
            0 < int(value) <= 9007199254740991)


def private_destination(path):
    require(not path.exists(),'REFUSE_OVERWRITE')
    for parent in (path,*path.parents):
        require(not (parent/'.git').exists() and
                not ((parent/'src').is_dir() and (parent/'package.json').is_file()),
                'OUTPUT_INSIDE_PUBLIC_REPO')


def build(sqlite_path, guide_manifest, objective_index, flow_index,
          mission_original, output, *, sqlite_sha, manifest_sha,
          objective_sha, flow_sha):
    paths=[Path(x) for x in (sqlite_path,guide_manifest,objective_index,flow_index,mission_original)]
    for p in paths:
        require(not p.is_symlink() and p.is_file(),'INPUT_NOT_REGULAR_FILE')
    sq,gm,ob,fl,mission=map(lambda p:p.resolve(strict=True),paths)
    out=Path(output).resolve()
    private_destination(out)
    require(all(SHA.fullmatch(x or '') for x in (sqlite_sha,manifest_sha,objective_sha,flow_sha)),
            'TRUSTED_SHA256_REQUIRED')
    src={p:digest(p) for p in (sq,gm,ob,fl,mission)}
    for p,h in ((sq,sqlite_sha),(gm,manifest_sha),(ob,objective_sha),(fl,flow_sha)):
        require(src[p]==h,'TRUSTED_INPUT_SHA_MISMATCH')
    manifest=unique_json(gm.read_bytes());objective=unique_json(ob.read_bytes());flows=unique_json(fl.read_bytes())
    require(manifest.get('target', {}).get('platform')=='Steam' and
            re.fullmatch(r'\d+\.\d+\.\d+', manifest['target'].get('gameVersion','')) and
            manifest.get('status')=='PARTIAL' and
            manifest.get('sources',{}).get('quests',{}).get('file')=='itemlist/Mission.json' and
            manifest['sources']['quests'].get('sha256')==src[mission],
            'GUIDE_MISSION_SOURCE_MISMATCH')
    require(objective.get('schema')=='wand.db03.item-objective-links@1' and
            flows.get('schema')=='wand.db03.item-flows@1' and
            objective.get('target')==manifest['target'] and flows.get('target')==manifest['target'] and
            objective.get('meaning')=='Selector candidates, NOT all simultaneously required items' and
            flows.get('meaning')=='STATIC candidates and item references; not guaranteed player state' and
            objective.get('indexCoverage')=='optional_partial_SRC01_membership_only_not_version_verification' and
            flows.get('indexCoverage')=='optional_partial_SRC01_membership_only',
            'GUIDE_INDEX_SEMANTICS')
    olen=manifest.get('itemObjectiveSelectorLinks'); flen=manifest.get('questItemFlowLinks')
    require(type(olen) is int and type(flen) is int and
            len(objective.get('links',[]))==olen and len(flows.get('links',[]))==flen,
            'GUIDE_COUNTS')
    con=sqlite3.connect(f'file:{sq.as_posix()}?mode=ro&immutable=1',uri=True)
    try:
        require(con.execute('PRAGMA user_version').fetchone()[0]==2 and
                con.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
                'DB01_SQLITE_VERSION_OR_INTEGRITY')
        row=con.execute('''SELECT store_schema,platform,game_version,items_sha256,
                definition_count,publication_authorized FROM catalog WHERE id=1''').fetchone()
        require(row is not None and row[0]=='wand.db01.sqlite@2' and row[1]=='Steam' and
                re.fullmatch(r'\d+\.\d+\.\d+', row[2]) and row[4]>0 and row[5]==0,
                'DB01_CATALOG_TARGET_OR_SCOPE')
        native={ident:(cat,sha) for ident,cat,sha in con.execute('SELECT item_id,native_category,source_sha256 FROM definition')}
        require(len(native)==row[4],'DB01_IDS')
        require(sum(cat=='Mission' for cat,_ in native.values())==manifest['sources']['quests']['records'],
                'MISSION_DEFINITION_COUNT')
        mission_shas={sha for cat,sha in native.values() if cat=='Mission'}
        require(mission_shas=={src[mission]},'CROSS_VERSION_MISSION_SHA_NOT_EQUAL')
    finally:
        con.close()
    refs=defaultdict(list)
    counts=Counter()
    counts_by_type=Counter()
    rescued=0
    seen=set()
    for kind,records in (('objective_candidate',objective['links']),('item_flow',flows['links'])):
        for r in records:
            require(isinstance(r,dict) and u64(r.get('itemId')) and u64(r.get('questId')),
                    'LINK_INVALID_ID')
            iid,qid=int(r['itemId']),int(r['questId'])
            require(iid in native and qid in native and native[qid][0]=='Mission',
                    'LINK_NOT_PRESENT_IN_SQLITE')
            detail={k:v for k,v in r.items() if k not in ('itemId','questId','indexMembership')}
            require(r.get('indexMembership') in ('present','not_in_supplied_index'),
                    'HISTORICAL_INDEX_MEMBERSHIP')
            rescued+=r['indexMembership']=='not_in_supplied_index'
            if kind=='objective_candidate':
                require(r.get('candidateRole') in OBJECTIVE_ROLES and
                        r.get('selectorMode') in ('item','itemList') and
                        r.get('candidateRole')==('direct' if r['selectorMode']=='item' else 'alternative') and
                        re.fullmatch(r'[0-9a-f]{64}',r.get('sourceObjectiveSha256','')),
                        'OBJECTIVE_SOURCE_OR_ALTERNATIVE')
                proof=r['sourceObjectiveSha256']
                counts_by_type[r['candidateRole']]+=1
            else:
                require(r.get('flowKind') in FLOW_ROLES and
                        re.fullmatch(r'[0-9a-f]{64}',r.get('nativeWireSha256','')) and
                        (r.get('flowKind')!='additional_reward_loot_candidate' or
                         r.get('selection')=='not_guaranteed'),
                        'FLOW_UNVERIFIED_REWARD')
                proof=r['nativeWireSha256']
                counts_by_type[r['flowKind']]+=1
            require(isinstance(r.get('sourceField'),str) and WIRE_PATH.fullmatch(r['sourceField']),
                    'SOURCE_FIELD')
            canonical=(kind,iid,qid,r['sourceField'],proof,packed(detail))
            require(canonical not in seen,'DUPLICATE_LINK')
            seen.add(canonical)
            refs[iid].append({'itemId':iid,'questId':qid,'nativeCategory':native[iid][0],
                              'referenceKind':kind,'sourceWireSha256':proof,
                              'sourceField':r['sourceField'],
                              'detail':detail})
            counts[kind]+=1
    require(counts['objective_candidate']==olen and counts['item_flow']==flen and
            counts_by_type['direct']+counts_by_type['alternative']==olen and
            sum(counts_by_type[k] for k in FLOW_ROLES)==flen,
            'LINK_LEDGER_MISMATCH')
    require(digest(sq)==src[sq] and digest(gm)==src[gm] and
            digest(ob)==src[ob] and digest(fl)==src[fl] and digest(mission)==src[mission],
            'INPUT_CHANGED_DURING_JOIN')
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.db01-guide-',dir=out.parent) as stage_str:
        stage=Path(stage_str)
        (stage/'id').mkdir()
        ledger={}
        for bucket in range(BINS):
            groups=[r for ident in sorted(refs) if ident%BINS==bucket for r in refs[ident]]
            path=f'id/{bucket:02x}.json'
            raw=packed(groups)
            (stage/path).write_bytes(raw)
            ledger[path]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'count':len(groups)}
        m={'schema':SCHEMA,'privateOnly':True,'publicationAuthorized':False,
           'platform':'Steam','db01GameVersion':row[2],'guideGameVersion':manifest['target']['gameVersion'],
           'db01SourceItemsSha256':row[3],'db01SqliteSha256':src[sq],
           'guideManifestSha256':src[gm], 'guideObjectivesSha256':src[ob],
           'guideFlowsSha256':src[fl],'originalMissionSha256':src[mission],
           'originalMissionSourceEqual':True,
           'linkCounts':{'objectiveCandidates':olen,'itemFlows':flen,'total':len(seen),
                         'oldPartialIndexMissesNowResolved':rescued},
           'distinctItemIds':len(refs),'bucketCount':BINS,
           'staticOnly':True,'guaranteedRewardVerified':False,
           'liveStateVerified':False,'playerProgressVerified':False,
           'files':ledger}
        (stage/'manifest.json').write_bytes(packed(m))
        require(not out.exists(),'REFUSE_OVERWRITE')
        os.rename(stage,out)
    return m


def main():
    p=argparse.ArgumentParser(description='Private DB-01↔DB-03 source-exact item/quest reference index')
    for name in ('sqlite','guide-manifest','objective-index','flow-index','mission-original','out'):
        p.add_argument('--'+name,type=Path,required=True)
    for name in ('sqlite-sha','manifest-sha','objective-sha','flow-sha'):
        p.add_argument('--'+name,required=True)
    a=p.parse_args()
    m=build(a.sqlite,a.guide_manifest,a.objective_index,a.flow_index,a.mission_original,a.out,
            sqlite_sha=a.sqlite_sha,manifest_sha=a.manifest_sha,
            objective_sha=a.objective_sha,flow_sha=a.flow_sha)
    print(json.dumps({'schema':m['schema'],'linkCounts':m['linkCounts'],
                      'distinctItemIds':m['distinctItemIds'],'privateOnly':True},sort_keys=True))


if __name__=='__main__':main()