"""Owner-private complete lazy-Quest shard byte-and-record digest audit.

Checks all 32 original v1.26.1 Guide shard JSON files against the authentic
733-record search index. Steam 1.26.2 reuse requires matching original Mission
file SHA; no relabelling of generated 1.26.1 output or publishing game text.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

SCHEMA='wand.db03.guide-shard-source-audit@1'
BASE_MANIFEST_SHA='cd9cdd00db16445d4ab6f604f08d1e1f2bd2c304c6f2d1d387783b89433adf26'
BASE_SEARCH_SHA='26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d'
TARGET_PROBE_SHA='07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a'
FRIENDSHIP_SHA='90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22'
MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
SHARD_SCHEMA='wand.db03.quest-detail-shards@1'
SOURCE='ddv_Data/StreamingAssets/itemlist/Mission.json'
EXPECTED_SHARDS=32
EXPECTED_BYTES=98001716
EXPECTED_COUNTS={'mission':733,'questGroup':289,'unclassified':8}
RECORD_HASH=re.compile(r'^[a-f0-9]{64}$')
ID=re.compile(r'^[1-9][0-9]{0,15}$')


def require(ok,code):
    if not ok:raise ValueError('DB03_SHARD_AUDIT_'+code)


def sha(raw):return hashlib.sha256(raw).hexdigest()


def canonical(row):
    return json.dumps(row,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf-8')


def strict_json(raw):
    def pairs(items):
        data={}
        for k,v in items:
            require(k not in data,'DUPLICATE_JSON_KEY')
            data[k]=v
        return data
    def invalid_constant(s):raise ValueError('DB03_SHARD_AUDIT_NONFINITE_NUMBER')
    return json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_constant=invalid_constant)


def pinned_json(path, expected_digest, max_bytes=32*1024*1024):
    require(path.is_file() and not path.is_symlink(),'MISSING_JSON_'+path.name)
    require(0<path.stat().st_size<=max_bytes,'INPUT_BYTES_'+path.name)
    raw=path.read_bytes()
    require(sha(raw)==expected_digest,'SOURCE_SHA_'+path.name)
    out=strict_json(raw)
    require(isinstance(out,dict),'SOURCE_JSON_ROOT_'+path.name)
    return out


def audit(manifest, index, probe, friendship_baseline, friendship_target, shard_dir:Path, *,
          require_exact_bytes=True, friendship_source_sha=FRIENDSHIP_SHA):
    require(manifest.get('schema')=='wand.db03.native-guide@1' and
            manifest.get('target')=={'gameVersion':'1.26.1','platform':'Steam'},
            'OLD_MANIFEST_SOURCE')
    require(index.get('schema')=='wand.db03.quest-search@1' and
            index.get('target')==manifest['target'] and
            index.get('source')=={'file':SOURCE,'sha256':MISSION_SHA},
            'OLD_QUEST_SOURCE')
    require(probe.get('schema')=='wand.src01.format-probe@1' and
            probe.get('gameVersion')=='1.26.2' and probe.get('platform')=='Steam' and
            probe.get('itemlistCandidates',{}).get('Mission.json',{}).get('sha256')==MISSION_SHA,
            'TARGET_SOURCE')
    old_mission=manifest.get('sources',{}).get('quests',{})
    require(old_mission.get('sha256')==MISSION_SHA and old_mission.get('records')==1030,
            'BASE_NATIVE_MISSION_CENSUS')
    friend=manifest.get('friendshipRewardSource',{})
    require(friend.get('file')=='friendship_levels_default.json' and
            friend.get('sha256')==friendship_source_sha and friend.get('bytes')==2095 and
            friend.get('records')==16 and
            len(friendship_baseline)==len(friendship_target)==2095 and
            sha(friendship_baseline)==sha(friendship_target)==friendship_source_sha,
            'FRIENDSHIP_SOURCE_CHANGED')
    counts=index.get('counts') or {}
    require((counts.get('missions'),counts.get('excludedQuestGroups'),
             counts.get('excludedUnclassified'),counts.get('sourceNativeRecords'))==(733,289,8,1030),
            'QUEST_INDEX_CENSUS')
    records=index.get('records')
    require(isinstance(records,list) and len(records)==733,'QUEST_INDEX_LENGTH')
    indexed={}
    for record in records:
        r=record.get('detail') if isinstance(record,dict) else None
        require(isinstance(r,dict) and isinstance(record.get('id'),str) and ID.fullmatch(record['id']) and
                record['id'] not in indexed and isinstance(r.get('file'),str) and
                RECORD_HASH.fullmatch(r.get('recordSha256','')) and
                RECORD_HASH.fullmatch(r.get('nativeWireSha256','')),
                'QUEST_INDEX_LOCATOR')
        indexed[record['id']]=r
    require(isinstance(shard_dir,Path) and shard_dir.is_dir() and not shard_dir.is_symlink(),
            'SHARD_DIRECTORY')
    expected_names={f'part-{i:02}.json' for i in range(EXPECTED_SHARDS)}
    found_names={x.name for x in shard_dir.glob('part-*.json')}
    require(found_names==expected_names,'SHARD_FILENAMES_MISSING_OR_EXTRA')
    by_file=[]; seen=set();kind_counts=Counter(); verified_quest_digests=0;total_bytes=0
    for i in range(EXPECTED_SHARDS):
        name=f'part-{i:02}.json'
        path=shard_dir/name
        require(path.is_file() and not path.is_symlink(),'SHARD_NOT_REGULAR_'+name)
        size=path.stat().st_size
        require(0<size<=16*1024*1024,'SHARD_BYTES_'+name)
        raw=path.read_bytes()
        require(len(raw)==size,'SHARD_CHANGED_DURING_READ_'+name)
        total_bytes+=size
        require(total_bytes<=128*1024*1024,'SHARD_TOTAL_BYTES')
        doc=strict_json(raw)
        require(isinstance(doc,dict) and doc.get('schema')==SHARD_SCHEMA and
                doc.get('target')==index['target'] and doc.get('source')==index['source'] and
                doc.get('bucket')==i and doc.get('evaluation')=='static_definition_only' and
                isinstance(doc.get('records'),list) and len(doc['records'])>0,
                'SHARD_SOURCE_'+name)
        shard_counts=Counter()
        for record in doc['records']:
            require(isinstance(record,dict) and isinstance(record.get('id'),str) and
                    ID.fullmatch(record['id']) and record['id'] not in seen and
                    RECORD_HASH.fullmatch(record.get('nativeWireSha256','')) and
                    record.get('recordKind') in EXPECTED_COUNTS and
                    isinstance(record.get('source'),dict) and
                    record['source'].get('file')==SOURCE and record['source'].get('sha256')==MISSION_SHA and
                    type(record['source'].get('frameIndex')) is int and record['source']['frameIndex']>=0,
                    'SHARD_RECORD_PROVENANCE_'+name)
            rid=record['id'];seen.add(rid);kind=record['recordKind']
            kind_counts[kind]+=1;shard_counts[kind]+=1
            if kind=='mission':
                locator=indexed.get(rid)
                require(locator is not None and locator['file']=='quest-shards/'+name and
                        locator['nativeWireSha256']==record['nativeWireSha256'],
                        'MISSION_LOCATOR_MISMATCH_'+name)
                require(sha(canonical(record))==locator['recordSha256'],
                        'MISSION_DETAIL_SHA_MISMATCH_'+name)
                verified_quest_digests+=1
            else:
                require(rid not in indexed,'GROUP_OR_UNCLASSIFIED_INDEXED_'+name)
        by_file.append({'file':'quest-shards/'+name,'sha256':sha(raw),
                        'bytes':size,'nativeRecords':len(doc['records']),
                        'recordKinds':{kind:shard_counts.get(kind,0) for kind in EXPECTED_COUNTS}})
    require(dict(kind_counts)==EXPECTED_COUNTS and verified_quest_digests==len(indexed)==733 and
            len(seen)==1030,'COMPLETE_SOURCE_RECORD_CENSUS')
    if require_exact_bytes:require(total_bytes==EXPECTED_BYTES,'ORIGINAL_SHARD_TOTAL_BYTES')
    return {
        'schema':SCHEMA,'status':'ALL_32_SHARDS_AND_FRIENDSHIP_ORIGINALS_VERIFIED',
        'targetSourceCompatibleWith':{'gameVersion':'1.26.2','platform':'Steam',
                                       'missionSha256':MISSION_SHA,
                                       'originalProbeSha256':TARGET_PROBE_SHA},
        'originalOutput':{'gameVersion':'1.26.1','platform':'Steam',
                          'originalSearchSha256':BASE_SEARCH_SHA,
                          'nativeSourceSha256':MISSION_SHA,
                          'versionRelabelled':False},
        'friendshipDefault':{'fullSourceSha256':friendship_source_sha,'bytes':2095,
                             'nativeRecords':16,'exactBaselineAndTargetBytesIdentical':True},
        'questShards':{'files':32,'totalBytes':total_bytes,
                        'nativeSourceRecords':1030,'recordsByKind':dict(kind_counts),
                        'verifiedSearchQuestRecordDigests':verified_quest_digests,
                        'fullShardFileSha256Available':True,
                        'entries':by_file},
        'limits':{'playerSaveProgressVerified':False,'accountEntitlementsVerified':False,
                  'runtimeQuestPrerequisitesVerified':False,
                  'fullCurrentGuideExtraction':False,
                  'currentStarPathOrServerEventsVerified':False,
                  'originalQuestOutputRetargeted':False,
                  'proprietaryGameStringsPublished':False},
    }


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    for field in ('baseline-manifest','baseline-search','target-probe',
                  'friendship-baseline','friendship-target','shards-dir','out'):
        ap.add_argument('--'+field,type=Path,required=True)
    opt=ap.parse_args(argv)
    paths=[opt.baseline_manifest,opt.baseline_search,opt.target_probe,
           opt.friendship_baseline,opt.friendship_target]
    dest=opt.out.resolve()
    require(all(dest!=path.resolve() and not path.resolve().is_relative_to(dest)
                for path in paths),'INPUT_OUTPUT_COLLISION')
    checkout=Path(__file__).resolve().parents[2]
    if (checkout/'package.json').is_file():
        require(not dest.is_relative_to(checkout),'PRIVATE_REPORT_INSIDE_PUBLIC_REPO')
    base=pinned_json(opt.baseline_manifest,BASE_MANIFEST_SHA)
    search=pinned_json(opt.baseline_search,BASE_SEARCH_SHA)
    probe=pinned_json(opt.target_probe,TARGET_PROBE_SHA)
    friends=[]
    for path in (opt.friendship_baseline,opt.friendship_target):
        require(path.is_file() and not path.is_symlink() and path.stat().st_size==2095,
                'FRIENDSHIP_ORIGINAL_INPUT')
        friends.append(path.read_bytes())
    result=audit(base,search,probe,*friends,opt.shards_dir)
    dest.parent.mkdir(parents=True,exist_ok=True)
    require(not dest.is_symlink(),'REPORT_SYMLINK')
    temp=dest.with_suffix(dest.suffix+'.tmp')
    require(not temp.exists(),'STALE_TEMP_REPORT')
    try:
        temp.write_text(json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n',encoding='utf-8')
        temp.replace(dest)
    finally:temp.unlink(missing_ok=True)
    print(json.dumps({'status':result['status'],'shards':result['questShards']['files'],
                      'bytes':result['questShards']['totalBytes'],
                      'verifiedQuestRecords':result['questShards']['verifiedSearchQuestRecordDigests'],
                      'reportSha256':sha(dest.read_bytes())},sort_keys=True))
    return 0


if __name__=='__main__':raise SystemExit(main())
