#!/usr/bin/env python3
"""Resolve current ToM Item definitions to exact source asset references.

Uses existing DB01 wire parser, SRC04 split Addressables resolver and the
hash-pinned ToM Texture2D extractor. Private output only. Resolving a
catalog reference does NOT prove pixel fidelity, material channel semantics,
UV projection, ownership or runtime use. No original images are published.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import struct
import sys
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'db-01-items'),str(ROOT/'src-04-r2'),str(ROOT/'src-02-acquisition')]
from build_complete_source_master import frames,scalar,vals
from resolve_shop_catalog import resolve
from protodb_shop_prices import fields,one,required,all_of
from extract_tom_source_textures import unpack_bundle,serialized_objects,container_links,SOURCE_NAME
PINS={
 'TouchOfMagic.json':'78a5e5153c1a69cdcbf49b2902494322efbf564fa1a21ded4b12aecbdf36e70d',
 'Furniture.json':'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196',
 'Clothing.json':'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946',
 'protoDb.bin':'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623',
 'dump.cs':'0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08',
 'catalog.json':'d8f6f8ae340da3e30de8c46d059acbf49fc2d67e338d028fe953d02c0b285c48',
 'catalog.keyData.bin':'20be86edc02effe8f236e722ac0125459790de5415e9ba2f1456e3c85b5f6176',
 'catalog.bucketData.bin':'bcfdf91e4206bc09ea7a013a298f4f2432b9f84905deebc753776e800b07bc9e',
 'catalog.entryData.bin':'fc4a579b494b4e80c0ebfba5ca0d8d2d4abca10c34f3555b9ad84146b6aba866',
 'catalog.InternalIds.bin':'09d7a580c211d1a3606488403ea6431fdae3c63aa281152ccf3bccab7402b4c6',
}
def need(ok,msg):
 if not ok:raise ValueError(msg)
def read(path):
 b=path.read_bytes();need(hashlib.sha256(b).hexdigest()==PINS[path.name],'SOURCE_SHA_'+path.name);return b
def guid(raw):
 if raw is None:return None
 need(isinstance(raw,bytes) and re.fullmatch(rb'guid:[a-f0-9]{32}',raw),'GUID')
 return raw[5:].decode('ascii')
def native_int32(row,field):
 v=scalar(row,field,0)
 if v is None:return None
 need(0<=v<=2**64-1,'INT32')
 v=v&0xffffffff
 return v-2**32 if v>=2**31 else v
def native_float(row,field):
 v=scalar(row,field,5)
 return struct.unpack('<f',v)[0] if v is not None else None

def source_schema(dump):
 s=dump.decode('utf8')
 expected={'FurnitureItemData':{'CanAddDecals':22,'CanChangeColor':23,'PrefabAddress':5},
 'ClothingItemData':{'CanAddDecals':24,'CanChangeColor':25,'PrefabAddress':5,'MalePrefabAddress':19},
 'DecalItemData':{'IconAddress':4,'AllowColoring':7},
 'TextureItemData':{'IconAddress':4,'DefaultColor1':7,'DefaultColor2':8,'DefaultColor3':9,'DefaultGlossiness':10,'DefaultMetalness':11,'ScaleFactor':12}}
 for cls,fields_by_name in expected.items():
  m=re.search(r'(?m)^public sealed class '+cls+r'\s*:[^\n]*\n\{',s)
  need(m is not None,'CLASS_'+cls)
  body=s[m.end():s.index('\n}',m.end())]
  actual={k:int(v) for k,v in re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)}
  need(all(actual.get(k)==v for k,v in fields_by_name.items()),'FIELD_SCHEMA_'+cls)

def palette(raw):
 found=[]
 for _,wire,body in fields(raw):
  need(wire==2,'PROTO_DB_WIRE')
  envelope=fields(required(fields(body),2,2))
  if required(envelope,5,2)!=b'Meta.Customization.DesignColors':continue
  found.append(required(envelope,6,2))
 need(len(found)==1,'PALETTE_DEFINITION')
 result=[]
 for index,body in enumerate(all_of(fields(found[0]),1,2)):
  r=fields(body);color=required(r,1,2).decode('ascii');need(re.fullmatch(r'#[0-9a-fA-F]{6}',color),'COLOR')
  result.append({'index':index,'htmlColor':color,'dominantColorItemId':one(r,2,0)})
 need(len(result)==75,'PALETTE_COUNT')
 return result

def extract(streaming,dump,out):
 source_schema(read(dump))
 itemroot=streaming/'itemlist';aa=streaming/'aa'
 for n in ('catalog.json','catalog.keyData.bin','catalog.bucketData.bin','catalog.entryData.bin','catalog.InternalIds.bin'):read(aa/n)
 bases=[];components=[];seen=set()
 for name,kind,flags,subtypes,total in [('Furniture.json','furniture',(22,23),{0,3},6746),('Clothing.json','clothing',(24,25),None,2041)]:
  rows=list(frames(read(itemroot/name)));need(len(rows)==total,'SOURCE_COUNT')
  for _,_,r in rows:
   i=scalar(r,1,0);need(type(i)is int and i not in seen,'ITEM_ID');seen.add(i)
   if subtypes is not None and i//100000%100 not in subtypes:continue
   positive=[scalar(r,f,0) for f in flags]
   if positive!=[1,1]:continue
   refs={'prefab':guid(scalar(r,5,2))}
   if kind=='clothing':refs['malePrefab']=guid(scalar(r,19,2))
   need(refs['prefab'] is not None,'BASE_PREFAB')
   bases.append({'itemId':i,'kind':kind,'canAddDecals':True,'canChangeColor':True,'refs':refs})
 rows=list(frames(read(itemroot/'TouchOfMagic.json')));need(len(rows)==696,'TOM_COUNT')
 for _,_,r in rows:
  i=scalar(r,1,0);need(type(i)is int and i not in seen and i//10_000_000==10,'TOM_ITEM_ID');seen.add(i)
  sub=i//100000%100;need(sub in (0,1),'TOM_SUBTYPE')
  g=guid(scalar(r,4,2));need(g is not None and scalar(r,5,2) is None,'SOURCE_ADDRESS')
  row={'itemId':i,'kind':'motif' if sub==0 else 'texture','iconGuid':g}
  if sub==0:row['allowColoringSource']=scalar(r,7,0)
  else:row.update(defaultColorIndices=[native_int32(r,n) for n in (7,8,9)],defaultGlossiness=native_float(r,10),defaultMetalness=scalar(r,11,0),scaleFactor=native_float(r,12))
  components.append(row)
 need(Counter(r['kind'] for r in bases)=={'furniture':40,'clothing':35},'BASE_COUNT')
 need(Counter(r['kind'] for r in components)=={'motif':648,'texture':48},'COMPONENT_COUNT')
 guids={r['iconGuid'] for r in components}|{g for r in bases for g in r['refs'].values() if g}
 locations,pins=resolve(aa,guids,('UnityEngine.Sprite','UnityEngine.Texture2D','UnityEngine.GameObject'))
 need(all(pins[n]==PINS[n] for n in pins),'CATALOG_PINS')
 bundle=aa/'win'/'touchofmagic_assets_assets'/SOURCE_NAME
 file_name,serialized,_=unpack_bundle(bundle.read_bytes());objects=serialized_objects(serialized);links=container_links(objects)
 for row in components:
  g=row['iconGuid'];locs=locations[g];need(any(v['class']=='Texture2D' for v in locs),'COMPONENT_LOCATION')
  row['locations']=locs
  if row['kind']=='texture':
   need(g in links,'MATERIAL_OBJECT')
   pid=links[g];row['sourceTexture']={'pathId':str(pid),'serializedFile':file_name,'name':objects[pid][1]}
 for row in bases:
  row['locations']={key:locations[g] for key,g in row['refs'].items() if g}
  need(all(any(v['class']=='GameObject' for v in locs) for locs in row['locations'].values()),'BASE_LOCATION')
 textures=[r for r in components if r['kind']=='texture'];used={r['iconGuid'] for r in textures}
 need(len(used)==43 and len(links)==46,'MATERIAL_CENSUS')
 need(sum(len(r['locations']) for r in bases)==110,'BASE_REFERENCE_CENSUS')
 report={'schema':'wand.tom.source-bindings@1','gameVersion':'1.26.2','privateOnly':True,'publicationAuthorized':False,
  'sourceSha256':PINS,'bases':sorted(bases,key=lambda r:r['itemId']),'components':sorted(components,key=lambda r:r['itemId']),
  'palette':palette(read(streaming/'protoDb.bin')),
  'unboundTextureObjects':[{'guid':g,'pathId':str(pid),'name':objects[pid][1]} for g,pid in links.items() if g not in used],
  'counts':{'furnitureBases':40,'clothingBases':35,'motifs':648,'textures':48,'uniqueMaterialTextures':43,'basePrefabReferences':110},
  'catalogReferencesVerified':True,'materialObjectLinksVerified':True,'motifObjectPixelsVerified':False,'baseMeshVerified':False,'uvCompositionVerified':False}
 with out.open('x',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,separators=(',',':'))
 print(json.dumps(report['counts']))
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--streaming-assets',type=Path,required=True);p.add_argument('--dump',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 need(not any((p/'.git').exists() for p in a.out.resolve().parents),'PRIVATE_OUTPUT_OUTSIDE_GIT')
 extract(a.streaming_assets,a.dump,a.out)
if __name__=='__main__':main()
