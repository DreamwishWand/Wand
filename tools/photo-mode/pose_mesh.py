"""Private extraction of observed Unity 6 avatar meshes, no asset publication."""
import numpy as np
from resolve_animation_bundle import Reader, digest, serialized_objects
from pose_curves import require
from zlib import crc32

FORMATS={0:('<f4',1),1:('<f2',1),2:('u1',255),6:('u1',1),10:('<u4',1)}

def decode_mesh(data):
    r=Reader(data); name=r.string()
    sub=[r.unpack('6I6f') for _ in range(r.count(48))]
    morph=np.frombuffer(r.take(r.count(40)*40),dtype=np.dtype([('delta','<f4',(9,)),('index','<u4')]))
    shapes=[r.unpack('IIBB2x') for _ in range(r.count(12))]
    channels=[(r.string(),*r.unpack('Iii')) for _ in range(r.count(16))]
    full_weights=r.unpack(f'{r.count(4)}f')
    matrices=np.frombuffer(r.take(r.count(64)*64),dtype='<f4').reshape(-1,4,4)
    hashes=r.unpack(f'{r.count(4)}I'); root,=r.unpack('I')
    require(len(hashes)==len(matrices),'bind pose/hash count mismatch')
    r.take(r.count(24)*24); require(r.count(4)==0,'variable bone counts unsupported')
    flags=r.take(4); require(flags[0]==0,'compressed mesh unsupported')
    fmt,=r.unpack('I'); require(fmt in (0,1),'unsupported index format')
    idx=np.frombuffer(r.take(r.count(1)),dtype='<u2' if fmt==0 else '<u4');r.align()
    n,=r.unpack('I'); descriptors=[r.unpack('4B') for _ in range(r.count(4))]
    require(0<n<=1000000 and len(descriptors)==14,'unsupported vertex layout')
    raw=r.take(r.count(1));r.align(); offset=0; attrs={}
    for stream in sorted({a[0] for a in descriptors if a[3]&15}):
        used=[(i,off,f,dim&15) for i,(s,off,f,dim) in enumerate(descriptors) if s==stream and dim&15]
        spans=[]
        for i,off,f,dim in used:
            require(f in FORMATS and 1<=dim<=4,'unsupported vertex channel')
            spans.append((off,off+np.dtype(FORMATS[f][0]).itemsize*dim))
        stride=max(b for _,b in spans)
        require(sum(b-a for a,b in spans)==stride and sorted(spans)[0][0]==0 and all(a[1]==b[0] for a,b in zip(sorted(spans),sorted(spans)[1:])),'invalid stream layout')
        require(offset+n*stride<=len(raw),'short vertex stream')
        for i,off,f,dim in used:
            dt,scale=FORMATS[f];dt=np.dtype(dt)
            a=np.ndarray((n,dim),dtype=dt,buffer=raw,offset=offset+off,strides=(stride,dt.itemsize)).copy()
            attrs[i]=a.astype(np.float32)/scale if f in (0,1,2) else a
        offset=(offset+n*stride+15)&~15
    require(offset==((len(raw)+15)&~15),'unconsumed vertex data')
    require(set((0,1,13))<=attrs.keys() and attrs[0].shape==(n,3),'missing skin attributes')
    if 12 not in attrs:
        require(attrs[13].shape==(n,1),'unsupported implicit weights')
        attrs[12]=np.ones((n,1),dtype=np.float32)
    require(attrs[12].shape==attrs[13].shape and attrs[13].shape[1] in (1,4),'invalid skin attributes')
    require(all(np.isfinite(a).all() for a in attrs.values()) and np.isfinite(matrices).all(),'nonfinite mesh')
    require(np.all(attrs[13]<len(hashes)),'joint index out of range')
    require(np.max(np.abs(attrs[12].sum(axis=1)-1))<=2/255+1e-6,'unnormalized source weights')
    tris=[]
    for start,count,topology,base,first,vertices,*_ in sub:
        size=2 if fmt==0 else 4
        require(start%size==0 and topology==0 and count%3==0 and start//size+count<=len(idx),'invalid submesh')
        faces=idx[start//size:start//size+count].astype(np.uint32)+base
        require(np.all(faces<n),'vertex index out of range');tris.append(faces.reshape(-1,3))
    require(np.all(morph['index']<n) and np.isfinite(morph['delta']).all(),'invalid blend shape vertices')
    require(all(a+b<=len(morph) and c in (0,1) and d in (0,1) for a,b,c,d in shapes),'invalid blend shape range')
    require(all(0<=start<=len(shapes) and 0<=count<=len(shapes)-start for _,_,start,count in channels) and len(full_weights)==len(shapes),'invalid shape frames')
    return dict(name=name,sha256=digest(data),attrs=attrs,indices=tris,bind=matrices,boneHashes=hashes,rootHash=root,morph=morph,shapes=shapes,channels=channels,fullWeights=full_weights,unparsedTailBytes=len(data)-r.pos)

def body_source(data,sex):
    version,objects=serialized_objects(data);require(version=='6000.0.62f1','unsupported version')
    def raw(pid,cls):
        c,s,n=objects[pid];require(c==cls,'wrong object class');return data[s:s+n]
    names={}; transforms={}
    for pid,(c,s,n) in objects.items():
        r=Reader(data[s:s+n])
        if c==1:
            comps=[r.unpack('iq') for _ in range(r.count(12))];r.take(4);names[pid]=(r.string(),comps)
        elif c==4:
            f,g=r.unpack('iq');q=r.unpack('4f');t=r.unpack('3f');scale=r.unpack('3f');kids=[r.unpack('iq') for _ in range(r.count(12))];parent=r.unpack('iq')
            require(f==0 and r.pos==n,'unexpected Transform');transforms[pid]=(g,q,t,scale,kids,parent)
    roots=[p for p,(g,*_,parent) in transforms.items() if parent==(0,0) and names[g][0]=='body'+sex.title() and len(transforms[p][-2])==2]
    require(len(roots)==1,'ambiguous body root');nodes=[];lookup={};seen=set()
    def walk(pid,path,parent):
        require(pid not in seen,'cyclic transform');seen.add(pid)
        g,q,t,scale,kids,_=transforms[pid]; require((0,pid) in names[g][1],'broken GameObject reference')
        index=len(nodes);lookup[pid]=index;nodes.append(dict(path=path,pathHash=crc32(path.encode()),parent=parent,rotation=q,translation=t,scale=scale,pathId=str(pid)))
        for f,k in kids:
            require(f==0 and transforms[k][-1]==(0,pid),'broken child reference');walk(k,(path+'/' if path else '')+names[transforms[k][0]][0],index)
    walk(roots[0],'',-1)
    meshes=[p for p,(c,s,n) in objects.items() if c==43 and Reader(data[s:s+n]).string()=='Body_'+sex]
    require(len(meshes)==1,'ambiguous body mesh');mp=meshes[0];mesh=decode_mesh(raw(mp,43))
    candidates=[]
    for pid,(c,s,n) in objects.items():
        if c!=137:continue
        r=Reader(raw(pid,137));f,g=r.unpack('iq')
        if f!=0 or g not in names or names[g][0]!=mesh['name']:continue
        require((0,pid) in names[g][1],'broken renderer reference')
        r.pos=72;materials=[r.unpack('iq') for _ in range(r.count(12))];r.take(56)
        if r.unpack('iq')!=(0,mp):continue
        bones=[r.unpack('iq') for _ in range(r.count(12))]
        if not all(f==0 and b in lookup for f,b in bones):continue
        joint=[lookup[b] for f,b in bones]
        if tuple(nodes[i]['pathHash'] for i in joint)!=mesh['boneHashes']:continue
        weights=r.unpack(f'{r.count(4)}f');root=r.unpack('iq');r.take(28)
        require(r.pos==n and root[0]==0 and root[1] in lookup and nodes[lookup[root[1]]]['pathHash']==mesh['rootHash'],'unexpected renderer tail')
        require(len(materials)==len(mesh['indices']),'material/submesh mismatch')
        candidates.append((pid,joint,materials,weights))
    require(len(candidates)==1,'missing or ambiguous renderer with exact bone hashes')
    renderer,joints,materials,weights=candidates[0]
    return mesh,nodes,joints,dict(rendererPathId=str(renderer),meshPathId=str(mp),materials=[(f,str(p)) for f,p in materials],blendShapeWeights=weights)
