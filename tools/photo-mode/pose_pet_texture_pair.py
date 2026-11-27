"""Apply native color textures to companion primitives in private paired diagnostics."""
import argparse,json
from pathlib import Path
import numpy as np
from pose_curves import require
from pose_pet_actor import Source,animator,meshes
from pose_textured import parse_glb,accessor
from resolve_animation_bundle import digest


def apply_pair(raw,source,row,actor,report,root):
    g=parse_glb(raw);d=g.doc;require(d['asset']['extras']['attachedPairDiagnostic'] is True,'not a paired diagnostic');a=d['animations'][0]['extras'];require(a['companionItemId']==row['itemId'] and a['companionClipSha256']==actor['clipSha256'],'actor identity mismatch')
    p=row['prefab'];require(source.cab==p['assetFile'] and source.sha==p['bundleSha256'],'wrong source bundle');hier,an,_,_,_=animator(source,int(p['pathId']));nodes,parts=meshes(source,int(hier[an]['pathId']));names={n['pathId']:n['path'] for n in hier};count=0;cache={}
    for i,m,j,e in parts:
        name='companion/'+names[nodes[i]['pathId']];hits=[n for n in d['nodes'] if n.get('name')==name and n.get('extras',{}).get('actorId')=='companion' and 'mesh' in n];require(len(hits)==1,'missing companion mesh');primitives=d['meshes'][hits[0]['mesh']]['primitives'];require(len(primitives)==len(m['indices'])==len(e['materials']),'material slots differ')
        for prim,tri,(cab,pid) in zip(primitives,m['indices'],e['materials']):
            require(np.array_equal(accessor(g,prim['indices']).reshape(-1),tri[:,[0,2,1]].reshape(-1)) and np.allclose(accessor(g,prim['attributes']['POSITION']),m['attrs'][0]*[-1,1,1]),'geometry differs');rec=report['materials'].get(cab,{}).get(pid);require(rec is not None and rec['status']=='decoded' and 4 in m['attrs'],'no decoded color texture');sha=rec['pngSha256'];require(len(sha)==64 and all(c in '0123456789abcdef' for c in sha),'invalid PNG hash');png=(root/(sha+'.png')).read_bytes();require(digest(png)==sha,'PNG hash mismatch');mat=rec['material'];slot=mat['textures'][rec['slot']];uv=m['attrs'][4]*np.asarray(slot['scale'])+np.asarray(slot['offset']);uv[:,1]=1-uv[:,1];prim['attributes']['TEXCOORD_0']=g.add(uv,'VEC2','<f4',34962)
            if sha not in cache:
                while len(g.bin)%4:g.bin.append(0)
                vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':len(g.bin),'byteLength':len(png)});g.bin.extend(png);images=d.setdefault('images',[]);ii=len(images);images.append({'bufferView':vi,'mimeType':'image/png'});textures=d.setdefault('textures',[]);cache[sha]=len(textures);textures.append({'source':ii})
            prim['material']=len(d['materials']);d['materials'].append({'name':mat['name'],'pbrMetallicRoughness':{'baseColorTexture':{'index':cache[sha]},'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.9},'doubleSided':True,'extras':{'sourceSha256':mat['sourceSha256'],'sourceColorSlot':rec['slot'],'shaderParityVerified':False}});count+=1
    require(count>0,'no textured companion primitive');d['asset']['extras'].update(companionColorTexturesApplied=True,companionMaterialVerified=False);return g.bytes(),count,len(cache)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pair',type=Path,required=True);p.add_argument('--relations',type=Path,required=True);p.add_argument('--actors',type=Path,required=True);p.add_argument('--materials',type=Path,required=True);p.add_argument('--bundle',type=Path,required=True);p.add_argument('--item',type=int,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)) and not out.exists(),'private output only');rel=json.loads(a.relations.read_bytes());act=json.loads(a.actors.read_bytes());mat=json.loads((a.materials/'index.json').read_bytes());require(all(d['privateOnly'] is True and d['publicationAuthorized'] is False for d in (rel,act,mat)),'private inputs required');row=next(x for x in rel['items'] if x['itemId']==a.item);actors=next(x for x in act['items'] if x['itemId']==a.item)['actors'];require(len(actors)==1,'ambiguous actor');data,n,t=apply_pair(a.pair.read_bytes(),Source(a.bundle),row,actors[0],mat,a.materials);out.parent.mkdir(parents=True,exist_ok=True);out.open('xb').write(data);print(a.item,n,t,len(data))
if __name__=='__main__':main()
