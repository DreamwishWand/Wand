"""Convert native smile/wink deltas and exact scalar curves for original photo/emote clips."""
import argparse,json,math,struct,zipfile,zlib
from pathlib import Path
from resolve_animation_bundle import Reader,digest,serialized_objects,unityfs
from pose_curves import decode,require
PARAMS=('smile_small','smile_medium','smile_big','wink_left','wink_right')
SHAPES=('Smile_01','Smile_02','Smile_03','Wink_Left','Wink_Right')
PINS={'femaleRig':'38f2069245537e4b0849bd78f550d05c5b0d5d868469b1e8b2bcea38a69a55f8','femaleClips':'08f717620f43a0c99753b0ebab30981659e1e9c1f273cd09f6133fc1c5893ac1'}
def source(raw,key):
    require(digest(raw)==PINS[key],'source pin '+key);v,files=unityfs(raw);require(v=='6000.0.62f1' and len(files)==1,'bundle version');data=next(iter(files.values()));v,rows=serialized_objects(data);require(v=='6000.0.62f1','serialized version')
    return [(cls,data[o:o+n]) for cls,o,n in rows.values()]
def morph(raw):
    r=Reader(raw);name=r.string();r.take(r.count(48)*48);deltas=r.take(r.count(40)*40);frames=[r.unpack('IIBB2x') for _ in range(r.count(12))];channels={}
    for _ in range(r.count(16)):
        n=r.string();h,a,b=r.unpack('Iii');require(n not in channels and h==zlib.crc32(n.encode()),'shape identity');channels[n]=(a,b)
    weights=r.unpack(f'{r.count(4)}f');require(len(weights)==len(frames),'frame count')
    r.take(r.count(64)*64);r.take(r.count(4)*4);r.take(4);r.take(r.count(24)*24);require(r.count(4)==0 and r.take(4)[0]==0,'mesh layout');r.take(4);r.take(r.count(1));r.align();n,=r.unpack('I');require(0<n<=100000,'vertices')
    if not any(s in channels for s in SHAPES):return None
    buf=bytearray(struct.pack('<4sI',b'WEM1',n));counts=[]
    for s in SHAPES:
        a,b=channels.get(s,(-1,0));first,count=0,0
        if b:
            require(b==1 and 0<=a<len(frames) and weights[a]==100,'native single frame');first,count,norm,tan=frames[a];require(first+count<=len(deltas)//40 and count<=n and norm==tan==0,'position only')
        buf+=struct.pack('<I',count);counts.append(count);seen=set()
        for i in range(first,first+count):
            *d,index=struct.unpack_from('<9fI',deltas,i*40);require(index<n and index not in seen and all(map(math.isfinite,d)) and not any(d[3:]),'position-only expression vertex');seen.add(index);buf+=struct.pack('<I3f',index,-d[0],d[1],d[2])
    return name,n,bytes(buf),counts

def scalar(clip,i):
    if i<len(clip['stream']):return {'kind':'stream','keys':clip['stream'][i]}
    i-=len(clip['stream']);w=clip['denseCount']
    if i<w:return {'kind':'dense','begin':clip['denseBegin'],'rate':clip['denseRate'],'values':clip['dense'][i::w]}
    return {'kind':'constant','value':clip['constants'][i-w]}
def build(rig,clips,out):
    out=out.resolve();require(not any((p/'.git').exists() for p in (out,*out.parents)),'derived output outside Git')
    assets={};meshes={};rows={};fail=[];candidates=0
    for cls,raw in source(rig,'femaleRig'):
        if cls!=43 or not Reader(raw).string().startswith('female_head_'):continue
        row=morph(raw)
        if not row:continue
        name,n,data,counts=row;key=digest(data);assets[key+'.wem']=data;meshes[digest(raw)]={'name':name,'vertices':n,'frameCounts':counts,'asset':{'sha256':key,'bytes':len(data)}}
    require(len(meshes)>=20,'head morph coverage')
    hashes={zlib.crc32(p.encode()):p for p in PARAMS}
    for cls,raw in source(clips,'femaleClips'):
        if cls!=74:continue
        name=Reader(raw).string();lower=name.lower()
        if not any(s in lower for s in ('photomode','selfie','emote','face_center')):continue
        candidates+=1
        try:c=decode(raw)
        except ValueError as e:fail.append({'name':name,'sha256':digest(raw),'reason':str(e)});continue
        p={}
        for b in c['bindings']:
            if b['classId']==95 and b['customType']==0 and b['pathHash']==0 and b['attribute'] in hashes:
                require(b['pointer']==b['integer']==0 and b['dimensions']==1,'parameter layout');k=hashes[b['attribute']];require(k not in p,'duplicate parameter');p[k]=scalar(c,b['offset'])
        if p:rows[c['sha256']]={'name':name,'start':c['start'],'end':c['end'],'loop':c['loop'],'parameters':p}
    m={'schema':'wand.photo-mode.expression-weights@1','gameVersion':'1.26.2','fullPoseVerified':False,'sourcePins':PINS,'parameters':list(PARAMS),'shapeNames':list(SHAPES),'meshes':meshes,'clips':rows,'candidates':candidates,'unsupported':fail}
    with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        z.writestr('expression-weights.json',json.dumps(m,separators=(',',':'),allow_nan=False))
        for name,data in sorted(assets.items()):z.writestr(name,data)
    with zipfile.ZipFile(out) as z:require(z.testzip() is None,'archive CRC')
    print({'size':out.stat().st_size,'sha256':digest(out.read_bytes()),'meshes':len(meshes),'assets':len(assets),'clips':len(rows),'candidates':candidates,'unsupported':len(fail),'records':sum(sum(r['frameCounts']) for r in meshes.values())})
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--rig',type=Path,required=True);p.add_argument('--clips',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();build(a.rig.read_bytes(),a.clips.read_bytes(),a.out)
