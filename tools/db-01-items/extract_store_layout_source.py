#!/usr/bin/env python3
"""Reproduce decoded store layout rules and display sequences, not raw game files."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src-02-acquisition'))
from acquisition import frames, wire, single, ids, text_value
from extract_public_iap import fields as proto_fields
PINS={'Display':'6ba1986365d04a1b1db665a48f3289eee18ee166fcbb864c470093c20d2ea452',
      'Furniture':'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196',
      'Clothing':'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946'}
PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623'
DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
SCHEMA={
 'LayoutArea':{'ItemGenerator':1},'ItemGenerator':{'Type':2,'SubType':3,'AllTags':12,'AnyTag':13,'Grid':17,'Min':100,'Max':101},
 'ItemTypeFilter':{'Values':1},'ItemSubTypeFilter':{'SubTypes':1},
 'SubTypeOption':{'Furniture':3,'Clothing':6,'Trimming':7},
 'FurnitureSubTypeFilter':{'Values':1},'ClothingSubTypeFilter':{'Values':1},'TrimmingSubTypeFilter':{'Values':1},
 'ItemAllTagsFilter':{'Values':1},'ItemAnyTagFilter':{'Values':1,'Invert':2},
 'ItemGridFilter':{'MinAreaSize':1,'MaxAreaSize':2,'CanRotate':3,'SizeQualifier':4,'IgnoreSizeForTags':5,'ExcludedLayers':6},
 'AreaSize':{'X':1,'Y':2},'DisplayItemData':{'DisplayType':8,'AlternateOfDisplayItemId':12},
 'DisplayType':{'StoreStage':1,'StoreShelf':2},
 'StoreStage':{'Layouts':1,'ItemsSequence':2},'StoreStage.Types.SequenceEntry':{'LayoutType':1,'Items':2},
 'LayoutInfo':{'Type':1,'Weight':2},'StoreShelf':{'ItemDefinitionList':1,'ExtraAmount':2,'ItemsSequence':3},
 'StoreShelf.Types.ItemDefinition':{'Type':1,'Amount':2},'ItemsSequence':{'ItemIds':1,'ApplyTo':2}}
def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,code):
 if not ok:raise ValueError('DB01_STORE_LAYOUT_'+code)
def fields(f,n):return [wire(v) for k,w,v in f if k==n and w==2]
def val(f,n,default=0):
 v=single(f,n,0);return default if v is None else v
def msg(f,n):return wire(single(f,n,2,True))
def parse_filter(raw):
 g=msg(wire(raw),1);out={}
 for n,w,v in g:
  if n in (100,101):
   require(w==0,'QUANTITY');out['min' if n==100 else 'max']=v;continue
  require(w==2,'FILTER_WIRE');f=wire(v)
  if n==2:out['typeCodes']=ids(f,1)
  elif n==3:
   out['subtypes']=[]
   for option in fields(f,1):
    require(len(option)==1,'SUBTYPE_ONEOF');kind,ww,body=option[0]
    require(kind in (3,6,7) and ww==2,'SUBTYPE_KIND')
    out['subtypes'].append([kind,ids(wire(body),1)])
  elif n in (12,13):
   out['allTags' if n==12 else 'anyTags']=ids(f,1)
   if n==13:out['invertAnyTags']=bool(val(f,2))
  elif n==17:
   grid={}
   for k,ww,b in f:
    if k in (1,2):
     area=wire(b);grid['minArea' if k==1 else 'maxArea']=[val(area,1),val(area,2)]
    elif k==3:grid['canRotate']=bool(b)
    else:require(k in (4,5,6),'GRID_FIELD')
   for k,name in [(4,'sizeQualifiers'),(5,'ignoreSizeForTags'),(6,'excludedLayers')]:
    values=ids(f,k)
    if values:grid[name]=values
   out['grid']=grid
  else:raise ValueError('UNKNOWN_FILTER_'+str(n))
 return out
def extract(proto,root,dump):
 p=proto.read_bytes();d=dump.read_bytes()
 require(sha(p)==PROTO and sha(d)==DUMP,'ORIGINAL_SHA')
 source=d.decode('utf-8')
 for cls,expected in SCHEMA.items():
  m=re.search(r'^public sealed class '+re.escape(cls)+r'\s*:[^\n]+\n\{',source,re.M)
  require(m is not None,'CLASS_'+cls)
  body=source[m.end():source.index('\n}',m.end())]
  actual={k:int(v) for k,v in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
  require(all(actual.get(k)==v for k,v in expected.items()),'FIELD_'+cls)
 raw={k:(root/(k+'.json')).read_bytes() for k in PINS}
 require(all(sha(v)==PINS[k] for k,v in raw.items()),'ITEMLIST_SHA')
 areas=[]
 for ix,(n,w,v) in enumerate(proto_fields(p)):
  require(n==1 and w==2,'PROTO_ENTRY')
  f=wire(v);meta=msg(f,2)
  if text_value(meta,5)!='Definitions.Displays.LayoutArea':continue
  key=text_value(f,1);body=single(meta,6,2,True)
  require(key.startswith('StoreLayoutArea_'),'AREA_KEY')
  areas.append([key,ix,sha(body),parse_filter(body)])
 require(len(areas)==27 and [a[1] for a in areas]==list(range(1895,1922)),'AREA_CENSUS')
 displays=[]
 for i,f in frames(raw['Display'],2140000000):
  key=text_value(f,2);dt=msg(f,8)
  require(len(dt)==1 and dt[0][0] in (1,2) and dt[0][1]==2,'DISPLAY_TYPE')
  kind,_,body=dt[0];b=wire(body)
  if kind==2:
   shelf=[[val(x,1),val(x,2)] for x in fields(b,1)]
   layouts=[];seq=[[None,ids(x,1),ids(x,2)] for x in fields(b,3)]
   extra=val(b,2)
  else:
   shelf=[];layouts=[[val(x,1),val(x,2)] for x in fields(b,1)]
   seq=[[val(x,1),ids(msg(x,2),1),ids(msg(x,2),2)] for x in fields(b,2)];extra=0
  displays.append([i,key,kind,shelf,layouts,seq,extra,single(f,12,0)])
 displays.sort()
 require(len(displays)==17 and sum(len(s[1]) for x in displays for s in x[5])==19 and
         len({i for x in displays for s in x[5] for i in s[1]})==15,'DISPLAY_CENSUS')
 return {'schema':'wand.db01.store-layout-source@1','target':{'platform':'Steam','gameVersion':'1.26.2'},
         'sourceProtoDbSha256':PROTO,'sourceIl2cppDumpSha256':DUMP,'sourceFiles':PINS,
         'areas':areas,'displays':displays}
if __name__=='__main__':
 p=argparse.ArgumentParser()
 for k in ['protodb','itemlist','dump','output']:p.add_argument('--'+k,type=Path,required=True)
 a=p.parse_args();a.output.write_text(json.dumps(extract(a.protodb,a.itemlist,a.dump),separators=(',',':'))+'\n',encoding='utf-8')
