"""Resolve only original ItemID-linked localization keys from audited LocDBs.
No full localization tables, original files, or arbitrary dialogue are published.
Text is kept verbatim (apart from missing/non-display sentinel detection).
"""
from __future__ import annotations
import argparse, collections, gzip, hashlib, json, re, zipfile
from pathlib import Path
import build_complete_source_master as wire

LOCALES={'en':'en-US','fr':'fr','it':'it','de':'de','es-ES':'es','ja':'ja','zh-CN':'zh-CN','pt-BR':'pt-BR'}
FIELDS=('Description','DescriptionText','EvolvingDescription','PluralDisplayName')
MARKER=re.compile(r'^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}',re.I)

def check(ok,code):
 if not ok:raise ValueError('DB01_LOCALIZED_'+str(code))
def sha(b):return hashlib.sha256(b).hexdigest()
def read_locbin(data):
 out={}
 for n,w,v in wire.fields(data):
  check(n==1 and w==2,'LOCBIN_CONTAINER')
  row=wire.fields(v)
  check(len(row)==2 and sorted((f,t) for f,t,_ in row)==[(1,2),(2,2)],'LOCBIN_ENTRY')
  k=wire.scalar(row,1,2).decode('utf8');value=wire.scalar(row,2,2).decode('utf8')
  check(k and len(k)<=1024 and len(value)<=8192 and k not in out,'LOCBIN_KEY')
  out[k]=value
 return out

def build(root,master_path,attributes_path):
 master_bytes=master_path.read_bytes();attr_bytes=attributes_path.read_bytes()
 m=json.loads(gzip.decompress(master_bytes));a=json.loads(gzip.decompress(attr_bytes))
 check(m['schema']=='wand.item-master.complete-source@1' and a['schema']=='wand.item-master.source-attributes@1' and a['masterArchiveSha256']==sha(master_bytes) and a['sourceItemsSha256']==m['sourceItemsSha256'] and a['release']==m['release'],'MASTER_IDENTITY')
 with zipfile.ZipFile(root/'db01-steam-v1262-full-source-audited-private.zip') as z:
  audit=json.loads(z.read('catalog/manifest.json'))
 check(audit['gameVersion']==m['target']['gameVersion'] and audit['platform']==m['target']['platform'] and audit['source']['all8CurrentLocdbZipShaMatched'],'AUDIT_VERSION')
 pinned=audit['source']['individualOriginalFileHashes'];rows={r['itemId']:r for r in m['items']};keys=set();links=[]
 for i,p in a['items']:
  check(i in rows,'ITEM_ID')
  if rows[i]['nativeCategory']=='Dialogue':continue
  fields={k:p[k] for k in FIELDS if k in p}
  # DisplayName is already handled by the canonical name table; do not override it.
  if not fields:continue
  check(all(isinstance(v,str) and '.' in v and re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*',v.split('.',1)[0]) for v in fields.values()),'KEY_SHAPE')
  links.append([i,fields]);keys.update(fields.values())
 by_member=collections.defaultdict(set)
 for k in keys:by_member[k.split('.',1)[0]+'.locbin'].add(k)
 translations={};evidence={};counts={}
 for locale,suffix in LOCALES.items():
  name='LocDB_'+suffix+'.zip';data=(root/name).read_bytes();meta=pinned['ddv_Data/StreamingAssets/Localization/'+name]
  check(len(data)==meta['bytes'] and sha(data)==meta['sha256'],'ARCHIVE_SHA_'+locale)
  values={};members={}
  with zipfile.ZipFile(root/name) as z:
   for member,selected in sorted(by_member.items()):
    if member not in z.namelist():continue
    b=z.read(member);check(len(b)<=16*1024*1024,'MEMBER_SIZE');table=read_locbin(b)
    members[member]=sha(b)
    for key in sorted(selected):
     v=table.get(key.split('.',1)[1])
     if v is not None and v.strip() and not MARKER.match(v):values[key]=v
  translations[locale]=dict(sorted(values.items()));counts[locale]=len(values);evidence[locale]={'archiveSha256':meta['sha256'],'members':members}
 matched_all=sum(all(key in translations[l] for l in LOCALES) for key in keys)
 fields_count=collections.Counter(k for _,p in links for k in p)
 return {'schema':'wand.item-master.localized-source@1','release':m['release'],'gameVersion':m['target']['gameVersion'],'sourceItemsSha256':m['sourceItemsSha256'],'masterArchiveSha256':sha(master_bytes),'attributesSha256':sha(attr_bytes),'count':len(links),'keyCount':len(keys),'allLocalesKeyCount':matched_all,'fieldCounts':dict(sorted(fields_count.items())),'localeCounts':counts,'evidence':evidence,'items':links,'translations':translations}

def main():
 p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--master',type=Path,required=True);p.add_argument('--attributes',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();d=build(a.input,a.master,a.attributes);b=gzip.compress(json.dumps(d,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0);a.output.write_bytes(b);print(json.dumps({k:d[k] for k in ('count','keyCount','allLocalesKeyCount','fieldCounts','localeCounts')}|{'bytes':len(b),'sha256':sha(b)},ensure_ascii=False))
if __name__=='__main__':main()
