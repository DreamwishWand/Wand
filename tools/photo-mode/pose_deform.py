"""Offline body-only skinning validation. Not a full game pose reconstruction."""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation
from pose_mesh import body_source, decode_mesh
from pose_curves import sample, require
from pose_rig import bind
from resolve_animation_bundle import unityfs, serialized_objects, digest, Reader

FIELDS={1:'translation',2:'rotation',3:'scale'}

def world(nodes):
    out=[]
    for i,node in enumerate(nodes):
        require(-1<=node['parent']<i,'invalid parent')
        mat=np.eye(4);mat[:3,:3]=Rotation.from_quat(node['rotation']).as_matrix()@np.diag(node['scale']);mat[:3,3]=node['translation']
        out.append(out[node['parent']]@mat if node['parent']>=0 else mat)
    return np.array(out)

def skin(mesh,nodes,joints):
    matrices=world(nodes)[joints]@mesh['bind']
    positions=np.column_stack((mesh['attrs'][0],np.ones(len(mesh['attrs'][0]))))
    joint_indices=mesh['attrs'][13]; weights=mesh['attrs'][12];weights=weights/weights.sum(axis=1,keepdims=True)
    posed=np.einsum('nkij,nj->nki',matrices[joint_indices],positions)
    result=np.einsum('nk,nki->ni',weights,posed)
    require(np.isfinite(result).all() and np.allclose(result[:,3],1,atol=1e-5),'invalid deformation')
    return result[:,:3]

def pose(nodes,clip,matched,seconds):
    nodes=[dict(n) for n in nodes];values=sample(clip,seconds)
    seen=set()
    for binding in matched:
        i,attr,offset,dim=(binding[k] for k in ('node','attribute','offset','dimensions'))
        if attr not in FIELDS: continue
        require((i,attr) not in seen,'duplicate transform channel');seen.add((i,attr))
        v=values[offset:offset+dim];require(len(v)==dim,'short sample')
        if attr==2:
            require(np.linalg.norm(v)>1e-7,'invalid quaternion');v=Rotation.from_quat(v).as_quat().tolist()
        nodes[i][FIELDS[attr]]=v
    return nodes

def validate_bind(mesh,nodes,joints):
    w=world(nodes);target=[i for i,n in enumerate(nodes) if n['path']==mesh['name']]
    require(len(target)==1,'unknown mesh transform')
    error=float(np.max(np.abs(w[joints]@mesh['bind']-w[target[0]])))
    require(error<1e-4,'rest-pose skin matrices differ from mesh transform');return error

def write_json(path,data):
    with path.open('x',encoding='utf-8') as f:json.dump(data,f,allow_nan=False,separators=(',',':'))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--male',type=Path,required=True);p.add_argument('--female',type=Path,required=True);p.add_argument('--curves',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output must stay outside Git');out.mkdir(parents=True,exist_ok=False)
    doc=json.loads((a.curves/'index.json').read_bytes());require(doc['privateOnly'] is True and doc['publicationAuthorized'] is False,'private source required')
    report={'schema':'wand.photo-mode.private-body-deformation@1','privateOnly':True,'publicationAuthorized':False,'fullPoseVerified':False,'gameVersion':doc['gameVersion'],'models':{}}
    for sex in ('male','female'):
        original=getattr(a,sex).read_bytes();v,files=unityfs(original);require(v=='6000.0.62f1' and len(files)==1,'unsupported bundle');name,data=next(iter(files.items()));mesh,nodes,joints,evidence=body_source(data,sex);rest_error=validate_bind(mesh,nodes,joints);rest=skin(mesh,nodes,joints)
        _,objects=serialized_objects(data);meshes=[]
        for pid,(cls,off,size) in objects.items():
            if cls!=43:continue
            m=decode_mesh(data[off:off+size]);meshes.append(dict(name=m['name'],pathId=str(pid),sha256=m['sha256'],vertices=len(m['attrs'][0]),triangles=sum(len(t) for t in m['indices']),blendShapes=len(m['channels']),skinJoints=len(m['bind']),unparsedTailBytes=m['unparsedTailBytes']))
        records=[]
        for rec in doc['clips']:
            if rec['rig']!=sex:continue
            sha=rec['clipSha256'];require(len(sha)==64 and all(x in '0123456789abcdef' for x in sha),'invalid clip hash');clip=json.loads((a.curves/'curves'/(sha+'.json')).read_bytes());require(clip['sha256']==sha,'curve identity mismatch')
            binding=bind(clip,{'nodes':nodes});matched=binding['matched'];times=np.linspace(clip['start'],clip['end'],11);frames=np.array([skin(mesh,pose(nodes,clip,matched,float(t)),joints) for t in times]);delta=float(np.max(np.linalg.norm(frames-frames[0],axis=2)));require(delta>1e-5,'no body motion')
            records.append({'clipSha256':sha,'name':clip['name'],'matchedBindings':len(matched),'unresolvedBindings':len(binding['unresolved']),'matchedSkinJoints':len(set(joints)&{x['node'] for x in matched}),'maxVertexDisplacement':delta})
            # Diagnostic samples only; no invented or discarded unknown tracks.
            np.savez_compressed(out/(sha+'.diagnostic.npz'),times=times,positions=frames.astype('<f4'))
        np.savez_compressed(out/(sex+'-body.npz'),positions=mesh['attrs'][0],normals=mesh['attrs'][1],uv=mesh['attrs'][4],joints=mesh['attrs'][13],weights=mesh['attrs'][12],inverseBindMatrices=mesh['bind'],skinNodes=joints,restPositions=rest,indices=np.concatenate(mesh['indices']),morph=mesh['morph'])
        write_json(out/(sex+'-body-rig.json'),{'nodes':nodes,'joints':joints,'shapes':mesh['shapes'],'channels':mesh['channels'],'fullWeights':mesh['fullWeights'],'renderer':evidence})
        report['models'][sex]={'bundleSha256':digest(original),'assetFile':name,'nodes':len(nodes),'skinJoints':len(joints),'bindMatrixMaxError':rest_error,'meshCensus':meshes,'clips':records}
    write_json(out/'index.json',report)
    print({sex:{'meshes':len(m['meshCensus']),'clips':len(m['clips']),'restError':m['bindMatrixMaxError'],'vertices':sum(x['vertices'] for x in m['meshCensus']),'minMotion':min(x['maxVertexDisplacement'] for x in m['clips']),'maxMotion':max(x['maxVertexDisplacement'] for x in m['clips']),'skinJointMatches':sorted(set(x['matchedSkinJoints'] for x in m['clips']))} for sex,m in report['models'].items()})
if __name__=='__main__':main()
