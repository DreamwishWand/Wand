"""Recover generic optimized Unity 6 Avatar rigs from the original serialized Avatar.
Only the observed no-axis layout is accepted; no humanoid retargeting is inferred.
"""
import struct
from zlib import crc32
import numpy as np
from resolve_animation_bundle import Reader, digest
from pose_curves import require
from pose_deform import world
from pose_mesh import decode_mesh


def avatar_nodes(raw):
    r=Reader(raw);name=r.string();size,=r.unpack('I')
    require(name and 0<size<len(raw),'invalid Avatar header')
    parents=[r.unpack('ii') for _ in range(r.count(8))]
    n=len(parents);require(1<n<=4096 and all(-1<=p<i and axis==-1 and (p==-1)==(i==0) for i,(p,axis) in enumerate(parents)),'unsupported Avatar skeleton')
    hashes=r.unpack(f'{r.count(4)}I');require(len(hashes)==n and len(set(hashes))==n and hashes[0]==0,'invalid Avatar hashes')
    require(r.count(1)==0,'Avatar axes unsupported')
    rest=[r.unpack('10f') for _ in range(r.count(40))];default=[r.unpack('10f') for _ in range(r.count(40))]
    require(len(rest)==len(default)==n and np.isfinite(rest).all() and np.array_equal(rest,default),'different or invalid Avatar rest/default pose')
    candidates=[]
    for pos in range(r.pos,len(raw)-4,4):
        if struct.unpack_from('<I',raw,pos)[0]!=n:continue
        q=Reader(raw);q.pos=pos+4;paths={}
        try:
            for _ in range(n):
                h,=q.unpack('I');path=q.string();require(h in hashes and h not in paths and crc32(path.encode())==h,'invalid Avatar path')
                paths[h]=path
            require(set(paths)==set(hashes) and paths[0]=='','Avatar path coverage')
            require(all(paths[hashes[i]].rpartition('/')[0]==paths[hashes[p]] for i,(p,_) in enumerate(parents) if i),'Avatar path parent mismatch')
            candidates.append(paths)
        except (ValueError,UnicodeError,struct.error):continue
    require(len(candidates)==1,'missing or ambiguous Avatar path table');paths=candidates[0]
    nodes=[]
    for i,((p,_),h,a) in enumerate(zip(parents,hashes,rest)):
        require(abs(np.linalg.norm(a[3:7])-1)<1e-3 and all(abs(x)>1e-8 for x in a[7:]),'invalid Avatar transform')
        nodes.append(dict(path=paths[h],pathHash=h,parent=p,translation=a[:3],rotation=a[3:7],scale=a[7:],pathId='avatar:'+str(h)))
    return nodes


def optimized_meshes(source,root,avatar_raw):
    nodes=avatar_nodes(avatar_raw);lut={n['pathHash']:i for i,n in enumerate(nodes)};w=world(nodes)
    prefab,_=source.hierarchy(root);parts=[]
    for n in prefab:
        for f,p in source.names[int(n['gameObject'])][1]:
            if f or source.objects[p][0]!=137:continue
            r=Reader(source.raw(p,137));require(r.unpack('iq')==(0,int(n['gameObject'])),'renderer backlink');r.pos=72
            materials=[source.reference(r.unpack('iq')) for _ in range(r.count(12))];r.take(56);mf,mp=r.unpack('iq');bones=[r.unpack('iq') for _ in range(r.count(12))];weights=r.unpack(f'{r.count(4)}f');rb=r.unpack('iq');r.take(28)
            require(r.pos==len(r.data) and mf==0 and not bones,'not an optimized renderer')
            m=decode_mesh(source.raw(mp,43));require(m['rootHash'] in lut and all(h in lut for h in m['boneHashes']),'Avatar bone hashes missing')
            i=lut.get(n['pathHash']);require(i is not None and nodes[i]['path']==n['path'],'Avatar mesh path missing')
            j=[lut[h] for h in m['boneHashes']];err=float(np.max(np.abs(w[j]@m['bind']-w[i])));require(err<1e-4 and len(materials)==len(m['indices']),'Avatar bind or material mismatch')
            parts.append((i,m,j,dict(rendererPathId=str(p),meshPathId=str(mp),meshSha256=m['sha256'],bindMatrixMaxError=err,materialSlotCount=len(materials),submeshCount=len(m['indices']),materials=[[c,str(p)] for c,p in materials],blendShapeWeights=weights,avatarSha256=digest(avatar_raw))))
    require(parts,'no optimized skinned mesh');return nodes,parts


def restore_hierarchy(prefab,animator_index,nodes):
    a=prefab[animator_index];prefix=a['path'];require(prefix and a['parent']>=0,'unsupported optimized Animator root')
    require(all(np.allclose(a[k],nodes[0][k],atol=1e-6) for k in ('translation','rotation','scale')),'Avatar root transform mismatch')
    full=[];mapping={}
    for i,n in enumerate(prefab):
        if n['path'].startswith(prefix+'/'):continue
        mapping[i]=len(full);full.append({**n,'parent':mapping[n['parent']] if n['parent']>=0 else -1})
    base=mapping[animator_index];nodes[0]['pathId']=a['pathId']
    indices={0:base}
    for i,n in enumerate(nodes[1:],1):
        indices[i]=len(full);full.append({**n,'path':prefix+'/'+n['path'],'parent':indices[n['parent']]})
    return full
