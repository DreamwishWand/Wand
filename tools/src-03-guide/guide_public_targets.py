"""Export public *static candidate* item selectors from SHA-pinned owner Guide source.

No live requirements, grants, ownership, or dynamic filter inference.
Build from owner-private ZIP; published output includes only typed references and
resolved public normalized names when separately added after source-version checks.
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

PRIVATE_BUNDLE_SHA = '9dcf0efbeb4b70fcf4222a295a43690ae6a04fb1ee12a169dc8031f062600d6f'
PUBLIC_MISSION_SHA = 'f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'
SCHEMA = 'wand.db03.public-quest-targets@1'
PART_SCHEMA = 'wand.db03.public-quest-targets-part@1'
PREFIX = 'Wand-Guide-Steam-v1.26.2/'


def digest(data): return hashlib.sha256(data).hexdigest()
def must(ok, message):
    if not ok: raise ValueError('DB03_TARGETS_' + message)

def serialize(value):
    return (json.dumps(value,ensure_ascii=False,separators=(',',':'),sort_keys=True)+'\n').encode('utf-8')

def candidate(c):
    cid=c.get('id')
    must(isinstance(cid,str) and cid.isdigit() and int(cid)>0,'BAD_NATIVE_ITEM_ID')
    role=c.get('role')
    must(role in ('direct','alternative'),'BAD_CANDIDATE_ROLE')
    result={'id':cid,'role':role}
    if c.get('generatorKind') in ('item','itemIngredient'):
        result['generatorKind']=c['generatorKind']
    return result

def export_target(target):
    must(target.get('schema')=='wand.db03.mission-items@1','UNSUPPORTED_ITEM_TARGET')
    result={'selectors':[]}
    for selector in target.get('selectors',[]):
        must(selector.get('kind') in ('any','selector'),'BAD_SELECTOR_KIND')
        sel={'role':selector.get('role'),'kind':selector['kind'],
             'mode':selector.get('mode') or (selector.get('nested') or {}).get('mode') or 'unresolved',
             'candidates':[candidate(c) for c in selector.get('itemCandidates',[])]}
        if selector.get('anyCategory'):
            sel['anyCategory']=selector['anyCategory']
        must(isinstance(sel['role'],str) and len(sel['role'])<64,'BAD_SELECTOR_ROLE')
        must(sel['mode'] in ('item','itemList','itemGenerator','filterGenerator','unresolved'),'BAD_SELECTOR_MODE')
        result['selectors'].append(sel)
    amount=target.get('amount')
    if isinstance(amount,dict):
        k=amount.get('kind')
        if k in ('value','range'):
            v={'kind':k}
            for field in (('value',) if k=='value' else ('min','max')):
                if field in amount:
                    n=amount[field]
                    must(isinstance(n,int) and 0<=n<=1000000000,'BAD_AMOUNT')
                    v[field]=n
            result['amount']=v
        else:result['amount']={'kind':'dynamic'}
    return result

def build(bundle,public_index):
    must(bundle.is_file() and not bundle.is_symlink(),'BUNDLE_MISSING')
    raw=bundle.read_bytes()
    must(digest(raw)==PRIVATE_BUNDLE_SHA,'BUNDLE_SHA_MISMATCH')
    must(public_index.get('schema')=='wand.db03.public-guide-quests@1','PUBLIC_INDEX_SCHEMA')
    must(public_index.get('target')=={'platform':'Steam','gameVersion':'1.26.2'},'TARGET_VERSION')
    must(public_index['provenance']['missionFullFileSha256']==PUBLIC_MISSION_SHA,'PUBLIC_SOURCE')
    must(public_index['counts']['quests']==733,'QUEST_CENSUS')
    by_id={q['id']:q for q in public_index['quests']}
    must(len(by_id)==733,'DUPLICATE_QUEST')
    rows=[{} for _ in range(8)];seen=set();raw_objectives=0;target_count=0;candidate_count=0;refs=set();dynamic=0
    with zipfile.ZipFile(bundle) as z:
        manifest=json.loads(z.read(PREFIX+'OWNER-PRIVATE-BUNDLE-MANIFEST.json'))
        must(manifest['counts']['searchableQuests']==733 and manifest['counts']['originalQuestShards']==32,'BUNDLE_CENSUS')
        for i in range(32):
            file=f'guide/quest-shards/part-{i:02d}.json'
            member=z.read(PREFIX+file)
            ledger=manifest['files'][file]
            must(len(member)==ledger['bytes'] and digest(member)==ledger['sha256'],'ORIGINAL_SHARD_SHA')
            part=json.loads(member)
            must(part['schema']=='wand.db03.quest-detail-shards@1' and part['bucket']==i,'ORIGINAL_SHARD_SCHEMA')
            for q in part['records']:
                if q.get('recordKind')!='mission': continue
                qid=q['id'];must(qid in by_id and qid not in seen and by_id[qid]['detailPart']==i//4,'QUEST_ID_OR_PART')
                seen.add(qid);entries=[]
                for si,step in enumerate(q.get('structured',{}).get('stepsDetailed') or []):
                    for bi,sub in enumerate(step.get('subSteps') or []):
                        for oi,obj in enumerate(sub.get('objectives') or []):
                            raw_objectives+=1
                            if not obj.get('itemTargets'):continue
                            t=export_target(obj['itemTargets']);target_count+=1
                            r={'step':si,'sub':bi,'objective':oi,'type':obj['type'],**t}
                            for selector in t['selectors']:
                                candidate_count+=len(selector['candidates'])
                                refs.update(c['id'] for c in selector['candidates'])
                                if not selector['candidates']:dynamic+=1
                            entries.append(r)
                if entries: rows[i//4][qid]=entries
    must(seen==set(by_id),'MISSING_QUEST')
    must(raw_objectives==11782,'OBJECTIVES_CENSUS')
    must(target_count==4869,'TARGETS_CENSUS')
    result={'schema':SCHEMA,'target':{'platform':'Steam','gameVersion':'1.26.2'},
            'source':{'privateBundleSha256':PRIVATE_BUNDLE_SHA,'missionSha256':PUBLIC_MISSION_SHA,
                      'originalProjectionVersion':'1.26.1','staticConfigurationOnly':True},
            'counts':{'quests':733,'targetObjectives':target_count,'candidateOccurrences':candidate_count,
                      'uniqueCandidateIds':len(refs),'selectorsWithoutExplicitCandidates':dynamic,'parts':8},
            'partFiles':{},'itemNames':{},'itemNamesSource':None}
    return result,rows,refs

def run(bundle,index_path,out):
    index=json.loads(index_path.read_text('utf-8'))
    document,parts,refs=build(bundle,index)
    out.mkdir(parents=True,exist_ok=True)
    for i,rows in enumerate(parts):
        name=f'quest-targets-{i:02d}.json'
        part={'schema':PART_SCHEMA,'part':i,'source':document['source'],'quests':rows}
        payload=serialize(part);(out/name).write_bytes(payload)
        document['partFiles'][name]={'sha256':digest(payload),'bytes':len(payload)}
    (out/'quest-targets-index.json').write_bytes(serialize(document))
    print(json.dumps({'counts':document['counts'],'bytes':[p.stat().st_size for p in sorted(out.iterdir())]},indent=2))
    return document

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--bundle',type=Path,required=True)
    p.add_argument('--public-index',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args();run(args.bundle,args.public_index,args.out)
if __name__=='__main__':main()
