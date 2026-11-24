#!/usr/bin/env python3
"""Reproduce default currency Item-ID references and verify native lookup branches.

Steam 1.26.2 only. Outputs derived Item-ID relations, not original bytes,
private provider price rows, or a live purchase quote.
"""
import argparse
from collections import Counter
import hashlib
import json
import re
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src-02-acquisition'))
from acquisition import frames, single

PINS={'Furniture':'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196',
      'Clothing':'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946'}
DUMP_SHA='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'
DLL_SHA='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'
CLASSES={'FurnitureItemData':18,'LandscapingItemData':10,'FenceAndRoadItemData':11,'ClothingItemData':20}
BANDS={400:'FurnitureItemData',403:'FurnitureItemData',402:'LandscapingItemData',
       401:'FenceAndRoadItemData',407:'FenceAndRoadItemData'}
WINDOWS=[
 (0x4109f19,98,'90e0563f642b1a87a0c3e60d0ab8ee22d60e94f0a9e661c8bdc5a28bca1903c5'),
 (0x4109f8b,47,'01ead62db6d8898cdebb9124adfe6ae7503269a04d8efde24c4541e391fb59e6'),
 (0x410a032,53,'46e6e8817b02904a05a753b80df92dffb64d2dbe1f644cbf0be99d5618554d68'),
 (0x40db856,18,'7b58752267fe9fe6bb64e95d35c2f67b79fb7f9c9291405013d51c31481e2fdd'),
 (0x3bacb81,25,'ac60dd47a076ebb76288eb8b0edb8ac7c712c12bf5bf0d223052e0c985a22c05'),
 (0x3c38411,28,'8e183d87072f9403b2f38a732c1ed92c9f6a3917850ffb72a6fd8768fdc0201f'),
 (0x3be9c51,25,'dec4b9339f190c5d96fbd29d40554196d0d3687d7c6e6df79858d219c34b5fc6'),
 (0x3bcf571,25,'33be429d0813cc178d1776f7ce4e547140e9efee8d620c736678764d4ad1fe52'),
]
def sha(b):return hashlib.sha256(b).hexdigest()
def require(v,code):
    if not v:raise ValueError('DB01_PURCHASE_CURRENCY_'+code)
def extract(root,dump_path,dll_path):
    dump=dump_path.read_bytes();dll=dll_path.read_bytes()
    require(sha(dump)==DUMP_SHA and sha(dll)==DLL_SHA,'SOURCE_SHA')
    text=dump.decode('utf-8')
    for cls,n in CLASSES.items():
        m=re.search(r'^public sealed class '+cls+r'\s*:[^\n]+\n\{',text,re.M)
        require(m is not None and 'IGenericBuyable' in m[0],'CLASS_'+cls)
        body=text[m.end():text.index('\n}',m.end())]
        require(f'public const int DefaultCurrencyItemIDFieldNumber = {n};' in body,'DECLARATION_'+cls)
    for address,size,digest in WINDOWS:
        require(sha(dll[address-0x1800:address-0x1800+size])==digest,'NATIVE_WINDOW')
    for address,target in [(0x4109f70,0x383a8c0),(0x4109fb3,0x383ae60)]:
        b=dll[address-0x1800:address-0x1800+5]
        require(b[0]==0xe8 and address+5+int.from_bytes(b[1:],'little',signed=True)==target,'NATIVE_CALL')
    coverage=Counter();out=[]
    for category,base in [('Furniture',40000000),('Clothing',50000000)]:
        raw=(root/(category+'.json')).read_bytes()
        require(sha(raw)==PINS[category],'ORIGINAL_'+category)
        for item,fields in frames(raw,base):
            cls=BANDS.get(item//100000) if category=='Furniture' else 'ClothingItemData'
            if not cls:continue
            coverage[cls]+=1
            value=single(fields,CLASSES[cls],0)
            if value is not None:out.append([item,value])
    require(coverage=={'FurnitureItemData':5288,'LandscapingItemData':526,
                       'FenceAndRoadItemData':374,'ClothingItemData':2041},'CENSUS')
    require(Counter(v for _,v in out)=={80000000:41,80100000:7},'CURRENCY_CENSUS')
    return {'schema':'wand.db01.default-purchase-currency@1',
            'target':{'platform':'Steam','gameVersion':'1.26.2'},'sourceFiles':PINS,
            'sourceIl2cppDumpSha256':DUMP_SHA,
            'coverage':dict(coverage),'rows':sorted(out)}
if __name__=='__main__':
    p=argparse.ArgumentParser()
    for k in ['itemlist','dump','assembly','output']:p.add_argument('--'+k,type=Path,required=True)
    a=p.parse_args()
    a.output.write_text(json.dumps(extract(a.itemlist,a.dump,a.assembly),separators=(',',':'))+'\n',encoding='utf-8')
