"""Offline DB-01 typed source attributes. Never publishes original payload bytes.
Reuses the complete master source census and its SHA-pinned IL2CPP declarations.
Only explicitly selected message schemas and scalar types are decoded. Unknown
or unsupported fields stay traceable in the v3 source-frame inventory.
"""
from __future__ import annotations
import argparse, collections, gzip, hashlib, json, math, re, struct
from pathlib import Path
import build_complete_source_master as master

SCHEMA='wand.item-master.source-attributes@1'
NESTED=frozenset(('GridAreaData','PriceOverride','CurrencyCost','ItemAmount',
 'CraftingRecipeItemData.Types.ResultInstance','CraftingRecipeItemData.Types.Ingredient',
 'CraftingRecipeItemData.Types.AppearWhenData','RecipeItemData.Types.Ingredient',
 'RecipeItemData.Types.IngredientsList','RecipeItemData.Types.TagsList',
 'CatalogVisibilityConditions','GridEditRestriction','GridEditRestriction.Types.Restriction',
 'GridEditRestriction.Types.PlaceRestriction','CollectionItemVisibility','ConditionsList'))
ROOT_MESSAGES=frozenset(('GridAreaData','PriceOverride','CatalogVisibilityConditions','GridEditRestriction',
 'CollectionVisibility','Result','Ingredients','AppearWhen','UnlockCost','SpecificUnlockCost'))
# Published strings are only source localization keys, not arbitrary source text.
LOCAL_KEYS=frozenset(('Description','DescriptionText','EvolvingDescription','DisplayName','PluralDisplayName'))
KEY=re.compile(r'[A-Za-z][A-Za-z0-9_.!:/ -]{0,255}\Z')
SCALAR=frozenset(('bool','int','uint','long','ulong','float','double'))
SKIP=frozenset(('ID','Name','GlotID','CurrencyGlotID'))

def check(ok,code):
 if not ok:raise ValueError('DB01_SOURCE_ATTRIBUTES_'+str(code))
def sha(data):return hashlib.sha256(data).hexdigest()
def declarations(dump,needed):
 schemas={};enums=set(re.findall(r'(?m)^public enum ([\w.]+) // TypeDefIndex:',dump))
 found=collections.defaultdict(list)
 for m in re.finditer(r'(?m)^public sealed class ([\w.]+)\s*:[^\n]*\n\{',dump):
  if m[1] not in needed:continue
  body=dump[m.end():dump.find('\n}',m.end())].split('// Methods',1)[0]
  fields={int(n):k for k,n in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
  props={k:t for t,k in re.findall(r'(?m)^\s*public ([\w.<>]+) (\w+) \{ get;(?: set;)? \}',body)}
  if fields:found[m[1]].append({n:(k,props[k]) for n,k in fields.items() if k in props})
 for name, candidates in found.items():
  if len(candidates)==1:schemas[name]=candidates[0]
 return schemas,enums

def scalar(value,wire,typ,enums):
 if typ=='bool':return bool(value) if wire==0 and value in (0,1) else None
 if typ in ('int','uint','long','ulong') or typ in enums or typ=='Nullable<int>':
  if wire!=0:return None
  if typ in ('int','Nullable<int>') or typ in enums:
   v=value&0xffffffff;return v-(1<<32) if v>=1<<31 else v
  if typ=='long' and value>=1<<63:value-=1<<64
  return value if -(1<<53)<value<(1<<53) else None
 if typ=='float' and wire==5:v=struct.unpack('<f',value)[0]
 elif typ=='double' and wire==1:v=struct.unpack('<d',value)[0]
 else:return None
 return v if math.isfinite(v) else None

def extract(wire,cls,schemas,enums,*,root=False):
 schema=schemas[cls];group=collections.defaultdict(list);out={};unknown=[]
 for n,w,v in wire:group[n].append((w,v))
 for n,values in sorted(group.items()):
  if n not in schema:unknown.append(n);continue
  key,typ=schema[n]
  if root and key in SKIP:continue
  repeated=typ.startswith('RepeatedField<');inner=typ[14:-1] if repeated else typ
  if inner in SCALAR or inner in enums or inner=='Nullable<int>':
   # Only known packed varint lists and the already verified fixed32 GridAreaData.Layers.
   if repeated:
    if cls=='GridAreaData' and key=='Layers':
     if all(w==5 or w==2 and len(v)%4==0 for w,v in values):
      out[key]=[x[0] for w,v in values for x in struct.iter_unpack('<I',v)]
     else:unknown.append(n)
    elif (not root or key in ('Tags','Villages','IncompatibleWith','IncompatibleWithItem','RequiredFurnitures')) and inner in ('int','uint'):
     decoded=[];ok=True
     for w,v in values:
      if w==0:decoded.append(scalar(v,0,inner,enums))
      elif w==2:
       p=0
       while p<len(v):x,p=master.varint(v,p);decoded.append(scalar(x,0,inner,enums))
      else:ok=False
     if ok and all(x is not None for x in decoded):out[key]=decoded
     else:unknown.append(n)
    else:unknown.append(n)
   elif len(values)==1 and (v:=scalar(values[0][1],values[0][0],inner,enums)) is not None:out[key]=v
   else:unknown.append(n)
  elif root and key in LOCAL_KEYS and inner=='string' and len(values)==1 and values[0][0]==2:
   try:v=values[0][1].decode('utf8')
   except UnicodeError:v=''
   if KEY.fullmatch(v) and '.' in v:out[key]=v
   else:unknown.append(n)
  elif inner in NESTED and inner in schemas and (not root or key in ROOT_MESSAGES) and all(w==2 for w,v in values):
   decoded=[]
   for w,v in values:
    child,unresolved=extract(master.fields(v),inner,schemas,enums)
    if unresolved:child['_unresolvedFields']=unresolved
    decoded.append(child)
   if repeated:out[key]=decoded
   elif len(decoded)==1:out[key]=decoded[0]
   else:unknown.append(n)
  else:unknown.append(n)
 return out,unknown

def build(root,release):
 source=json.loads(gzip.decompress(release.read_bytes()));check(source['schema']=='wand.item-master.complete-source@1','MASTER_SCHEMA')
 dump=(root/'dump.cs').read_bytes();check(sha(dump)==source['sourceIl2cppDumpSha256'],'DUMP_SHA')
 rows={r['itemId']:r for r in source['items']};check(len(rows)==source['count'],'MASTER_COUNT')
 needed={r['sourceClass'] for r in rows.values() if r['sourceClass']}|NESTED
 schemas,enums=declarations(dump.decode('utf8'),needed)
 output=[];coverage=collections.Counter();unresolved=collections.Counter();seen=set()
 for family,expected in sorted(source['sourceFilesSha256'].items()):
  data=(root/(family+'.json')).read_bytes();check(sha(data)==expected,'SOURCE_SHA_'+family)
  for off,n,wire in master.frames(data):
   i=master.scalar(wire,1,0);r=rows[i];check(i not in seen and r['nativeCategory']==family and r['sourceFrame']==[off,n] and master.scalar(wire,2,2).decode()==r['nativeKey'],'IDENTITY');seen.add(i)
   cls=r['sourceClass']
   if not cls or cls not in schemas:unresolved[family]+=1;continue
   props,unknown=extract(wire,cls,schemas,enums,root=True)
   # Existing v3 fields are not duplicated unless richer nested data is new.
   for k,v in r['nativeProperties'].items():
    if k in props:check(props[k]==v,'SCALAR_MISMATCH_'+str(i)+'_'+k);props.pop(k)
   # Existing name and tag data stays canonical; keep source localization keys.
   if not props:continue
   for k in props:coverage[k]+=1
   output.append([i,props])
 check(seen==set(rows),'ORIGINAL_CENSUS')
 output.sort(key=lambda r:r[0]);check(len(output)==len({r[0] for r in output}),'OUTPUT_CENSUS')
 return {'schema':SCHEMA,'release':source['release'],'gameVersion':source['target']['gameVersion'],
  'sourceItemsSha256':source['sourceItemsSha256'],'masterArchiveSha256':sha(release.read_bytes()),'definitionCount':len(rows),
  'count':len(output),'coverage':dict(sorted(coverage.items())), 'unmappedSourceClassCount':dict(unresolved),
  'allOriginalFieldSemanticsVerified':False,'gridLayerOccupancyVerified':False,'runtimePriceVerified':False,'items':output}

def main():
 p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--master',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();d=build(a.input,a.master);body=gzip.compress(json.dumps(d,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode(),compresslevel=9,mtime=0);a.output.write_bytes(body);print(json.dumps({'count':d['count'],'coverage':d['coverage'],'unmapped':d['unmappedSourceClassCount'],'sha256':sha(body),'bytes':len(body)}))
if __name__=='__main__':main()
