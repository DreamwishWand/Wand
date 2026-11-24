"""Extract only ItemList-linked localization text from SHA-pinned game sources."""
import argparse,base64,collections,hashlib,json,re,sqlite3,zipfile,zlib
from pathlib import Path
from build_full_native_fields import fields
LOCALES={'en':'en-US','fr':'fr','it':'it','de':'de','es-ES':'es','ja':'ja','zh-CN':'zh-CN','pt-BR':'pt-BR'}
MARKER=re.compile(r'^\s*\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}',re.I)
def require(ok,msg):
 if not ok:raise ValueError(msg)
def sha(b):return hashlib.sha256(b).hexdigest()
def read_locbin(b):
 out={}
 for n,w,v,_ in fields(b):
  require((n,w)==(1,2),'container');a=list(fields(v));require(len(a)==2 and sorted((x[0],x[1]) for x in a)==[(1,2),(2,2)],'entry')
  d={x[0]:x[2].decode('utf8') for x in a};require(d[1] and d[1] not in out and len(d[1])<=1024 and len(d[2])<=8192,'entry identity');out[d[1]]=d[2]
 return out

def build(root,dbpath):
 with zipfile.ZipFile(root/'db01-steam-v1262-full-source-audited-private.zip') as z:a=json.loads(z.read('catalog/manifest.json'))
 require(a['source']['all39ItemlistsShaMatched'] and a['source']['all8CurrentLocdbZipShaMatched'],'audit');pinned=a['source']['individualOriginalFileHashes']
 with sqlite3.connect(dbpath.resolve().as_uri()+'?mode=ro',uri=True) as db:
  m=json.loads(db.execute("select value from metadata where key='manifest'").fetchone()[0]);require(m['gameVersion']==a['gameVersion'] and m['platform']==a['platform'],'version')
  for cat,h in db.execute('select distinct category,source_sha256 from item'):
   require(sha((root/(cat+'.json')).read_bytes())==h,'item source '+cat)
  # Verify raw string envelope, not just the SQLite decoded value.
  candidates=collections.defaultdict(set);links=collections.Counter();fields_by_key=collections.defaultdict(set)
  for i,path,k,n,v,raw in db.execute("select item_id,path,field_key,field_number,value_json,raw from field where status='declared_utf8'"):
   value=json.loads(v);p,sep,q=value.partition('.')
   if not sep or not q or not re.fullmatch(r'[A-Za-z0-9_/-]+',p):continue
   r=list(fields(raw));require(len(r)==1 and r[0][:2]==(n,2) and r[0][2].decode('utf8')==value,'source string');candidates[p+'.locbin'].add(value);links[value]+=1;fields_by_key[value].add(k)
  translations={};evidence={};member_union=set();exact=set();non_display=set()
  for loc,suffix in LOCALES.items():
   name='LocDB_'+suffix+'.zip';b=(root/name).read_bytes();meta=pinned['ddv_Data/StreamingAssets/Localization/'+name];require(len(b)==meta['bytes'] and sha(b)==meta['sha256'],'archive '+loc)
   values={};members={}
   with zipfile.ZipFile(root/name) as z:
    for member in sorted(set(z.namelist())&candidates.keys()):
     raw=z.read(member);require(len(raw)<=16*1024*1024,'member size');table=read_locbin(raw);members[member]=sha(raw);member_union.add(member)
     for k in sorted(candidates[member]):
      v=table.get(k.split('.',1)[1]);
      if v is not None:
       exact.add(k)
       if v.strip() and not MARKER.match(v):values[k]=v
       else:non_display.add(k)
   translations[loc]=values;evidence[loc]={'archiveSha256':meta['sha256'],'members':members}
  present=set().union(*(t.keys() for t in translations.values()));all8={k for k in present if all(k in t for t in translations.values())};field_counts=collections.Counter(k for key in exact for k in fields_by_key[key]);print('exact',len(exact),'present',len(present),'all8',len(all8),'links',sum(links[k] for k in exact),'members',len(member_union),'fields',len(field_counts),'marker',len(non_display));print('counts', {l:len(t) for l,t in translations.items()});print('fields',field_counts.most_common());
  # Avoid republishing root names already present in the canonical name projection.
  selected={k for k in present if fields_by_key[k]!={'DisplayName'}}
  print('non-name selected',len(selected),'all8',len(selected&all8));print('bytes by locale', {loc:len(zlib.compress(json.dumps({k:v for k,v in t.items() if k in selected},ensure_ascii=False,separators=(',',':')).encode(),9)) for loc,t in translations.items()})
  return m,translations,evidence,selected,exact,links,fields_by_key
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--database',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();m,t,e,selected,exact,links,fields_by_key=build(a.input,a.database);a.output.mkdir(exist_ok=True,parents=True)
 # Publish one source-linked, compressed locale archive per locale; keys are
 # sorted and the build generates selectively loadable smaller blocks.
 for loc,values in t.items():
  vals={k:values[k] for k in sorted(selected&values.keys())};packed=base64.b64encode(zlib.compress(json.dumps(vals,ensure_ascii=False,separators=(',',':')).encode(),9)).decode()
  obj={'schema':'wand.item-master.linked-localizations@1','gameVersion':m['gameVersion'],'sourceItemsSha256':m['sourceItemsSha256'],'sourceIl2cppDumpSha256':m['sourceIl2cppDumpSha256'],'locale':loc,'count':len(vals),'sourceArchiveSha256':e[loc]['archiveSha256'],'packed':packed};b=(json.dumps(obj,separators=(',',':'))+'\n').encode();path=a.output/f'linked-localizations-steam-{m["gameVersion"]}-{loc}.json';path.write_bytes(b);path.with_suffix('.txt').write_text('\n'.join('DB01:'+b[j:j+800].decode() for j in range(0,len(b)-1,800))+'\n');print(path.name,len(b),sha(b),hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest())
