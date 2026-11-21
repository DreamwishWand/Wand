"""Build a SHA-pinned, provenance-preserving Steam v1.26.2 Guide source composite.

Does not rewrite v1.26.1 quest-search or lazy quest shards, infer live
availability, import saves, or publish copyrighted game data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

SCHEMA = 'wand.db03.guide-source-composite@1'
BASE_SHA = 'cd9cdd00db16445d4ab6f604f08d1e1f2bd2c304c6f2d1d387783b89433adf26'
PROBE_SHA = '07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a'
SEARCH_SHA = '26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d'
LOCALE_SHA = '4f185a7a02af11c9a84502c5f0c104949ae4e8cf563b646f8d456891a316312e'
PROTO_SHA = 'dcf79a666f16aa64a2cfa9505c4e6f309d160a16db7190c550bd415a3acbeab9'
CONDITION_SHA = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c'
CONDITION_V2_SHA = 'aa04c61c973874881443a370a50009f5ad6156d9e1b83ec4553045561c41b08f'
CONDITION_V2_MANIFEST_SHA = 'fc1bcae901a41da9ae66a6f31faa7161889ebc7c7887ac6cda82f90718068890'
PROTO_DB_SHA = 'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
MISSION_SHA = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
FAMILIES = {
    'characters': 'Character.json',
    'conditionalEvents': 'ConditionalEvent.json',
    'conditions': 'Condition.json',
    'duties': 'DutyAch.json',
    'events': 'RecurringEvent.json',
    'quests': 'Mission.json',
    'stories': 'Story.json',
    'tutorials': 'Ftue.json',
    'worlds': 'Scene.json',
}
LOCALES = {'en':'en-US','de':'de','es-ES':'es','fr':'fr',
           'it':'it','ja':'ja','pt-BR':'pt-BR','zh-CN':'zh-CN'}


def require(ok: bool, code: str) -> None:
    if not ok:
        raise ValueError('DB03_GUIDE_COMPOSITE_' + code)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_pinned(path: Path, pinned: str, *, maximum: int = 32*1024*1024) -> dict:
    require(path.is_file() and not path.is_symlink(), 'SOURCE_MISSING_' + path.name)
    require(0 < path.stat().st_size <= maximum, 'SOURCE_SIZE_' + path.name)
    raw = path.read_bytes()
    require(sha(raw) == pinned, 'ORIGINAL_FINGERPRINT_' + path.name)
    data = json.loads(raw.decode('utf-8-sig'))
    require(isinstance(data, dict), 'SOURCE_ROOT_' + path.name)
    return data


def build(base: dict, probe: dict, search: dict, locales: dict,
          protodb: dict, condition: dict, condition_index: dict) -> dict:
    require(base.get('schema') == 'wand.db03.native-guide@1' and
            base.get('target') == {'gameVersion':'1.26.1','platform':'Steam'},
            'BASELINE_SOURCE_VERSION')
    require(probe.get('schema') == 'wand.src01.format-probe@1' and
            probe.get('platform') == 'Steam' and probe.get('gameVersion') == '1.26.2',
            'TARGET_SOURCE_VERSION')
    require(search.get('schema') == 'wand.db03.quest-search@1' and
            search.get('target') == base['target'] and
            search.get('source') == {'file':'ddv_Data/StreamingAssets/itemlist/Mission.json',
                                     'sha256':MISSION_SHA},
            'BASELINE_SEARCH_ORIGIN')
    c = search.get('counts') or {}
    require(all(type(c.get(k)) is int for k in
                ('missions','sourceNativeRecords','excludedQuestGroups','excludedUnclassified')) and
            (c['missions'],c['sourceNativeRecords'],c['excludedQuestGroups'],c['excludedUnclassified']) ==
            (733,1030,289,8), 'SEARCH_SOURCE_CENSUS')
    records = search.get('records')
    require(isinstance(records,list) and len(records)==733 and
            len({r['id'] for r in records})==733,
            'SEARCH_SOURCE_IDS')
    shard_paths = {r.get('detail',{}).get('file') for r in records}
    require(shard_paths == {f'quest-shards/part-{i:02}.json' for i in range(32)},
            'UNEXPECTED_SHARD_LOCATORS')
    require(all(isinstance(r['detail'].get('recordSha256'),str) and
                len(r['detail']['recordSha256'])==64 and
                isinstance(r['detail'].get('nativeWireSha256'),str) and
                len(r['detail']['nativeWireSha256'])==64 for r in records),
            'SEARCH_RECORD_SHA_MISSING')
    base_sources = base.get('sources') or {}
    target_sources = probe.get('itemlistCandidates') or {}
    require(set(FAMILIES)==set(base_sources), 'BASELINE_SOURCE_FAMILIES')
    proof = {}
    for family, name in FAMILIES.items():
        baseline = base_sources[family]
        target = target_sources.get(name) or {}
        require(baseline.get('file')=='itemlist/'+name and
                target.get('status')=='binary_structure_probe' and
                target.get('isJsonText') is False and
                target.get('source')=='ddv_Data/StreamingAssets/itemlist/'+name and
                type(target.get('size')) is int and
                type(baseline.get('bytes')) is int and
                type(baseline.get('records')) is int,
                'FAMILY_PROVENANCE_'+family)
        equal = baseline.get('sha256')==target.get('sha256') and baseline['bytes']==target['size']
        require(equal == (family != 'conditions'), 'FAMILY_CHANGE_CONTRACT_'+family)
        if family == 'conditions':
            require(target['sha256'] == CONDITION_SHA and
                    baseline['records']==5439 and baseline['sha256']!=target['sha256'],
                    'CONDITION_REGEN_REQUIRED')
        if family == 'quests': require(target['sha256']==MISSION_SHA, 'MISSION_SOURCE_SHA')
        proof[family] = {
            'file':target['source'], 'baselineVersion':'1.26.1',
            'baselineSha256':baseline['sha256'], 'baselineNativeRecords':baseline['records'],
            'targetVersion':'1.26.2', 'targetSha256':target['sha256'],
            'targetBytes':target['size'],
            'reuseMode':'EXACT_ORIGINAL_FULL_FILE_SHA256' if equal else
                        'REEXTRACT_CURRENT_CHANGED_ORIGINAL',
        }
    require(locales.get('schema')=='wand.db03.locale-payload-bridge@1' and
            locales.get('status')=='PAYLOAD_IDENTICAL_ALL_EIGHT_LOCALES' and
            locales.get('localeCount')==8 and locales.get('memberComparisons')==142816 and
            locales.get('baseline',{}).get('manifestSha256')==BASE_SHA and
            locales.get('target',{}).get('sourceProbeSha256')==PROBE_SHA,
            'LOCALE_BRIDGE_SCOPE')
    locale_rows = {}
    require(set((locales.get('locales') or {}))==set(LOCALES), 'LOCALE_CENSUS')
    for language, suffix in sorted(LOCALES.items()):
        src = locales['locales'][language]
        old_zip=base.get('localizationSources',{}).get(language,{})
        target_zip=probe.get('localization',{}).get(language,{})
        old,new=src.get('baseline',{}),src.get('target',{})
        require(src.get('memberPayloadsIdentical') is True and
                src.get('addedMembers')==src.get('changedMemberPayloads')==src.get('removedMembers')==0 and
                old.get('zipSha256')==old_zip.get('sha256') and
                new.get('zipSha256')==target_zip.get('sha256') and
                old_zip.get('file')==f'LocDB_{suffix}.zip' and
                target_zip.get('source')==f'ddv_Data/StreamingAssets/Localization/LocDB_{suffix}.zip' and
                old.get('memberCount')==new.get('memberCount')==target_zip.get('archiveEntries')==17852 and
                old.get('memberTreeSha256')==new.get('memberTreeSha256') and
                old.get('uncompressedBytes')==new.get('uncompressedBytes'),
                'LOCALE_PAYLOAD_MISMATCH_'+language)
        locale_rows[language]={
            'baselineZipSha256':old['zipSha256'], 'targetZipSha256':new['zipSha256'],
            'decompressedTreeSha256':new['memberTreeSha256'],
            'memberCount':17852, 'payloadMode':'EXACT_DECOMPRESSED_MEMBER_CONTENT_SHA256',
        }
    require(protodb.get('schema')=='wand.db03.protodb-source-bridge@1' and
            protodb.get('status')=='IDENTICAL_ARCHIVED_STATIC_SOURCE' and
            protodb.get('proof',{}).get('fullOriginalBytesIdentical') is True and
            protodb.get('baseline',{}).get('sha256')==PROTO_DB_SHA and
            protodb.get('target',{}).get('sha256')==PROTO_DB_SHA and
            protodb.get('baseline',{}).get('protoDbEntries')==2246 and
            protodb.get('target',{}).get('protoDbEntries')==2246 and
            protodb.get('starPath',{}).get('archivedSeasonDefinitions')==0,
            'PROTO_STATIC_LIMITS')
    require(condition.get('schema')=='wand.db03.condition-native-index-manifest@2' and
            condition.get('target')=={'gameVersion':'1.26.2','platform':'Steam'} and
            condition.get('source',{}).get('sha256')==CONDITION_SHA and
            condition.get('source',{}).get('formatProbeSha256')==PROBE_SHA and
            condition.get('source',{}).get('bytes')==571341 and
            condition.get('missionSource',{}).get('sha256')==MISSION_SHA and
            condition.get('counts',{}).get('definitionCount')==5440 and
            condition.get('counts',{}).get('missionReferenceLeaves')==4960 and
            condition.get('counts',{}).get('kindTotal')==9861 and
            condition.get('privateIndexSha256')==CONDITION_V2_SHA and
            condition.get('privateIndexBytes')==4093730 and
            condition.get('limits',{}).get('missionPredicateTruthEvaluated') is False and
            condition.get('limits',{}).get('currentStarPathOrLiveEventVerified') is False,
            'LATEST_CONDITION_INDEX_CONTRACT')
    require(condition_index.get('schema')=='wand.db03.condition-native-index@2' and
            condition_index.get('target')==condition['target'] and
            condition_index.get('missionSource')==condition['missionSource'] and
            condition_index.get('source')==condition['source'] and
            len(condition_index.get('records',[]))==5440,
            'LATEST_CONDITION_INDEX_SOURCE')
    return {
        'schema':SCHEMA,
        'status':'SOURCE_VERIFIED_STATIC_COMPOSITE',
        'target':{'gameVersion':'1.26.2','platform':'Steam'},
        'sourceProbeSha256':PROBE_SHA,
        'baseline':{'gameVersion':'1.26.1','platform':'Steam',
                    'nativeGuideManifestSha256':BASE_SHA},
        'originalGuideFamilySources':proof,
        'locales':{'languageCount':8,'totalMemberComparisons':142816,
                   'reusedLocaleContent':locale_rows,
                   'archiveContainersEqual':False},
        'staticProtoDb':{'originalSha256':PROTO_DB_SHA,'nativeEntries':2246,
                         'staticCensus':protodb['staticCensusReused'],
                         'currentLiveStarPathSeasonDefinitionsVerified':False},
        'questSearch':{
            'originalOutputGameVersion':'1.26.1',
            'originalOutputSha256':SEARCH_SHA,
            'sourceMissionSha256':MISSION_SHA,
            'searchableMissions':733, 'questGroups':289, 'unclassified':8,
            'uniqueReferencedShardPaths':32,
            'privateOutputPath':'Steam-v1.26.1/guide/quest-search.json',
            'privateShardDirectory':'Steam-v1.26.1/guide/quest-shards/',
            'shardVerification':'PER_RECORD_SHA256_WHEN_DETAIL_IS_OPENED',
            'shardFileBytesVerifiedByThisManifest':False,
            'versionRelabelling':False,
        },
        'currentConditions':{
            'originalGameVersion':'1.26.2',
            'sourceFileSha256':CONDITION_SHA,
            'indexSchema':'wand.db03.condition-native-index@2',
            'privateOutputPath':'Steam-v1.26.2/condition-native-index-v2.json',
            'privateIndexSha256':CONDITION_V2_SHA,
            'privateIndexBytes':4093730,
            'privateManifestSha256':CONDITION_V2_MANIFEST_SHA,
            'privateManifestPath':'Steam-v1.26.2/condition-native-index-manifest-v2.json',
            'nativeDefinitions':5440, 'typedMissionMentions':4960,
        },
        'limits':{
            'staticSourceCoverage':'NINE_ITEMLIST_FAMILIES_EIGHT_LOCALES_ARCHIVED_PROTO_DB',
            'sourceContentComposedNotReextracted':True,
            'fullQuestShardFileBytesValidated':False,
            'friendshipDefaultCrossVersionEqualityVerified':False,
            'otherGuideFamiliesCoverageComplete':False,
            'currentStarPathOrLiveEventVerified':False,
            'runtimeConditionConsumptionVerified':False,
            'playerProgressOrEntitlementVerified':False,
            'automaticPrerequisiteGraphVerified':False,
            'publicGameTextDistributionAuthorized':False,
        },
    }


def main(argv: list[str] | None = None) -> int:
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('baseline-manifest','target-probe','baseline-search','locale-bridge',
                'protodb-bridge','condition-v2-manifest','condition-v2-index','out'):
        p.add_argument('--'+arg,type=Path,required=True)
    a=p.parse_args(argv)
    inputs=[a.baseline_manifest,a.target_probe,a.baseline_search,a.locale_bridge,
            a.protodb_bridge,a.condition_v2_manifest,a.condition_v2_index]
    dest=a.out.resolve()
    require(all(path.resolve()!=dest and not path.resolve().is_relative_to(dest) for path in inputs),
            'OUTPUT_COLLIDES_WITH_INPUT')
    checkout=Path(__file__).resolve().parents[2]
    if (checkout/'package.json').is_file():
        require(not dest.is_relative_to(checkout), 'OUTPUT_INSIDE_PUBLIC_REPO')
    pinned=[BASE_SHA,PROBE_SHA,SEARCH_SHA,LOCALE_SHA,PROTO_SHA,
            CONDITION_V2_MANIFEST_SHA,CONDITION_V2_SHA]
    docs=[read_pinned(path,digest) for path,digest in zip(inputs,pinned)]
    result=build(*docs)
    dest.parent.mkdir(parents=True,exist_ok=True)
    data=(json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode('utf-8')
    require(not dest.is_symlink(),'OUTPUT_SYMLINK')
    temp=dest.with_name(dest.name+'.tmp')
    require(not temp.exists(),'STALE_TEMP_OUTPUT')
    try:
        temp.write_bytes(data)
        temp.replace(dest)
    finally:
        temp.unlink(missing_ok=True)
    print(json.dumps({'status':result['status'],'families':len(result['originalGuideFamilySources']),
                      'unchangedFamilies':8,'typedMissionMentions':4960,
                      'compositeSha256':sha(data),'bytes':len(data)},sort_keys=True))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
