"""Private companion skinning and trigger-to-clip extraction from exact prefab references."""
import argparse,json
from pathlib import Path
from zlib import crc32
import numpy as np
from resolve_animation_bundle import Reader,unityfs,serialized_objects,digest
from pose_mesh import decode_mesh,body_source
from pose_deform import world,pose,skin
from pose_curves import decode,require
from pose_rig import bind
from pose_material import externals,decode_material
from pose_pet_controller import resolve_controller

class Source:
 def __init__(self,path):
  self.path=path;raw=path.read_bytes();self.sha=digest(raw);v,fs=unityfs(raw);require(v=='6000.0.62f1' and len(fs)==1,'unsupported bundle');self.cab,self.data=next(iter(fs.items()));_,self.objects=serialized_objects(self.data);self.ext=externals(self.data);self.names={};self.trans={}
  for pid,(c,s,n) in self.objects.items():
   r=Reader(self.data[s:s+n])
   if c==1:cc=[r.unpack('iq') for _ in range(r.count(12))];r.take(4);self.names[pid]=(r.string(),cc)
   elif c==4:
    f,g=r.unpack('iq');q=r.unpack('4f');t=r.unpack('3f');scale=r.unpack('3f');kids=[r.unpack('iq') for _ in range(r.count(12))];par=r.unpack('iq');require(f==0 and r.pos==n,'invalid transform');self.trans[pid]=(g,q,t,scale,kids,par)
 def raw(self,pid,cls):
  c,s,n=self.objects[pid];require(c==cls,'unexpected object class');return self.data[s:s+n]
 def reference(self,ref):
  f,p=ref;require(0<=f<=len(self.ext),'external file index');return (self.cab if f==0 else self.ext[f-1].rsplit('/',1)[-1],p)
 def hierarchy(self,root):
  rows=[];lookup={}
  def walk(pid,path,parent):
   require(pid not in lookup,'cyclic transform');g,q,t,s,kids,_=self.trans[pid];require((0,pid) in self.names[g][1],'invalid GameObject backlink');lookup[pid]=len(rows);rows.append(dict(path=path,pathHash=crc32(path.encode()),parent=parent,translation=t,rotation=q,scale=s,gameObject=str(g),pathId=str(pid)))
   for f,k in kids:
    require(f==0 and self.trans[k][-1]==(0,pid),'invalid child');walk(k,(path+'/' if path else '')+self.names[self.trans[k][0]][0],lookup[pid])
  walk(root,'',-1);return rows,lookup
 def root(self,go):
  roots=[p for p,t in self.trans.items() if t[0]==go and t[-1]==(0,0)];require(len(roots)==1,'ambiguous prefab root');return roots[0]

def animator(source,go):
 rows,lookup=source.hierarchy(source.root(go));matches=[(n,p) for n in rows for f,p in source.names[int(n['gameObject'])][1] if f==0 and source.objects[p][0]==95];require(len(matches)==1,'ambiguous animator');n,p=matches[0];r=Reader(source.raw(p,95));require(r.unpack('iq')==(0,int(n['gameObject'])),'invalid animator backlink');r.take(4);avatar=source.reference(r.unpack('iq'));ctrl=source.reference(r.unpack('iq'));return rows,lookup[int(n['pathId'])],str(p),avatar,ctrl

def resolve_clip(source,ctrl,pose,sources):
 cab,pid=ctrl;over=sources[cab];r=Reader(over.raw(pid,221));name=r.string();base=over.reference(r.unpack('iq'));pairs={}
 for _ in range(r.count(24)):
  a,b=over.reference(r.unpack('iq')),over.reference(r.unpack('iq'));require(a not in pairs,'duplicate override');pairs[a]=b
 require(r.pos==len(r.data),'override tail');parent=sources[base[0]];raw=parent.raw(base[1],91);states,tail=resolve_controller(raw);hits=[(t,states[t]) for t in pose['attachedSetTriggers'] if t in states];require(len(hits)==1,'ambiguous photo state');trigger,state=hits[0];original=parent.reference(state['clip']);selected=pairs.get(original,original);clip_source=sources[selected[0]];clip_raw=clip_source.raw(selected[1],74);clip=decode(clip_raw);return clip,clip_raw,dict(trigger=trigger,state=state,overrideController=[cab,str(pid)],overrideControllerName=name,baseController=[base[0],str(base[1])],baseControllerSha256=digest(raw),unparsedControllerTailBytes=tail,originalClip=[original[0],str(original[1])],selectedClip=[selected[0],str(selected[1])],clipName=clip['name'],clipSha256=clip['sha256'],clipBundleSha256=clip_source.sha)

def meshes(source,root,*,base_pass_only=False):
 nodes,lookup=source.hierarchy(root);w=world(nodes);parts=[]
 for i,n in enumerate(nodes):
  for f,p in source.names[int(n['gameObject'])][1]:
   if f or source.objects[p][0]!=137:continue
   r=Reader(source.raw(p,137));require(r.unpack('iq')==(0,int(n['gameObject'])),'renderer backlink');r.pos=72;materials=[source.reference(r.unpack('iq')) for _ in range(r.count(12))];r.take(56);mf,mp=r.unpack('iq');bones=[r.unpack('iq') for _ in range(r.count(12))];weights=r.unpack(f'{r.count(4)}f');rb=r.unpack('iq');r.take(28);require(r.pos==len(r.data) and mf==0 and all(f==0 and b in lookup for f,b in bones),'unsupported renderer reference');m=decode_mesh(source.raw(mp,43));j=[lookup[b] for f,b in bones];require(tuple(nodes[k]['pathHash'] for k in j)==m['boneHashes'],'bone hash mismatch');require(rb[0]==0 and rb[1] in lookup and nodes[lookup[rb[1]]]['pathHash']==m['rootHash'],'root bone mismatch');err=float(np.max(np.abs(w[j]@m['bind']-w[i])));omitted=False
   if base_pass_only and len(materials)!=len(m['indices']):
    def shader(ref):
     c,pid=ref;require(c==source.cab,'external secondary pass material');mat=decode_material(source.raw(pid,21));return source.reference(tuple(map(int,mat['shader'])))
    if len(materials)==1 and shader(materials[0])==('CAB-d79bfb1b074ecaf0c1e3e4fd94de319e',6863707950531551734):
     # Only omit an extra renderer sharing geometry with a retained base renderer.
     require(any(e['meshPathId']==str(mp) and e['materialSlotCount']==e['submeshCount'] for _,_,_,e in parts),'unverified secondary renderer');continue
    if len(materials)==len(m['indices'])+1 and shader(materials[-1])==('CAB-d79bfb1b074ecaf0c1e3e4fd94de319e',2274174900306393721):
     materials=materials[:-1];omitted=True
    else:raise ValueError('material slot mismatch')
   parts.append((i,m,j,dict(rendererPathId=str(p),meshPathId=str(mp),meshSha256=m['sha256'],vertices=len(m['attrs'][0]),triangles=sum(map(len,m['indices'])),bindMatrixMaxError=err,materialSlotCount=len(materials),submeshCount=len(m['indices']),materials=[[c,str(p)] for c,p in materials],blendShapeWeights=weights,secondaryPassOmitted=omitted)))
 require(parts,'missing skinned mesh');return nodes,parts

def attachment_maps(avatar,script):
 hits=[]
 for pid,(cls,_,_) in script.objects.items():
  if cls!=115:continue
  r=Reader(script.raw(pid,115));n=r.string();r.take(20);k,ns,assembly=r.string(),r.string(),r.string()
  if (n,k,ns,assembly)==('PetAttachmentPoints','PetAttachmentPoints','Mdl.Characters.Pets','Game'):hits.append((script.cab,pid))
 require(len(hits)==1,'ambiguous attachment script');result={}
 for pid,(cls,_,_) in avatar.objects.items():
  if cls!=114:continue
  r=Reader(avatar.raw(pid,114));go=r.unpack('iq');r.take(4);ref=avatar.reference(r.unpack('iq'));r.string()
  if ref!=hits[0]:continue
  require(go[0]==0 and (0,pid) in avatar.names[go[1]][1],'invalid attachment component');nodes,lookup=avatar.hierarchy(avatar.root(go[1]));mapping={}
  for _ in range(r.count(16)):
   key,=r.unpack('i');f,p=r.unpack('iq');require(f==0 and p in lookup and key not in mapping,'invalid attachment point');mapping[key]=nodes[lookup[p]]['path']
  require(r.pos==len(r.data) and set(mapping)==set(range(11)),'attachment map layout');root=mapping[0];require(all(v==root or v.startswith(root+'/') for v in mapping.values()),'attachment outside body');name=avatar.names[go[1]][0];result[name]=dict(componentPathId=str(pid),points={k:v[len(root):].lstrip('/') for k,v in mapping.items()})
 return result

def run(relations,sources,avatar,script,body_bundles,out):
 require(relations['schema']=='wand.photo-mode.private-item-relations@1' and relations['privateOnly'] is True and relations['publicationAuthorized'] is False,'private input required');mapping=attachment_maps(avatar,script);bodies={}
 for sex,src in body_bundles.items():
  mesh,nodes,joints,evidence=body_source(src.data,sex);paths={n['path']:i for i,n in enumerate(nodes)};points=mapping[sex+'Preview']['points'];require(all(p in paths for p in points.values()),'unmatched avatar anchor');bodies[sex]={str(k):dict(path=p,node=paths[p]) for k,p in points.items()}
 records=[];out.mkdir(parents=True,exist_ok=False)
 for row in relations['items']:
  if not row.get('poses'):continue
  rec={'itemId':row['itemId'],'fullPoseVerified':False,'actors':[]};records.append(rec);p=row['prefab'];source=sources[p['assetFile']];require(source.sha==p['bundleSha256'],'prefab source mismatch');go=int(p['pathId']);hierarchy,anim_node,anim_id,av,ctrl=animator(source,go)
  for ph in row['poses']:
   if ph.get('attachmentOverrides'):
    rec['actors'].append(dict(componentPathId=ph['componentPathId'],status='unresolved',reason='body-specific attachment requires per-body actor conversion'))
    continue
   actor=dict(componentPathId=ph['componentPathId'],animatorPathId=anim_id,animatorRootPath=hierarchy[anim_node]['path'],attachmentPoint=ph['attachmentPoint'],attachedOffset=ph['attachedOffset'],attachedRotation=ph['attachedRotation'],anchors={s:b[str(ph['attachmentPoint'])] for s,b in bodies.items()});rec['actors'].append(actor)
   try:
    clip,raw,evidence=resolve_clip(source,ctrl,ph,sources);actor.update(evidence);path=out/(clip['sha256']+'.clip.bin')
    if not path.exists():path.write_bytes(raw)
    nodes,parts=meshes(source,int(hierarchy[anim_node]['pathId']));bound=bind(clip,{'nodes':nodes});require(bound['matched'],'missing clip bindings');frames=[]
    for t in np.linspace(clip['start'],clip['end'],11):
     posed=pose(nodes,clip,bound['matched'],float(t));frames.append(np.concatenate([skin(m,posed,j) for _,m,j,_ in parts]))
    delta=float(np.max(np.abs(np.array(frames)-frames[0])));require(delta>1e-6,'no geometry motion');actor.update(status='diagnostic',duration=clip['end']-clip['start'],matchedBindings=len(bound['matched']),unresolvedBindings=len(bound['unresolved']),nodes=len(nodes),meshes=[e for _,_,_,e in parts],maxVertexDisplacement=delta,restParityVerified=all(e['bindMatrixMaxError']<1e-4 for _,_,_,e in parts),materialSlotsMatch=all(e['materialSlotCount']==e['submeshCount'] for _,_,_,e in parts));np.savez_compressed(out/(str(row['itemId'])+'-'+ph['componentPathId']+'.npz'),frames=np.array(frames,dtype=np.float32))
   except (ValueError,KeyError) as e:actor.update(status='unresolved',reason=str(e))
 report=dict(schema='wand.photo-mode.private-pet-actors@1',privateOnly=True,publicationAuthorized=False,fullPoseVerified=False,avatarBundleSha256=avatar.sha,scriptBundleSha256=script.sha,attachmentMaps=mapping,bodyAnchors=bodies,items=records);(out/'index.json').write_text(json.dumps(report,separators=(',',':'),allow_nan=False));return report

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--relations',type=Path,required=True);p.add_argument('--bundle',type=Path,action='append',required=True);p.add_argument('--avatar',type=Path,required=True);p.add_argument('--script',type=Path,required=True);p.add_argument('--male',type=Path,required=True);p.add_argument('--female',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');sources=[Source(x) for x in a.bundle];require(len({x.cab for x in sources})==len(sources),'duplicate bundle CAB');report=run(json.loads(a.relations.read_bytes()),{s.cab:s for s in sources},Source(a.avatar),Source(a.script),{s:Source(getattr(a,s)) for s in ('male','female')},out);actors=[x for row in report['items'] for x in row['actors']];print('actors',len(actors),'clip refs resolved',sum('selectedClip' in x for x in actors),'sampled',sum(x['status']=='diagnostic' for x in actors),'rest parity',sum(x.get('restParityVerified',False) for x in actors),'materials matched',sum(x.get('materialSlotsMatch',False) for x in actors));print([(row['itemId'],a.get('reason')) for row in report['items'] for a in row['actors'] if a['status']!='diagnostic'])
if __name__=='__main__':main()
