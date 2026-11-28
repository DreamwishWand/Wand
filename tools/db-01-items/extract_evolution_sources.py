#!/usr/bin/env python3
"""Reproduce the reviewed evolution objective projection from owner-held originals."""
import argparse, hashlib, json, re
from functools import lru_cache
from pathlib import Path
from build_complete_source_master import fields, frames, scalar
DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
FILES={'Clothing':'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946',
       'Tool':'2126651d27fcee9974f79e1ab86bf961be70d6182a778c2fb62d6c3c09a1457d'}
def check(ok,why):
 if not ok:raise ValueError('DB01_EVOLUTION_'+why)
def sha(b):return hashlib.sha256(b).hexdigest()
def extract(root,dump):
 check(sha(dump)==DUMP,'DUMP')
 text=dump.decode('utf-8-sig')
 @lru_cache(None)
 def schema(name):
  match=re.search(r'^public sealed class '+re.escape(name)+r'\s*:',text,re.M)
  check(match,'CLASS_'+name)
  body=text[match.end():text.index('\n}',match.end())].split('// Methods')[0]
  fs={int(n):k for k,n in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
  types={k:t for t,k in re.findall(r'^\s*public ([\w.<>]+) (\w+) \{ get; (?:set; )?\}',body,re.M)}
  return {n:(k,types[k]) for n,k in fs.items()}
 def decode(b,typ,depth=0):
  check(depth<=20,'DEPTH')
  out={}
  for n,w,v in fields(b):
   k,t=schema(typ)[n]
   repeated=t.startswith('RepeatedField<')
   if repeated:t=t[14:-1]
   if w==0:
    check(t!='string' and v<2**53,'SCALAR')
    if t=='bool':check(v in (0,1),'BOOL');val=bool(v)
    else:val=v
   elif w==2:
    # This reviewed projection has no string content, packed primitives,
    # addresses or arbitrary original bytes.
    check(t!='string','UNREVIEWED_STRING')
    val=decode(v,t,depth+1)
   else:raise ValueError('unreviewed wire')
   if repeated:out.setdefault(k,[]).append(val)
   else:check(k not in out,'DUPLICATE');out[k]=val
  return out
 chains=[]
 for cat,step_field,flag_field,count in [('Clothing',32,30,2041),('Tool',11,9,126)]:
  b=(root/(cat+'.json')).read_bytes();check(sha(b)==FILES[cat],'ORIGINAL_'+cat)
  root_schema=schema(cat+'ItemData')
  check(root_schema[step_field]==('EvolvingConditions','RepeatedField<Evolve'+cat+'Data>') and root_schema[flag_field]==('IsEvolvedAsset','bool'),'ROOT_SCHEMA')
  step_schema=schema('Evolve'+cat+'Data')
  check(step_schema=={1:('EvolveAction','ObjectiveData'),14:('EvolvesInto','int')},'STEP_SCHEMA')
  target_ids=set();flag_ids=set();rows=0
  for _,_,f in frames(b):
   rows+=1;item=scalar(f,1,0)
   if scalar(f,flag_field,0)==1:flag_ids.add(item)
   steps=[decode(v,'Evolve'+cat+'Data') for n,w,v in f if n==step_field and w==2]
   if steps:
    check(len(steps)==2,'STEP_COUNT')
    chains.append({'category':cat,'baseItemId':item,'steps':steps})
    for s in steps:
     check(s['EvolvesInto'] not in target_ids,'TARGET_DUPLICATE');target_ids.add(s['EvolvesInto'])
  check(rows==count and target_ids==flag_ids,'CENSUS_'+cat)
 check(len(chains)==4 and sum(len(c['steps']) for c in chains)==8,'CENSUS')
 return {'schema':'wand.db01.evolution-sources@1','source':{'platform':'Steam','gameVersion':'1.26.2','il2cppDumpSha256':DUMP,'files':FILES},'chains':chains}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--itemlist',type=Path,required=True);p.add_argument('--il2cpp-dump',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 a=p.parse_args();check(a.output.resolve() not in [a.il2cpp_dump.resolve(),*((a.itemlist/(k+'.json')).resolve() for k in FILES)],'OUTPUT')
 a.output.write_text(json.dumps(extract(a.itemlist,a.il2cpp_dump.read_bytes()),separators=(',',':'))+'\n',encoding='utf8')
