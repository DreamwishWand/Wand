"""Build converted face morphs from original Steam 1.26.2 resources and avatar bundles."""
import argparse,json,math,struct,zipfile
from pathlib import Path
from resolve_animation_bundle import Reader,digest,serialized_objects,unityfs
from pose_mesh import decode_mesh
from pose_curves import require

ROLES=('nose','mouth','jaw')
SEXES=('male','female')

def config(raw,sex):
    r=Reader(raw);r.take(28);require(r.string()==sex.title()+'AvatarConfig','avatar config name')
    require(r.unpack('i')==(int(sex=='male'),),'avatar gender')
    def reference():
        guid,sub,typ=(r.string() for _ in range(3));require(len(guid)==32 and all(c in '0123456789abcdef' for c in guid),'avatar asset GUID');return guid
    require(r.count(12)==8,'head options');heads=[reference() for _ in range(8)]
    require(len(set(heads))==8 and r.count(24)==6,'body options')
    for _ in range(6):
        r.string();weight,=r.unpack('i');reference();r.string();require(weight==100,'body weight')
    groups={}
    for role in ('eyes',*ROLES):
        require(r.count(32)==8,'face options');rows=[]
        for i in range(8):
            weight,=r.unpack('f');name=r.string();reference();normal=reference()
            require(math.isfinite(weight) and 0<=weight<=150 and name==('' if role=='eyes' or i==0 else 'head_'+role+'_'+chr(65+i)),'face option layout')
            rows.append((name,weight,normal))
        groups[role]=rows
    require(r.pos==len(raw),'unconsumed avatar config')
    return groups

def morph_asset(raw,groups,sex):
    m=decode_mesh(raw);require(m['name']==sex+'_head_skull','skull mesh')
    morph=m['morph'];shapes=m['shapes'];channels={name:(start,count) for name,_,start,count in m['channels']}
    require(len(channels)==len(m['channels']),'duplicate channel')
    weights=m['fullWeights'];vertices=len(m['attrs'][0]);require(0<vertices<=100000,'vertex count')
    out=bytearray(struct.pack('<4sI',b'WFM1',vertices))
    for role in ROLES:
        for name,intensity,_ in groups[role][1:]:
            start,count=channels[name];require(count==1 and 0<=start<len(shapes) and weights[start]==100,'single native frame')
            first,n,normal,tangent=shapes[start];require(first+n<=len(morph) and n<=vertices and normal==tangent==0,'native position-only frame')
            out+=struct.pack('<I',n);seen=set()
            for row in morph[first:first+n]:
                index=int(row['index']);delta=[float(x) for x in row['delta']]
                require(index<vertices and index not in seen and all(math.isfinite(v) for v in delta),'morph vertex');seen.add(index)
                w=intensity/100;out+=struct.pack('<I3f',index,-delta[0]*w,delta[1]*w,delta[2]*w)
    return bytes(out),vertices

def objects(raw):
    version,files=unityfs(raw);require(version=='6000.0.62f1','bundle version')
    for data in files.values():
        version,rows=serialized_objects(data);require(version=='6000.0.62f1','serialized version')
        for cls,start,n in rows.values():yield cls,data[start:start+n]

def build(resources,bundles,out):
    conf={};pins={'configResources':digest(resources)};assets={};manifest={}
    version,rows=serialized_objects(resources);require(version=='6000.0.62f1','config resources version')
    for cls,start,n in rows.values():
        raw=resources[start:start+n]
        if cls!=114 or len(raw)<32:continue
        r=Reader(raw);r.take(28)
        try:name=r.string()
        except (ValueError,UnicodeError):continue
        for sex in SEXES:
            if name==sex.title()+'AvatarConfig':require(sex not in conf,'duplicate avatar config');conf[sex]=raw
    require(set(conf)==set(SEXES),'missing avatar config')
    for sex in SEXES:
        groups=config(conf[sex],sex);pins[sex+'Config']=digest(conf[sex]);pins[sex+'Bundle']=digest(bundles[sex]);rows={}
        for cls,raw in objects(bundles[sex]):
            if cls!=43 or Reader(raw).string()!=sex+'_head_skull':continue
            data,vertices=morph_asset(raw,groups,sex);key=digest(data);mesh=digest(raw);require(mesh not in rows,'duplicate source skull')
            assets[key]=data;rows[mesh]={'vertices':vertices,'asset':{'sha256':key,'bytes':len(data)}}
        require(len(rows)==8,'skull source coverage');manifest[sex]=rows
    m={'schema':'wand.photo-mode.face-morphs@1','gameVersion':'1.26.2','sourcePins':pins,'fullPoseVerified':False,'items':manifest}
    with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        z.writestr('face-morphs.json',json.dumps(m,separators=(',',':'),allow_nan=False))
        for key,data in sorted(assets.items()):z.writestr(key+'.wfm',data)
    with zipfile.ZipFile(out) as z:
        require(z.testzip() is None and set(z.namelist())=={'face-morphs.json',*(k+'.wfm' for k in assets)},'archive integrity')
    print(json.dumps({'size':out.stat().st_size,'sha256':digest(out.read_bytes()),'sourcePins':pins,'meshes':sum(map(len,manifest.values())),'assets':len(assets)},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path,required=True);p.add_argument('--male',type=Path,required=True);p.add_argument('--female',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    out=a.out.resolve();require(not any((x/'.git').exists() for x in out.parents),'local output only');build(a.config.read_bytes(),{s:getattr(a,s).read_bytes() for s in SEXES},out)
