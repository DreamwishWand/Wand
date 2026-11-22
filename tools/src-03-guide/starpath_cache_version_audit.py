"""Compare owner-held original Steam BattlePass cache snapshots, offline only.

The two private cache files are NOT copied to GitHub. The output is a small
source-authenticated comparison of static definitions, not live availability.
"""
import argparse
import hashlib
import json
from pathlib import Path

SCHEMA = 'wand.db03.starpath-native-revision-evidence@1'
SOURCES = (
    ('1.25.0', 140265, '820d9838722e1f28b2211ebd7a24a97393c273ac09b22dfde0a9610ea5184b53'),
    ('1.26.2', 186442, '4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14'),
)
EXPECTED_EARLY = 'HauntingElegance2026'
EXPECTED_LATE_ONLY = 'Seafaring2026'
BASELINE_REVISION = 12500
UPDATED_REVISION = 12602


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def source(path, version, size, sha):
    path=Path(path)
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= 1024*1024:
        raise ValueError('SOURCE_FILE_MISSING_OR_INVALID')
    raw=path.read_bytes()
    if len(raw) != size or digest(raw) != sha:
        raise ValueError('BATTLEPASS_ORIGINAL_SOURCE_MISMATCH: '+version)
    obj=json.loads(raw)
    if not isinstance(obj,dict) or set(obj) != {'Data'} or not isinstance(obj['Data'],dict):
        raise ValueError('INVALID_BATTLEPASS_TRANSPORT')
    data={}
    for key,payload in obj['Data'].items():
        if not isinstance(payload,str) or not key or key in data:
            raise ValueError('INVALID_BATTLEPASS_SEASON')
        item=json.loads(payload)
        if not isinstance(item,dict) or item.get('OnlineId') != key:
            raise ValueError('BATTLEPASS_ONLINE_ID_MISMATCH')
        data[key]=item
    return data


def make(early,late):
    a=source(early,*SOURCES[0]);b=source(late,*SOURCES[1]);
    if set(a) != {EXPECTED_EARLY} or set(b) != {EXPECTED_EARLY,EXPECTED_LATE_ONLY}:
        raise ValueError('UNEXPECTED_BATTLEPASS_CACHE_MEMBERS')
    old=a[EXPECTED_EARLY];new=b[EXPECTED_EARLY]
    if old.get('Version') != BASELINE_REVISION or new.get('Version') != UPDATED_REVISION:
        raise ValueError('WRONG_NATIVE_REVISION')
    if old.get('MinGameVersion') != '1.25' or new.get('MinGameVersion') != '1.25':
        raise ValueError('WRONG_MINIMUM_GAME_VERSION')
    if 'PlatformFilter' in old or new.get('PlatformFilter') != {'IncludeAllExcept': {'PlatformsToExclude':['AppleArcade']}}:
        raise ValueError('UNEXPECTED_PLATFORM_FILTER_CHANGE')
    # Compare full *original* structured definitions; every reward field, slot,
    # price, secondary vault alternative and page policy must remain identical.
    rewards=('RewardsPages','BonusRewards','VaultRewards')
    if any(old.get(k)!=new.get(k) for k in rewards):
        raise ValueError('REWARD_SLOT_DEFINITION_CHANGED')
    expected_static=set(old)-{'Version','LastUpdateTimestamp','TaskConfig'}
    expected_current=set(new)-{'Version','LastUpdateTimestamp','TaskConfig','PlatformFilter'}
    if expected_static!=expected_current or any(old[k]!=new[k] for k in expected_static):
        raise ValueError('UNEXPECTED_NON_TASK_FIELDS_CHANGED')
    if set(old['TaskConfig']) != {'Tasks'} or set(new['TaskConfig']) != {'Tasks'}:
        raise ValueError('BAD_TASK_COLLECTION')
    older=old['TaskConfig']['Tasks'];current=new['TaskConfig']['Tasks']
    if len(older)!=121 or len(current)!=121:
        raise ValueError('WRONG_DAILY_TASK_CENSUS')
    differences=[]
    for index,(left,right) in enumerate(zip(older,current)):
        key=left.get('InternalName')
        if key!=right.get('InternalName') or key!=f'Task{index+1:02d}':
            raise ValueError('TASK_ID_OR_ORDER_CHANGED')
        if left==right:
            continue
        if set(left)!=set(right) or any(left[name]!=right[name] for name in left if name!='Description'):
            raise ValueError('TASK_FIELDS_OTHER_THAN_DESCRIPTION_CHANGED')
        desc_before=left.get('Description');desc_after=right.get('Description')
        if not isinstance(desc_before,str) or not isinstance(desc_after,str) or desc_before==desc_after:
            raise ValueError('UNSUPPORTED_TASK_DESCRIPTION_EDIT')
        differences.append({'taskId':key,'earlier':desc_before,'later':desc_after})
    if [r['taskId'] for r in differences]!=['Task15','Task64','Task100']:
        raise ValueError('UNEXPECTED_TASK_DELTA')
    count=sum(len(p['Rewards']) for p in old['RewardsPages']) + sum(len(p['Rewards']) for p in old['BonusRewards']['Pages'])+len(old['VaultRewards']['Data']['Rewards'])
    if count!=50:
        raise ValueError('WRONG_REWARD_SLOT_COUNT')
    return {
      'schema':SCHEMA,
      'evidence':{'platform':'Steam','comparisonIsStaticConfigOnly':True,
        'liveStatusVerified':False,'historicalSeasonCatalogComplete':False,
        'sources':[{'gameVersion':v,'sourceBytes':size,'sourceSha256':sha,
            'seasonIds':sorted((a if i==0 else b).keys())}
            for i,(v,size,sha) in enumerate(SOURCES)]},
      'matchedSeason':{
         'seasonId':EXPECTED_EARLY,'earlierDefinitionVersion':BASELINE_REVISION,
         'laterDefinitionVersion':UPDATED_REVISION,'rewardSlotsWithIdenticalFullSourceDefinition':count,
         'rewardSourceIdentity':'exact_full_reward_pages_bonus_and_vault',
         'dailyTasksWithSameIdAndNonDescriptionFields':len(older),
         'unchangedWeeklyTasks':True,
         'descriptionEdits':differences,
         'platformFilter':{'earlier':'absent_from_source','later':{'excludes':['AppleArcade']}},
         'allOtherStaticSeasonFieldsUnchanged':True,
      },
      'onlyInLaterSnapshot':[EXPECTED_LATE_ONLY],
      'onlyInEarlierSnapshot':[],
      'unseenHistoricalSeasonIdsVerified':0,
    }


def publish(early,late,dest):
    result=make(early,late)
    payload=json.dumps(result,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf8')
    dest=Path(dest)
    if dest.is_symlink() or dest.resolve() in (Path(early).resolve(),Path(late).resolve()):
        raise ValueError('UNSAFE_PUBLIC_OUTPUT')
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(payload)
    return {'bytes':len(payload),'sha256':digest(payload),'taskEdits':len(result['matchedSeason']['descriptionEdits']),
            'verifiedUnchangedRewardSlots':result['matchedSeason']['rewardSlotsWithIdenticalFullSourceDefinition']}


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--earlier',type=Path,required=True)
    p.add_argument('--later',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    print(json.dumps(publish(args.earlier,args.later,args.out),sort_keys=True))