#!/usr/bin/env python3
"""Reproduce only the reviewed historical Switch Star Path reward projection.
No game bytes, tasks, resource addresses or player data enter the output.
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
from extract_public_iap import fields

SOURCE='36c2f64d849a5c7e2350b874e9e9443795c0675381a185d801649b587b093b60'
DUMP='6e649926a8da4bc4f1d0bd4744ffaeea89701ef3c1a823b036e6733e915ba9a4'
PAYLOAD='92396d259cb5db1f247d2d4b3826a3e8c0ffc2aecc226ff6c3049c2f416a3ff4'
SCHEMA={
 'BattlePassSeasonData':{'Version':1,'RewardsPages':21,'BonusRewards':22,'VaultRewards':23},
 'BattlePassRewardsPage':{'Rewards':10},
 'BattlePassBonusRewards':{'Pages':2},
 'BattlePassReward':{'ItemId':2,'Amount':5,'IsPremium':7},
 'BattlePassVaultRewardsRef':{'Id':1,'Data':2},
 'BattlePassVaultRewards':{'Rewards':1},
 'BattlePassVaultReward':{'ItemId':2,'Amount':5,'IsPremium':6,'AlternateReward':9},
}
def check(ok,why):
 if not ok:raise ValueError('DB01_SWITCH_STARPATH_'+why)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def repeated(rows,n,w):
 vals=[(t,v) for k,t,v in rows if k==n]
 check(all(t==w for t,v in vals),'WIRE')
 return [v for t,v in vals]
def one(rows,n,w):
 a=repeated(rows,n,w);check(len(a)<=1,'SCALAR')
 return a[0] if a else None
def decode_rewards(rows,n,vault=False):
 result=[]
 for raw in repeated(rows,n,2):
  f=fields(raw);item=one(f,2,0);amount=one(f,5,0);premium=one(f,6 if vault else 7,0)
  alternate=one(f,9,0) if vault else None
  check(type(item) is int and item>0 and type(amount) is int and amount>0 and premium in (None,0,1) and (alternate is None or type(alternate) is int and alternate>0),'REWARD')
  result.append([item,amount,premium,alternate])
 return result
def extract(original,dump):
 check(len(original)==2101932 and sha(original)==SOURCE and sha(dump)==DUMP,'SOURCE')
 text=dump.decode('utf-8-sig')
 for cls,expected in SCHEMA.items():
  match=re.search(r'^public sealed class '+cls+r'\s*:',text,re.M);check(match,'CLASS_'+cls)
  body=text[match.start():text.index('\n}',match.end())]
  actual={k:int(v) for k,v in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
  check(all(actual.get(k)==v for k,v in expected.items()),'SCHEMA_'+cls)
 entries=fields(original);check(len(entries)==3118,'RECORD_COUNT')
 seasons=[];vaults=[]
 for index,(n,w,entry) in enumerate(entries):
  check((n,w)==(1,2),'ENTRY')
  f=fields(entry);env=fields(one(f,2,2));typ=one(env,5,2).decode()
  if typ not in ('Definitions.BattlePassSeasonData','Definitions.BattlePassVaultRewards'):continue
  key=one(f,1,2).decode();body=one(env,6,2);p=fields(body)
  if typ.endswith('.BattlePassVaultRewards'):
   vaults.append([key,index,sha(body),decode_rewards(p,1,True)]);continue
  pages=[decode_rewards(fields(v),10) for v in repeated(p,21,2)]
  b=one(p,22,2);bonus=[decode_rewards(fields(v),10) for v in repeated(fields(b),2,2)] if b is not None else []
  v=one(p,23,2);ref=None
  if v is not None:
   q=fields(v);r=one(q,1,2);check(one(q,2,2) is None,'INLINE_VAULT_UNREVIEWED')
   ref=r.decode() if r is not None else None
  seasons.append([key,index,sha(body),one(p,1,0),pages,bonus,ref])
 check(len(seasons)==23 and len(vaults)==3,'SEASONS')
 by_vault={v[0]:v[3] for v in vaults};linked=set();occ=[]
 for key,index,digest,version,pages,bonus,ref in seasons:
  occ.extend(r for page in pages+bonus for r in page)
  if ref is not None:
   check(ref in by_vault,'MISSING_VAULT');linked.add(ref);occ.extend(by_vault[ref])
 check(len(occ)==1032 and len({r[0] for r in occ})==863 and len(linked)==2,'CENSUS')
 payload=json.dumps([seasons,vaults],separators=(',',':')).encode()
 check(len(payload)==25500 and sha(payload)==PAYLOAD,'PAYLOAD')
 return {'schema':'wand.db01.historical-starpath-rewards@1',
  'source':{'platform':'Switch','gameVersion':'1.24.1','protoDbSha256':SOURCE,'il2cppDumpSha256':DUMP,'protoDbRecords':3118},
  'coverage':{'seasons':23,'vaultDefinitions':3,'linkedVaultDefinitions':2,'rewardOccurrences':1032,'distinctRewardItemIds':863,'currentAvailabilityVerified':False,'seasonCatalogComplete':False},
  'payloadSha256':PAYLOAD,'payloadBytes':len(payload),'packed':base64.b64encode(zlib.compress(payload,9)).decode()}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--protodb',type=Path,required=True);p.add_argument('--il2cpp-dump',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 a=p.parse_args();check(a.output.resolve() not in (a.protodb.resolve(),a.il2cpp_dump.resolve()),'OUTPUT')
 a.output.write_text(json.dumps(extract(a.protodb.read_bytes(),a.il2cpp_dump.read_bytes()),separators=(',',':'))+'\n',encoding='utf8')
