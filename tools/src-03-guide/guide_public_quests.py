"""Project source-authenticated owner Guide exports into public, factual quest records.

Game-derived quest names and short objective instructions are public Guide content.
This intentionally omits source-native files, all long story/dialogue descriptions,
raw entitlement/player progress, and private audit manifests.
"""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

INDEX_SHA = '26c29bc0df15161602d75578c9842c5b7cca56caee0d6dd1031180949cceb30d'
SHARD_AUDIT_SHA = '99a539aad1884c92cc92337f52c6651879dc2f27493a9185dec36ff05863c4bf'
CHARACTERS_SHA = 'a54e5847f6228b660ace695bd6ee2d36334bacfc26f4903c6afd6ba6bd207b2e'
CATALOGUE_SHA = '3384a3c340c6982bba1132482427dc00f4e371080656f74c383f65fa4812754e'
MISSION_SOURCE_SHA = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
LANGS = ('ja','en','fr','it','de','es-ES','zh-CN','pt-BR')
INDEX_SCHEMA = 'wand.db03.public-guide-quests@1'
DETAIL_SCHEMA = 'wand.db03.public-guide-details@1'

def digest(raw): return hashlib.sha256(raw).hexdigest()
def require(ok, code):
    if not ok: raise ValueError('DB03_PUBLIC_GUIDE_'+code)
def read_pin(path, expected, max_bytes=20_000_000):
    require(path.is_file() and not path.is_symlink() and 0<path.stat().st_size<=max_bytes, 'BAD_INPUT_'+path.name)
    raw=path.read_bytes()
    require(digest(raw)==expected, 'SHA_MISMATCH_'+path.name)
    return json.loads(raw)
def sparse_text(localized):
    if not isinstance(localized,dict): return {}
    # Names and short quest-objective UI instructions, NOT narrative prose.
    return {lang: localized[lang] for lang in LANGS if isinstance(localized.get(lang),str)
            and localized[lang].strip() and len(localized[lang]) <= 480}
def objective(o):
    d=o.get('descriptions') or {}
    text=sparse_text((d.get('stepDescription') or {}).get('plainText') or {})
    v={'type':o['type']}
    if isinstance(o.get('objectiveId'),str):v['objectiveId']=o['objectiveId']
    if text:v['text']=text
    return v

def summarize(r):
    allsteps=[];objective_count=0
    for i,s in enumerate(r.get('structured',{}).get('stepsDetailed') or []):
        row={'index':i}
        if isinstance(s.get('stepId'),str):row['stepId']=s['stepId']
        substeps=[]
        for j,sub in enumerate(s.get('subSteps') or []):
            sobjs=[objective(o) for o in (sub.get('objectives') or [])]
            objective_count+=len(sobjs)
            u={'index':j,'objectives':sobjs}
            if isinstance(sub.get('subStepId'),str):u['subStepId']=sub['subStepId']
            substeps.append(u)
        row['subSteps']=substeps
        step_text=sparse_text(((s.get('descriptions') or {}).get('stepDescription') or {}).get('plainText') or {})
        if step_text:row['text']=step_text
        allsteps.append(row)
    meta=r.get('structured',{}).get('rewardsDecoded') or {}
    v={'id':r['id'],'steps':allsteps,'objectiveCount':objective_count}
    friendship=meta.get('friendshipOverride')
    if isinstance(friendship,dict) and isinstance(friendship.get('min'),int) and isinstance(friendship.get('max'),int):
        v['configuredFriendshipRange']={'min':friendship['min'],'max':friendship['max']}
    return v

def render(index,audit,shards,characters,groups):
    require(index.get('schema')=='wand.db03.quest-search@1' and index.get('target')=={'gameVersion':'1.26.1','platform':'Steam'},'ORIGINAL_INDEX')
    require(index.get('source',{}).get('sha256')==MISSION_SOURCE_SHA, 'ORIGINAL_MISSION')
    require(len(index['records'])==733 and index['counts']['sourceNativeRecords']==1030,'SOURCE_COUNTS')
    require(audit.get('questShards',{}).get('verifiedSearchQuestRecordDigests')==733,'SHARD_DIGEST_CENSUS')
    records={row['id']:row for row in index['records']}
    require(len(records)==733,'DUPLICATE_QUEST_ID')
    out={i:[] for i in range(8)};seen=set();total_objectives=0;total_steps=0
    for i in range(32):
        doc=shards[i]
        require(doc.get('schema')=='wand.db03.quest-detail-shards@1' and doc.get('bucket')==i,'SOURCE_SHARD_SCHEMA')
        for r in doc['records']:
            if r.get('recordKind')!='mission': continue
            rid=r['id'];require(rid in records and rid not in seen,'INVALID_NATIVE_QUEST_ID');seen.add(rid)
            ref=records[rid];require(ref['detail']['file']==f'quest-shards/part-{i:02d}.json' and r['nativeWireSha256']==ref['detail']['nativeWireSha256'] and r['names']==ref['names'],'QUEST_SOURCE_MISMATCH')
            detail=summarize(r)
            total_steps+=len(detail['steps']);total_objectives+=detail['objectiveCount']
            out[i//4].append(detail)
    require(seen==set(records),'MISSING_QUESTS')
    catalog=[]
    for rid,row in records.items():
        catalog.append({'id':rid,'names':row['names'],'internalName':row.get('internalName'),'characterId':row.get('characterId'),'groupId':row.get('groupId'),
           'update':row.get('sourceUpdateGroup'),'scope':row.get('sourceScopeTokens',[]),
           'objectiveKinds':row['objectiveKinds'],'detailPart':int(row['detail']['file'][18:20])//4})
    catalog.sort(key=lambda r:int(r['id']))
    require(total_objectives==11782 and total_steps==7878,'OBJECTIVE_COUNT_MISMATCH')
    meta={'target':{'gameVersion':'1.26.2','platform':'Steam'},'provenance':{
          'originalProjectionVersion':'1.26.1','missionFullFileSha256':MISSION_SOURCE_SHA,
          'missionSourceIdenticalAcrossVersions':True,'eightLocaleOriginalPayloadsIdentical':True,
          'sourceIsStaticNotPlayerProgress':True}}
    catalog_doc={'schema':INDEX_SCHEMA,**meta,
      'characters':{row['id']:sparse_text(row['names']) for row in characters['records'] if row.get('id')},
      'groups':{row['id']:{'rawName':row.get('rawName'),'names':sparse_text(row.get('names'))} for row in groups['questGroups'] if row.get('id')},
      'counts':{'quests':len(catalog),'steps':total_steps,
                  'objectives':total_objectives,'detailParts':8},'quests':catalog}
    details={f'quest-details-{i:02d}.json':{'schema':DETAIL_SCHEMA,**meta,'part':i,'quests':sorted(rows,key=lambda r:int(r['id']))} for i,rows in out.items()}
    return catalog_doc,details

def run(index_path,audit_path,shards_dir,output,character_path,groups_path):
    idx=read_pin(index_path,INDEX_SHA)
    audit=read_pin(audit_path,SHARD_AUDIT_SHA)
    characters=read_pin(character_path,CHARACTERS_SHA)
    groups=read_pin(groups_path,CATALOGUE_SHA)
    entries={r['file']:r for r in audit['questShards']['entries']}
    require(len(entries)==32,'SHARD_AUDIT_MISSING')
    shards={}
    for n in range(32):
        name=f'quest-shards/part-{n:02d}.json'
        require(name in entries,'MISSING_PINNED_SHARD')
        shards[n]=read_pin(shards_dir/f'part-{n:02d}.json',entries[name]['sha256'])
    index,details=render(idx,audit,shards,characters,groups)
    output.mkdir(parents=True,exist_ok=True)
    index['detailFiles']={}
    for filename,document in sorted(details.items()):
        payload=json.dumps(document,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode('utf-8')+b'\n'
        (output/filename).write_bytes(payload)
        index['detailFiles'][filename]={'sha256':digest(payload),'bytes':len(payload)}
    payload=json.dumps(index,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode('utf-8')+b'\n'
    (output/'quest-index.json').write_bytes(payload)
    return index

def main():
    p=argparse.ArgumentParser();p.add_argument('--search',type=Path,required=True);p.add_argument('--audit',type=Path,required=True)
    p.add_argument('--shards',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--characters',type=Path,required=True);p.add_argument('--groups',type=Path,required=True)
    a=p.parse_args();index=run(a.search,a.audit,a.shards,a.out,a.characters,a.groups)
    print('published static facts:',index['counts'])
if __name__=='__main__':main()
