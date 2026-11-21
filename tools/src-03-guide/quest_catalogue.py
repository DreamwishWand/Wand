"""Compact owner-private Guide quest catalogue from the native source projection.

Does not infer quest unlocks, completion, player rewards, or event availability.
Keeps exact source-linked locale text and optional absent names untouched.
"""
import argparse
import collections
import json
from pathlib import Path

SCHEMA='wand.db03.quest-catalogue@1'
MAX_SOURCE_BYTES=256*1024*1024
KINDS=('mission','questGroup','unclassified')
ORIGINAL_FILE='ddv_Data/StreamingAssets/itemlist/Mission.json'


def _checked_sha(value):
    return isinstance(value,str) and len(value)==64 and all(c in '0123456789abcdef' for c in value)


def summary(records, target):
    if not isinstance(target,dict) or not target.get('gameVersion') or not target.get('platform'):
        raise ValueError('QUEST_CATALOGUE_TARGET_REQUIRED')
    if not isinstance(records,list):
        raise ValueError('QUEST_CATALOGUE_RECORDS_REQUIRED')
    seen=set()
    rows={kind:[] for kind in KINDS}
    for r in records:
        if not isinstance(r,dict) or r.get('recordKind') not in KINDS:
            raise ValueError('QUEST_CATALOGUE_UNCLASSIFIED_RECORD_KIND')
        rid=r.get('id')
        if not isinstance(rid,str) or not rid.isascii() or not rid.isdecimal() or int(rid)<=0 or rid in seen:
            raise ValueError('QUEST_CATALOGUE_INVALID_OR_DUPLICATE_ID')
        seen.add(rid)
        source=r.get('source') or {}
        if source.get('file')!=ORIGINAL_FILE or not _checked_sha(source.get('sha256')) or not _checked_sha(r.get('nativeWireSha256')):
            raise ValueError('QUEST_CATALOGUE_SOURCE_PROVENANCE_MISMATCH')
        names=r.get('names')
        if not isinstance(names,dict) or any(not isinstance(k,str) or not isinstance(v,str) for k,v in names.items()):
            raise ValueError('QUEST_CATALOGUE_INVALID_LOCALIZED_NAMES')
        base={'id':rid,'rawName':r.get('rawName'), 'names':names,
              'nameKey':r.get('nameKey'), 'nativeWireSha256':r['nativeWireSha256'],
              'recordKind':r['recordKind']}
        if r['recordKind']=='mission':
            typed=r.get('structured')
            if not isinstance(typed,dict):
                raise ValueError('QUEST_CATALOGUE_MISSING_MISSION_DETAILS')
            steps=typed.get('stepsDetailed')
            meta=typed.get('questMeta')
            flows=typed.get('itemFlows')
            policies=typed.get('activationPolicies')
            if not isinstance(steps,list) or not isinstance(meta,dict) or not isinstance(flows,dict) or not isinstance(policies,dict):
                raise ValueError('QUEST_CATALOGUE_INVALID_STRUCTURED_MISSION')
            raw_step_count=r.get('nativeStepCount')
            if type(raw_step_count) is not int or raw_step_count!=len(steps):
                raise ValueError('QUEST_CATALOGUE_STEP_COUNT_MISMATCH')
            objectives=[]
            substeps=[]
            for step in steps:
                if not isinstance(step,dict) or not isinstance(step.get('subSteps'),list):
                    raise ValueError('QUEST_CATALOGUE_BAD_SUBSTEPS')
                for sub in step['subSteps']:
                    if not isinstance(sub,dict) or not isinstance(sub.get('objectives'),list):
                        raise ValueError('QUEST_CATALOGUE_BAD_OBJECTIVES')
                    substeps.append(sub)
                    objectives.extend(sub['objectives'])
            counts=dict(sorted(collections.Counter(obj.get('type','unresolved') for obj in objectives).items()))
            base.update({
                'groupId':r.get('groupId'), 'characterId':r.get('characterId'),
                'typeCode':r.get('typeCode'),
                'sourceUpdateGroup':meta.get('updateVersion'),
                'sourceScopeTokens':r.get('sourceScopeTokens',[]),
                'missionType':meta.get('missionType'),
                'uiCategory':meta.get('uiCategory'),
                'sourceStepCount':raw_step_count,
                'sourceSubStepCount':len(substeps),
                'sourceObjectiveCount':len(objectives),
                'objectiveKinds':counts,
                'configuredRewards':typed.get('rewardsDecoded',{}),
                'conditionDefinitions':{key:{
                    'present':key in typed.get('conditions',{}),
                    'sourceWireSha256':typed.get('conditions',{}).get(key,{}).get('nativeWireSha256')}
                    for key in ('availableConditions','unlockConditions')},
                'activationPolicyDefinitionCounts':{key:len(policies.get(key,[]))
                    for key in ('autoAcceptOptions','ownerOverrides','uiUnlockConditions')},
                'itemFlowDefinitionCounts':{
                    'introGrantSelectors':len(flows.get('introItemsToGive',[])),
                    'postMissionCleanupItemReferences':len(flows.get('itemsToDeleteAfterMission',[])),
                    'overrideRewardReferences':len(flows.get('overrideRewardReferences',[])),
                    'additionalRewardLootSubtables':len((flows.get('additionalRewards') or {}).get('subLootTables',[])),
                    'bringItemSubsteps':sum('extraBringItem' in sub for sub in substeps),
                },
            })
        rows[r['recordKind']].append(base)
    group_ids={x['id'] for x in rows['questGroup']}
    child_lookup=collections.defaultdict(list)
    for quest in rows['mission']:
        gid=quest['groupId']
        quest['groupIndexMembership']=(
            'not_configured' if gid is None else
            'present_in_native_source_index' if gid in group_ids else
            'not_in_native_source_index')
        if gid in group_ids:child_lookup[gid].append(quest['id'])
    for group in rows['questGroup']:
        group['missionIds']=sorted(child_lookup[group['id']],key=int)
    for kind in KINDS:
        rows[kind].sort(key=lambda x:int(x['id']))
    root_hashes={r['source']['sha256'] for r in records}
    if len(root_hashes)>1:raise ValueError('QUEST_CATALOGUE_MIXED_SOURCE_VERSIONS')
    result={
        'schema':SCHEMA,'target':target,
        'meaning':'native_static_source_only_not_player_progress_or_live_availability',
        'source':{'file':ORIGINAL_FILE,'sha256':next(iter(root_hashes),None)},
        'localizationPolicy':'exact_provided_locales_only_missing_names_remain_missing',
        'counts':{'missions':len(rows['mission']), 'questGroups':len(rows['questGroup']),
                  'unclassified':len(rows['unclassified']),
                  'nativeSourceRecords':len(records),
                  'sourceSteps':sum(x['sourceStepCount'] for x in rows['mission']),
                  'sourceObjectives':sum(x['sourceObjectiveCount'] for x in rows['mission']),
                  'missionsWithNoResolvedLocaleName':sum(not x['names'] for x in rows['mission']),
                  'missionsWithVerifiedGroup':sum(x['groupIndexMembership']=='present_in_native_source_index' for x in rows['mission'])},
        'missions':rows['mission'],
        'questGroups':rows['questGroup'],
        'unclassified':rows['unclassified'],
    }
    return result


def project_quest_catalogue(records,target,out,save):
    result=summary(records,target)
    save(Path(out)/'guide'/'quest-catalogue.json',result)
    return result['counts']


def main():
    ap=argparse.ArgumentParser(description='Source-typed compact quest catalogue (offline)')
    ap.add_argument('--input',required=True,type=Path)
    ap.add_argument('--output',required=True,type=Path)
    args=ap.parse_args()
    try:
        source=args.input.resolve(strict=True)
        if args.input.is_symlink() or not source.is_file() or source==args.output.resolve() or source.stat().st_size>MAX_SOURCE_BYTES:
            raise ValueError('QUEST_CATALOGUE_INVALID_INPUT_OR_OUTPUT')
        data=json.loads(source.read_text(encoding='utf8'))
        if not isinstance(data,dict) or data.get('family')!='quests':
            raise ValueError('QUEST_CATALOGUE_NOT_QUEST_SOURCE')
        result=summary(data.get('records'),data.get('target'))
        from native_guide import save
        save(args.output,result)
        print(json.dumps({'counts':result['counts'],'output':str(args.output)},sort_keys=True))
    except (OSError,ValueError,UnicodeError) as ex:
        ap.exit(1,f'DB-03 quest catalogue error: {ex}\n')

if __name__=='__main__':main()
