"""Resolve native garment and hair geometry to shared body rig for private diagnostics."""
import argparse,json,struct
from pathlib import Path
from zlib import crc32
import numpy as np
from resolve_animation_bundle import Reader,serialized_objects,unityfs,digest
from pose_mesh import decode_mesh,body_source
from pose_curves import require
from pose_deform import world
from pose_glb import Glb,trs,REFLECT


def read_objects(raw):
    version,files=unityfs(raw)
    require(version=='6000.0.62f1' and len(files)==1,'unsupported bundle')
    data=next(iter(files.values()));version,objects=serialized_objects(data)
    require(version=='6000.0.62f1','unsupported serialized file')
    return data,objects


def garment(raw,sex,body,prefab_guid):
    data,objects=read_objects(raw)
    def obj(pid,cls):
        c,s,n=objects[pid];require(c==cls,'wrong object class');return data[s:s+n]
    names={};trans={};entries=[]
    for pid,(cls,s,n) in objects.items():
        r=Reader(data[s:s+n])
        if cls==1:
            components=[r.unpack('iq') for _ in range(r.count(12))];r.take(4);names[pid]=(r.string(),components)
        elif cls==4:
            f,g=r.unpack('iq');q=r.unpack('4f');t=r.unpack('3f');scale=r.unpack('3f');kids=[r.unpack('iq') for _ in range(r.count(12))];par=r.unpack('iq')
            require(f==0 and r.pos==n,'invalid transform');trans[pid]=(g,q,t,scale,kids,par)
        elif cls==142:
            r.string();count=r.count(12);r.take(count*12)
            for _ in range(r.count(24)):
                key=r.string();start,length,f,x=r.unpack('iiiq')
                require(start>=0 and length>=0 and start+length<=count,'invalid preload range')
                entries.append((key,f,x))
    roots=[(pid,g) for pid,(g,q,t,s,kids,par) in trans.items() if par==(0,0) and len(kids)==2 and names[g][0].endswith('_'+sex) and (prefab_guid,0,g) in entries]
    require(len(roots)==1,'missing or ambiguous garment geometry root for GUID')
    rows=[];lookup={}
    def walk(pid,path,parent):
        require(pid not in lookup,'cyclic transform');g,q,t,s,kids,_=trans[pid];require((0,pid) in names[g][1],'broken transform');lookup[pid]=len(rows);rows.append(dict(path=path,parent=parent,translation=t,rotation=q,scale=s,gameObject=g))
        for f,k in kids:
            require(f==0 and trans[k][-1]==(0,pid),'broken child reference');walk(k,(path+'/' if path else '')+names[trans[k][0]][0],lookup[pid])
    walk(roots[0][0],'',-1);gw=world(rows);bw=world(body);bp={n['path']:i for i,n in enumerate(body)};require(len(bp)==len(body),'duplicate body path')
    parts=[]
    for i,n in enumerate(rows):
        for f,pid in names[n['gameObject']][1]:
            if f or objects[pid][0]!=137:continue
            r=Reader(obj(pid,137));require(r.unpack('iq')==(0,n['gameObject']),'broken renderer');r.pos=72;materials=[r.unpack('iq') for _ in range(r.count(12))];r.take(56);mf,mp=r.unpack('iq');bones=[r.unpack('iq') for _ in range(r.count(12))];weights=r.unpack(f'{r.count(4)}f');root=r.unpack('iq');r.take(28)
            require(mf==0 and r.pos==len(r.data) and all(f==0 and b in lookup for f,b in bones),'unresolved garment reference')
            m=decode_mesh(obj(mp,43));paths=[rows[lookup[b]]['path'] for f,b in bones];require(tuple(crc32(p.encode()) for p in paths)==m['boneHashes'],'bone hash mismatch');require(all(p in bp for p in paths),'missing shared body bone');j=[bp[p] for p in paths]
            require(root[0]==0 and root[1] in lookup and crc32(rows[lookup[root[1]]]['path'].encode())==m['rootHash'],'root hash mismatch');err=float(np.max(np.abs(bw[j]@m['bind']-gw[i])));require(err<1e-4,'garment bind mismatch')
            require(len(materials)==len(m['indices']),'material/submesh count mismatch')
            parts.append(dict(mesh=m,node=n,joints=j,error=err,rendererPathId=str(pid),meshPathId=str(mp),materials=materials,weights=weights,prefabGuid=prefab_guid,bundleSha256=digest(raw)))
    require(len(parts)==1,'unsupported multi-renderer garment geometry')
    return parts[0]


def append_outfit(raw,body,parts):
    magic,v,size=struct.unpack_from('<4sII',raw);require((magic,v,size)==(b'glTF',2,len(raw)),'invalid GLB');n,tag=struct.unpack_from('<I4s',raw,12);require(tag==b'JSON','invalid JSON chunk');g=Glb();g.doc=json.loads(raw[20:20+n]);size,tag=struct.unpack_from('<I4s',raw,20+n);require(tag==b'BIN\0' and 28+n+size==len(raw),'invalid BIN chunk');g.bin=bytearray(raw[28+n:]);d=g.doc
    require(d['asset']['extras']['privateOnly'] is True and d['asset']['extras']['fullPoseVerified'] is False and all(x['name']==(y['path'] or 'body') for x,y in zip(d['nodes'],body)) and len(d['nodes'])>=len(body),'body rig mismatch')
    # Neutral colours are diagnostic, not game materials. Body masking is not inferred.
    colors={'top':[.22,.37,.50,1],'bottom':[.19,.23,.31,1],'shoes':[.8,.8,.8,1],'hair':[.18,.12,.08,1]}
    for role,part in parts.items():
        m=part['mesh'];a=m['attrs'];j=a[13];w=a[12];j=np.pad(j,((0,0),(0,4-j.shape[1])));w=np.pad(w,((0,0),(0,4-w.shape[1])));w=w/w.sum(axis=1,keepdims=True)
        attrs={'POSITION':g.add(a[0]*[-1,1,1],'VEC3','<f4',34962,True),'NORMAL':g.add(a[1]*[-1,1,1],'VEC3','<f4',34962),'JOINTS_0':g.add(j,'VEC4','<u2',34962),'WEIGHTS_0':g.add(w,'VEC4','<f4',34962)}
        if 4 in a:attrs['TEXCOORD_0']=g.add(a[4],'VEC2','<f4',34962)
        mat=len(d['materials']);d['materials'].append({'name':'Diagnostic '+role,'pbrMetallicRoughness':{'baseColorFactor':colors[role],'metallicFactor':0,'roughnessFactor':.9},'doubleSided':True})
        mi=len(d['meshes']);d['meshes'].append({'primitives':[{'attributes':attrs,'indices':g.add(t[:,[0,2,1]].reshape(-1),'SCALAR','<u2' if int(t.max())<65536 else '<u4',34963),'material':mat} for t in m['indices']]});si=len(d['skins']);ib=(REFLECT@m['bind']@REFLECT).transpose(0,2,1).reshape(-1,16);d['skins'].append({'joints':part['joints'],'inverseBindMatrices':g.add(ib,'MAT4','<f4')});ni=len(d['nodes']);d['nodes'].append({'name':m['name'],**trs(part['node']),'mesh':mi,'skin':si});d['nodes'][0]['children'].append(ni)
    d['asset']['extras']['outfitMaskVerified']=False
    return g.bytes()


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--avatar',type=Path,required=True);p.add_argument('--head-glb',type=Path,required=True);p.add_argument('--sex',choices=('male','female'),required=True);p.add_argument('--part',nargs=3,action='append',metavar=('ROLE','BUNDLE','GEOMETRY_GUID'),required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');require(not out.exists(),'output exists');data,_=read_objects(a.avatar.read_bytes());_,body,_,_=body_source(data,a.sex)
    parts={}
    for role,path,guid in a.part:
        require(role in ('top','bottom','shoes','hair') and role not in parts,'unknown or duplicate role');require(len(guid)==32 and all(c in '0123456789abcdef' for c in guid),'invalid source GUID');parts[role]=garment(Path(path).read_bytes(),a.sex,body,guid)
    require(set(parts)=={'top','bottom','shoes','hair'},'incomplete outfit')
    for role,x in parts.items():print(role,x['mesh']['name'],len(x['mesh']['attrs'][0]),len(x['joints']),x['error'])
    payload=append_outfit(a.head_glb.read_bytes(),body,parts);out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('xb') as f:f.write(payload)
    print('private diagnostic bytes',len(payload))
if __name__=='__main__':main()
