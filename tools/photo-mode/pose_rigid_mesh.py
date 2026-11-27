"""Observed Unity 6 rigid mesh and streamed resource decoding.

The packed tangent frame remains unresolved; geometric normals are explicitly
derived only for diagnostic rendering. Rigid weights are a rendering projection,
not a claim that the source mesh was skinned.
"""
import re
import numpy as np
from resolve_animation_bundle import Reader, digest
from pose_curves import require

def decode_rigid(data,resources):
    r=Reader(data);name=r.string();sub=[r.unpack('6I6f') for _ in range(r.count(48))]
    for width in (40,12,16,4,64,4):require(r.count(width)==0,'non-rigid mesh data')
    root,=r.unpack('I');require(root==0,'rigid mesh root hash')
    require(r.count(24)==0 and r.count(4)==0,'rigid bone data')
    flags=r.take(4);require(flags[0]==0,'compressed rigid mesh')
    fmt,=r.unpack('I');require(fmt in (0,1),'index format')
    idx=np.frombuffer(r.take(r.count(1)),dtype='<u2' if fmt==0 else '<u4');r.align()
    n,=r.unpack('I');desc=[r.unpack('4B') for _ in range(r.count(4))];require(0<n<=1000000 and len(desc)==14,'vertex layout')
    raw=r.take(r.count(1));r.align();tail_start=r.pos
    if not raw:
        candidates=[]
        for pos in range(tail_start,len(data)-16,4):
            t=Reader(data);t.pos=pos
            try:
                off,size=t.unpack('QI');path=t.string()
                if t.pos==len(data) and re.fullmatch(r'archive:/CAB-[0-9a-f]+/CAB-[0-9a-f]+\.resS',path):candidates.append((off,size,path))
            except (ValueError,UnicodeError):continue
        require(len(candidates)==1,'ambiguous mesh resource');off,size,path=candidates[0];key=path.rsplit('/',1)[-1]
        require(key in resources and size>0 and off+size<=len(resources[key]),'mesh resource bounds');raw=resources[key][off:off+size]
    formats={0:('<f4',1),1:('<f2',1),2:('u1',255),3:('i1',127),6:('u1',1),10:('<u4',1)}
    attrs={};offset=0
    for stream in sorted({a[0] for a in desc if a[3]&15}):
        used=[(i,off,f,dim&15) for i,(s,off,f,dim) in enumerate(desc) if s==stream and dim&15];spans=[]
        for i,off,f,dim in used:
            require(f in formats and 1<=dim<=4,'unsupported rigid channel');spans.append((off,off+np.dtype(formats[f][0]).itemsize*dim))
        stride=max(b for _,b in spans);require(sum(b-a for a,b in spans)==stride and sorted(spans)[0][0]==0 and all(a[1]==b[0] for a,b in zip(sorted(spans),sorted(spans)[1:])),'rigid stream layout');require(offset+n*stride<=len(raw),'short rigid stream')
        for i,off,f,dim in used:
            dt,scale=formats[f];dt=np.dtype(dt);a=np.ndarray((n,dim),dtype=dt,buffer=raw,offset=offset+off,strides=(stride,dt.itemsize)).copy();attrs[i]=a.astype(np.float32)/scale if f in (0,1,2,3) else a
        offset=(offset+n*stride+15)&~15
    require(offset==((len(raw)+15)&~15),'unconsumed rigid vertex data')
    require(0 in attrs and attrs[0].shape[1] in (3,4) and 4 in attrs and attrs[4].shape==(n,2) and not {12,13}&attrs.keys(),'invalid rigid geometry')
    require(all(np.isfinite(x).all() for x in attrs.values()),'nonfinite rigid geometry')
    attrs[0]=attrs[0][:,:3].copy();tris=[]
    for start,count,topology,base,first,vertices,*_ in sub:
        size=2 if fmt==0 else 4;require(start%size==0 and topology==0 and count%3==0 and start//size+count<=len(idx),'invalid submesh');faces=idx[start//size:start//size+count].astype(np.uint32)+base;require(np.all(faces<n),'vertex bounds');tris.append(faces.reshape(-1,3))
    require(tris,'missing faces')
    derived=1 not in attrs
    if derived:
        normal=np.zeros((n,3),dtype=np.float64);pos=attrs[0].astype(np.float64)
        for tri in tris:
            v=pos[tri];face=np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0])
            for k in range(3):np.add.at(normal,tri[:,k],face)
        length=np.linalg.norm(normal,axis=1);require(np.all(length>1e-12),'undefined geometric normal');attrs[1]=(normal/length[:,None]).astype(np.float32)
    else:require(attrs[1].shape==(n,3),'unsupported normal layout')
    attrs[13]=np.zeros((n,1),dtype=np.uint16);attrs[12]=np.ones((n,1),dtype=np.float32)
    return dict(name=name,sha256=digest(data),attrs=attrs,indices=tris,bind=np.eye(4,dtype=np.float32)[None,:,:],normalsDerived=derived)

def rigid_meshes(source,root,resources):
    nodes,_=source.hierarchy(root);parts=[]
    for k,n in enumerate(nodes):
        go=int(n['gameObject']);components=[(source.objects[p][0],p) for f,p in source.names[go][1] if f==0]
        renderers=[p for c,p in components if c==23];filters=[p for c,p in components if c==33]
        require(not any(c==137 for c,p in components),'mixed skinned/rigid actor')
        if not renderers and not filters:continue
        require(len(renderers)==len(filters)==1,'ambiguous rigid renderer')
        r=Reader(source.raw(go,1));r.take(r.count(12)*12);r.take(4);r.string();require(r.take(len(r.data)-r.pos)==bytes((0,0,1)),'unsupported inactive object')
        r=Reader(source.raw(filters[0],33));require(r.unpack('iq')==(0,go),'mesh filter backlink')
        mf,mp=r.unpack('iq');require(mf==0 and r.pos==len(r.data),'external rigid mesh')
        r=Reader(source.raw(renderers[0],23));require(r.unpack('iq')==(0,go) and r.take(1)==b'\x01','disabled renderer')
        r.pos=72;materials=[source.reference(r.unpack('iq')) for _ in range(r.count(12))]
        require(r.take(len(r.data)-r.pos)==bytes(72),'unsupported renderer tail')
        m=decode_rigid(source.raw(mp,43),resources);require(len(materials)==len(m['indices']),'material slot mismatch')
        parts.append((k,m,[k],dict(rendererPathId=str(renderers[0]),meshPathId=str(mp),meshSha256=m['sha256'],
            vertices=len(m['attrs'][0]),triangles=sum(map(len,m['indices'])),bindMatrixMaxError=0.,
            materialSlotCount=len(materials),submeshCount=len(m['indices']),materials=[[c,str(p)] for c,p in materials],
            normalsDerived=m['normalsDerived'])))
    require(parts,'missing rigid mesh');return nodes,parts
