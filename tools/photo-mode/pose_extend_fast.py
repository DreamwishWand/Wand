"""Resumable private clip package extension using batched native curve sampling."""
import argparse, json, struct, shutil
from pathlib import Path
import numpy as np
from pose_extend_package import read,verified
from resolve_animation_bundle import digest,unityfs
from pose_curves import decode,require
from pose_mesh import body_source
from pose_rig import bind
from pose_glb import Glb,trs
from pose_textured import parse_glb

def sample_tracks(clip,nodes):
    duration=clip['end']-clip['start'];times=np.linspace(0,duration,int(np.ceil(duration*30))+1,dtype=np.float32)
    ts=np.clip(times.astype(np.float64)+clip['start'],clip['start'],clip['end']);cols=[]
    for curve in clip['stream']:
        keys=np.asarray([k for k,_ in curve]);coeff=np.asarray([v for _,v in curve]);i=np.maximum(0,np.searchsorted(keys,ts,side='right')-1);a,b,c,d=coeff[i].T;dt=np.where(keys[i]<-1e30,0,np.maximum(0,ts-keys[i]));cols.append(((a*dt+b)*dt+c)*dt+d)
    if clip['denseCount']:
        x=np.clip((ts-clip['denseBegin'])*clip['denseRate'],0,clip['denseFrames']-1);lo=x.astype(int);hi=np.minimum(lo+1,clip['denseFrames']-1);dense=np.asarray(clip['dense']).reshape(-1,clip['denseCount']);cols.extend((dense[lo]+(dense[hi]-dense[lo])*(x-lo)[:,None]).T)
    cols.extend(np.full(len(ts),v) for v in clip['constants']);values=np.asarray(cols).T;require(np.isfinite(values).all(),'nonfinite sample')
    g=Glb();doc=g.doc;animation=dict(name=clip['name'],samplers=[],channels=[],extras=dict(sourceSha256=clip['sha256'],fullPoseVerified=False));time=g.add(times,'SCALAR','<f4',bounds=True);seen=set()
    for b in bind(clip,{'nodes':nodes})['matched']:
        i=b['node'];path={1:'translation',2:'rotation',3:'scale'}.get(b['attribute']);
        if path is None:continue
        require((i,path) not in seen,'duplicate track');seen.add((i,path));v=values[:,b['offset']:b['offset']+b['dimensions']].copy()
        if path=='translation':v*=np.array([-1,1,1])
        if path=='rotation':
            v*=np.array([1,-1,-1,1]);norm=np.linalg.norm(v,axis=1);require(np.all(norm>1e-7),'zero quaternion');v/=norm[:,None]
        v=v.astype(np.float32)
        if path=='rotation':
            for k in range(1,len(v)):
                if np.dot(v[k-1],v[k])<0:v[k]*=-1
        output=g.add(v,'VEC4' if path=='rotation' else 'VEC3','<f4');j=len(animation['samplers']);animation['samplers'].append(dict(input=time,output=output,interpolation='LINEAR'));animation['channels'].append(dict(sampler=j,target=dict(node=i,path=path)))
    require(animation['channels'],'no bound tracks');return g,animation

def extend(package,relations,avatar,sex,out):
    m=read(package/'index.json');links=read(relations/'index.json');require(m['schema']=='wand.private-pose-package@1' and links['schema']=='wand.photo-mode.private-item-relations@1' and all(d['privateOnly'] is True and d['publicationAuthorized'] is False and d['fullPoseVerified'] is False for d in (m,links)),'private sources required');model=m['model'];name=model['sha256']+'.glb';base=parse_glb(verified(package/name,model['sha256'],model['bytes']));require(base.doc['asset']['extras']['splitDiagnostic'] is True and 'animations' not in base.doc,'split model required');v,fs=unityfs(avatar.read_bytes());require(v=='6000.0.62f1' and len(fs)==1,'unsupported avatar');mesh,nodes,joints,_=body_source(next(iter(fs.values())),sex);bn=base.doc['nodes'];require(len(bn)>=len(nodes) and all(b['name']==(n['path'] or 'body') and all(b[k]==v for k,v in trs(n).items()) for b,n in zip(bn,nodes)),'model rig mismatch');require(base.doc['skins'][0]['joints']==joints,'skin mismatch');require([(i,c) for i,b in enumerate(bn[:len(nodes)]) for c in b.get('children',[]) if c<len(nodes)]==[(n['parent'],i) for i,n in enumerate(nodes) if n['parent']>=0] or sorted((i,c) for i,b in enumerate(bn[:len(nodes)]) for c in b.get('children',[]) if c<len(nodes))==sorted((n['parent'],i) for i,n in enumerate(nodes) if n['parent']>=0),'rig topology mismatch')
    out.mkdir(parents=True,exist_ok=True);prior=out/'index.json';rows=list(m['clips']);source_pin=digest((relations/'index.json').read_bytes())
    if prior.exists():
        saved=read(prior);require(saved['model']==model and saved['clips'][:len(rows)]==rows and saved['additionalClipSourceManifestSha256']==source_pin,'resume source mismatch');rows=saved['clips']
    def save_asset(name,data):
        dest=out/name
        if dest.exists():require(dest.read_bytes()==data,'existing asset mismatch')
        else:
            temp=dest.with_suffix(dest.suffix+'.tmp');temp.write_bytes(data);temp.replace(dest)
    def checkpoint():
        m['clips']=rows;m['additionalClipSourceManifestSha256']=source_pin;tmp=out/'index.json.tmp';tmp.write_text(json.dumps(m,separators=(',',':'),allow_nan=False));tmp.replace(prior)
    save_asset(name,verified(package/name,model['sha256'],model['bytes']))
    for r in rows:
        name=r['sha256']+'.wpa';src=package/name if (package/name).exists() else out/name;save_asset(name,verified(src,r['sha256'],r['bytes']))
    checkpoint();known={r['sourceSha256'] for r in rows};candidates={r['clipSha256']:r for r in links['newClipObjects'].values() if r['sourceBundle'].startswith(sex+'_')}
    for sha,rec in candidates.items():
        if sha in known:continue
        clip=decode(verified(relations/(sha+'.clip.bin'),sha,rec['bytes']));require(clip['name']==rec['clipName'],'clip name mismatch');g,a=sample_tracks(clip,nodes);doc=dict(schema='wand.private-pose-clip@1',privateOnly=True,publicationAuthorized=False,modelSha256=model['sha256'],animation=a,buffers=[dict(byteLength=len(g.bin))],bufferViews=g.doc['bufferViews'],accessors=g.doc['accessors']);js=json.dumps(doc,separators=(',',':'),allow_nan=False).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<4sII',b'WPA1',len(js),len(g.bin))+js+g.bin;h=digest(payload);save_asset(h+'.wpa',payload);rows.append(dict(sourceSha256=sha,sha256=h,bytes=len(payload),name=a['name']));known.add(sha);checkpoint()
    print(sex,len(rows),'clips, model unchanged',model['sha256'])

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--package',type=Path,required=True);p.add_argument('--relations',type=Path,required=True);p.add_argument('--avatar',type=Path,required=True);p.add_argument('--sex',choices=('male','female'),required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');extend(a.package,a.relations,a.avatar,a.sex,out)
