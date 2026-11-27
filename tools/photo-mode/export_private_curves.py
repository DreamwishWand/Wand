"""Offline private export of decoded pose curves and rig-binding evidence."""
import argparse
import json
from pathlib import Path
from pose_curves import decode, sample, require
from pose_rig import bundle_rig, bind
from resolve_animation_bundle import digest

def write(path, data):
    with path.open('x',encoding='utf-8') as f:
        json.dump(data,f,ensure_ascii=False,allow_nan=False,separators=(',',':'))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--clips',type=Path,required=True)
    p.add_argument('--male',type=Path,required=True)
    p.add_argument('--female',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    out=a.out.resolve()
    require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output must stay outside Git')
    require(not out.exists(),'output already exists')
    manifest=json.loads((a.clips/'animation-objects.json').read_bytes())
    require(manifest.get('publicationAuthorized') is False and manifest.get('privateOnly') is True,'private manifest required')
    rigs={sex:bundle_rig(getattr(a,sex).read_bytes(),'rig'+sex.title()) for sex in ('male','female')}
    out.mkdir(parents=True)
    (out/'curves').mkdir()
    for sex,rig in rigs.items():
        write(out/(sex+'-rig.json'),rig)
    records=[]
    for guid,source in manifest['objects'].items():
        sha=source['clipSha256']
        require(len(sha)==64 and all(c in '0123456789abcdef' for c in sha),'invalid clip hash')
        data=(a.clips/(sha+'.clip.bin')).read_bytes()
        require(digest(data)==sha and source['unityVersion']=='6000.0.62f1','clip source mismatch')
        clip=decode(data)
        require(clip['name']==source['clipName'],'clip name mismatch')
        for i in range(11):
            sample(clip,clip['start']+(clip['end']-clip['start'])*i/10)
        target=out/'curves'/(sha+'.json')
        if not target.exists():
            write(target,clip)
        bundle=source['sourceBundle']
        sex='female' if 'female' in bundle else 'male'
        rig_match=None if 'mermaid' in bundle else bind(clip,rigs[sex])
        records.append({'guid':guid,'clipSha256':sha,'start':clip['start'],'end':clip['end'],'rig':None if rig_match is None else sex,'bindingEvidence':rig_match,'sourceBundleSha256':source['sourceBundleSha256']})
    write(out/'index.json',{'schema':'wand.photo-mode.private-decoded-curves@1','privateOnly':True,'publicationAuthorized':False,'gameVersion':manifest['gameVersion'],'fullPoseVerified':False,'clips':records})
    print(f'{len(records)} clips decoded and sampled; {sum(r["rig"] is not None for r in records)} normal-form rig binding reports')

if __name__=='__main__':
    main()
