"""Assemble a private local Collection diagnostic package; no public assets."""
import argparse,json
from pathlib import Path
from resolve_animation_bundle import digest
from pose_curves import require
from pose_textured import parse_glb
from pose_extend_package import read,verified
from PIL import Image


def build(index,packages,pairs,icons,out):
    projection=read(index);require(projection['schema']=='wand.photo-mode.private-asset-projection@1' and projection['privateOnly'] is True and projection['publicationAuthorized'] is False and projection['fullPoseVerified'] is False,'private projection required')
    out.mkdir(parents=True,exist_ok=False);models={};body_icons={};manifests={};items={}
    def store(data,ext):
        sha=digest(data);file=out/(sha+ext)
        if file.exists():require(file.read_bytes()==data,'hash collision')
        else:file.write_bytes(data)
        return dict(sha256=sha,bytes=len(data))
    for body,root in packages.items():
        m=read(root/'index.json');require(m['privateOnly'] is True and m['publicationAuthorized'] is False and m['model']==projection['models'][body],'package mismatch');manifests[body]=m;entry=m['model'];models[body]=store(verified(root/(entry['sha256']+'.glb'),entry['sha256'],entry['bytes']),'.glb');path=icons[body];require(path.name=='body_icon_'+body+'.png','unexpected source icon name')
        with Image.open(path) as im:require(im.size==(152,152) and im.mode=='RGBA','invalid body icon');im.verify()
        body_icons[body]=store(path.read_bytes(),'.png')
    for item,row in projection['items'].items():
        options={}
        for body,root in packages.items():
            for p in row['poses']:
                clip=p['clips'].get(body,{});entry=clip.get('asset');sha=clip.get('sourceSha256')
                if not entry:continue
                if row['kind']=='companion':
                    pair=pairs/(item+'-'+body+'.glb')
                    if not pair.exists():continue
                    raw=pair.read_bytes();g=parse_glb(raw);a=g.doc['animations'][0]['extras'];require(g.doc['asset']['extras']['attachedPairDiagnostic'] is True and a['sourceSha256']==sha and a['companionItemId']==int(item) and p.get('actor') and a['companionClipSha256']==p['actor']['clipSha256'],'pair mismatch');options[body]=dict(kind='pair',sourceSha256=sha,asset=store(raw,'.glb'));break
                c=next(c for c in manifests[body]['clips'] if c['sourceSha256']==sha);require(c['sha256']==entry['sha256'] and c['bytes']==entry['bytes'],'clip mismatch');store(verified(root/(c['sha256']+'.wpa'),c['sha256'],c['bytes']),'.wpa');options[body]=dict(kind='player',sourceSha256=sha,clip=c,accessoryIncluded=False);break
        if set(options)==set(packages):items[item]=options
    result=dict(schema='wand.photo-mode.private-local-collection@1',privateOnly=True,publicationAuthorized=False,fullPoseVerified=False,gameVersion=projection['gameVersion'],projectionSha256=digest(index.read_bytes()),models=models,bodyIcons=body_icons,items=items);(out/'local-preview.json').write_text(json.dumps(result,separators=(',',':'),allow_nan=False));print('items',len(items),'body options',sum(map(len,items.values())),'files',len(list(out.iterdir())))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--index',type=Path,required=True);p.add_argument('--male-package',type=Path,required=True);p.add_argument('--female-package',type=Path,required=True);p.add_argument('--pairs',type=Path,required=True);p.add_argument('--male-icon',type=Path,required=True);p.add_argument('--female-icon',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();require(not any((x/'.git').exists() for x in (out,*out.parents)),'private output only');build(a.index,{'male':a.male_package,'female':a.female_package},a.pairs,{'male':a.male_icon,'female':a.female_icon},out)
