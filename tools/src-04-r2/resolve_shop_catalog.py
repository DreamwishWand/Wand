"""Resolve Shop image GUIDs from a local split Addressables catalog.
Private offline output; no image generation or publication.
"""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

FILES = ('catalog.json','catalog.keyData.bin','catalog.bucketData.bin','catalog.entryData.bin','catalog.InternalIds.bin')
GUID = re.compile(r'guid:([a-f0-9]{32})')

def read_offers(paths):
    rows=[]
    for path in paths:
        outer=json.loads(path.read_bytes())
        for key,encoded in outer['Data'].items():
            snap=json.loads(encoded) if isinstance(encoded,str) else encoded
            if snap['OnlineId']!=key: raise ValueError('snapshot mismatch')
            seen=set()
            for c in snap['Categories']:
                for root in c['Data'].values():
                    entries=[(None,o) for o in root.get('Bundles',[])]+[(st['Id'],o) for st in root.get('Stores',[]) for o in st['Data'].get('BundleContents',[])]
                    for store,o in entries:
                        v=o['Data']; oid=o['Id']
                        if v['OnlineId']!=oid or oid in seen: raise ValueError('offer mismatch')
                        seen.add(oid); refs=[]
                        def add(field,val):
                            if not val:return
                            m=GUID.fullmatch(val) if isinstance(val,str) else None
                            refs.append({'field':field,'guid':m[1]} if m else {'field':field,'status':'unsupported_address'})
                        for f in ('Image','Background'):add(f,v.get(f))
                        for i,x in enumerate(v['Contents']):add(f'Contents.{i}.Image',x.get('Image'))
                        for i in range(1,5):add(f'MegaBundleAdjustment.OverridedImage{i}',(v.get('MegaBundleAdjustment') or {}).get(f'OverridedImage{i}'))
                        rows.append({'snapshot':key,'offerId':oid,'storeId':store,'refs':refs})
    return rows

def resolve(root,targets,resource_classes=('UnityEngine.Sprite','UnityEngine.Texture2D')):
    raw={f:(root/f).read_bytes() for f in FILES}; d=json.loads(raw[FILES[0]])
    k,b,e=(raw[f] for f in FILES[1:4]); ids=raw[FILES[4]].decode('utf-8-sig').splitlines()
    n=struct.unpack_from('<i',e)[0]; count=struct.unpack_from('<i',b)[0]
    if n<0 or len(e)!=4+28*n or count<0 or count!=struct.unpack_from('<i',k)[0]:raise ValueError('catalog header mismatch')
    pos=4; buckets=[]; hits={}
    for _ in range(count):
        off,size=struct.unpack_from('<ii',b,pos);pos+=8
        if size<0 or not 4<=off<len(k) or pos+4*size>len(b):raise ValueError('invalid bucket')
        entries=struct.unpack_from(f'<{size}i',b,pos);pos+=4*size
        if any(not 0<=i<n for i in entries):raise ValueError('invalid entry index')
        buckets.append(entries)
        if k[off]==0 and off+37<=len(k) and struct.unpack_from('<i',k,off+1)[0]==32:
            guid=k[off+5:off+37].decode('ascii',errors='replace')
            if guid in targets:
                if guid in hits:raise ValueError('duplicate GUID key')
                hits[guid]=entries
    if pos!=len(b):raise ValueError('bucket size mismatch')
    def entry(i):
        a=struct.unpack_from('<7i',e,4+28*i)
        if not 0<=a[0]<len(ids) or not 0<=a[6]<len(d['m_resourceTypes']):raise ValueError('invalid catalog location')
        return a
    result={}
    for g in sorted(targets):
        candidates=[]
        for i in hits.get(g,()):
            a=entry(i);cls=d['m_resourceTypes'][a[6]]['m_ClassName']
            if cls not in resource_classes:continue
            if a[2]!=-1 and not 0<=a[2]<len(buckets):raise ValueError('invalid dependency index')
            deps=[ids[entry(j)[0]] for j in buckets[a[2]]] if a[2]>=0 else []
            candidates.append({'class':cls.split('.')[-1],'internalId':ids[a[0]],'dependencies':deps})
        result[g]=candidates
    return result,{f:hashlib.sha256(v).hexdigest() for f,v in raw.items()}

def main():
    p=argparse.ArgumentParser();p.add_argument('--catalog',type=Path,required=True);p.add_argument('--cache',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    out=a.out.resolve()
    if any((x/'.git').exists() for x in out.parents):raise ValueError('private output must stay outside Git')
    offers=read_offers(a.cache);targets={r['guid'] for o in offers for r in o['refs'] if 'guid' in r};locs,pins=resolve(a.catalog,targets)
    result={'schema':'wand.media.private-shop-catalog-locations@1','privateOnly':True,'publicationAuthorized':False,'catalogSha256':pins,'offers':offers,'locations':locs}
    with out.open('x',encoding='utf-8') as f:json.dump(result,f,indent=2)
    print(json.dumps({'offers':len(offers),'guids':len(targets),'matched':sum(bool(v) for v in locs.values()),'serializedObjectMappingVerified':False},indent=2))
if __name__=='__main__':main()
