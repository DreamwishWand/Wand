#!/usr/bin/env python3
"""Join native background geometry to the existing encoded-image index. Private only."""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path
from PIL import Image

SHA=re.compile(r'[a-f0-9]{64}')
PATH=re.compile(r'images/maps/original/([a-f0-9]{2})/([a-f0-9]{64})\.webp')

def check(ok,message):
    if not ok:raise ValueError(message)

def ref(cab,pid):
    check(isinstance(pid,str) and re.fullmatch(r'-?\d+',pid),'Invalid serialized ID')
    return cab.lower(),pid

def local_verify(root,path,sha,size,expected_bytes=None):
    if root is None:return False
    for relative in (f'images/{sha}.webp',path):
        p=(root/relative).resolve()
        check(p.is_relative_to(root),'Unsafe image path')
        if not p.is_file():continue
        check(20<=p.stat().st_size<=80*1024*1024,'Invalid image bytes')
        raw=p.read_bytes()
        check(hashlib.sha256(raw).hexdigest()==sha and (expected_bytes is None or len(raw)==expected_bytes),'Existing image hash/size mismatch: '+sha)
        with Image.open(io.BytesIO(raw)) as im:
            check(im.format=='WEBP' and not getattr(im,'is_animated',False) and list(im.size)==size,'Existing image dimension/format mismatch: '+sha)
            im.load()
        return True
    return False

def bind(geometry,hires,ordinary,ocean,root=None):
    check(geometry['schema']=='wand.src04.native-map-geometry-candidate@1' and geometry['state']=='unpublished' and geometry['publicationAuthorized'] is False,'Unexpected geometry')
    check(hires['schema']=='wand.src04.native-map-texture-refs@1' and hires['samplingMetadataVerified'] and hires['bundleSha256']==geometry['sources']['hiresSha256'],'Hires source mismatch')
    check(ordinary['schema']=='wand.src04.world-map-repair@3' and ocean['schema']=='wand.media.ocean-source-candidate@1' and ordinary['gameVersion']==ocean['gameVersion']=='1.26.2' and ordinary['publicationAuthorized'] is False and ocean['publicationAuthorized'] is False,'Unexpected previous index')
    worlds={w['prefab']:w for w in ordinary['worlds']}
    check(len(worlds)==len(ordinary['worlds'])==len(geometry['maps'])==10,'Map coverage mismatch')
    sdf={ref(t['cab'],t['pathId']):t for t in ocean['textures']}
    check(len(sdf)==len(ocean['textures'])==7,'SDF index mismatch')
    used=set();seen_maps=set();out=[];counts={'texture':0,'sdf':0,'fill':0};verified=0
    for world in geometry['maps']:
        mid=world['id'];check(mid not in seen_maps,'Duplicate map');seen_maps.add(mid)
        old=worlds[mid]['parts'];by_guid={p['layoutEvidence']['guid']:p for p in old}
        native=[p['guid'] for p in world['layers'] if p['kind']=='texture']
        check(len(by_guid)==len(old) and native==list(by_guid),'Native texture order or GUID mismatch: '+mid)
        layers=[]
        for p in world['layers']:
            kind=p['kind'];counts[kind]+=1;row=dict(p)
            if kind=='fill':layers.append(row);continue
            if kind=='texture':
                guid=p['guid'];prior=by_guid[guid];e=prior['layoutEvidence'];g=hires['assets'][guid];t,s=g['28'],g['213']
                check(e['componentEnabled'] is True and e['mapping']=='observed_guid_field_exact_catalog_internal_id_container_pptr' and e['catalogInternalIds']==[guid],'Invalid old reference')
                check(ref(*e['highSprite'])==ref(hires['cab'],s['pathID']) and s['texturePathID']==t['pathID'] and s['name']==t['name']==prior['name'],'Native sprite identity mismatch')
                check(ref(p['source']['cab'],p['source']['pathID'])==ref(hires['cab'],t['pathID']) and p['size']==[t['width'],t['height']],'Native texture identity mismatch')
                check(s['offset']==[0,0] and abs(s['rect'][0])<1e-4 and abs(s['rect'][1])<1e-4 and all(abs(s['rect'][i+2]-p['size'][i])<1e-3 for i in range(2)),'Non-full Sprite needs explicit pixel mapping')
                sha,path,n=prior['imageSha256'],prior['imagePath'],None
            else:
                check(mid=='MapVillageExpansion4','Unexpected SDF world')
                prior=sdf[ref(p['source']['cab'],p['source']['pathID'])]
                check(prior['format']==63 and p['size']==[prior['width'],prior['height']],'SDF dimensions/format mismatch')
                sha,path,n=prior['sha256'],prior['path'],prior['bytes']
            m=PATH.fullmatch(path);check(SHA.fullmatch(sha) and m and m[1]==m[2][:2] and sha not in used,'Invalid or duplicate prior image identity');used.add(sha)
            ok=local_verify(root,path,sha,p['size'],n);verified+=ok
            row.update(imageSha256=sha,localImageBytesVerified=ok)
            # Existing bytes are not proof of current CDN presence or native SDF red equivalence.
            layers.append(row)
        out.append({**world,'layers':layers})
    check(seen_maps==set(worlds) and counts=={'texture':109,'sdf':7,'fill':11} and len(used)==116,'Incomplete layer coverage')
    return {**geometry,'schema':'wand.src04.native-map-image-candidate@1','canonicalMetadataVerified':False,'cdnVerified':False,'sdfRedEquivalenceVerified':False,'localImageBytesVerifiedCount':verified,'maps':out}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('geometry','hires-index','out'):p.add_argument('--'+name,type=Path,required=True)
    for name,file in [('ordinary-index','world-map-source-steam-1.26.2.json'),('ocean-index','world-map-ocean-source-steam-1.26.2.json')]:p.add_argument('--'+name,type=Path,default=Path(__file__).with_name(file))
    p.add_argument('--image-root',type=Path);a=p.parse_args();out=a.out.resolve()
    check(not out.exists() and not any((x/'.git').exists() for x in out.parents),'Use new private output outside Git')
    args=[json.loads(p.read_bytes()) for p in (a.geometry,a.hires_index,a.ordinary_index,a.ocean_index)]
    doc=bind(*args,root=a.image_root.resolve() if a.image_root else None)
    with out.open('x',encoding='utf-8') as f:json.dump(doc,f,separators=(',',':'),allow_nan=False)
    print('Linked 116 prior image candidates; locally verified encoded bytes:',doc['localImageBytesVerifiedCount'])

if __name__=='__main__':main()
