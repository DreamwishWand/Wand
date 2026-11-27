"""Resolve all head meshes to the same native body rig; export private diagnostic variants."""
import argparse,json,struct
from pathlib import Path
from zlib import crc32
import numpy as np
from resolve_animation_bundle import Reader,serialized_objects,unityfs
from pose_curves import require
from pose_mesh import decode_mesh,body_source
from pose_deform import world
from pose_glb import Glb,trs,REFLECT

def head_parts(data,sex,body):
    version,objects=serialized_objects(data);require(version=='6000.0.62f1','unsupported version')
    def raw(pid,cls):
        c,s,n=objects[pid];require(c==cls,'wrong class');return data[s:s+n]
    names={};trans={}
    for pid,(cls,s,n) in objects.items():
        r=Reader(data[s:s+n])
        if cls==1:
            comps=[r.unpack('iq') for _ in range(r.count(12))];r.take(4);names[pid]=(r.string(),comps)
        elif cls==4:
            f,g=r.unpack('iq');q=r.unpack('4f');t=r.unpack('3f');scale=r.unpack('3f');kids=[r.unpack('iq') for _ in range(r.count(12))];par=r.unpack('iq')
            require(f==0 and r.pos==n,'invalid transform');trans[pid]=(g,q,t,scale,kids,par)
    bw=world(body);bp={n['path']:i for i,n in enumerate(body)};require(len(bp)==len(body),'duplicate body path');result={}
    for letter in 'ABCDEFGH':
        roots=[p for p,(g,*_,par) in trans.items() if par==(0,0) and names[g][0]==f'head_{sex}_{letter}'];require(len(roots)==1,'ambiguous head')
        rows=[];lookup={}
        def walk(pid,path,parent):
            require(pid not in lookup,'cycle');g,q,t,scale,kids,_=trans[pid];require((0,pid) in names[g][1],'broken transform reference')
            lookup[pid]=len(rows);rows.append(dict(path=path,parent=parent,translation=t,rotation=q,scale=scale,gameObject=g))
            for f,k in kids:
                require(f==0 and trans[k][-1]==(0,pid),'broken child reference');walk(k,(path+'/' if path else '')+names[trans[k][0]][0],lookup[pid])
        walk(roots[0],'',-1);hw=world(rows);parts=[]
        for i,n in enumerate(rows):
            for f,pid in names[n['gameObject']][1]:
                if f or objects[pid][0]!=137:continue
                r=Reader(raw(pid,137));require(r.unpack('iq')==(0,n['gameObject']),'broken renderer reference');r.pos=72;materials=[r.unpack('iq') for _ in range(r.count(12))];r.take(56);mf,mp=r.unpack('iq');bones=[r.unpack('iq') for _ in range(r.count(12))];weights=r.unpack(f'{r.count(4)}f');root=r.unpack('iq');r.take(28)
                require(mf==0 and r.pos==len(r.data) and all(f==0 and b in lookup for f,b in bones),'unresolved head reference');mesh=decode_mesh(raw(mp,43));paths=[rows[lookup[b]]['path'] for f,b in bones];require(tuple(crc32(x.encode()) for x in paths)==mesh['boneHashes'],'head bone hash mismatch');require(all(p in bp for p in paths),'missing body bone');j=[bp[p] for p in paths];require(root[0]==0 and root[1] in lookup and crc32(rows[lookup[root[1]]]['path'].encode())==mesh['rootHash'],'head root mismatch');err=float(np.max(np.abs(bw[j]@mesh['bind']-hw[i])));require(err<1e-4,'head body bind mismatch');require(len(materials)==len(mesh['indices']),'material count mismatch')
                parts.append(dict(mesh=mesh,node=n,joints=j,error=err,materials=materials,weights=weights))
        require(len(parts)==6,'missing head parts');result[letter]=parts
    return result

def append_head(body_glb,body,parts):
    magic,v,size=struct.unpack_from('<4sII',body_glb);require((magic,v,size)==(b'glTF',2,len(body_glb)),'invalid GLB');n,tag=struct.unpack_from('<I4s',body_glb,12);require(tag==b'JSON','invalid JSON chunk');g=Glb();g.doc=json.loads(body_glb[20:20+n]);size,tag=struct.unpack_from('<I4s',body_glb,20+n);require(tag==b'BIN\0' and 28+n+size==len(body_glb),'invalid BIN chunk');g.bin=bytearray(body_glb[28+n:]);d=g.doc
    require(d['asset']['extras']['privateOnly'] is True and len(d['nodes'])==len(body) and all(x['name']==(y['path'] or 'body') for x,y in zip(d['nodes'],body)),'body rig mismatch')
    for part in parts:
        m=part['mesh'];a=m['attrs'];name=m['name']
        # Shadow is retained in the census; its game shader is not reconstructed.
        if name.endswith('_shadow'):continue
        j=a[13];w=a[12];j=np.pad(j,((0,0),(0,4-j.shape[1])));w=np.pad(w,((0,0),(0,4-w.shape[1])));w=w/w.sum(axis=1,keepdims=True)
        attrs={'POSITION':g.add(a[0]*[-1,1,1],'VEC3','<f4',34962,True),'NORMAL':g.add(a[1]*[-1,1,1],'VEC3','<f4',34962),'JOINTS_0':g.add(j,'VEC4','<u2',34962),'WEIGHTS_0':g.add(w,'VEC4','<f4',34962)}
        mat=len(d['materials']);color=[.25,.25,.25,1] if 'eyelash' in name else [.85,.85,.85,1] if 'teeth' in name or name.endswith('_eyes') else [.65,.65,.65,1];d['materials'].append({'name':'Diagnostic '+name,'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':0,'roughnessFactor':.9},'doubleSided':True})
        mi=len(d['meshes']);d['meshes'].append({'primitives':[{'attributes':attrs,'indices':g.add(t[:,[0,2,1]].reshape(-1),'SCALAR','<u2',34963),'material':mat} for t in m['indices']]});si=len(d['skins']);ib=(REFLECT@m['bind']@REFLECT).transpose(0,2,1).reshape(-1,16);d['skins'].append({'joints':part['joints'],'inverseBindMatrices':g.add(ib,'MAT4','<f4')});ni=len(d['nodes']);d['nodes'].append({'name':name,**trs(part['node']),'mesh':mi,'skin':si});d['nodes'][0]['children'].append(ni)
    return g.bytes()

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',type=Path,required=True);p.add_argument('--body-glb',type=Path,required=True);p.add_argument('--sex',choices=('male','female'),required=True);p.add_argument('--head',choices=tuple('ABCDEFGH'),default='A');p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');require(not out.exists(),'output exists');v,files=unityfs(a.bundle.read_bytes());require(v=='6000.0.62f1' and len(files)==1,'unsupported bundle');data=next(iter(files.values()));_,body,_,_=body_source(data,a.sex);parts=head_parts(data,a.sex,body);raw=append_head(a.body_glb.read_bytes(),body,parts[a.head]);out.parent.mkdir(parents=True,exist_ok=True);out.open('xb').write(raw);print(a.sex,len(parts),sum(map(len,parts.values())),max(x['error'] for ps in parts.values() for x in ps),len(raw))
if __name__=='__main__':main()
