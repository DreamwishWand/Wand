"""Project official Shop titles from the game's localized protobuf files.
Only exact native ID + English title joins from authenticated source snapshots.
Never emit name-only candidates or infer contents/availability from localization.
"""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path

LOCALES = ['en','fr','it','de','es-ES','ja','zh-CN','pt-BR']
NAMES = {'en':'en-US','es-ES':'es'}
PINS = {
'en':'792b400f79bd29440d2d6d624c16e92ce380a3b927ebf2c7e9b7f19121acda86',
'ja':'071e495bc199898078f75c3c5aef51f1c7abc92da699a65578d109fbb9bd7758',
'de':'bf545ab41e59ae2a28974d4ce8ff1d3e926ee0b7a196caf5fa1f46d5d9802538',
'fr':'2769b7694887f0cd4331c01ebe63faa2b933f45c4e25b54434a2ba32249ec970',
'it':'dae2f265496cb60a525cd170f82f82b5e21f8194dcf9140865a57284360cbdbf',
'es-ES':'7daabcde7b39e152eee704216f5ed80e0c7a0a3ed7235f5b474e045c02cedaf5',
'pt-BR':'ef5e376fc1f9f0f72e82bd85839d4241c7c037412c7fe68c7cddbaa6e5c67b16',
'zh-CN':'977b8f9b8568cf6e2aac8d46f558e2748ba32e54bd9bf443c8175227ca80993c'}
CACHE_PINS = {'233c03e73d22503dba2f6b0961ecaa8f36ac7ef16848bb88c35e2d86f696b1ff',
'01a561793ecaa253457e89797da03e929ca8bb8e3dac7d257d786215584468a5',
'd8e3d2bfe2707e8f00562adb19c98fb87efa21e9a6ac7d07370894712043b238',
'efed915841a02dcc5fa181a74b2064d2c8e1666014e495b4727182c04303162a'}
def digest(b): return hashlib.sha256(b).hexdigest()
def varint(data,i):
    v=0
    for shift in range(0,70,7):
        if i>=len(data): raise ValueError('truncated varint')
        x=data[i];i+=1;v|=(x&127)<<shift
        if x<128:return v,i
    raise ValueError('invalid varint')
def fields(data):
    i=0
    while i<len(data):
        t,i=varint(data,i)
        if t&7!=2 or t>>3==0:raise ValueError('unexpected locbin field')
        n,i=varint(data,i)
        if n>len(data)-i:raise ValueError('truncated field')
        yield t>>3,data[i:i+n];i+=n
def read_locale(path,locale):
    raw=path.read_bytes()
    if digest(raw)!=PINS[locale]:raise ValueError('locale archive mismatch')
    with zipfile.ZipFile(path) as z:b=z.read('Liveops.locbin')
    result={}
    for tag,entry in fields(b):
        if tag!=1:raise ValueError('unexpected locbin entry')
        f=dict(fields(entry))
        k=f[1].decode()
        if k in result:raise ValueError('duplicate key')
        result[k]=f.get(2,b'').decode()
    return result
def clean(s):
    return s.replace('<nobr>','').replace('</nobr>','').replace('\u200b','').replace('\u00ad','')
def extract(root,caches):
    texts={loc:read_locale(root/('LocDB_'+NAMES.get(loc,loc)+'.zip'),loc) for loc in LOCALES}
    seen=set(); titles={}
    for path in caches:
        raw=path.read_bytes();pin=digest(raw)
        if pin not in CACHE_PINS or pin in seen:raise ValueError('cache mismatch')
        seen.add(pin)
        for key,encoded in json.loads(raw)['Data'].items():
            snap=json.loads(encoded)
            if snap['OnlineId']!=key or snap['Language']!='en-US':raise ValueError('cache identity')
            for c in snap['Categories']:
                for root in c['Data'].values():
                    entries=root.get('Bundles',[])+[o for st in root.get('Stores',[]) for o in st['Data'].get('BundleContents',[])]
                    for o in entries:
                        d=o['Data'];oid=o['Id']
                        if d['OnlineId']!=oid or d['Language']!='en-US':raise ValueError('offer identity')
                        if d.get('Title'):titles.setdefault(oid,set()).add(d['Title'])
    if seen!=CACHE_PINS:raise ValueError('incomplete cache set')
    rows=[]
    for oid,values in sorted(titles.items()):
        key=oid+'_Title'
        if len(values)!=1 or texts['en'].get(key) not in values:continue
        vals=[texts[l].get(key) for l in LOCALES]
        if not all(vals):continue
        rows.append([oid,*[clean(s) for s in vals]])
    return {'schema':'wand.shop.bundle-localized-titles@1','locales':LOCALES,'rows':rows}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--loc-root',type=Path,required=True)
    p.add_argument('--cache',type=Path,action='append',required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    data=json.dumps(extract(a.loc_root,a.cache),ensure_ascii=False,separators=(',',':')).encode()
    with a.out.open('xb') as f:f.write(data)
    print(len(data),digest(data))
