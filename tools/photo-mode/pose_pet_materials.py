"""Resolve companion renderer materials and source color textures for private diagnostics."""
import argparse,json
from pathlib import Path
from collections import defaultdict
from resolve_animation_bundle import unityfs,serialized_objects,digest
from pose_material import externals,decode_material,decode_texture
from pose_curves import require


def extract(actors,paths,out):
    require(actors['schema']=='wand.photo-mode.private-pet-actors@1' and actors['privateOnly'] is True and actors['publicationAuthorized'] is False,'private actors required')
    refs={(cab,int(pid)) for row in actors['items'] for actor in row['actors'] for mesh in actor.get('meshes',[]) for cab,pid in mesh['materials']}
    sources={};materials={};textures={};wanted=defaultdict(set)
    out.mkdir(parents=True,exist_ok=False)
    for path in paths:
        raw=path.read_bytes();v,files=unityfs(raw);require(v=='6000.0.62f1' and len(files)==1,'unsupported bundle');cab,data=next(iter(files.items()));require(cab not in sources,'duplicate CAB');sources[cab]=(path,digest(raw));_,objects=serialized_objects(data);ext=externals(data)
        for c,pid in sorted(refs):
            if c!=cab or pid==0:continue
            cls,off,size=objects[pid];require(cls==21,'not a Material');m=decode_material(data[off:off+size]);slot=next((k for k in ('_MainTex','_AvatarSkinTex') if k in m['textures'] and m['textures'][k]['pathId']!='0'),None)
            rec=dict(material=m,slot=slot,bundleSha256=sources[cab][1],texture=None,status='no_supported_color_slot');materials.setdefault(cab,{})[str(pid)]=rec
            if slot:
                t=m['textures'][slot];f=t['fileId'];require(0<=f<=len(ext),'invalid texture file id');target=cab if f==0 else ext[f-1].rsplit('/',1)[-1];ref=(target,int(t['pathId']));rec.update(texture=[target,t['pathId']],status='unresolved_texture');wanted[target].add(ref[1])
    for cab,ids in wanted.items():
        if cab not in sources:continue
        path,sha=sources[cab];raw=path.read_bytes();require(digest(raw)==sha,'source changed');_,files=unityfs(raw,include_resources=True);data=files[cab];_,objects=serialized_objects(data)
        for pid in sorted(ids):
            cls,off,size=objects[pid];require(cls==28,'not a Texture2D')
            try:
                meta,png=decode_texture(data[off:off+size],files);dest=out/(meta['pngSha256']+'.png')
                if not dest.exists():dest.write_bytes(png)
                textures.setdefault(cab,{})[str(pid)]=dict(meta,status='decoded')
            except ValueError as e:textures.setdefault(cab,{})[str(pid)]=dict(status='unsupported',reason=str(e))
    for group in materials.values():
        for m in group.values():
            if m['texture']:
                c,p=m['texture'];t=textures.get(c,{}).get(p)
                if t and t['status']=='decoded':m.update(status='decoded',pngSha256=t['pngSha256'])
    report=dict(schema='wand.photo-mode.private-pet-materials@1',privateOnly=True,publicationAuthorized=False,shaderParityVerified=False,materials=materials,textures=textures,unresolvedMaterialRefs=[[c,str(p)] for c,p in sorted(refs) if str(p) not in materials.get(c,{})]);(out/'index.json').write_text(json.dumps(report,separators=(',',':'),allow_nan=False));return report


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--actors',type=Path,required=True);p.add_argument('--bundle',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');r=extract(json.loads(a.actors.read_bytes()),a.bundle,out);from collections import Counter;print('materials',Counter(m['status'] for g in r['materials'].values() for m in g.values()),'textures',Counter(t['status'] for g in r['textures'].values() for t in g.values()),'missing',len(r['unresolvedMaterialRefs']),'unique pngs',len(list(out.glob('*.png'))))
if __name__=='__main__':main()
