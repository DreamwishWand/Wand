"""Offline source-verified optimized companion overlay generation."""
import argparse,json,zipfile
from pathlib import Path
import numpy as np
from pose_pet_actor import Source,animator,resolve_clip,attachment_maps
from pose_companions import extract,script_identity
from pose_optimized_avatar import optimized_meshes,restore_hierarchy
from pose_deform import pose,skin
from pose_rig import bind
from build_companion_actor_delta import export_actor,archive_files,frames,fields
from resolve_animation_bundle import unityfs,digest,read_bundle,serialized_objects,container_entries
from pose_curves import require,decode
from prepare_release_preview import metadata,RELEASE_SHA,BODY_TYPES
from prepare_companion_delta import DELTA_SHA
from pose_mesh import body_source
from pose_glb import trs

def generate(a):
    require(digest(a.base.read_bytes())==RELEASE_SHA,'base archive identity')
    targets=[]
    for _,raw in frames(a.itemlist.read_bytes()):
        f={n:v for n,w,v,_ in fields(raw) if n in (1,5)}
        if f.get(1)==a.item and 5 in f:targets.append(f[5].decode())
    require(len(targets)==1 and targets[0].startswith('guid:'),'item source identity')
    guid=targets[0][5:];sources={};resources={}
    for path in [a.pet,*a.dependency]:
        s=Source(path);require(s.cab not in sources,'duplicate source');sources[s.cab]=s;_,resources[s.cab]=unityfs(path.read_bytes(),include_resources=True)
    s=next(x for x in sources.values() if x.path==a.pet);p=extract(a.pet,script_identity(a.script),{guid})[guid]
    h,i,_,av,ctrl=animator(s,int(p['pathId']));poses=[c['pose'] for c in p['poseComponents'] if c['enabled'] and c['pose']]
    require(len(poses)==1 and not poses[0]['attachmentOverrides'],'unsupported optimized pose variants');ph=poses[0]
    clip,_,_=resolve_clip(s,ctrl,ph,sources);nodes,parts=optimized_meshes(s,int(h[i]['pathId']),sources[av[0]].raw(av[1],90));full=restore_hierarchy(h,i,nodes)
    bound=bind(clip,{'nodes':nodes});require(not bound['unresolved'],'unresolved animation')
    samples=np.array([np.concatenate([skin(m,pose(nodes,clip,bound['matched'],float(t)),j) for _,m,j,_ in parts]) for t in np.linspace(clip['start'],clip['end'],25)])
    require(np.isfinite(samples).all() and np.max(np.abs(samples-samples[0]))>1e-6,'invalid geometry motion')
    raw=export_actor(s,full,nodes,parts,ph,clip,sources,resources,{},secondary_pass=False);sha=digest(raw)
    anchors={};player={};mapping=attachment_maps(Source(a.avatar),Source(a.script))
    with zipfile.ZipFile(a.base) as z:
        names=archive_files(z);base=json.loads(z.read(names['local-preview.json']));models=base['models']
        for b in BODY_TYPES:
            asset=models[b];data=z.read(names[asset['sha256']+'.glb']);require(digest(data)==asset['sha256'] and len(data)==asset['bytes'],'model integrity')
            model_nodes=metadata(data)['nodes'];_,fs=unityfs(getattr(a,b+'_body').read_bytes());_,ns,_,_=body_source(next(iter(fs.values())),b)
            require(len(model_nodes)>=len(ns) and all(x['name']==(n['path'] or 'body') and all(x[k]==v for k,v in trs(n).items()) for x,n in zip(model_nodes,ns)),'source rig mismatch')
            path=mapping[b+'Preview']['points'][ph['attachmentPoint']] or 'body';inds=[i for i,x in enumerate(model_nodes) if x['name']==path];require(len(inds)==1,'anchor');anchors[b]=dict(node=inds[0],path=path)
            _,fs=unityfs(getattr(a,b+'_clips').read_bytes());g=ph['clipGuids'][b];hits=[]
            for cab,data in fs.items():
                _,ob=serialized_objects(data)
                for c,off,n in ob.values():
                    if c!=142:continue
                    ref=container_entries(data[off:off+n]).get(g)
                    if ref:
                        f,pid=ref;cl,off2,n2=ob[pid];require(f==0 and cl==74,'clip identity');hits.append(decode(data[off2:off2+n2]))
            require(len(hits)==1 and abs((hits[0]['end']-hits[0]['start'])-(clip['end']-clip['start']))<1e-5,'timing');player[b]=hits[0]['sha256']
    manifest=dict(schema='wand.photo-mode.lucky-actor@1',gameVersion=base['gameVersion'],baseReleaseSha256=RELEASE_SHA,baseCompanionDeltaSha256=DELTA_SHA,models=models,items={str(a.item):dict(asset=dict(sha256=sha,bytes=len(raw)),sourceSha256=clip['sha256'],anchors=anchors,playerSourceSha256=player)})
    with zipfile.ZipFile(a.out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,data in [('companion-lucky.json',json.dumps(manifest,separators=(',',':')).encode()),(sha+'.glb',raw)]:
            zi=zipfile.ZipInfo(name,(2026,11,28,0,0,0));zi.compress_type=zipfile.ZIP_DEFLATED;z.writestr(zi,data,compresslevel=6)
    with zipfile.ZipFile(a.out) as z:require(z.testzip() is None,'zip CRC')
    print('optimized nodes',len(nodes),'bindings',len(bound['matched']),'frames',len(samples),'archive',a.out.stat().st_size,digest(a.out.read_bytes()))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('base','itemlist','pet','script','avatar','male-body','female-body','male-clips','female-clips','out'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--dependency',type=Path,action='append',default=[]);p.add_argument('--item',type=int,required=True);a=p.parse_args();a.out=a.out.resolve()
    require(not any((x/'.git').exists() for x in (a.out,*a.out.parents)),'private output outside Git required');generate(a)
