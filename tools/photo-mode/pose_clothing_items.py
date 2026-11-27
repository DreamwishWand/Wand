"""Extract exact source garment choices and material references, without guessing runtime visibility order."""
import argparse,json,re
from pathlib import Path
from resolve_animation_bundle import Reader,unityfs,serialized_objects,digest
from pose_material import externals
from pose_curves import require


def script_identity(path):
    version,files=unityfs(path.read_bytes());require(version=='6000.0.62f1','unsupported script bundle');hits=[]
    for name,data in files.items():
        _,objects=serialized_objects(data)
        for pid,(cls,off,size) in objects.items():
            if cls!=115:continue
            r=Reader(data[off:off+size]);n=r.string();r.take(20);c,ns,assembly=r.string(),r.string(),r.string()
            if n==c=='ClothingItemScript' and ns=='Mdl.Avatar' and assembly=='Game':
                require(r.pos==len(r.data),'unsupported MonoScript tail');hits.append((name,pid))
    require(len(hits)==1,'missing or ambiguous ClothingItemScript');return hits[0]


def extract(path,identity,config):
    raw=path.read_bytes();version,files=unityfs(raw);require(version=='6000.0.62f1','unsupported bundle');out=[]
    for cab,data in files.items():
        _,objects=serialized_objects(data);ext=externals(data);names={};entries=[]
        for pid,(cls,off,size) in objects.items():
            r=Reader(data[off:off+size])
            if cls==1:
                components=[r.unpack('iq') for _ in range(r.count(12))];r.take(4);names[pid]=(r.string(),components)
            elif cls==142:
                r.string();n=r.count(12);r.take(n*12)
                for _ in range(r.count(24)):
                    key=r.string();start,count,f,p=r.unpack('iiiq');require(0<=start<=n and 0<=count<=n-start,'invalid preload range');entries.append((key,f,p))
        for pid,(cls,off,size) in objects.items():
            if cls!=114:continue
            r=Reader(data[off:off+size]);g=r.unpack('iq');enabled,=r.unpack('I');f,script=r.unpack('iq');r.string()
            if not (1<=f<=len(ext) and (ext[f-1].rsplit('/',1)[-1],script)==identity):continue
            require(g[0]==0 and g[1] in names and (0,pid) in names[g[1]][1] and enabled in (0,1),'broken garment component')
            def ref():
                guid,sub,typ=r.string(),r.string(),r.string();require(not guid or re.fullmatch('[0-9a-f]{32}',guid),'invalid asset GUID');return dict(guid=guid,subObjectName=sub,subObjectType=typ)
            material,socks,gloss=ref(),ref(),ref();pose=r.unpack('iq');require(r.count(1)==0,'nonempty VFX array unsupported');decal=r.unpack('iq');category,dark=r.unpack('ii');layers=r.unpack(f'{r.count(4)}i');options=r.unpack(f'{r.count(4)}i');require(r.pos==size and dark in (0,1) and 0<=category<len(config['categories']),'invalid garment tail');category_def=config['categories'][category];labels=category_def['optionLabels'];require(len(options)==len(labels) and all(0<=v<len(l['options']) for v,l in zip(options,labels)),'unresolved native option index')
            selected=[dict(label=l['name'],index=v,**l['options'][v]) for v,l in zip(options,labels)]
            material_targets=[p for key,f,p in entries if key==material['guid'] and f==0 and p in objects and objects[p][0]==21];require(len(material_targets)<=1,'ambiguous material GUID');matid=str(material_targets[0]) if material_targets else None
            if material['guid']:require(matid is not None,'material GUID not local')
            out.append(dict(name=names[g[1]][0],assetFile=cab,bundle=path.name,bundleSha256=digest(raw),componentPathId=str(pid),gameObjectPathId=str(g[1]),prefabGuids=[key for key,f,p in entries if f==0 and p==g[1]],category=category,material=material,materialPathId=matid,socks=socks,socksGloss=gloss,photoPoseRef=[pose[0],str(pose[1])],staticDecalRef=[decal[0],str(decal[1])],dark=bool(dark),animationLayers=layers,options=options,categoryHiddenParts=category_def['hiddenParts'],selectedOptions=selected))
    require(out,'no clothing components');return out


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--scripts',type=Path,required=True);p.add_argument('--config',type=Path,required=True);p.add_argument('--bundle',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');doc=json.loads(a.config.read_bytes());require(doc['privateOnly'] is True and doc['publicationAuthorized'] is False,'private config required');identity=script_identity(a.scripts);rows=[r for path in a.bundle for r in extract(path,identity,doc['config'])];out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x') as f:json.dump(dict(schema='wand.photo-mode.private-clothing-items@1',privateOnly=True,publicationAuthorized=False,maskApplicationVerified=False,items=rows),f,allow_nan=False,separators=(',',':'))
    print('components',len(rows),'material GUIDs resolved',sum(x['materialPathId'] is not None for x in rows),'selected options',sum(len(x['options']) for x in rows))
if __name__=='__main__':main()
