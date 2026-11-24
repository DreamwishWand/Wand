#!/usr/bin/env python3
"""Reproduce individual friendship, configured store display and design unlock links.
Uses existing source decoders. Emits reviewed ID relations, never original game bytes.
"""
import argparse
import base64
import hashlib
import json
import re
import sys
import zlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src-02-acquisition'))
from extract_public_iap import fields, one, strings, varint, PROTO_SHA, PROTO_BYTES, EXPECTED_RECORDS
from acquisition import frames, single

DUMP_SHA='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
PINS={
 'Furniture':'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196',
 'Clothing':'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946',
 'Trimming':'a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c',
}
CONTRACTS={
 'Friendship':{'DefaultFriendship':1,'Friendships':2},
 'PetFriendship':{'DefaultFriendship':1,'Friendships':2},
 'FriendshipData':{'FriendshipLevels':1,'CharacterId':2},
 'PetFriendshipData':{'FriendshipLevels':1,'PetId':2},
 'FriendshipLevel':{'Level':1,'XP':2,'Tier1Reward':3,'Tier2Reward':4,'Tier3Reward':5,'LevelReward':6},
 'ItemReward':{'Id':1,'Amount':2,'State':3},
 'StoreData':{'FurnituresToDisplay':11,'ClothingsToDisplay':12},
 'StoreDataPreDLC':{'ItemListPreDLC':1},
 'FurnitureItemData':{'CatalogVisibilityConditions':20},
 'ClothingItemData':{'CatalogVisibilityConditions':22},
 'TrimmingItemData':{'CatalogVisibilityConditions':21},
 'CatalogVisibilityConditions':{'UnlockedByDesignChallenge':5},
}
RECORDS={
 'Friendship':('Definitions.Character.Friendship',398,'adc6472b804a00b6b76c0023318e546f16eb8dd5f006f54f1203851375114336'),
 'PetFriendship':('Definitions.Companion.PetFriendship',400,'3bebc2d8d47b5aa6fbf89929c798521e569084a39d23679676868a2b9c228324'),
 'Store_Default':('Definitions.Store.StoreData',1922,'000744e651ce271832e1580d439645c9213cce0ff4922c6d357d6663fc51a3cc'),
 'Store_PreDLC':('Definitions.Store.StoreDataPreDLC',1923,'ac2eb64cff112e14656b33e00d5339c287cfdb3adc460404473d6546369c4db5'),
}
def require(ok,reason):
 if not ok:raise ValueError('DB01_PROTO_ACQUISITION_'+reason)
def sha(b):return hashlib.sha256(b).hexdigest()
def friendship(body):
 out=[]
 for n,k,v in fields(body):
  if n!=2:continue
  require(k==2,'OWNER_WIRE')
  f=fields(v);owner=one(f,2); rewards=[]
  for n,k,v in f:
   if n!=1:continue
   require(k==2,'LEVEL_WIRE')
   l=fields(v);level=one(l,1)
   for a,b,c in l:
    if a not in (3,4,5,6):continue
    require(a==3 and b==2,'UNREVIEWED_REWARD_STAGE')
    rec=fields(c)
    require(all(n in (1,2) and k==0 for n,k,_ in rec),'UNREVIEWED_REWARD_STATE')
    i,amount=one(rec,1),one(rec,2)
    require(type(level) is int and 1<=level<=10 and type(i) is int and i>0 and
            (amount is None or type(amount) is int and amount>0),'REWARD_VALUE')
    rewards.append([level,i,amount])
  require(type(owner) is int and owner>0 and rewards and len({r[0] for r in rewards})==len(rewards),'OWNER')
  out.append([owner,rewards])
 require(len({x[0] for x in out})==len(out),'DUP_OWNER')
 return out
def packed_ids(raw):
 require(isinstance(raw,bytes),'PACKED_ID')
 out=[];p=0
 while p<len(raw):
  i,p=varint(raw,p);require(i>0,'ID');out.append(i)
 require(len(set(out))==len(out),'DUP_ID')
 return out
def extract(proto,itemlist,dump):
 require(len(proto)==PROTO_BYTES and sha(proto)==PROTO_SHA and sha(dump)==DUMP_SHA,'SOURCE_SHA')
 text=dump.decode('utf-8')
 for cls,expected in CONTRACTS.items():
  m=re.search(r'^public sealed class '+cls+r'\s*:',text,re.M)
  require(m is not None,'CLASS_'+cls)
  body=text[m.end():text.index('\n}',m.end())]
  actual={k:int(v) for k,v in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
  require(all(actual.get(k)==v for k,v in expected.items()),'SCHEMA_'+cls)
 entries=fields(proto);require(len(entries)==EXPECTED_RECORDS,'PROTO_CENSUS')
 result={};design={}
 for idx,(n,k,v) in enumerate(entries):
  require(n==1 and k==2,'ENTRY')
  row=fields(v);m=fields(one(row,2));name=strings(row,1);cls=strings(m,5);body=one(m,6)
  if cls=='Definitions.DesignChallengeData':
   require(name not in design,'DUP_CHALLENGE');design[name]=idx
  if name not in RECORDS:continue
  typ,pos,digest=RECORDS[name]
  require(cls==typ and idx==pos and sha(body)==digest and name not in result,'RECORD_'+name)
  result[name]=friendship(body) if name in ('Friendship','PetFriendship') else [
      packed_ids(one(fields(body),f)) for f in ((11,12) if name=='Store_Default' else (1,))]
 require(set(result)==set(RECORDS) and len(design)==183,'RECORD_CENSUS')
 unlock=[]
 for cat,base,field in [('Furniture',40000000,20),('Clothing',50000000,22),('Trimming',160000000,21)]:
  raw=(itemlist/(cat+'.json')).read_bytes();require(sha(raw)==PINS[cat],'ITEMLIST_'+cat)
  for i,f in frames(raw,base):
   if cat=='Furniture' and i//100000 not in (400,403):continue
   v=single(f,field,2)
   challenge=strings(fields(v),5) if v is not None else None
   if challenge:
    require(challenge in design,'UNKNOWN_CHALLENGE')
    unlock.append([i,challenge,design[challenge]])
 payload=[result[k] for k in ('Friendship','PetFriendship','Store_Default','Store_PreDLC')]+[sorted(unlock)]
 c,p,s,pre,d=payload
 coverage={'characterOwners':len(c),'characterRewardOccurrences':sum(len(a) for _,a in c),
  'petOwners':len(p),'petRewardOccurrences':sum(len(a) for _,a in p),
  'friendshipItemIds':len({i for _,a in c+p for _,i,_ in a}),
  'storeFurniture':len(s[0]),'storeClothing':len(s[1]),'preDlcItems':len(pre[0]),'designUnlocks':len(d)}
 require(list(coverage.values())==[82,720,241,482,620,86,55,76,31],'OUTPUT_CENSUS')
 b=json.dumps(payload,separators=(',',':')).encode()
 require(sha(b)=='34ae5f96fadc07180faa52b07f99b232321d325665e5c637906b46030aeb1ca4','PAYLOAD_SHA')
 return {'schema':'wand.db01.original-protodb-acquisition@1','target':{'platform':'Steam','gameVersion':'1.26.2'},
  'sourceProtoDbSha256':PROTO_SHA,'sourceIl2cppDumpSha256':DUMP_SHA,'sourceFiles':PINS,
  'sourceRecords':{k:[v[1],v[2]] for k,v in RECORDS.items()},'coverage':coverage,
  'payloadSha256':sha(b),'payloadBytes':len(b),'packed':base64.b64encode(zlib.compress(b,9)).decode()}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--protodb',type=Path,required=True);p.add_argument('--itemlist',type=Path,required=True)
 p.add_argument('--il2cpp-dump',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 a=p.parse_args();a.output.write_text(json.dumps(extract(a.protodb.read_bytes(),a.itemlist,a.il2cpp_dump.read_bytes()),separators=(',',':'))+'\n',encoding='utf-8')
