#!/usr/bin/env python3
"""Export minimal static Quest reward candidates from owner-authenticated Steam v1.26.2 Guide.

Only source-explicit Item IDs and currency-amount ranges are made public. Loot
candidates are NOT guaranteed grants. Original files, signatures and save data
stay private. Source Mission itself is verified byte-identical between 1.26.1/2.
"""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

PREFIX='Wand-Guide-Steam-v1.26.2/'
BUNDLE_SHA='9dcf0efbeb4b70fcf4222a295a43690ae6a04fb1ee12a169dc8031f062600d6f'
MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
SCHEMA='wand.db03.public-quest-rewards@1'

def sha(data):return hashlib.sha256(data).hexdigest()
def canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
def check(ok,tag):
    if not ok:raise ValueError('DB03_QUEST_REWARDS_'+tag)
def item_id(v):
    check(isinstance(v,str) and v.isdigit() and v[0]!='0' and 0<int(v)<2**53,'INVALID_SOURCE_ITEM_ID')
    return v

def project(bundle):
    path=Path(bundle);check(path.is_file() and not path.is_symlink(),'SOURCE_NOT_REGULAR_FILE')
    check(path.stat().st_size<32_000_000 and sha(path.read_bytes())==BUNDLE_SHA,'SOURCE_BUNDLE_SHA')
    with ZipFile(path) as z:
        manifest=json.loads(z.read(PREFIX+'OWNER-PRIVATE-BUNDLE-MANIFEST.json'))
        check(manifest['schema']=='wand.db03.owner-guide-bundle@1' and
              manifest['target']['gameVersion']=='1.26.2' and
              manifest['counts']['searchableQuests']==733 and
              manifest['counts']['originalQuestShards']==32 and
              manifest['sourceProvenance']['originalQuestFullFileSha256']==MISSION_SHA,
              'ORIGINAL_MISSION_PROVENANCE')
        def authenticated(name):
            raw=z.read(PREFIX+name);meta=manifest['files'][name]
            check(len(raw)==meta['bytes'] and sha(raw)==meta['sha256'],'BUNDLE_FILE_MISMATCH')
            return json.loads(raw)
        search=authenticated('guide/quest-search.json')
        check(search['source']['sha256']==MISSION_SHA and
              search['target']['gameVersion']=='1.26.1' and len(search['records'])==733,
              'ORIGINAL_QUEST_SEARCH')
        byid={row['id']:row for row in search['records']}
        check(len(byid)==733,'DUPLICATE_SEARCH_QUEST')
        counts=Counter();itemids=set();currencyids=set();rows={};seen=set();opaque=0
        for shard_id in range(32):
            filename=f'guide/quest-shards/part-{shard_id:02d}.json'
            shard=authenticated(filename)
            check(shard['schema']=='wand.db03.quest-detail-shards@1' and
                  shard['bucket']==shard_id and shard['source']['sha256']==MISSION_SHA and
                  shard['target']['gameVersion']=='1.26.1','ORIGINAL_SHARD_PROVENANCE')
            for row in shard['records']:
                if row.get('recordKind')!='mission':continue
                qid=row['id'];check(qid in byid and qid not in seen,'INVALID_QUEST_ID');seen.add(qid)
                meta=byid[qid]['detail']
                check(meta['file']==f'quest-shards/part-{shard_id:02d}.json' and
                      row['nativeWireSha256']==meta['nativeWireSha256'] and
                      sha(canonical(row))==meta['recordSha256'],'QUEST_RECORD_HASH')
                structured=row['structured'];flows=structured.get('itemFlows') or {}
                check(flows.get('schema')=='wand.db03.item-flows@1','SOURCE_ITEM_FLOWS')
                reward=structured.get('rewardsDecoded') or {}
                currencies=[];additional=[]
                for c in reward.get('currency') or []:
                    cid=item_id(c['currencyId']);mn=c['amountMin'];mx=c['amountMax']
                    check(type(mn)==int and type(mx)==int and 0<=mn<=mx<=1_000_000_000,'CURRENCY_AMOUNT_RANGE')
                    currencies.append([cid,mn,mx]);currencyids.add(cid);counts['currencyOccurrences']+=1
                block=flows.get('additionalRewards')
                if block is not None:
                    counts['questsWithDeclaredAdditionalRewards']+=1
                    check(isinstance(block,dict) and isinstance(block.get('subLootTables'),list),'INVALID_ADDITIONAL_LOOT_TREE')
                    if not block['subLootTables']:counts['emptyAdditionalLootDefinitions']+=1
                    for table_id,table in enumerate(block['subLootTables']):
                        check(table['index']==table_id and isinstance(table['items'],list),'LOOT_TABLE_INDEX')
                        # Unlike a direct reward grant, a Loot Table has roll policy.
                        check(not table['conditionalItems'] and not table['filterFingerprints'] and
                              not table['rarityCodes'] and not table['lootTypeFingerprints'],
                              'UNSUPPORTED_CONDITIONAL_LOOT')
                        roll_min=table.get('minimumRolls');roll_max=table.get('maximumRolls')
                        check((roll_min is None and roll_max is None) or
                              (type(roll_min)==int and type(roll_max)==int and 0<=roll_min<=roll_max<=10000),
                              'INVALID_LOOT_ROLL_POLICY')
                        weight=table.get('weight');check(weight is None or
                              (type(weight)==int and 0<=weight<=1000000),'INVALID_LOOT_WEIGHT')
                        counts['lootTables']+=1
                        for item_index,it in enumerate(table['items']):
                            check(it['index']==item_index,'LOOT_ITEM_INDEX')
                            item=item_id(it['itemId']);state=it['itemStateSha256'] is not None
                            check(it['itemStateSha256'] is None or isinstance(it['itemStateSha256'],str) and
                                  len(it['itemStateSha256'])==64,'STATE_DIGEST_INVALID')
                            # index, itemId, min/max ROLLS (not item quantities), optional table weight, item state flag.
                            additional.append([table_id,item_index,item,roll_min,roll_max,weight,state])
                            itemids.add(item);counts['additionalItemOccurrences']+=1
                overrides=flows.get('overrideRewardReferences') or []
                if overrides or flows.get('overrideRewardsWireSha256'):
                    # The source points at external reward definitions whose Item IDs
                    # are not resolved by this original Mission projection.
                    check(isinstance(overrides,list) and all(isinstance(x,str) and x.isdigit() for x in overrides),
                          'INVALID_OPAQUE_OVERRIDE')
                    opaque+=1
                if additional or currencies or overrides or flows.get('overrideRewardsWireSha256'):
                    result={}
                    if currencies:result['currency']=currencies;counts['questsWithCurrencyReward']+=1
                    if additional:result['additionalLoot']=additional;counts['questsWithAdditionalItemCandidates']+=1
                    if overrides or flows.get('overrideRewardsWireSha256'):result['opaqueOverrideUnresolved']=True
                    rows[qid]=result
        check(seen==set(byid),'INCOMPLETE_QUEST_CENSUS')
        counts=dict(quests=733,questRowsWithAnyRewardEvidence=len(rows),
                    distinctAdditionalItemIds=len(itemids),distinctCurrencyIds=len(currencyids),
                    questsWithOpaqueOverrides=opaque,**counts)
        expected={'quests':733,'questRowsWithAnyRewardEvidence':247,
                  'distinctAdditionalItemIds':291,'distinctCurrencyIds':4,
                  'questsWithOpaqueOverrides':4,'currencyOccurrences':65,
                  'questsWithCurrencyReward':65,'additionalItemOccurrences':330,
                  'questsWithAdditionalItemCandidates':195,
                  'questsWithDeclaredAdditionalRewards':243,
                  'emptyAdditionalLootDefinitions':48,'lootTables':328}
        check(counts==expected,'NATIVE_REWARD_CENSUS_'+str(counts))
        check(currencyids=={'80000000','80000003','80000010','80300000'},'SOURCE_CURRENCY_IDENTITIES')
        return dict(schema=SCHEMA,target={'platform':'Steam','gameVersion':'1.26.2'},
                    provenance={'bundleSha256':BUNDLE_SHA,'originalMissionSha256':MISSION_SHA,
                                'originalMissionVersion':'1.26.1','staticCandidatesOnly':True,
                                'notConfirmedGrantsOrPlayerProgress':True,
                                'opaqueOverridesNotResolved':True},
                    counts=counts,rows={k:rows[k] for k in sorted(rows,key=int)})

def main():
    a=argparse.ArgumentParser();a.add_argument('--bundle',required=True,type=Path)
    a.add_argument('--output',required=True,type=Path);args=a.parse_args()
    doc=project(args.bundle);b=canonical(doc);args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(b);print(json.dumps({'bytes':len(b),'sha256':sha(b),'counts':doc['counts']},sort_keys=True))

if __name__=='__main__':main()