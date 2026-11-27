"""Convert source Ariel rock geometry and original attachment animation for both body types."""
import argparse,json,zipfile
from pathlib import Path
from zlib import crc32
import numpy as np
from pose_pet_actor import Source
from pose_rigid_mesh import decode_rigid
from pose_material import decode_material
from resolve_animation_bundle import Reader,unityfs,digest,container_entries
from pose_curves import require,decode
from pose_glb import Glb,trs
from pose_extend_fast import sample_tracks
from build_companion_actor_delta import material_projection,frames,fields
from pose_textured import accessor,parse_glb

ITEM=70200029
GUID='65f95d83dc42c03498efdafb9f3150f1'
BONE='root/bn_emote_pose'

def generate(a):
    rows=[{n:v for n,w,v,_ in fields(raw) if n in (1,7,8,12)} for _,raw in frames(a.itemlist.read_bytes())]; rows=[r for r in rows if r[1]==ITEM]
    require(len(rows)==1 and rows[0][12]==('guid:'+GUID).encode(),'accessory source')
    s=Source(a.rock);grass=Source(a.grass);_,resources=unityfs(a.rock.read_bytes(),include_resources=True)
    hits=[]
    for pid,(c,_,_) in s.objects.items():
        if c!=142:continue
        r=Reader(s.raw(pid,c));r.string();n=r.count(12);r.take(n*12)
        for _ in range(r.count(24)):
            key=r.string();i,count,f,p=r.unpack('iiiq');require(0<=i<=n and 0<=count<=n-i,'preload range')
            if key==GUID:hits.append((f,p))
    require(len(hits)==1 and hits[0][0]==0 and s.names[hits[0][1]][0]=='ArielRock_visual_photomode','accessory prefab')
    nodes,_=s.hierarchy(s.root(hits[0][1]));require([n['path'] for n in nodes]==['','Rock','Rock (1)','Grass Mask'],'accessory hierarchy')
    geometry=[]
    for i,n in enumerate(nodes[1:],1):
        go=int(n['gameObject']);components={s.objects[p][0]:p for f,p in s.names[go][1] if f==0};require(set(components)=={4,23,33},'accessory renderer structure')
        r=Reader(s.raw(components[33],33));require(r.unpack('iq')==(0,go),'filter backlink');f,p=r.unpack('iq');require(r.pos==len(r.data),'filter tail')
        rr=Reader(s.raw(components[23],23));require(rr.unpack('iq')==(0,go) and rr.take(1)==b'\x01','renderer backlink');rr.pos=72;refs=[s.reference(rr.unpack('iq')) for _ in range(rr.count(12))];require(len(refs)==1 and rr.take(len(rr.data)-rr.pos)==bytes(72),'renderer material structure')
        if i==3:
            cab,mid=refs[0];require(cab==grass.cab and decode_material(grass.raw(mid,21))['name']=='GrassMask' and f!=0,'grass mask identity');continue
        require(f==0 and refs[0][0]==s.cab,'rock references');m=decode_rigid(s.raw(p,43),resources);require(m['name']=='ArielRock' and len(m['indices'])==1,'rock geometry');geometry.append((m,refs[0]))
    require(len(geometry)==2 and geometry[0][0]['sha256']==geometry[1][0]['sha256'] and geometry[0][1]==geometry[1][1],'rock geometry reuse')
    nodes=nodes[:3];require(nodes[0]['translation']==(0,0,0) and nodes[0]['rotation']==(0,0,0,1) and nodes[0]['scale']==(1,1,1),'prop rest transform')
    g=Glb();d=g.doc;d['asset']['extras'].update(propActorDiagnostic=True,shaderParityVerified=False,effectParityVerified=False,grassMaskOmitted=True,derivedNormals=geometry[0][0]['normalsDerived'])
    d.update(nodes=[dict(name=BONE if i==0 else n['path'],**trs(n),extras=dict(actorId='prop')) for i,n in enumerate(nodes)],skins=[],meshes=[],materials=[]);d['nodes'][0]['children']=[1,2]
    m,ref=geometry[0];idx,slot=material_projection(g,ref,{s.cab:s},{s.cab:resources},{},{},{})
    attrs=m['attrs'];uv=attrs[4]*np.asarray(slot['scale'])+np.asarray(slot['offset']);uv[:,1]=1-uv[:,1]
    prim=dict(attributes=dict(POSITION=g.add(attrs[0]*[-1,1,1],'VEC3','<f4',34962,True),NORMAL=g.add(attrs[1]*[-1,1,1],'VEC3','<f4',34962),TEXCOORD_0=g.add(uv,'VEC2','<f4',34962),JOINTS_0=g.add(np.zeros((len(uv),4)),'VEC4','<u2',34962),WEIGHTS_0=g.add(np.tile([1,0,0,0],(len(uv),1)),'VEC4','<f4',34962)),indices=g.add(m['indices'][0][:,[0,2,1]].reshape(-1),'SCALAR','<u2',34963),material=idx)
    d['meshes']=[dict(primitives=[prim])];ib=g.add(np.eye(4).reshape(1,16),'MAT4','<f4')
    for i in (1,2):d['skins'].append(dict(joints=[i],inverseBindMatrices=ib));d['nodes'][i].update(mesh=0,skin=i-1)
    geometry_raw=g.bytes();assets={};options={}
    for body,field in (('male',8),('female',7)):
        guid=rows[0][field].decode().removeprefix('guid:');src=Source(getattr(a,body));hits=[]
        for pid,(c,_,_) in src.objects.items():
            if c==142:
                ref=container_entries(src.raw(pid,c)).get(guid)
                if ref:hits.append(ref)
        require(len(hits)==1 and hits[0][0]==0,'clip identity');clip=decode(src.raw(hits[0][1],74));require(clip['name']=='photomode_body_ariel_01','clip name')
        tracks,anim=sample_tracks(clip,[dict(pathHash=crc32(BONE.encode()))]);require({ch['target']['path'] for ch in anim['channels']}=={'translation','rotation'} and len(anim['channels'])==2,'rock transform tracks')
        obj=parse_glb(geometry_raw);d=obj.doc;vo=len(d['bufferViews']);ao=len(d['accessors']);bo=len(obj.bin);obj.bin.extend(tracks.bin);d['bufferViews'].extend({**v,'byteOffset':v['byteOffset']+bo} for v in tracks.doc['bufferViews']);d['accessors'].extend({**v,'bufferView':v['bufferView']+vo} for v in tracks.doc['accessors']);
        for sm in anim['samplers']:sm['input']+=ao;sm['output']+=ao
        d['animations']=[anim];raw=obj.bytes();check=parse_glb(raw);require(all(np.isfinite(accessor(check,sm['output'])).all() for sm in anim['samplers']),'nonfinite sampled motion');sha=digest(raw);assets[sha+'.glb']=raw;options[body]=dict(sourceSha256=clip['sha256'],asset=dict(sha256=sha,bytes=len(raw)),duration=clip['end']-clip['start']);print(body,options[body])
    manifest=dict(schema='wand.photo-mode.ariel-prop@1',gameVersion='1.26.2',itemId=ITEM,sourcePrefabSha256=s.sha,sourcePrefabGuid=GUID,items=options)
    with zipfile.ZipFile(a.out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,raw in [('ariel-prop.json',json.dumps(manifest,separators=(',',':')).encode()),*sorted(assets.items())]:
            zi=zipfile.ZipInfo(name,(2026,11,28,0,0,0));zi.compress_type=zipfile.ZIP_DEFLATED;z.writestr(zi,raw,compresslevel=6)
    with zipfile.ZipFile(a.out) as z:require(z.testzip() is None,'zip CRC')
    print('vertices',len(uv),'triangles',len(m['indices'][0]),'archive',a.out.stat().st_size,digest(a.out.read_bytes()))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('itemlist','rock','grass','male','female','out'):p.add_argument('--'+name,type=Path,required=True)
    a=p.parse_args();a.out=a.out.resolve();require(not any((x/'.git').exists() for x in (a.out,*a.out.parents)),'private output only');generate(a)
