"""Owner-private DB-01 source extraction. No publishable runtime assets are emitted."""
import argparse, collections, hashlib, json, math, pathlib, re, sqlite3, struct, zipfile
from build_complete_source_master import item_class

def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def varint(b,p):
    v=0
    for k in range(10):
        if p>=len(b):raise ValueError('truncated varint')
        c=b[p];p+=1;v|=(c&127)<<(7*k)
        if c<128:
            require(v<2**64,'varint overflow');return v,p
    raise ValueError('long varint')
def fields(b):
    p=0
    while p<len(b):
        start=p;tag,p=varint(b,p);n,w=tag>>3,tag&7;require(0<n<2**29,'invalid field number')
        if w==0:v,p=varint(b,p)
        elif w==2:
            l,p=varint(b,p);require(p+l<=len(b),'truncated bytes');v=b[p:p+l];p+=l
        elif w in (1,5):
            l=8 if w==1 else 4;require(p+l<=len(b),'truncated fixed');v=b[p:p+l];p+=l
        else:raise ValueError('unsupported wire type')
        yield n,w,v,b[start:p]
def frames(b):
    p=0;seen=set()
    while p<len(b):
        off,p=varint(b,p);l,p=varint(b,p);require(off not in seen and 0<l<=len(b)-p,'invalid frame');seen.add(off)
        yield p,b[p:p+l];p+=l

def declarations(s):
    msgs=collections.defaultdict(list);enums=collections.defaultdict(list)
    for m in re.finditer(r'^// Namespace: ([^\n]*)\npublic (sealed class|enum) ([\w.]+)[^\n]*\n\{\n(.*?)^\}',s,re.M|re.S):
        ns,kind,name,body=m.groups();q=f'{ns}.{name}' if ns else name
        if kind=='enum':
            vals={int(v,0):k for k,v in re.findall(r'public const [\w.]+ (\w+) = (-?(?:0x[0-9a-fA-F]+|\d+));',body)}
            enums[name].append((q,vals));continue
        nums=re.findall(r'public const int (\w+)FieldNumber = (\d+);',body)
        if not nums and not re.search(r'public sealed class '+re.escape(name)+r' : IMessage<',m[0].split('\n{',1)[0]):continue
        props={k:t.strip() for t,k in re.findall(r'^\s*public ([\w.<> ,]+?) (\w+) \{ get;[^}]*\}',body,re.M)}
        msgs[name].append((q,{int(n):(k,props.get(k)) for k,n in nums}))
    return msgs,enums

def unique(defs,t,context):
    a=defs.get(t,[])
    if len(a)==1:return a[0]
    ns=context.rsplit('.',1)[0];same=[v for v in a if v[0]==ns+'.'+t]
    return same[0] if len(same)==1 else None

def decode(data,decl,msgs,enums,prefix='',depth=0):
    q,d=decl if decl else ('',{});counts=collections.Counter()
    for n,w,v,raw in fields(data):
        name,t=d.get(n,(f'#{n}',None));j=counts[n];counts[n]+=1;path=f'{prefix}{name}[{j}]'
        status='unresolved';value=None;child=None;inner=t or ''
        repeated=inner.startswith('RepeatedField<');inner=inner[14:-1] if repeated else inner
        inner=inner[9:-1] if inner.startswith('Nullable<') else inner
        enum=unique(enums,inner,q);msg=unique(msgs,inner,q)
        if w==0 and (inner in ('int','uint','long','ulong','bool') or enum):
            if inner=='bool' and v not in (0,1):pass
            else:
                value=bool(v) if inner=='bool' else str(v) if v>2**53-1 else v;status='varint_wire_value'
        elif w==2 and inner=='string':
            try:value=v.decode('utf-8');status='declared_utf8'
            except UnicodeDecodeError:pass
        elif w==2 and inner=='ByteString':status='declared_bytes'
        elif (w,inner) in ((5,'float'),(1,'double')):
            x=struct.unpack('<f' if w==5 else '<d',v)[0]
            if math.isfinite(x):value=x;status='declared_float'
        elif w==2 and repeated and q.endswith('.GridAreaData') and name=='Layers' and len(v)%4==0:
            value=list(struct.unpack('<'+'I'*(len(v)//4),v));status='fixed32_grid_layers'
        elif w==2 and repeated and (inner in ('int','uint','long','ulong','bool') or enum):
            try:
                pos=0;xs=[]
                while pos<len(v):
                    x,pos=varint(v,pos);xs.append(str(x) if x>2**53-1 else x)
                value=xs;status='packed_varint_wire_values'
            except ValueError:pass
        elif w==2 and msg and depth<32:
            try:child=list(decode(v,msg,msgs,enums,path+'.',depth+1));status='declared_message'
            except ValueError:child=None
        yield (path,re.sub(r'\[\d+\]','',path),q or None,n,w,t,status,json.dumps(value,ensure_ascii=False,separators=(',',':')) if value is not None else None,raw)
        if child is not None:yield from child

def build(root,catalog,types,out):
    with zipfile.ZipFile(catalog) as z:
        manifest=json.loads(z.read('catalog/manifest.json'));payload=z.read('catalog/items.jsonl')
        require(sha(payload)==manifest['outputSha256']['items.jsonl'],'catalog SHA mismatch');items={r['itemId']:r for r in map(json.loads,payload.splitlines())}
    with zipfile.ZipFile(types) as z:
        tm=json.loads(z.read('manifest.json'));require(tm['sourceItemsSha256']==sha(payload),'type catalog mismatch');typed={}
        for name,meta in tm['files'].items():
            b=z.read(name);require(sha(b)==meta['sha256'],'type shard SHA mismatch')
            for r in json.loads(b):require(r['itemId'] not in typed,'duplicate type ID');typed[r['itemId']]=r
    require(set(items)==set(typed) and len(items)==manifest['counts']['currentDefinitions']==tm['definitionCount'],'catalog ID mismatch')
    dump=(root/'dump.cs').read_bytes();require(sha(dump)==tm['sourceIl2cppDumpSha256'],'dump SHA mismatch');msgs,enums=declarations(dump.decode('utf-8-sig'))
    originals={pathlib.Path(k).name:v for k,v in manifest['source']['individualOriginalFileHashes'].items() if '/itemlist/' in k}
    require(originals,'missing original manifest');out=pathlib.Path(out);require(not out.exists(),'output exists')
    db=sqlite3.connect(out);db.executescript('''PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE item(item_id INTEGER PRIMARY KEY,category TEXT NOT NULL,native_name TEXT,source_class TEXT,source_payload_offset INTEGER,source_sha256 TEXT NOT NULL,catalog_json TEXT NOT NULL,type_json TEXT NOT NULL,frame BLOB NOT NULL);
CREATE TABLE field(item_id INTEGER NOT NULL,path TEXT NOT NULL,field_key TEXT NOT NULL,declaring_class TEXT,field_number INTEGER NOT NULL,wire INTEGER NOT NULL,declared_type TEXT,status TEXT NOT NULL,value_json TEXT,raw BLOB NOT NULL,PRIMARY KEY(item_id,path),FOREIGN KEY(item_id) REFERENCES item(item_id));''')
    seen=set();stats=collections.Counter();root_stats=collections.Counter();classes=set();paths=set();unmapped=0
    for fn,meta in sorted(originals.items()):
        b=(root/fn).read_bytes();require(len(b)==meta['bytes'] and sha(b)==meta['sha256'],'source mismatch '+fn)
        for offset,raw in frames(b):
            ff=list(fields(raw));ids=[v for n,w,v,_ in ff if n==1 and w==0];require(len(ids)==1,'missing ID');i=ids[0]
            r=items[i];t=typed[i];require(i not in seen and r['nativeCategory']==fn[:-5] and t['sourceSha256']==meta['sha256'] and [v.decode('utf-8') for n,w,v,_ in ff if n==2 and w==2]==[r['nativeNameField']],'frame identity mismatch');seen.add(i)
            cls=item_class(r['nativeCategory'],t['subtypeCode']);decl=unique(msgs,cls or '', 'Definitions.Items.Root');unmapped+=decl is None
            if decl:classes.add(decl[0])
            db.execute('INSERT INTO item VALUES(?,?,?,?,?,?,?,?,?)',(i,r['nativeCategory'],r['nativeNameField'],decl[0] if decl else None,offset,meta['sha256'],json.dumps(r,ensure_ascii=False,separators=(',',':')),json.dumps(t,separators=(',',':')),raw))
            batch=list(decode(raw,decl,msgs,enums));db.executemany('INSERT INTO field VALUES(?,?,?,?,?,?,?,?,?,?)',((i,*x) for x in batch))
            for path,field_key,declaring_class,n,w,ty,status,val,blob in batch:
                stats[status]+=1;paths.add((decl[0] if decl else r['nativeCategory'],re.sub(r'\[\d+\]','[]',path)))
                if '.' not in path:root_stats[status]+=1
            require(sum('.' not in x[0] for x in batch)==len(ff),'root field count mismatch')
    require(seen==set(items),'incomplete original coverage')
    report={'schema':'wand.db01.native-fields.private@1','platform':tm['platform'],'gameVersion':tm['gameVersion'],'sourceItemsSha256':sha(payload),'sourceIl2cppDumpSha256':sha(dump),'sourceFiles':len(originals),'itemCount':len(seen),'mappedRootClasses':len(classes),'unmappedItems':unmapped,'fieldOccurrences':sum(stats.values()),'rootOccurrences':sum(root_stats.values()),'distinctClassPaths':len(paths),'statusCounts':dict(sorted(stats.items())),'rootStatusCounts':dict(sorted(root_stats.items())),'publicationAuthorized':False,'runtimeSemanticsVerified':False}
    db.execute('INSERT INTO metadata VALUES(?,?)',('manifest',json.dumps(report,sort_keys=True)));db.executescript('CREATE INDEX field_key ON field(field_key,item_id); CREATE INDEX field_value ON field(field_key,value_json,item_id) WHERE value_json IS NOT NULL; CREATE INDEX field_status ON field(status,item_id); CREATE INDEX item_category ON item(category,item_id);');db.commit();require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLite integrity');db.close();return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',required=True,type=pathlib.Path);p.add_argument('--catalog',required=True);p.add_argument('--types',required=True);p.add_argument('--output',required=True);a=p.parse_args();print(json.dumps(build(a.input,a.catalog,a.types,a.output),ensure_ascii=False,indent=2))
