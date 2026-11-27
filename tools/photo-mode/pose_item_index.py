"""Private, Item-ID keyed pose asset projection; item names and state stay in DB-01."""
import argparse,json
from pathlib import Path
from resolve_animation_bundle import digest
from pose_curves import require
from pose_extend_package import read,verified

ROLES=('male','female','maleGown','femaleGown','maleMermaid','femaleMermaid')

def build(relations,packages,actor_dirs):
    links=read(relations/'index.json');require(links['schema']=='wand.photo-mode.private-item-relations@1','invalid relations')
    def private(x):require(x['privateOnly'] is True and x['publicationAuthorized'] is False and x['fullPoseVerified'] is False,'private source required')
    private(links);models={};clips={};pins={'relations':digest((relations/'index.json').read_bytes()),'packages':{},'actors':[]};actor_index={}
    for body,root in packages.items():
        manifest=read(root/'index.json');private(manifest);require(manifest['schema']=='wand.private-pose-package@1','invalid package');m=manifest['model'];verified(root/(m['sha256']+'.glb'),m['sha256'],m['bytes']);models[body]=m;pins['packages'][body]=digest((root/'index.json').read_bytes());clips[body]={}
        for c in manifest['clips']:
            require(c['sourceSha256'] not in clips[body],'duplicate source clip');verified(root/(c['sha256']+'.wpa'),c['sha256'],c['bytes']);clips[body][c['sourceSha256']]=dict(sha256=c['sha256'],bytes=c['bytes'])
    for root in actor_dirs:
        manifest=read(root/'index.json');private(manifest);require(manifest['schema']=='wand.photo-mode.private-pet-actors@1','invalid actor report');pins['actors'].append(digest((root/'index.json').read_bytes()))
        for item in manifest['items']:
            for a in item['actors']:
                k=(item['itemId'],a['componentPathId']);require(k not in actor_index,'duplicate actor identity');actor_index[k]=a
                if a['status']=='diagnostic':
                    sha=a['clipSha256'];verified(root/(sha+'.clip.bin'),sha)
    def role_map(refs,mermaid):
        out={}
        for role,r in refs.items():
            require(role in ROLES,'unknown role')
            if not r:continue
            source=r['source'];sha=source['clipSha256'] if source else None;body='female' if role.startswith('female') else 'male';asset=clips[body].get(sha) if not (mermaid or role.endswith('Mermaid')) else None
            out[role]=dict(sourceGuid=r['guid'],sourceSha256=sha,asset=asset,status='diagnostic' if asset else 'source_only' if sha else 'unresolved')
        return out
    items={};groups={}
    for row in links['items']:
        id=row['itemId'];require(type(id) is int and id>0 and str(id) not in items,'invalid item ID');poses=[]
        if row['kind']=='emote':
            poses=[dict(id='emote',clips=role_map(row['clips'],row['avatarFormWire']!=0),avatarFormWire=row['avatarFormWire'],accessoryGuid=row.get('accessoryGuid'),accessoryStatus='source_only' if row.get('accessory') else 'unresolved' if row.get('accessoryGuid') else 'none')]
        else:
            for p in row['poses']:
                a=actor_index.get((id,p['componentPathId']));status=a['status'] if a else 'unresolved';actor=None
                if a and status=='diagnostic':actor={k:a[k] for k in ('clipSha256','duration','anchors','attachedOffset','attachedRotation','restParityVerified','materialSlotsMatch')}
                poses.append(dict(id=p['componentPathId'],enabled=p['enabled'],bodyNumber=p['bodyNumber'],clips=role_map(p['clips'],False),actor=actor,actorStatus=status))
        for p in poses:
            for c in p['clips'].values():
                if c['sourceSha256']:groups.setdefault(c['sourceSha256'],set()).add(id)
        items[str(id)]=dict(kind=row['kind'],poses=poses,fullPoseVerified=False)
    require(set(actor_index)<= {(int(i),p['id']) for i,row in items.items() for p in row['poses']},'orphan actor')
    return dict(schema='wand.photo-mode.private-asset-projection@1',privateOnly=True,publicationAuthorized=False,fullPoseVerified=False,gameVersion=links['gameVersion'],sourcePins=pins,models=models,items=items,sharedClipItems={k:sorted(v) for k,v in groups.items()})

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--relations',type=Path,required=True);p.add_argument('--male-package',type=Path,required=True);p.add_argument('--female-package',type=Path,required=True);p.add_argument('--actors',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');d=build(a.relations,{'male':a.male_package,'female':a.female_package},a.actors);out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x') as f:json.dump(d,f,separators=(',',':'),allow_nan=False)
    rows=list(d['items'].values());print('items',len(rows),'standard diagnostic',sum(any(p['clips'].get(k,{}).get('asset') for p in r['poses'] for k in ('male','female')) for r in rows),'counterpart diagnostic',sum(any(p.get('actorStatus')=='diagnostic' for p in r['poses']) for r in rows),'shared clip groups',sum(len(v)>1 for v in d['sharedClipItems'].values()))
if __name__=='__main__':main()
