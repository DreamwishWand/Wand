"""Add source-verified player clips to an existing private shared model, without changing model bytes."""
import argparse,copy,json,struct,shutil
from pathlib import Path
from resolve_animation_bundle import digest,unityfs
from pose_curves import decode,require
from pose_mesh import body_source
from pose_glb import export
from pose_textured import parse_glb
from pose_split import subset

def read(path):return json.loads(path.read_bytes())
def verified(path,sha,size=None):
    require(len(sha)==64 and all(c in '0123456789abcdef' for c in sha),'invalid sha');data=path.read_bytes();require(digest(data)==sha and (size is None or len(data)==size),'asset integrity mismatch');return data

def extend(package,relations,avatar,sex,out):
    manifest=read(package/'index.json');links=read(relations/'index.json')
    require(manifest['schema']=='wand.private-pose-package@1' and links['schema']=='wand.photo-mode.private-item-relations@1' and all(d['privateOnly'] is True and d['publicationAuthorized'] is False and d['fullPoseVerified'] is False for d in (manifest,links)),'private package required')
    model=manifest['model'];model_path=package/(model['sha256']+'.glb');base=parse_glb(verified(model_path,model['sha256'],model['bytes']));require(base.doc['asset']['extras']['splitDiagnostic'] is True and 'animations' not in base.doc,'not a split model')
    version,files=unityfs(avatar.read_bytes());require(version=='6000.0.62f1' and len(files)==1,'unsupported avatar');mesh,nodes,joints,_=body_source(next(iter(files.values())),sex)
    candidates={r['clipSha256']:r for r in links['newClipObjects'].values() if r['sourceBundle'].startswith(sex+'_')};known={r['sourceSha256'] for r in manifest['clips']};require(candidates,'no new source clips');clips=[]
    for sha,rec in candidates.items():
        if sha in known:continue
        raw=verified(relations/(sha+'.clip.bin'),sha,rec['bytes']);clip=decode(raw);require(clip['sha256']==sha and clip['name']==rec['clipName'],'clip identity mismatch');clips.append(clip)
    require(clips,'no clips to extend');source=parse_glb(export(mesh,nodes,joints,clips));bn=base.doc['nodes'];sn=source.doc['nodes'];require(len(bn)>=len(sn) and all(all(a[k]==b[k] for k in ('name','translation','rotation','scale')) for a,b in zip(bn,sn)),'model rig differs from source')
    def edges(nodes,count):return [(i,c) for i,n in enumerate(nodes[:count]) for c in n.get('children',[]) if c<count]
    require(edges(bn,len(sn))==edges(sn,len(sn)),'rig topology differs');require(base.doc['skins'][0]['joints']==source.doc['skins'][0]['joints'],'body skin differs')
    out.mkdir(parents=True,exist_ok=False);shutil.copyfile(model_path,out/model_path.name);rows=copy.deepcopy(manifest['clips'])
    for r in rows:
        name=r['sha256']+'.wpa';verified(package/name,r['sha256'],r['bytes']);shutil.copyfile(package/name,out/name)
    for animation in source.doc['animations']:
        a=copy.deepcopy(animation);refs=[(s,k) for s in a['samplers'] for k in ('input','output')];doc=dict(schema='wand.private-pose-clip@1',privateOnly=True,publicationAuthorized=False,modelSha256=model['sha256'],animation=a);g=subset(source,doc,refs);doc['buffers'][0]['byteLength']=len(g.bin);js=json.dumps(doc,separators=(',',':'),allow_nan=False).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<4sII',b'WPA1',len(js),len(g.bin))+js+g.bin;sha=digest(payload);(out/(sha+'.wpa')).write_bytes(payload);rows.append(dict(sourceSha256=a['extras']['sourceSha256'],sha256=sha,bytes=len(payload),name=a['name']))
    manifest['clips']=rows;manifest['additionalClipSourceManifestSha256']=digest((relations/'index.json').read_bytes());(out/'index.json').write_text(json.dumps(manifest,separators=(',',':'),allow_nan=False));print(sex,'model unchanged',model['sha256'],'clips',len(rows),'new',len(clips))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--package',type=Path,required=True);p.add_argument('--relations',type=Path,required=True);p.add_argument('--avatar',type=Path,required=True);p.add_argument('--sex',choices=('male','female'),required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');extend(a.package,a.relations,a.avatar,a.sex,out)
if __name__=='__main__':main()
