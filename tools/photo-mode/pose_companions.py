"""Resolve original companion photo-pose components and accessory prefab identities privately."""
import argparse,json,math,re
from pathlib import Path
from resolve_animation_bundle import Reader,unityfs,serialized_objects,digest,read_bundle
from pose_material import externals
from pose_curves import require
ROLES=('female','male','femaleGown','maleGown','femaleMermaid','maleMermaid')

def script_identity(path):
    v,files=unityfs(path.read_bytes());require(v=='6000.0.62f1','unsupported version');hits=[]
    for cab,data in files.items():
        _,objects=serialized_objects(data)
        for pid,(cls,off,size) in objects.items():
            if cls!=115:continue
            r=Reader(data[off:off+size]);name=r.string();r.take(20);klass,ns,assembly=r.string(),r.string(),r.string()
            if (name,klass,ns,assembly)==('PetPhotoPose','PetPhotoPose','Mdl.Characters.Pets','Game'):
                require(r.pos==size,'unsupported MonoScript tail');hits.append((cab,pid))
    require(len(hits)==1,'ambiguous PetPhotoPose script');return hits[0]

def decode_pose(r):
    attachment,=r.unpack('i');offset=r.unpack('3f');rotation=r.unpack('4f')
    require(all(map(math.isfinite,offset+rotation)),'invalid attachment transform')
    require(r.count(4)==0,'attachment overrides not decoded')
    triggers=[[r.string() for _ in range(r.count(4))] for _ in range(3)]
    body,tool=r.unpack('ii');refs={}
    for role in ROLES:
        guid,sub,typ=r.string(),r.string(),r.string()
        require(not guid or re.fullmatch('[0-9a-f]{32}',guid),'invalid clip GUID')
        require((not guid and not sub and not typ) or (guid and not sub and typ.startswith('UnityEngine.AnimationClip, UnityEngine.AnimationModule,')),'unsupported asset reference')
        refs[role]=guid or None
    require(r.pos==len(r.data),'unparsed PetPhotoPose fields')
    return dict(attachmentPoint=attachment,attachedOffset=offset,attachedRotation=rotation,attachedResetTriggers=triggers[0],attachedSetTriggers=triggers[1],detachedResetTriggers=triggers[2],bodyNumber=body,toolToEquip=tool,clipGuids=refs)

def extract(path,identity,targets):
    raw=path.read_bytes();version,files=unityfs(raw);require(version=='6000.0.62f1','unsupported bundle');out={};sha=digest(raw)
    for cab,data in files.items():
        _,objects=serialized_objects(data);ext=externals(data);names={};entries=[];components={}
        for pid,(cls,off,size) in objects.items():
            r=Reader(data[off:off+size])
            if cls==1:
                cc=[r.unpack('iq') for _ in range(r.count(12))];r.take(4);names[pid]=(r.string(),cc)
            elif cls==142:
                r.string();n=r.count(12);r.take(n*12)
                for _ in range(r.count(24)):
                    key=r.string();start,count,f,p=r.unpack('iiiq');require(0<=start<=n and 0<=count<=n-start,'invalid preload range');entries.append((key,f,p))
            elif cls==114:
                go=r.unpack('iq');enabled,=r.unpack('I');f,script=r.unpack('iq');r.string()
                if 1<=f<=len(ext) and (ext[f-1].rsplit('/',1)[-1],script)==identity:
                    require(go[0]==0 and enabled in (0,1),'invalid pose component');components.setdefault(go[1],[]).append((pid,enabled,r))
        for guid,f,pid in entries:
            if guid not in targets or f!=0 or pid not in names:continue
            require(guid not in out,'ambiguous prefab GUID');name,cc=names[pid];rec=dict(assetFile=cab,pathId=str(pid),nativeName=name,bundle=path.name,bundleSha256=sha,poseComponents=[])
            for component,enabled,r in components.get(pid,[]):
                require((0,component) in cc,'broken component backlink')
                try:pose=decode_pose(r);status='decoded'
                except ValueError as exc:pose=None;status=str(exc)
                rec['poseComponents'].append(dict(pathId=str(component),enabled=bool(enabled),status=status,pose=pose))
            out[guid]=rec
    return out

def build(census,objects,packages,bundles,script,clip_bundles,output):
    require(census['privateOnly'] is True and census['publicationAuthorized'] is False and objects['privateOnly'] is True and objects['publicationAuthorized'] is False,'private input required')
    require(census['gameVersion']==objects['gameVersion'],'source version mismatch')
    available={}
    for role,pkg in packages.items():
        require(pkg['privateOnly'] is True and pkg['publicationAuthorized'] is False,'private package required')
        available[role]={c['sourceSha256']:c for c in pkg['clips']}
        require(len(available[role])==len(pkg['clips']),'duplicate clip hash')
    companions=census['companionDefinitions'];emotes=census['emotes'];targets={x['references']['companionPrefab']['guid'] for x in companions}|{x['references']['accessory']['guid'] for x in emotes if 'accessory' in x['references']}
    identity=script_identity(script);prefabs={}
    for path in bundles:
        hits=extract(path,identity,targets);require(not prefabs.keys()&hits.keys(),'ambiguous prefab across bundles');prefabs.update(hits)
    clip_targets={g for rec in prefabs.values() for c in rec['poseComponents'] if c['pose'] for g in c['pose']['clipGuids'].values() if g}
    found=dict(objects['objects']);new={}
    for path in clip_bundles:
        hits=read_bundle(path,clip_targets,output);require(not new.keys()&hits.keys(),'ambiguous clip across bundles');new.update(hits)
    for g,hit in new.items():
        require(g not in found or found[g]['clipSha256']==hit['clipSha256'],'source clip conflict');found[g]=hit
    def clip(g,role):
        if not g:return None
        src=found.get(g);body='female' if role.startswith('female') else 'male';package=available.get(body,{}).get(src['clipSha256']) if src else None
        return dict(guid=g,source=src,diagnosticClip=package,fullPoseVerified=False)
    rows=[]
    for item in emotes:
        refs=item['references'];rows.append(dict(itemId=item['itemId'],kind='emote',avatarFormWire=item['avatarFormWire'],clips={role:clip(v['guid'],role) for role,v in refs.items() if role!='accessory'},accessory=prefabs.get(refs.get('accessory',{}).get('guid')),accessoryGuid=refs.get('accessory',{}).get('guid')))
    for item in companions:
        guid=item['references']['companionPrefab']['guid'];prefab=prefabs.get(guid);poses=[]
        if prefab:
            for c in prefab['poseComponents']:
                if c['pose'] is not None:
                    pose=c['pose'];poses.append(dict(componentPathId=c['pathId'],enabled=c['enabled'],**pose,clips={role:clip(g,role) for role,g in pose['clipGuids'].items()}))
        rows.append(dict(itemId=item['itemId'],kind='companion',prefabGuid=guid,prefab=prefab,poses=poses))
    require(len({x['itemId'] for x in rows})==len(rows),'duplicate item ID')
    groups={}
    for row in rows:
        definitions=[row] if row['kind']=='emote' else row['poses']
        for definition in definitions:
            for role,c in definition['clips'].items():
                if c and c['source']:
                    # Exact source bytes, not name, species, or BodyNumber.
                    groups.setdefault(c['source']['clipSha256'],set()).add(row['itemId'])
    return dict(schema='wand.photo-mode.private-item-relations@1',privateOnly=True,publicationAuthorized=False,fullPoseVerified=False,gameVersion=census['gameVersion'],items=rows,sharedClipItems={k:sorted(v) for k,v in groups.items()},newClipObjects=new,unresolvedClipGuids=sorted(clip_targets-found.keys()))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--census',type=Path,required=True);p.add_argument('--objects',type=Path,required=True);p.add_argument('--male-package',type=Path,required=True);p.add_argument('--female-package',type=Path,required=True);p.add_argument('--script',type=Path,required=True);p.add_argument('--bundle',type=Path,action='append',required=True);p.add_argument('--clip-bundle',type=Path,action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');out.mkdir(parents=True,exist_ok=False)
    def read(path):return json.loads(path.read_bytes())
    report=build(read(a.census),read(a.objects),{k:read(getattr(a,k+'_package')/'index.json') for k in ('male','female')},a.bundle,a.script,a.clip_bundle,out);(out/'index.json').write_text(json.dumps(report,separators=(',',':'),allow_nan=False))
    rows=report['items'];print('emotes',sum(x['kind']=='emote' for x in rows),'companion prefab matches',sum(x.get('prefab') is not None for x in rows),'companion pose matches',sum(bool(x.get('poses')) for x in rows),'accessories',sum(x.get('accessory') is not None for x in rows),'new clip objects',len(report['newClipObjects']),'unresolved',len(report['unresolvedClipGuids']))
if __name__=='__main__':main()
