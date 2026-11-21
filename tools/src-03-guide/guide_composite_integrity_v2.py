"""Attach independently audited complete quest shard and friendship evidence to
an existing owner-private original-source-equivalent Steam 1.26.2 Guide bundle.

V1 bundle remains byte-for-byte preserved. V2 is an additional private proof,
not a rewrite of any original v1.26.1 quest search/shard or player state.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re

SOURCE_SCHEMA='wand.db03.guide-source-composite@1'
OUTPUT_SCHEMA='wand.db03.guide-source-composite@2'
SOURCE_SHA='c38c436bddc0bab2f1d6237fd5536e14c778bf39159e55e3c081c74182fe2d38'
SHARD_AUDIT_SHA='99a539aad1884c92cc92337f52c6651879dc2f27493a9185dec36ff05863c4bf'
FRIENDSHIP_SHA='90c16a1b54bd6e0aac6176bcd164493295f867cfe536d272638b7841a651db22'
SOURCE_MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
SHARD_BYTES=98001716
HASH=re.compile(r'^[a-f0-9]{64}$')


def require(ok,code):
    if not ok:raise ValueError('DB03_GUIDE_COMPOSITE_V2_'+code)


def digest(raw):return hashlib.sha256(raw).hexdigest()


def read_exact(path:Path, sha:str):
    require(path.is_file() and not path.is_symlink() and 0<path.stat().st_size<=128*1024,
            'INPUT_MISSING_OR_OVERSIZED')
    raw=path.read_bytes()
    require(digest(raw)==sha,'SOURCE_SHA_MISMATCH')
    value=json.loads(raw)
    require(isinstance(value,dict),'INPUT_ROOT')
    return value


def build_v2(base,shards):
    require(isinstance(base,dict) and base.get('schema')==SOURCE_SCHEMA and
            base.get('status')=='SOURCE_VERIFIED_STATIC_COMPOSITE' and
            base.get('target')=={'gameVersion':'1.26.2','platform':'Steam'} and
            base.get('questSearch',{}).get('originalOutputGameVersion')=='1.26.1' and
            base.get('questSearch',{}).get('originalOutputSha256')==
              '26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d' and
            base.get('questSearch',{}).get('uniqueReferencedShardPaths')==32 and
            base.get('currentConditions',{}).get('nativeDefinitions')==5440 and
            base.get('currentConditions',{}).get('typedMissionMentions')==4960 and
            base.get('limits',{}).get('fullQuestShardFileBytesValidated') is False and
            base.get('limits',{}).get('friendshipDefaultCrossVersionEqualityVerified') is False,
            'SOURCE_COMPOSITE_SCOPE')
    require(isinstance(shards,dict) and
            shards.get('schema')=='wand.db03.guide-shard-source-audit@1' and
            shards.get('status')=='ALL_32_SHARDS_AND_FRIENDSHIP_ORIGINALS_VERIFIED' and
            shards.get('targetSourceCompatibleWith',{}).get('gameVersion')=='1.26.2' and
            shards.get('targetSourceCompatibleWith',{}).get('missionSha256')==SOURCE_MISSION_SHA and
            shards.get('originalOutput',{}).get('gameVersion')=='1.26.1' and
            shards.get('originalOutput',{}).get('nativeSourceSha256')==SOURCE_MISSION_SHA and
            shards.get('originalOutput',{}).get('originalSearchSha256')==
                base['questSearch']['originalOutputSha256'] and
            shards.get('originalOutput',{}).get('versionRelabelled') is False,
            'SHARD_AUDIT_SOURCE')
    xs=shards.get('questShards') or {}
    require(xs.get('files')==32 and xs.get('totalBytes')==SHARD_BYTES and
            xs.get('nativeSourceRecords')==1030 and
            xs.get('verifiedSearchQuestRecordDigests')==733 and
            xs.get('recordsByKind')=={'mission':733,'questGroup':289,'unclassified':8} and
            xs.get('fullShardFileSha256Available') is True and
            isinstance(xs.get('entries'),list) and len(xs['entries'])==32,
            'SHARD_AUDIT_CENSUS')
    observed=set();bytes_seen=0;counts={'mission':0,'questGroup':0,'unclassified':0}
    for entry in xs['entries']:
        require(isinstance(entry,dict) and isinstance(entry.get('file'),str) and
                re.fullmatch(r'quest-shards/part-(?:0\d|[12]\d|3[01])\.json',entry['file']) and
                entry['file'] not in observed and
                isinstance(entry.get('sha256'),str) and HASH.fullmatch(entry['sha256']) and
                type(entry.get('bytes')) is int and entry['bytes']>0 and
                type(entry.get('nativeRecords')) is int and entry['nativeRecords']>0 and
                isinstance(entry.get('recordKinds'),dict) and
                set(entry['recordKinds'])==set(counts) and
                sum(entry['recordKinds'].values())==entry['nativeRecords'],
                'SHARD_AUDIT_FILE_ENTRY')
        observed.add(entry['file']);bytes_seen+=entry['bytes']
        for kind in counts:counts[kind]+=entry['recordKinds'][kind]
    require(len(observed)==32 and bytes_seen==SHARD_BYTES and counts==xs['recordsByKind'],
            'SHARD_AUDIT_SUMS')
    friend=shards.get('friendshipDefault') or {}
    require(friend.get('fullSourceSha256')==FRIENDSHIP_SHA and friend.get('bytes')==2095 and
            friend.get('nativeRecords')==16 and
            friend.get('exactBaselineAndTargetBytesIdentical') is True,
            'FRIENDSHIP_AUDIT_SOURCE')
    limits=shards.get('limits') or {}
    require(limits.get('fullCurrentGuideExtraction') is False and
            limits.get('currentStarPathOrServerEventsVerified') is False and
            limits.get('proprietaryGameStringsPublished') is False,
            'SHARD_AUDIT_LIMITS')
    result={**base}
    result['schema']=OUTPUT_SCHEMA
    result['status']='SOURCE_VERIFIED_STATIC_COMPOSITE_WITH_ALL_QUEST_SHARDS'
    result['sourceCompositeV1Sha256']=SOURCE_SHA
    result['fullShardAndFriendshipAuditSha256']=SHARD_AUDIT_SHA
    result['friendshipDefaultSource']={
        'nativeSourceSha256':FRIENDSHIP_SHA,'bytes':2095,'records':16,
        'baseVersion':'1.26.1','targetVersion':'1.26.2',
        'exactFullOriginalFileContentIdentical':True,
    }
    result['questSearch']={**base['questSearch'],
        'shardVerification':'FULL_ORIGINAL_FILE_SHA256_PLUS_PER_RECORD_SHA256',
        'shardFileBytesVerifiedByThisManifest':True,
    }
    result['originalQuestShardFullHashes']={
        'schema':'wand.db03.guide-shard-source-audit@1',
        'auditSha256':SHARD_AUDIT_SHA,
        'originalOutputGameVersion':'1.26.1',
        'sourceEquivalentTargetVersion':'1.26.2',
        'shards':32,'totalBytes':SHARD_BYTES,'nativeSourceRecords':1030,
        'searchableMissionsWhoseDetailsWereFullyVerified':733,
        'fileHashes':{entry['file']:entry['sha256'] for entry in xs['entries']},
    }
    result['limits']={**base['limits'],
        'fullQuestShardFileBytesValidated':True,
        'friendshipDefaultCrossVersionEqualityVerified':True,
        'completeGameGuideOrLiveServiceCoverage':False,
    }
    return result


def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source-composite',type=Path,required=True)
    ap.add_argument('--shard-audit',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    opt=ap.parse_args(argv)
    dest=opt.out.resolve()
    require(dest not in (opt.source_composite.resolve(),opt.shard_audit.resolve()) and
            all(not x.resolve().is_relative_to(dest) for x in (opt.source_composite,opt.shard_audit)),
            'SOURCE_OUTPUT_COLLISION')
    repo=Path(__file__).resolve().parents[2]
    if (repo/'package.json').is_file():
        require(not dest.is_relative_to(repo),'PRIVATE_OUTPUT_IN_PUBLIC_REPO')
    result=build_v2(read_exact(opt.source_composite,SOURCE_SHA),
                    read_exact(opt.shard_audit,SHARD_AUDIT_SHA))
    dest.parent.mkdir(parents=True,exist_ok=True)
    require(not dest.is_symlink(),'OUTPUT_SYMLINK')
    tmp=dest.with_name(dest.name+'.tmp')
    require(not tmp.exists(),'TEMP_FILE_ALREADY_EXISTS')
    try:
        tmp.write_text(json.dumps(result,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n',encoding='utf-8')
        tmp.replace(dest)
    finally:tmp.unlink(missing_ok=True)
    print(json.dumps({'status':result['status'],'sha256':digest(dest.read_bytes()),
                      'bytes':dest.stat().st_size,'shards':result['originalQuestShardFullHashes']['shards'],
                      'validatedOriginalMissionRecords':733},sort_keys=True))
    return 0


if __name__=='__main__':raise SystemExit(main())
