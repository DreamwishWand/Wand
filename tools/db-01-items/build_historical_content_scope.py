"""Extract explicit native content scopes and mandatory positive DLC gates.

Historical evidence only: exact original Steam 1.25.3/1.26.1 corpora and the
reviewed 1.26.2 IL2CPP schema. Publish only typed Item IDs, scope and hashes.
Unknown dispatch, OR/NOT, negative/inverted predicates and unresolved paths
never imply a DLC purchase requirement. A source gate does not prove ownership.
"""
import argparse
from collections import defaultdict, Counter
import hashlib
import json
from pathlib import Path
import re
from build_complete_source_master import CLASSES, fields, frames, item_class, scalar

BEFORE='2a06e746b885057f0e00dd8d4ebd809f12aae6d9318c1266515cd2cdb8789daf'
AFTER='4ccf2816de3a5f2e27e780aa1c5a954b8ed0e325ccbd7d6bb76597f0f09ad41c'
DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
SCOPE='Expansion04Main'
EXPANSION=b'Expansion04'
SCHEMA='wand.db01.historical-content-scope@1'

def check(ok, code):
    if not ok:
        raise ValueError('DB01_CONTENT_SCOPE_'+code)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':')).encode()

def scan(root, expected, count, names=None):
    if names is None:
        names=sorted(p.stem for p in root.glob('*.json'))
    check(len(names)==39 and len(set(names))==39,'CATEGORY_CENSUS')
    sources,rows={},{}
    for name in names:
        check(re.fullmatch(r'[A-Za-z][A-Za-z0-9]*',name),'CATEGORY')
        raw=(root/(name+'.json')).read_bytes()
        sources[name]=sha(raw)
        for _,_,wire in frames(raw):
            i=scalar(wire,1,0)
            k=scalar(wire,2,2)
            check(type(i) is int and 0<i<2**53 and i not in rows and isinstance(k,bytes) and bool(k),'ID')
            k.decode('utf-8')
            rows[i]=(name,wire)
    check(len(rows)==count and sha(canonical(sources))==expected,'CORPUS')
    return sources,rows

def declarations(dump):
    needed={c for v in CLASSES.values() for c in ([v] if isinstance(v,str) else v.values())}|{
        'TagItemData','ConditionsList','ConditionOneOf','ConditionCommon','ConditionExpansion',
        'ConditionalGiveItemData','ConditionalSendMailbox','ConditionalSendMailbox.Types.MailAttachment',
        'ConditionalSwapItemData','ItemInstance'}
    found=defaultdict(list)
    for m in re.finditer(r'(?m)^public sealed class ([\w.]+)\s*:[^\n]*\n\{',dump):
        name=m[1]
        if name not in needed:
            continue
        body=dump[m.end():dump.find('\n}',m.end())].split('// Methods',1)[0]
        nums={k:int(n) for k,n in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
        props={k:t for t,k in re.findall(r'(?m)^\s*public ([\w.<>]+) (\w+) \{ get;(?: set;)? \}',body)}
        found[name].append({k:(n,props.get(k)) for k,n in nums.items()})
    return {name:rows[0] for name,rows in found.items() if len(rows)==1}

def require_contract(decl):
    required={
        'ConditionsList':{'Operator':1,'Conditions':2},
        'ConditionOneOf':{'CommonConditions':5,'SubConditions':10,'Expansion':140},
        'ConditionCommon':{'Condition':1,'Inversed':2},
        'ConditionExpansion':{'ExpansionName':1,'Inversed':2,'AnyPlatform':3},
        'ConditionItemData':{'Conditions':6},
        'MissionItemData':{'UpdateVersion':12,'QuestId':13},
        'ConditionalEventItemData':{'Conditions':11,'GiveItem':23,'SendMailbox':27,'SwapItem':35},
        'ConditionalGiveItemData':{'Items':1},
        'ConditionalSendMailbox':{'Attachments':5},
        'ConditionalSendMailbox.Types.MailAttachment':{'Attachment':1,'Amount':2},
        'ConditionalSwapItemData':{'ItemsToGive':2},
        'ItemInstance':{'ItemID':1,'Amount':2},
    }
    for cls,props in required.items():
        for field,num in props.items():
            check(decl.get(cls,{}).get(field,(None,))[0]==num,'DECLARATION_'+cls+'_'+field)

def mandatory(raw,conditions,stack=(),depth=0):
    """Return leaf ordinal paths and common-condition chain for AND-only gates."""
    if depth>16:
        return []
    tree=fields(raw)
    if scalar(tree,1,0,0)!=0 or any((n,w) not in ((1,0),(2,2)) for n,w,_ in tree):
        return []
    result=[]
    for ordinal,leaf in enumerate(v for n,w,v in tree if (n,w)==(2,2)):
        one=fields(leaf)
        if len(one)!=1 or one[0][1]!=2:
            continue
        tag,_,payload=one[0]
        if tag==140:
            f=fields(payload)
            if (all((n,w) in ((1,2),(2,0),(3,0)) for n,w,_ in f) and
                scalar(f,2,0,0)==0 and scalar(f,1,2)==EXPANSION):
                result.append([[ordinal],[]])
        elif tag==5:
            f=fields(payload)
            if any((n,w) not in ((1,0),(2,0)) for n,w,_ in f) or scalar(f,2,0,0)!=0:
                continue
            cid=scalar(f,1,0)
            if cid in conditions and cid not in stack:
                for path,chain in mandatory(conditions[cid],conditions,stack+(cid,),depth+1):
                    result.append([[ordinal]+path,[cid]+chain])
        elif tag==10:
            for path,chain in mandatory(payload,conditions,stack,depth+1):
                result.append([[ordinal]+path,chain])
    return result

def positive_grants(wire):
    # Use the explicit outer Amount of MailAttachment, not ItemInstance.Amount.
    for n,w,raw in wire:
        if w!=2 or n not in (23,27,35):
            continue
        role,field={23:('conditional_grant',1),27:('conditional_mail_attachment',5),35:('conditional_swap_grant',2)}[n]
        for k,t,v in fields(raw):
            if (k,t)!=(field,2):
                continue
            f=fields(v)
            amount=scalar(f,2,0,0)
            item=scalar(fields(scalar(f,1,2)),1,0) if n==27 else scalar(f,1,0)
            # Signed int32 amounts: negative serialized varints are not grants.
            if type(item) is int and 0<item<2**53 and 0<amount<=0x7fffffff:
                yield item,amount,role

def build(before,after,dump_path):
    bp,old=scan(before,BEFORE,35819)
    ap,rows=scan(after,AFTER,39066,sorted(bp))
    raw=dump_path.read_bytes()
    check(sha(raw)==DUMP,'DUMP_PIN')
    decl=declarations(raw.decode('utf-8'))
    require_contract(decl)
    new=set(rows)-set(old)
    check(len(new)==3254,'NEW_COUNT')
    conditions={i:scalar(f,6,2) for i,(c,f) in rows.items() if c=='Condition'}
    check(all(isinstance(v,bytes) for v in conditions.values()),'CONDITION_ROOT')
    scopes=[];gates=[];grants=[];root_count=0;unmapped_scope=[]
    mission_groups=defaultdict(list)
    for i,(cat,wire) in rows.items():
        cls=item_class(cat,i%10000000//100000)
        if cls=='MissionItemData':
            q=scalar(wire,13,0,0)
            if q:
                mission_groups[q].append((i,scalar(wire,12,2,b'')))
        if i not in new:
            continue
        schema=decl.get(cls,{})
        if cat=='Dialogue' and not cls and scalar(wire,20,2)==SCOPE.encode():
            unmapped_scope.append(i)
        if cat in ('Mission','Dialogue') and 'UpdateVersion' in schema:
            tag,typ=schema['UpdateVersion']
            check(typ=='string','SCOPE_TYPE')
            if scalar(wire,tag,2)==SCOPE.encode():
                scopes.append([i,cat,cls,tag])
        for prop,(tag,typ) in sorted(schema.items()):
            if typ!='ConditionsList':
                continue
            root=scalar(wire,tag,2)
            if root is None:
                continue
            root_count+=1
            paths=mandatory(root,conditions)
            if not paths:
                continue
            gates.append([i,cat,cls,prop,tag,sha(root),paths])
            if cat=='ConditionalEvent' and prop=='Conditions':
                grants.extend([i,item,amount,role] for item,amount,role in positive_grants(wire) if item in new)
    groups=[]
    for i,entries in sorted(mission_groups.items()):
        if i in new and rows[i][0]=='Mission' and item_class('Mission',i%10000000//100000)=='MissionQuestItemData' and all(j in new and scope==SCOPE.encode() for j,scope in entries):
            groups.append([i,sorted(j for j,_ in entries)])
    scopes.sort();gates.sort();grants.sort()
    counts={'rootConditionFields':root_count,'gateDefinitions':len({r[0] for r in gates}),'gateFields':len(gates),
        'scopeByCategory':dict(Counter(r[1] for r in scopes)), 'groupDefinitions':len(groups),
        'gatedGrantOccurrences':len(grants),'gatedGrantItems':len({r[1] for r in grants}),
        'unmappedScopeLookingDialogueCount':len(unmapped_scope)}
    return {'schema':SCHEMA,'platform':'Steam','introducedAfter':'1.25.3','introducedVersion':'1.26.1',
        'introducedAfterSourceCorpusSha256':BEFORE,'introducedSourceCorpusSha256':AFTER,
        'sourceFiles':ap,'schemaDumpVersion':'1.26.2','schemaDumpSha256':DUMP,'nativeScope':SCOPE,
        'expansion':'Expansion04','counts':counts,'scopeRows':scopes,'gateRows':gates,
        'groupRows':groups,'grantRows':grants,'runtimeAvailabilityVerified':False,
        'accountEntitlementVerified':False,'allContentAttributionVerified':False}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--before',type=Path,required=True)
    p.add_argument('--after',type=Path,required=True)
    p.add_argument('--dump',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    result=build(a.before,a.after,a.dump)
    body=canonical(result)+b'\n'
    with a.out.open('xb') as f:
        f.write(body)
    print(json.dumps({'sha256':sha(body),'bytes':len(body),**result['counts']},sort_keys=True))

if __name__=='__main__':
    main()
