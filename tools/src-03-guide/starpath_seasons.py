"""Offline source-typed BattlePass (Star Path) snapshot projection.

Validated against owner-held Steam 1.26.1 IL2CPP `dump.cs` contracts for
Definitions.BattlePassSeasonData / GetBattlePasses.Types.Response.
This module parses a separately supplied raw Protobuf snapshot, NEVER
connects to a service or infers present-day live availability, purchases,
player task completion or season catalog completeness.
"""

import argparse
import json
from pathlib import Path

from native_guide import wire_fields, int_field, text_field, sha, save
from protodb_guide_catalog import archived_condition_date, source_ids

SCHEMA = 'wand.db03.battlepass-source-snapshot@1'
MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024
MAX_SEASONS = 512
MAX_TASKS = 20000

# Definitions.ObjectiveData oneof: verified IL2CPP field IDs, not mission objective IDs.
TASK_OBJECTIVE_KINDS = {
    21:'CatchFish',22:'CollectCurrency',23:'CookMeal',24:'MineMineral',
    28:'GardeningHarvest',29:'GardeningPlant',31:'PickUp',33:'SellItem',
    41:'RoyalDuties',48:'StartDiscussion',49:'GiftToCharacter',
    56:'ServeRestaurantOrder',57:'PurchaseItem',58:'CraftItem',
    59:'PetCompanion',60:'TakePicture',61:'HangoutWithCharacter',
    62:'DigTile',63:'EatMeal',64:'DressUp',65:'ConsumeItem',
    66:'DesignChallenge',67:'BoutiqueChallenge',68:'BoutiqueDisplay',
    69:'FeedCritter',70:'SavePicture',71:'ClaimStoreGift',72:'EquipPet',
    73:'VisitArea',74:'WaterPlant',75:'Unlock',76:'Friend',77:'Decorate',
    78:'Conditional',79:'BoatCrewMember',80:'BoatCustomization',
    81:'SailingAction',
}


def singular(fields, number, wire):
    matches = [value for n, w, value in fields if n == number and w == wire]
    if len(matches) > 1:
        raise ValueError('DUPLICATE_BATTLEPASS_SCALAR_FIELD')
    return matches[0] if matches else None


def nested(fields, number):
    return [value for n, w, value in fields if n == number and w == 2]


def oneof(fields, members):
    selected = [(n,w,v) for n,w,v in fields if n in members]
    if len(selected) > 1:
        raise ValueError('MULTIPLE_BATTLEPASS_ONEOF_FIELDS')
    return selected[0] if selected else None


def source_text(fields, num):
    # text_field already rejects invalid UTF-8/control characters
    return text_field(fields, num)


def price(blob):
    f = wire_fields(blob)
    return {'sourceWireSha256':sha(blob),
            'currencyId':str(v) if (v:=singular(f,1,0)) is not None else None,
            'amount':singular(f,2,0)}


def reward(blob, vault=False):
    f = wire_fields(blob)
    r = {'sourceWireSha256':sha(blob),
         'itemId':str(i) if (i:=singular(f,2,0)) is not None else None}
    for n,key in ((1,'editorHeaderName'),(4,'imageResource')):
        v=source_text(f,n)
        if v is not None:r[key]=v
    for n,key in ((5,'configuredAmount'),(8 if vault else 9,'featuringPriority')):
        v=singular(f,n,0)
        if v is not None:r[key]=v
    for n,key in ((3,'overrideImage'),(6 if vault else 7,'premiumOnly')):
        v=singular(f,n,0)
        if v is not None:r[key]=bool(v)
    if vault:
        for n,key in ((7,'alwaysRevealed'),(9,'alternateRewardId')):
            v=singular(f,n,0)
            if v is not None:r[key]=str(v) if n==9 else bool(v)
    else:
        for n,key in ((8,'recurrent'),(10,'bonus')):
            v=singular(f,n,0)
            if v is not None:r[key]=bool(v)
        v=singular(f,6,0)
        if v is not None:r['currencyPrice']=v
    return r


def page(blob):
    f=wire_fields(blob)
    result={'sourceWireSha256':sha(blob),
            'rewards':[reward(raw) for raw in nested(f,10)],
            'unlockRequirement':None}
    head=source_text(f,1)
    if head is not None:result['editorHeaderName']=head
    convert=singular(f,2,0)
    if convert is not None:result['currencyConversionPage']=bool(convert)
    layout=singular(f,3,0)
    if layout is not None:result['layoutCode']=layout
    # UnlockRequirementTask/Reward/Rewards/AllPreviousCollected are ONEOF messages.
    # Preserve exact schema member and original message fingerprint. Contents are
    # not evaluated against a player profile or passed off as completed unlocks.
    selected=oneof(f,(5,6,7,8))
    if selected:
        n,w,payload=selected
        if w!=2:raise ValueError('BATTLEPASS_INVALID_UNLOCK_ONEOF_WIRE')
        result['unlockRequirement']={'type':{5:'task',6:'reward',7:'rewards',
            8:'allPreviousRewardsCollected'}[n], 'sourceWireSha256':sha(payload)}
        # Source types: UnlockRequirementTask.MinCollected(1),
        # UnlockRequirementReward.MinPurchased(1),
        # UnlockRequirementRewards.MinPurchasedFromLastPage(1).
        if n in (5,6,7):
            val=singular(wire_fields(payload),1,0)
            if val is not None:
                result['unlockRequirement'][{5:'minimumCollectedTasks',
                    6:'minimumPurchasedRewards',
                    7:'minimumPurchasedOnLastPage'}[n]]=val
    return result


def objective(blob):
    f=wire_fields(blob)
    # `ObjectiveData` is a union, NOT the MissionObjectiveData union.
    choices=[(n,w,v) for n,w,v in f if n in TASK_OBJECTIVE_KINDS]
    if len(choices)>1:raise ValueError('MULTIPLE_BATTLEPASS_TASK_OBJECTIVE_ONEOF')
    if not choices:return {'kind':'unknown', 'sourceWireSha256':sha(blob)}
    n,w,payload=choices[0]
    if w!=2:raise ValueError('INVALID_BATTLEPASS_TASK_OBJECTIVE_WIRE')
    return {'kind':TASK_OBJECTIVE_KINDS[n], 'protobufField':n,
            'sourceWireSha256':sha(payload)}


def task(blob):
    f=wire_fields(blob)
    r={'sourceWireSha256':sha(blob), 'objective':None}
    for n,k in ((1,'editorHeaderName'),(2,'iconResource'),(3,'description'),
                (7,'internalName'),(8,'taskId')):
        v=source_text(f,n)
        if v is not None:r[k]=v
    for n,k in ((5,'configuredCurrencyReward'),(6,'availableOnDay')):
        v=singular(f,n,0)
        if v is not None:r[k]=v
    body=singular(f,4,2)
    if body is not None:r['objective']=objective(body)
    return r


def tasks_group(blob, weekly=False):
    f=wire_fields(blob)
    if weekly:
        out=[]
        for i,raw in enumerate(nested(f,1)):
            w=wire_fields(raw)
            out.append({'weekIndex':i,'sourceWireSha256':sha(raw),
                        'editorHeaderName':source_text(w,1),
                        'tasks':[task(t) for t in nested(w,2)]})
        return out
    return [task(t) for t in nested(f,1)]


def vault(blob):
    f=wire_fields(blob)
    v={'sourceWireSha256':sha(blob), 'referenceId':source_text(f,1),
       'rewards':[], 'dataSuppliedInSnapshot':False}
    payload=singular(f,2,2)
    if payload is not None:
        v['dataSuppliedInSnapshot']=True
        v['rewards']=[reward(r,vault=True) for r in nested(wire_fields(payload),1)]
    return v


def bonus(blob):
    f=wire_fields(blob)
    return {'sourceWireSha256':sha(blob),
        'overrideColors':source_text(f,1),
        'pages':[page(p) for p in nested(f,2)]}


def season(blob, map_key):
    """Parse a single BattlePassSeasonData, without knowing whether it is current."""
    if not isinstance(map_key,str) or not map_key or len(map_key)>1024:
        raise ValueError('BATTLEPASS_INVALID_MAP_KEY')
    f=wire_fields(blob)
    r={'id':map_key,'schema':SCHEMA,'sourceWireSha256':sha(blob),
       'currentStatus':'not_evaluated_static_snapshot',
       'rewardPages':[], 'bonusRewards':None, 'vaultRewards':None,
       'tasks':[], 'weeklyTasks':[]}
    for n,k in ((1,'sourceVersion'),(14,'configuredCurrencyIncrement'),
                (16,'configuredCurrencyBundleAmount'),
                (18,'freeActiveTaskSlots'),(19,'premiumActiveTaskSlots')):
        v=singular(f,n,0)
        if v is not None:r[k]=v
    for n,k in ((2,'minimumGameVersion'),(7,'title'),(8,'description'),
                (9,'shortDescription'),(11,'premiumPassImageResource'),
                (12,'currencyName'),(30,'onlineId'),(31,'currencyOnlineId'),
                (32,'currencyOnlineType'),(33,'language'),(50,'iconResource')):
        v=source_text(f,n)
        if v is not None:r[k]=v
    active=singular(f,3,0)
    if active is not None:r['sourceActiveFlag']=bool(active)
    # The active flag is a snapshot/configuration field, not active-now.
    r['configuredTags']=source_ids(f,10)
    for n,k in ((4,'startCondition'),(5,'finishCondition'),
                (6,'endCondition'),(34,'lastUpdatedCondition')):
        d=singular(f,n,2)
        if d is not None:r[k]=archived_condition_date(d,wire_fields,int_field,sha)
    for n,k in ((13,'premiumPassPrice'),(15,'currencyIncrementPrice'),
                (17,'currencyBundlePrice')):
        d=singular(f,n,2)
        if d is not None:r[k]=price(d)
    r['rewardPages']=[page(p) for p in nested(f,21)]
    for n,k,fn in ((22,'bonusRewards',bonus),(23,'vaultRewards',vault)):
        d=singular(f,n,2)
        if d is not None:r[k]=fn(d)
    d=singular(f,24,2)
    if d is not None:r['tasks']=tasks_group(d)
    d=singular(f,25,2)
    if d is not None:r['weeklyTasks']=tasks_group(d,weekly=True)
    d=singular(f,51,2)
    if d is not None:r['resourcesWireSha256']=sha(d)
    d=singular(f,52,2)
    if d is not None:r['platformFilterWireSha256']=sha(d)
    d=singular(f,53,2)
    if d is not None:r['referencedConfigWireSha256']=sha(d)
    if r.get('onlineId') and r['onlineId']!=map_key:
        # Backend remapping and localized key conventions are possible;
        # preserve mismatch rather than alter either identifier.
        r['onlineIdDiffersFromResponseMapKey']=True
    return r


def decode_response(raw):
    """GetBattlePasses.Types.Response, fields 4, 6, 7 (source-verified)."""
    f=wire_fields(raw)
    entries,not_found,remappings=[],[],[]
    map_keys=set()
    for i,entry in enumerate(nested(f,4)):
        fields=wire_fields(entry)
        k=singular(fields,1,2)
        v=singular(fields,2,2)
        if k is None or v is None:
            raise ValueError('INVALID_BATTLEPASS_MAP_ENTRY')
        try:key=k.decode('utf-8')
        except UnicodeDecodeError as ex:raise ValueError('BAD_BATTLEPASS_MAP_KEY') from ex
        if key in map_keys:raise ValueError('DUPLICATE_BATTLEPASS_RESPONSE_MAP_KEY')
        map_keys.add(key)
        entries.append(season(v,key))
    for raw_id in nested(f,6):
        try:value=raw_id.decode('utf-8')
        except UnicodeDecodeError as ex:raise ValueError('BAD_BATTLEPASS_NOT_FOUND_ID') from ex
        if value:not_found.append(value)
    for raw_mapping in nested(f,7):
        f2=wire_fields(raw_mapping)
        first=singular(f2,1,2);second=singular(f2,2,2)
        if first is None or second is None:raise ValueError('INVALID_BATTLEPASS_ID_REMAP')
        try:
            remappings.append({'originalId':first.decode('utf-8'),
                               'newId':second.decode('utf-8')})
        except UnicodeDecodeError as ex:raise ValueError('BAD_BATTLEPASS_ID_REMAP') from ex
    response_state={}
    for n,k in ((1,'responseResultCode'),(3,'playFabResultCode')):
        val=singular(f,n,0)
        if val is not None:response_state[k]=val
    return entries,not_found,remappings,response_state


def project_snapshot(raw, format, direct_id=None):
    if not raw or len(raw)>MAX_SNAPSHOT_BYTES:
        raise ValueError('BATTLEPASS_SNAPSHOT_EMPTY_OR_TOO_LARGE')
    if format=='response':
        entries,not_found,remappings,response_state=decode_response(raw)
    elif format=='season':
        if not direct_id:raise ValueError('DIRECT_SEASON_REQUIRES_ID')
        entries=[season(raw,direct_id)]
        not_found,remappings,response_state=[],[],{}
    else:raise ValueError('INVALID_BATTLEPASS_INPUT_FORMAT')
    keys=[(r['id'],r.get('language')) for r in entries]
    if len(entries)>MAX_SEASONS or len(set(keys))!=len(keys):
        raise ValueError('TOO_MANY_OR_DUPLICATE_BATTLEPASS_SEASONS')
    if sum(len(s['tasks'])+sum(len(w['tasks']) for w in s['weeklyTasks'])
           for s in entries)>MAX_TASKS:
        raise ValueError('TOO_MANY_BATTLEPASS_TASKS')
    entries.sort(key=lambda s:(s['id'],s.get('language','')))
    return {'schema':SCHEMA,'source':{'format':format,'sha256':sha(raw),
            'bytes':len(raw),'nativeClass':('GetBattlePasses.Types.Response'
                if format=='response' else 'Definitions.BattlePassSeasonData')},
        'coverage':'partial_response_updates_only_not_complete_season_catalog',
        'evaluation':'source_snapshot_only_not_live_availability_or_user_progress',
        'responseStateCodes':response_state,
        'seasons':entries,'idsNotFoundInResponse':not_found,
        'idRemappingsFromResponse':remappings,
        'counts':{'seasonEntries':len(entries),
                  'rewardPages':sum(len(s['rewardPages']) for s in entries),
                  'rewardDefinitions':sum(sum(len(p['rewards']) for p in s['rewardPages'])
                    +sum(len(p['rewards']) for p in (s['bonusRewards'] or {}).get('pages',[]))
                    +len((s['vaultRewards'] or {}).get('rewards',[])) for s in entries),
                  'tasks':sum(len(s['tasks']) for s in entries),
                  'weeklyTasks':sum(sum(len(w['tasks']) for w in s['weeklyTasks'])
                    for s in entries)}}


def main():
    arg=argparse.ArgumentParser(description='Offline Star Path Protobuf snapshot importer')
    arg.add_argument('--input',required=True,type=Path)
    arg.add_argument('--output',required=True,type=Path)
    arg.add_argument('--format',required=True,choices=['response','season'])
    arg.add_argument('--id',help='Trusted season ID for --format season only')
    args=arg.parse_args()
    try:
        source=args.input.resolve(strict=True)
        out=args.output.resolve()
        if args.input.is_symlink() or not source.is_file() or source==out:
            raise ValueError('BATTLEPASS_INVALID_SOURCE_OR_DESTINATION')
        if source.stat().st_size>MAX_SNAPSHOT_BYTES:
            raise ValueError('BATTLEPASS_SNAPSHOT_TOO_LARGE')
        if args.format=='response' and args.id is not None:
            raise ValueError('DIRECT_ID_NOT_VALID_FOR_RESPONSE')
        data=project_snapshot(source.read_bytes(),args.format,args.id)
        save(out,data)
        print(json.dumps({'schema':SCHEMA,'status':'snapshot_only',
                          'counts':data['counts'],'output':str(out)},sort_keys=True))
    except (OSError,ValueError,UnicodeError) as ex:
        arg.exit(1,f'DB-03 Star Path error: {ex}\n')


if __name__=='__main__':
    main()
