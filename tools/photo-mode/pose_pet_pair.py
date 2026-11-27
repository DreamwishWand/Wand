"""Build private attached-pet diagnostic GLBs, not verified Unity runtime poses."""
import argparse,json,copy
from pathlib import Path
import numpy as np
from pose_pet_actor import Source,animator,meshes
from pose_curves import decode,require
from pose_deform import pose
from pose_rig import bind
from pose_glb import trs,REFLECT
from pose_textured import parse_glb
from resolve_animation_bundle import digest

def append_pair(player,source,row,actor,clip_raw,sex):
 require(actor['status']=='diagnostic' and digest(clip_raw)==actor['clipSha256'],'unverified actor clip');p=row['prefab'];require(source.cab==p['assetFile'] and source.sha==p['bundleSha256'],'actor bundle mismatch');ph=[v for v in row['poses'] if v['componentPathId']==actor['componentPathId']];require(len(ph)==1,'pose identity');ph=ph[0];g=parse_glb(player);d=g.doc;require(len(d['animations'])==1,'one player clip required');animation=d['animations'][0];require(animation['extras']['sourceSha256']==ph['clips'][sex]['source']['clipSha256'],'wrong player pose');anchor=actor['anchors'][sex];require(d['nodes'][anchor['node']]['name']==anchor['path'],'wrong player anchor');hierarchy,anim_node,anim_id,_,_=animator(source,int(p['pathId']));require(anim_id==actor['animatorPathId'],'animator mismatch');nodes,parts=meshes(source,int(hierarchy[anim_node]['pathId']));clip=decode(clip_raw);duration=clip['end']-clip['start'];require(abs(duration-actor['duration'])<1e-5,'actor duration');from pose_textured import accessor
 player_duration=max(float(accessor(g,s['input'])[-1,0]) for s in animation['samplers']);require(abs(player_duration-duration)<1e-5,'nonmatching animation duration')
 start=len(d['nodes']);indices={n['pathId']:start+i for i,n in enumerate(hierarchy)};actor_name='companion';hierarchy[0]=dict(hierarchy[0],translation=ph['attachedOffset'],rotation=ph['attachedRotation']);d['nodes'].extend({'name':actor_name+'/'+n['path'],**trs(n),'extras':{'actorId':actor_name}} for n in hierarchy)
 for i,n in enumerate(hierarchy):
  parent=anchor['node'] if n['parent']<0 else start+n['parent'];d['nodes'][parent].setdefault('children',[]).append(start+i)
 for i,m,j,e in parts:
  a=m['attrs'];joints=np.pad(a[13],((0,0),(0,4-a[13].shape[1])));weights=np.pad(a[12],((0,0),(0,4-a[12].shape[1])));weights/=weights.sum(axis=1,keepdims=True);attributes={'POSITION':g.add(a[0]*[-1,1,1],'VEC3','<f4',34962,True),'NORMAL':g.add(a[1]*[-1,1,1],'VEC3','<f4',34962),'JOINTS_0':g.add(joints,'VEC4','<u2',34962),'WEIGHTS_0':g.add(weights,'VEC4','<f4',34962)}
  if 4 in a:attributes['TEXCOORD_0']=g.add(a[4],'VEC2','<f4',34962)
  mat=len(d['materials']);d['materials'].append({'name':'Diagnostic companion','pbrMetallicRoughness':{'baseColorFactor':[.67,.45,.25,1],'metallicFactor':0,'roughnessFactor':.9},'doubleSided':True});mi=len(d['meshes']);d['meshes'].append({'primitives':[{'attributes':attributes,'indices':g.add(t[:,[0,2,1]].reshape(-1),'SCALAR','<u2' if t.max()<65536 else '<u4',34963),'material':mat} for t in m['indices']]});si=len(d['skins']);ib=(REFLECT@m['bind']@REFLECT).transpose(0,2,1).reshape(-1,16);d['skins'].append({'joints':[indices[nodes[k]['pathId']] for k in j],'inverseBindMatrices':g.add(ib,'MAT4','<f4')});d['nodes'][indices[nodes[i]['pathId']]].update(mesh=mi,skin=si)
 matched=bind(clip,{'nodes':nodes})['matched'];times=np.linspace(0,duration,int(np.ceil(duration*30))+1,dtype=np.float32);frames=[pose(nodes,clip,matched,float(t)+clip['start']) for t in times];time=g.add(times,'SCALAR','<f4',bounds=True)
 for b in matched:
  i=b['node'];path={1:'translation',2:'rotation',3:'scale'}.get(b['attribute']);
  if path is None:continue
  vals=np.array([trs(f[i])[path] for f in frames],dtype=np.float32)
  if path=='rotation':
   for k in range(1,len(vals)):
    if np.dot(vals[k-1],vals[k])<0:vals[k]*=-1
  output=g.add(vals,'VEC4' if path=='rotation' else 'VEC3','<f4');j=len(animation['samplers']);animation['samplers'].append({'input':time,'output':output,'interpolation':'LINEAR'});animation['channels'].append({'sampler':j,'target':{'node':indices[nodes[i]['pathId']],'path':path}})
 d['asset']['extras'].update(attachedPairDiagnostic=True,runtimeAttachmentVerified=False,companionMaterialVerified=False,companionRestParityVerified=actor['restParityVerified']);animation['extras'].update(companionClipSha256=actor['clipSha256'],companionItemId=row['itemId'],attachmentNode=anchor['node']);return g.bytes()

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--player',type=Path,required=True);p.add_argument('--relations',type=Path,required=True);p.add_argument('--actors',type=Path,required=True);p.add_argument('--bundle',type=Path,required=True);p.add_argument('--item',type=int,required=True);p.add_argument('--sex',choices=('male','female'),required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)) and not out.exists(),'private output only');rel=json.loads(a.relations.read_bytes());actors=json.loads((a.actors/'index.json').read_bytes());require(all(x['privateOnly'] is True and x['publicationAuthorized'] is False for x in (rel,actors)),'private inputs required');row=next(x for x in rel['items'] if x['itemId']==a.item);ac=next(x for x in actors['items'] if x['itemId']==a.item)['actors'];require(len(ac)==1,'ambiguous actor');actor=ac[0];raw=(a.actors/(actor['clipSha256']+'.clip.bin')).read_bytes();payload=append_pair(a.player.read_bytes(),Source(a.bundle),row,actor,raw,a.sex);out.parent.mkdir(parents=True,exist_ok=True);out.open('xb').write(payload);print(a.item,a.sex,len(payload))
if __name__=='__main__':main()
