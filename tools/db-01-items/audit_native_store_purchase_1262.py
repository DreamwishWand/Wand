#!/usr/bin/env python3
"""Read-only source verification for native store and purchase lookup rules.

Only aggregate counts and audited rule metadata are returned. No private
price-provider amounts, individual cache rows, game instructions or saves
are exported. Exact Steam 1.26.2 originals are required.
"""
import argparse
from collections import Counter
import hashlib
import json
import re
import struct
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src-02-acquisition'))
from acquisition import frames, wire, single
from extract_public_iap import fields, one, strings, PROTO_SHA, PROTO_BYTES, EXPECTED_RECORDS
from audit_native_price_provider_registry_1262 import original_price_provider_census

PINS={
 'GameAssembly.dll':'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653',
 'dump.cs':'0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08',
 'Furniture.json':'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196',
 'Clothing.json':'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946',
}
# Original relative file offsets in the SHA-authenticated Windows build:
# the il2cpp section has a verified RVA-to-file displacement of 0x1800.
WINDOWS=(
 (0x410813c,48,'8155b505f5cd3d2191a43354e8c393ebd063901647f1ed5754ad93b071a89a4e'),
 (0xf6c9d0,8,'f735d0fc9d977dae4106869f19103860041ce8fe3fcea5a380c84ac3a66f7df4'),
 (0xff8b70,8,'b96a99bb019c6c196f2d811c580adcf2028e3696b8a30e4838ae8294f6715cb7'),
 (0x410806a,48,'72028d492bf0938cd7f64912037fe13ab0b3c6ae2696a65092291ec0f8d447ff'),
 (0x410810b,49,'c37d4063adc632b85c8bf905120c0de04bfd498c13d41b3d2a07fbc226037512'),
 (0x41080a0,18,'66f834479adcf1ef9107eb480df32dc0157c5b6d877902e2d80360f211b58e49'),
 (0x37c91f0,8,'163c95912674c5738efefaa6da090487c58957c11c975cfb8d4479259179f95f'),
 (0xaa6440,8,'a2b9905bb83a58f4063dc0d01cb011ce0324f0b9e43ddbde411581c1192174ae'),
 (0x383ab10,10,'0d3a66f75f5697f2e94fd328359de1da1d0ec500322f901c3eeff4b1b63c49a0'),
 (0x383ab9a,4,'3b9112f85b93c8bee80d192c8f678356a68ca8d15e32b026647571265be67f6f'),
 (0x383abcd,10,'962301f6d839b4d0a1f764814453ace58a3a776a4a38aad390045e167dae28da'),
 (0x383b0cb,10,'c01ba620afdaddf4e7a0bed2c62161c4fe2e4c99a49eb3f628e129be3f489be5'),
 (0x383b179,24,'c455514d6b5622cc2e911dde0205087d6bb096f062f444ef975928bd2b269255'),
 (0x4a55385,9,'1016c74cd17988108feb64ccf6ff93d6fb86baaeb0f212a8f40f65f111c8f222'),
 (0x4a5540d,32,'24d9a44c2c539ce193d166b3a31701cbb293fdba602bbd347d4c7ed9615be38f'),
)
# Direct call edges: explicit override first, formula/provider paths later,
# transaction callers, then the actual store generator's structural/state filters.
CALLS=(
 (0x383ab3b,0x403ad10),(0x383abbf,0x403ad10),
 (0x383aca5,0x4017ac0),(0x383ad1f,0x17f8160),
 (0x383b117,0x403ad10),
 (0x4604845,0x383a8c0),(0x4605c98,0x383a8c0),
 (0x45e285a,0x383a8c0),(0x4a5858c,0x383ae60),
 (0x4a50200,0x41080c0),(0x4a5022f,0x36d8d70),
 (0x4a5032c,0x4a552d0),(0x4a53a9f,0x38a6770),
)
def require(ok,code):
 if not ok:raise ValueError('DB01_NATIVE_PURCHASE_'+code)
def sha(b):return hashlib.sha256(b).hexdigest()
def authenticated(path,name):
 b=path.read_bytes();require(sha(b)==PINS[name],'SOURCE_'+name);return b

def resolve_native_interfaces(raw,schema):
 # Resolve encoded type references through the native metadata registration.
 count,table_va=struct.unpack_from('<QQ',raw,0x8c86e80)
 require(count==0x23eff and table_va==0x188d831b0,'TYPE_REGISTRATION')
 table=table_va-0x180000000-0x2400
 require(table==0x8d80db0 and table+count*8<=0x9831e00,'TYPE_TABLE_RANGE')
 for slot,expected_index,expected_definition,name in [
     (0x9bd90a0,69924,11069,'IIsHiddable'),
     (0x9bd9558,68775,11029,'IAvailability'),
     (0x9b57de8,69925,11006,'IIsMissionItem')]:
  encoded=struct.unpack_from('<Q',raw,slot-0x3200)[0]
  require(encoded==(0x20000001|(expected_index<<1)),'TYPE_ENCODING')
  va=struct.unpack_from('<Q',raw,table+expected_index*8)[0]
  offset=va-0x180000000-0x3200
  require(0x9831e00<=offset<0xa0d7200-16,'TYPE_DESCRIPTOR_RANGE')
  definition,bits=struct.unpack_from('<QI',raw,offset)
  require(definition==expected_definition and bits==0x00120000,'TYPE_DESCRIPTOR')
  require(f'public interface {name} // TypeDefIndex: {definition}' in schema,'TYPE_NAME')
 require(re.search(r'public interface IAvailability[^\n]*\n\{.*?Slot: 0\s*public abstract bool get_IsUnavailableForGenerator\(\);',schema,re.S) is not None,
         'AVAILABILITY_SLOT')

def audit(assembly,dump,proto,itemlist):
 raw=authenticated(assembly,'GameAssembly.dll')
 require(len(raw)==176820736,'DLL_SIZE')
 schema=authenticated(dump,'dump.cs').decode('utf-8')
 resolve_native_interfaces(raw,schema)
 for cls,n in [('FurnitureItemData',21),('ClothingItemData',23),
               ('FenceAndRoadItemData',13),('LandscapingItemData',11)]:
  match=re.search(r'^public sealed class '+cls+r'\s*:[^\n]+\n\{',schema,re.M)
  require(match is not None and 'IPriceOverrider' in match[0],'INTERFACE_'+cls)
  body=schema[match.end():schema.index('\n}',match.end())]
  require(f'public const int PriceOverrideFieldNumber = {n};' in body,'FIELD_'+cls)
 for cls,field,generator in [('FurnitureItemData',24,50),('ClothingItemData',29,33)]:
  match=re.search(r'^public sealed class '+cls+r'\s*:[^\n]+\n\{',schema,re.M)
  require(match is not None and 'IIsHiddable' in match[0],'HIDDEN_INTERFACE_'+cls)
  body=schema[match.end():schema.index('\n}',match.end())]
  require(f'public const int IsHiddenFieldNumber = {field};' in body,'HIDDEN_FIELD_'+cls)
  require('IAvailability' in match[0] and f'public const int IsUnavailableForGeneratorFieldNumber = {generator};' in body,'GENERATOR_FIELD_'+cls)
 require('public abstract bool get_IsHidden();' in schema,'HIDDEN_INTERFACE_METHOD')
 for token in ['public const PriceOverride.OverrideOneofCase Price = 2;',
               'private PriceOverride.OverrideOneofCase overrideCase_; // 0x20',
               'public const ItemType Furniture = 4;',
               'public const FurnitureItemType Default = 0;',
               'public const FurnitureItemType Door = 3;',
               'private int id_; // 0x18','private int amount_; // 0x1C']:
  require(token in schema,'SCHEMA')
 for a,n,h in WINDOWS:
  require(sha(raw[a-0x1800:a-0x1800+n])==h,'NATIVE_WINDOW')
 for a,target in CALLS:
  data=raw[a-0x1800:a-0x1800+5]
  require(len(data)==5 and data[0]==0xe8 and a+5+int.from_bytes(data[1:],'little',signed=True)==target,'NATIVE_CALL')
 original=proto.read_bytes()
 original_price_provider_census(original)
 require(len(original)==PROTO_BYTES and sha(original)==PROTO_SHA,'PROTO_SHA')
 entries=fields(original);require(len(entries)==EXPECTED_RECORDS,'PROTO_CENSUS')
 providers={}
 for _,_,rec in entries:
  meta=fields(one(fields(rec),2));typ=strings(meta,5);payload=one(meta,6)
  if typ=='Definitions.Shops.DynamicItemPriceDatase':
   payload=one(fields(payload),3)
  elif typ!='Definitions.Shops.ItemPriceDatabase':continue
  for _,_,row in fields(payload):
   r=fields(row);i=one(r,1);require(i not in providers,'DUP_PROVIDER')
   providers[i]=[(one(fields(v),1),one(fields(v),2)) for n,w,v in r if n==2 and w==2]
 require(len(providers)==9537,'PROVIDER_CENSUS')
 counts=Counter();gate=Counter();screen=Counter()
 for family,base in [('Furniture',40000000),('Clothing',50000000)]:
  for i,f in frames(authenticated(itemlist/(family+'.json'),family+'.json'),base):
   if family=='Furniture':gate[i//100000 in (400,403)]+=1
   if family=='Furniture' and i//100000 not in (400,403):screen['excluded_by_furniture_type']+=1
   else:
    hidden=single(f,24 if family=='Furniture' else 29,0)
    require(hidden in (None,0,1),'HIDDEN_WIRE')
    unavailable=single(f,50 if family=='Furniture' else 33,0)
    require(unavailable in (None,0,1),'GENERATOR_WIRE')
    screen['excluded_by_hidden' if hidden else 'excluded_by_generator' if unavailable else 'not_excluded_by_reviewed_gates']+=1
   n=23 if family=='Clothing' else {400:21,403:21,401:13,407:13,402:11}.get(i//100000)
   if n is None:continue
   value=single(f,n,2)
   if value is None:continue
   w=wire(value);p=single(w,2,2)
   if p is None:continue
   require(single(w,1,0) is None,'ONEOF')
   cost=wire(p);c,a=single(cost,1,0,True),single(cost,2,0,True)
   require(c>0 and 0<=a<=2147483647,'PRICE')
   row=providers.get(i)
   match=('no_provider' if row is None else 'exact' if (c,a) in row else
          'currency_missing' if c not in dict(row) else 'amount_differs')
   counts[match]+=1
 require(counts=={'amount_differs':808,'no_provider':302,'exact':25,'currency_missing':21},'OVERRIDE_CENSUS')
 require(gate=={True:5288,False:1458},'FURNITURE_GATE_CENSUS')
 require(screen=={'excluded_by_furniture_type':1458,'excluded_by_hidden':1537,
                 'excluded_by_generator':3344,'not_excluded_by_reviewed_gates':2448},'STORE_SCREEN_CENSUS')
 return {'gameVersion':'1.26.2','platform':'Steam','nativeWindowsVerified':len(WINDOWS),
  'nativeCallEdgesVerified':len(CALLS),'matchingCurrencyExplicitOverridePrecedesProviders':True,
  'furnitureTypeGatePassed':gate[True],'furnitureTypeGateRejected':gate[False],
  'storeDisplayScreen':dict(screen),'nativeNotBuyableInterfaceIdentitiesVerified':True,
  'otherNativeConditionsVerified':False,
  'overrideProviderComparison':dict(counts),'storeMembershipVerified':False,'liveTransactionVerified':False,
  'privateProviderValuesExported':False}
if __name__=='__main__':
 p=argparse.ArgumentParser()
 for k in ['assembly','dump','proto','itemlist']:p.add_argument('--'+k,type=Path,required=True)
 a=p.parse_args();print(json.dumps(audit(a.assembly,a.dump,a.proto,a.itemlist),indent=2))
