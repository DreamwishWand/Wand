"""Private glTF 2.0 body-only diagnostic export; no final-game-pose claim."""
import argparse, json, struct
from pathlib import Path
import numpy as np
from pose_deform import pose, validate_bind
from pose_mesh import body_source
from pose_curves import require
from pose_rig import bind
from resolve_animation_bundle import unityfs, digest

# Reflect X to change coordinate handedness; preserve original relative transforms.
REFLECT=np.diag([-1.,1.,1.,1.])

def trs(node):
    t=np.asarray(node['translation'])*[-1,1,1]
    q=np.asarray(node['rotation'])*[1,-1,-1,1]
    return {'translation':t.tolist(),'rotation':(q/np.linalg.norm(q)).tolist(),'scale':list(node['scale'])}

class Glb:
    def __init__(self):
        self.bin=bytearray();self.doc={'asset':{'version':'2.0','generator':'Wand private diagnostic','extras':{'privateOnly':True,'fullPoseVerified':False}},'buffers':[{}],'bufferViews':[],'accessors':[],'scene':0,'scenes':[{'nodes':[0]}]}
    def add(self,values,kind,dtype,target=None,bounds=False):
        arr=np.ascontiguousarray(values,dtype=dtype); require(len(arr)>0 and np.isfinite(arr).all(),'invalid accessor')
        while len(self.bin)%4:self.bin.append(0)
        view={'buffer':0,'byteOffset':len(self.bin),'byteLength':arr.nbytes}
        if target:view['target']=target
        self.bin.extend(arr.tobytes());i=len(self.doc['bufferViews']);self.doc['bufferViews'].append(view)
        a={'bufferView':i,'componentType':{'<f4':5126,'<u2':5123,'<u4':5125}[dtype],'count':len(arr),'type':kind}
        if bounds:a.update(min=np.min(arr,axis=0).reshape(-1).tolist(),max=np.max(arr,axis=0).reshape(-1).tolist())
        i=len(self.doc['accessors']);self.doc['accessors'].append(a);return i
    def bytes(self):
        self.doc['buffers'][0]['byteLength']=len(self.bin)
        js=json.dumps(self.doc,separators=(',',':'),allow_nan=False).encode();js+=b' '*((-len(js))%4);self.bin.extend(b'\0'*((-len(self.bin))%4))
        return struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(self.bin))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(self.bin),b'BIN\0')+self.bin

def export(mesh,nodes,joints,clips):
    validate_bind(mesh,nodes,joints);g=Glb();d=g.doc
    d['nodes']=[{'name':n['path'] or 'body',**trs(n)} for n in nodes]
    for i,n in enumerate(nodes):
        if n['parent']>=0:d['nodes'][n['parent']].setdefault('children',[]).append(i)
    target=next(i for i,n in enumerate(nodes) if n['path']==mesh['name']);d['nodes'][target].update(mesh=0,skin=0)
    a=mesh['attrs'];p=a[0]*[-1,1,1];norm=a[1]*[-1,1,1];weights=a[12]/a[12].sum(axis=1,keepdims=True)
    attributes={'POSITION':g.add(p,'VEC3','<f4',34962,True),'NORMAL':g.add(norm,'VEC3','<f4',34962),'TEXCOORD_0':g.add(a[4],'VEC2','<f4',34962),'JOINTS_0':g.add(a[13],'VEC4','<u2',34962),'WEIGHTS_0':g.add(weights,'VEC4','<f4',34962)}
    d['meshes']=[{'primitives':[{'attributes':attributes,'indices':g.add(t[:,[0,2,1]].reshape(-1),'SCALAR','<u2',34963),'material':0} for t in mesh['indices']]}]
    d['materials']=[{'name':'Diagnostic neutral material','pbrMetallicRoughness':{'baseColorFactor':[.65,.65,.65,1],'metallicFactor':0,'roughnessFactor':.9},'doubleSided':True}]
    ib=(REFLECT@mesh['bind']@REFLECT).transpose(0,2,1).reshape(-1,16)
    d['skins']=[{'joints':joints,'inverseBindMatrices':g.add(ib,'MAT4','<f4')}];d['animations']=[]
    for clip in clips:
        matched=bind(clip,{'nodes':nodes})['matched'];duration=clip['end']-clip['start'];times=np.linspace(0,duration,int(np.ceil(duration*30))+1,dtype=np.float32);frames=[pose(nodes,clip,matched,float(t)+clip['start']) for t in times]
        time=g.add(times,'SCALAR','<f4',bounds=True);animation={'name':clip['name'],'samplers':[],'channels':[],'extras':{'sourceSha256':clip['sha256'],'fullPoseVerified':False}}
        for b in matched:
            i=b['node'];path={1:'translation',2:'rotation',3:'scale'}.get(b['attribute'])
            if path is None:continue
            vals=np.array([trs(f[i])[path] for f in frames],dtype=np.float32)
            if path=='rotation':
                for k in range(1,len(vals)):
                    if np.dot(vals[k-1],vals[k])<0:vals[k]*=-1
            # Constant tracks are retained; the bind pose is not necessarily their value.
            output=g.add(vals,'VEC4' if path=='rotation' else 'VEC3','<f4');j=len(animation['samplers']);animation['samplers'].append({'input':time,'output':output,'interpolation':'LINEAR'});animation['channels'].append({'sampler':j,'target':{'node':i,'path':path}})
        d['animations'].append(animation)
    return g.bytes()

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--bundle',type=Path,required=True);p.add_argument('--sex',choices=('male','female'),required=True);p.add_argument('--curves',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output must stay outside Git');require(not out.exists(),'output exists');v,files=unityfs(a.bundle.read_bytes());require(v=='6000.0.62f1' and len(files)==1,'unsupported bundle');mesh,nodes,joints,_=body_source(next(iter(files.values())),a.sex)
    index=json.loads((a.curves/'index.json').read_bytes());require(index['privateOnly'] is True and index['publicationAuthorized'] is False,'private source required');clips=[]
    for rec in index['clips']:
        if rec['rig']!=a.sex:continue
        sha=rec['clipSha256'];require(len(sha)==64 and all(c in '0123456789abcdef' for c in sha),'invalid sha');clip=json.loads((a.curves/'curves'/(sha+'.json')).read_bytes());require(clip['sha256']==sha,'clip identity mismatch');clips.append(clip)
    require(bool(clips),'no clips');payload=export(mesh,nodes,joints,clips);out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('xb') as f:f.write(payload)
    print(len(clips),len(payload),digest(payload))
if __name__=='__main__':main()
