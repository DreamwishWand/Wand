"""Read original Unity Transform hierarchies; never infer missing bone paths."""
from math import isfinite
from zlib import crc32
from resolve_animation_bundle import Reader, unityfs, serialized_objects, digest
from pose_curves import require

def extract(data, root_name):
    revision, objects = serialized_objects(data)
    require(revision == '6000.0.62f1', 'unsupported rig version')
    names, transforms, avatars = {}, {}, []
    for pid,(cls,off,size) in objects.items():
        r=Reader(data[off:off+size])
        if cls==1:
            components=[r.unpack('iq') for _ in range(r.count(12))]
            r.take(4); n,=r.unpack('i'); name=r.take(n).decode('utf-8')
            names[pid]=(name,components)
        elif cls==4:
            fid,g=r.unpack('iq'); q=r.unpack('4f'); t=r.unpack('3f'); s=r.unpack('3f')
            kids=[r.unpack('iq') for _ in range(r.count(12))]; parent=r.unpack('iq')
            require(fid==0 and r.pos==size and all(map(isfinite,(*q,*t,*s))), 'invalid Transform')
            transforms[pid]=(g,q,t,s,kids,parent)
        elif cls==90:
            avatars.append({'name':r.string(),'pathId':str(pid),'sha256':digest(data[off:off+size])})
    roots=[pid for pid,(g,q,t,s,kids,parent) in transforms.items() if parent==(0,0) and names[g][0]==root_name]
    require(len(roots)==1,'missing or ambiguous rig root')
    rows=[]; visited=set(); hashes=set()
    def walk(pid, path, parent_index):
        require(pid not in visited and pid in transforms,'invalid rig hierarchy'); visited.add(pid)
        g,q,t,s,kids,parent=transforms[pid]
        require((0,pid) in names[g][1], 'GameObject/Transform mismatch')
        h=crc32(path.encode('utf-8')); require(h not in hashes,'duplicate path hash'); hashes.add(h)
        index=len(rows); rows.append({'path':path,'pathHash':h,'parent':parent_index,'pathId':str(pid),'translation':t,'rotation':q,'scale':s})
        for f,k in kids:
            require(f==0 and k in transforms and transforms[k][-1]==(0,pid),'child/parent mismatch')
            walk(k, (path+'/' if path else '')+names[transforms[k][0]][0],index)
    walk(roots[0],'',-1)
    return {'rootName':root_name,'unityVersion':revision,'nodes':rows,'avatarObjects':avatars,'serializedSha256':digest(data)}

def bundle_rig(raw, root_name):
    revision, files=unityfs(raw)
    require(revision=='6000.0.62f1' and len(files)==1,'unsupported rig bundle')
    name,data=next(iter(files.items())); rig=extract(data,root_name)
    return {**rig,'assetFile':name,'sourceBundleSha256':digest(raw)}

def bind(clip,rig):
    paths={n['pathHash']:i for i,n in enumerate(rig['nodes'])}
    matched=[]; unresolved=[]
    for b in clip['bindings']:
        if b['classId']==4 and b['customType']==0 and not b['pointer'] and not b['integer'] and b['attribute'] in (1,2,3,4) and b['pathHash'] in paths:
            matched.append({**b,'node':paths[b['pathHash']]})
        else:
            unresolved.append(b)
    return {'matched':matched,'unresolved':unresolved,'fullPoseVerified':False}
