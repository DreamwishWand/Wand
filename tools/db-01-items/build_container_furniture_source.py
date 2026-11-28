"""Offline typed container-template references and capacities from verified originals."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from build_complete_source_master import fields, frames, scalar

FURN='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196'
DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'

def sha(b): return hashlib.sha256(b).hexdigest()
def check(ok, reason):
    if not ok: raise ValueError('DB01_CONTAINER_FURNITURE_'+reason)
def extract(furn, proto, dump):
    check(sha(furn)==FURN and sha(proto)==PROTO and sha(dump)==DUMP,'SOURCE_SHA')
    text=dump.decode('utf8')
    for cls, expected in {'FurnitureItemData':{'Container':28},'ContainerInteraction':{'DefaultContainerInventoryData':1,'UpgradedContainer':3},'ContainerInventory':{'Size':2,'Inventory':3}}.items():
        matches=list(re.finditer(r'^public sealed class '+cls+r'\s*:',text,re.M))
        check(len(matches)==1,'CLASS_'+cls)
        body=text[matches[0].end():text.index('\n}',matches[0].end())]
        actual={k:int(v) for k,v in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
        check(all(actual.get(k)==v for k,v in expected.items()),'DECLARATION_'+cls)
    templates={}
    for index,(n,w,entry) in enumerate(fields(proto)):
        check((n,w)==(1,2),'PROTO_ENTRY')
        f=fields(entry); name=scalar(f,1,2).decode('utf8'); meta=fields(scalar(f,2,2))
        if scalar(meta,5,2)!=b'Meta.ContainerInventory':continue
        raw=scalar(meta,6,2); fs=fields(raw); size=scalar(fs,2,0)
        check(name not in templates and type(size) is int and size>0,'TEMPLATE')
        check(all((a,b) in ((2,0),(3,2),(4,0),(5,0)) for a,b,_ in fs),'TEMPLATE_FIELDS')
        slots=[fields(v) for a,b,v in fs if (a,b)==(3,2)]
        populated=sum(bool(scalar(slot,1,0,0)) for slot in slots)
        templates[name]=[name,index,size,len(slots),populated,sha(raw)]
    rows=[]
    for _,_,f in frames(furn):
        i=scalar(f,1,0)
        if i//100000 not in (400,403):continue
        raw=scalar(f,28,2)
        if raw is None:continue
        fs=fields(raw)
        check(all((a,b) in ((1,2),(3,0)) for a,b,_ in fs),'CONTAINER_FIELDS')
        name=scalar(fs,1,2,b'').decode('utf8') or None
        upgrade=scalar(fs,3,0)
        check(name is None or name in templates,'TEMPLATE_REFERENCE')
        rows.append([i,name,upgrade])
    rows.sort()
    ids={r[0] for r in rows}
    check(len(rows)==len(ids)==136 and len(templates)==88,'CENSUS')
    check(sum(r[1] is not None for r in rows)==131 and len({r[1] for r in rows if r[1]})==54,'REFERENCES')
    check(sum(r[2] is not None for r in rows)==16 and all(r[2] in ids for r in rows if r[2] is not None),'UPGRADES')
    check(sum(templates[r[1]][4]>0 for r in rows if r[1])==52,'POPULATED_REFERENCES')
    check(sum(r[3] for r in templates.values())==147 and sum(r[4] for r in templates.values())==146,'SLOTS')
    return {'schema':'wand.db01.container-furniture-source@1','target':{'platform':'Steam','gameVersion':'1.26.2'},'sourceFurnitureSha256':FURN,'sourceIl2cppDumpSha256':DUMP,'sourceProtoDbSha256':PROTO,'fieldContract':{'furnitureContainer':28,'templateKey':1,'upgradeItem':3,'templateSize':2,'templateSlots':3},'templates':sorted(templates.values()),'furniture':rows,'runtimeContentsVerified':False,'capacityRuntimeVerified':False,'spawnVerified':False}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('furniture','protodb','dump','out'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args()
    raw=(json.dumps(extract(a.furniture.read_bytes(),a.protodb.read_bytes(),a.dump.read_bytes()),sort_keys=True,separators=(',',':'))+'\n').encode()
    with a.out.open('xb') as f:f.write(raw)
    print(len(raw),sha(raw))
