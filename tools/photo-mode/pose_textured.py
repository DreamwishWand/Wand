"""Private, source-backed clothing albedo and exact native material-section masking."""
import argparse,json,struct
from pathlib import Path
import numpy as np
from resolve_animation_bundle import Reader,unityfs,serialized_objects,digest
from pose_curves import require
from pose_material import externals,decode_material
from pose_visibility import selected_hidden
from pose_outfit import garment
from pose_mesh import body_source
from pose_glb import Glb

def native_file(path):
    raw=path.read_bytes();v,files=unityfs(raw);require(v=='6000.0.62f1' and len(files)==1,'unsupported bundle');cab,data=next(iter(files.items()));_,objects=serialized_objects(data);return raw,cab,data,objects,externals(data)

def material_names(paths):
    result={}
    for p in paths:
        raw,cab,data,objects,_=native_file(p);require(cab not in result,'duplicate material CAB');result[cab]={str(pid):Reader(data[s:s+n]).string() for pid,(c,s,n) in objects.items() if c==21}
    return result

def verify_variant(file,item,part):
    raw,cab,data,objects,_=file;require(item['assetFile']==cab and item['bundleSha256']==digest(raw),'variant source mismatch')
    go=int(item['gameObjectPathId']);components={};transforms={}
    for pid,(c,s,n) in objects.items():
        r=Reader(data[s:s+n])
        if c==1:components[pid]=[r.unpack('iq') for _ in range(r.count(12))]
        elif c==4:
            f,g=r.unpack('iq');r.take(40);kids=[r.unpack('iq') for _ in range(r.count(12))];parent=r.unpack('iq');require(f==0,'external transform');transforms[pid]=(g,kids,parent)
    roots=[p for p,(g,k,par) in transforms.items() if g==go and par==(0,0)];require(len(roots)==1,'variant root mismatch');seen=set();renderers=[]
    def walk(p):
        require(p not in seen,'cycle');seen.add(p);g,kids,_=transforms[p]
        for f,ptr in components[g]:
            if f!=0 or objects[ptr][0]!=137:continue
            c,s,n=objects[ptr];r=Reader(data[s:s+n]);require(r.unpack('iq')==(0,g),'broken renderer');r.pos=72;r.take(r.count(12)*12);r.take(56);renderers.append(r.unpack('iq'))
        for f,k in kids:require(f==0 and transforms[k][2]==(0,p),'broken child');walk(k)
    walk(roots[0]);require(renderers==[(0,int(part['meshPathId']))],'variant does not reference selected geometry')

def parse_glb(raw):
    require(struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw)),'invalid GLB');n,t=struct.unpack_from('<I4s',raw,12);require(t==b'JSON','invalid JSON');g=Glb();g.doc=json.loads(raw[20:20+n]);size,tag=struct.unpack_from('<I4s',raw,20+n);require(tag==b'BIN\0' and 28+n+size==len(raw),'invalid BIN');g.bin=bytearray(raw[28+n:]);require(g.doc['asset']['extras']['privateOnly'] is True and g.doc['asset']['extras']['fullPoseVerified'] is False,'not a diagnostic asset');return g

def accessor(g,i):
    a=g.doc['accessors'][i];v=g.doc['bufferViews'][a['bufferView']];dt={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']];d={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];require('byteStride' not in v and a.get('byteOffset',0)==0,'unsupported accessor');return np.frombuffer(g.bin[v['byteOffset']:v['byteOffset']+v['byteLength']],dtype=dt).reshape(a['count'],d)

def apply(g,mesh,source_refs,source_file,names,hidden,material=None,texture_root=None):
    d=g.doc;hits=[n for n in d['nodes'] if n.get('name')==mesh['name'] and 'mesh' in n];require(len(hits)==1,'missing mesh');node=hits[0];primitives=d['meshes'][node['mesh']]['primitives'];require(len(primitives)==len(mesh['indices'])==len(source_refs),'submesh mismatch');_,cab,_,_,ext=source_file
    keep=[];removed=[];mat_index=None;uv_index=None
    if material is not None:
        slot=material['textures']['_MainTex'];require(slot['status']=='resolved' and 4 in mesh['attrs'],'missing main texture');sha=slot['pngSha256'];require(len(sha)==64 and all(c in '0123456789abcdef' for c in sha),'invalid texture hash');png=(texture_root/(sha+'.png')).read_bytes();require(digest(png)==sha,'texture hash mismatch')
        # Converted PNG is top-left raster, Unity source UV is bottom-left.
        uv=mesh['attrs'][4]*np.asarray(slot['scale'])+np.asarray(slot['offset']);uv[:,1]=1-uv[:,1];uv_index=g.add(uv,'VEC2','<f4',34962)
        while len(g.bin)%4:g.bin.append(0)
        vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':len(g.bin),'byteLength':len(png)});g.bin.extend(png)
        images=d.setdefault('images',[]);ii=len(images);images.append({'bufferView':vi,'mimeType':'image/png'});textures=d.setdefault('textures',[]);ti=len(textures);textures.append({'source':ii});mat_index=len(d['materials']);tint=material['colors'].get('_Tint',[1,1,1,1]);require(len(tint)==4 and all(0<=x<=1 for x in tint),'unsupported tint');d['materials'].append({'name':material['name'],'pbrMetallicRoughness':{'baseColorTexture':{'index':ti},'baseColorFactor':tint,'metallicFactor':0,'roughnessFactor':.9},'doubleSided':True,'extras':{'sourceSha256':material['sourceSha256'],'shaderParityVerified':False}})
    for primitive,tri,(f,pid) in zip(primitives,mesh['indices'],source_refs):
        require(np.array_equal(accessor(g,primitive['indices']).reshape(-1),tri[:,[0,2,1]].reshape(-1)) and np.allclose(accessor(g,primitive['attributes']['POSITION']),mesh['attrs'][0]*[-1,1,1]),'geometry provenance mismatch')
        require(0<=f<=len(ext),'invalid material file ID');target=cab if f==0 else ext[f-1].rsplit('/',1)[-1];require(str(pid) in names.get(target,{}),'unresolved original material');name=names[target][str(pid)];primitive.setdefault('extras',{})['nativeSection']=name
        if name in hidden:removed.append({'section':name,'triangles':len(tri)});continue
        if mat_index is not None:primitive['material']=mat_index;primitive['attributes']['TEXCOORD_0']=uv_index
        keep.append(primitive)
    require(keep,'fully hidden mesh unsupported');d['meshes'][node['mesh']]['primitives']=keep
    return removed,len(keep),mat_index is not None

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--avatar',type=Path,required=True);p.add_argument('--sex',choices=('male','female'),required=True);p.add_argument('--glb',type=Path,required=True);p.add_argument('--materials',type=Path,required=True);p.add_argument('--items',type=Path,required=True);p.add_argument('--mapping',type=Path,required=True);p.add_argument('--material-bundle',type=Path,action='append',required=True);p.add_argument('--part',nargs=4,action='append',metavar=('ROLE','BUNDLE','GEOMETRY_GUID','VARIANT_GUID'),required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)) and not out.exists(),'private new output only')
    def private(path):
        d=json.loads(path.read_bytes());require(d['privateOnly'] is True and d['publicationAuthorized'] is False,'private input required');return d
    mapping=private(a.mapping);items=private(a.items)['items'];materials=private(a.materials/'index.json')['assetFiles'];src=native_file(a.avatar);mesh,body,_,evidence=body_source(src[2],a.sex);g=parse_glb(a.glb.read_bytes());parts={};selected=[];sources=list(a.material_bundle)+[a.avatar]
    for role,path,geo,variant in a.part:
        require(role in ('top','bottom','shoes','hair') and role not in parts,'invalid part role');path=Path(path);file=native_file(path);hits=[x for x in items if variant in x['prefabGuids'] and x['assetFile']==file[1]];require(len(hits)==1,'missing or ambiguous variant');item=hits[0];part=garment(file[0],a.sex,body,geo);verify_variant(file,item,part);parts[role]=(file,part,item);selected.append(item);sources.append(path)
    require(set(parts)=={'top','bottom','shoes','hair'},'missing selected part');hidden=selected_hidden(mapping,selected);names=material_names(list(dict.fromkeys(sources)));records={'body':apply(g,mesh,evidence['materials'],src,names,hidden)}
    for role,(file,part,item) in parts.items():
        m=None
        if role!='hair':
            require(item['materialPathId'] is not None,'missing material GUID');rec=materials[file[1]];require(rec['sha256']==digest(file[0]),'material bundle mismatch');m=rec['materials'][item['materialPathId']]
        records[role]=apply(g,part['mesh'],part['materials'],file,names,hidden,m,a.materials)
    g.doc['asset']['extras'].update(nativeSectionMaskApplied=True,outfitMaskVerified=False,shaderParityVerified=False,bodyAndHairAppearanceVerified=False)
    out.parent.mkdir(parents=True,exist_ok=True);payload=g.bytes();out.open('xb').write(payload);print(json.dumps(dict(bytes=len(payload),hidden=sorted(hidden),records=records,animations=len(g.doc['animations'])),ensure_ascii=False))
if __name__=='__main__':main()
