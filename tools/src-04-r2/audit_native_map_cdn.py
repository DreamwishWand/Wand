#!/usr/bin/env python3
"""Private source-pixel audit for existing canonical map WebPs. No credentials or writes to CDN."""
import argparse
import hashlib
import io
import json
import re
import socket
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from PIL import Image
from urllib.error import HTTPError, URLError

USER_AGENT='DreamwishWand-MediaVerifier/1.0 (+https://dreamwishwand.com)'

ORIGIN='https://media.dreamwishwand.com'
SHA=re.compile(r'[0-9a-f]{64}')
LIMIT=80*1024*1024
TOTAL=500_000_000


def check(ok,msg):
    if not ok:raise ValueError(msg)


def digest(raw):return hashlib.sha256(raw).hexdigest()


def pixels(im,kind):
    rgba=im.convert('RGBA')
    return digest((rgba.getchannel('R') if kind=='sdf' else rgba).tobytes())


def clean(layer):
    row={k:layer[k] for k in ('kind','unitQuadToCanvas','rgba')}
    if layer['kind']!='fill':row.update({k:layer[k] for k in ('imageSha256','size','wrap','colorSpace')})
    if 'mask' in layer:
        m=layer['mask'];row['mask']={k:m[k] for k in ('kind','overlayToMaskUv')}
        if m['kind']=='alpha':row['mask']['image']=clean(m['image'])
    return row


def prepare(plan,folders):
    check(plan['privateOnly'] is True and plan['publicationAuthorized'] is False,'Expected private plan')
    expected={v for _,v in plan['refs']};check(len(expected)==118,'Unexpected reference coverage')
    maps=[];assets={}
    for m in plan['maps']:
        paths=[p/m['id']/'manifest.json' for p in folders if (p/m['id']/'manifest.json').is_file()]
        check(len(paths)==1,'Missing or ambiguous pack '+m['id']);p=paths[0];doc=json.loads(p.read_bytes())
        check(doc['schema']=='wand.media.native-local-preview@1' and doc['privateOnly'] is True and doc['publicationAuthorized'] is False and doc['worldPlacementVerified'] is False and len(doc['maps'])==1,'Invalid local fixture')
        local=doc['maps'][0];check(all(local[k]==m[k] for k in ('id','width','height')),'Fixture identity mismatch')
        seen={}
        def match(a,b):
            a,b=clean(a),clean(b);am=a.pop('mask',None);bm=b.pop('mask',None)
            check((am is None)==(bm is None),'Mask mismatch')
            if am:
                if am['kind']=='alpha':match(am.pop('image'),bm.pop('image'))
                check(am==bm,'Mask geometry mismatch')
            if a['kind']!='fill':
                sha=a.pop('imageSha256');png=b.pop('imageSha256')
                check(sha in expected and SHA.fullmatch(png),'Unknown image identity')
                if sha in seen:check(seen[sha]==png,'Conflicting PNG binding')
                else:
                    raw=(p.parent/(png+'.png')).read_bytes();check(digest(raw)==png,'PNG SHA mismatch')
                    with Image.open(io.BytesIO(raw)) as im:
                        check(im.format=='PNG' and not getattr(im,'is_animated',False) and list(im.size)==a['size'],'PNG size or format mismatch')
                        meta={'width':im.width,'height':im.height,'kind':a['kind'],'pixelSha256':pixels(im,a['kind'])}
                    check(sha not in assets or assets[sha]==meta,'Conflicting pixel witness');assets[sha]=meta;seen[sha]=png
            check(a==b,'Layer geometry or sampling mismatch')
        row={k:local[k] for k in ('id','width','height','ticksToCanvas')}
        for state in ('locked','unlocked'):
            check(len(m[state+'Plan'])==len(local[state]),'Draw coverage mismatch')
            for a,b in zip(m[state+'Plan'],local[state]):match(a,b)
            row[state]=[clean(a) for a in m[state+'Plan']]
        maps.append(row)
    check(len(maps)==10 and set(assets)==expected,'Incomplete source coverage')
    return {'schema':'wand.src04.native-cdn-audit-input@1','gameVersion':'1.26.2','privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,'images':assets,'maps':maps}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


def verify_bytes(sha,meta,raw):
    check(20<=len(raw)<=LIMIT and digest(raw)==sha,'Encoded SHA or size mismatch')
    with Image.open(io.BytesIO(raw)) as im:
        check(im.format=='WEBP' and not getattr(im,'is_animated',False) and im.size==(meta['width'],meta['height']),'WebP format or dimension mismatch')
        check(pixels(im,meta['kind'])==meta['pixelSha256'],'Original pixel mismatch')
    return len(raw)


def fetch(sha,budget):
    with build_opener(NoRedirect()).open(Request(ORIGIN+'/images/'+sha+'.webp',headers={'Accept':'image/webp','Accept-Encoding':'identity','User-Agent':USER_AGENT}),timeout=30) as response:
        check(response.status==200 and response.headers.get_content_type()=='image/webp','Unexpected HTTP response')
        check(response.headers.get('Cache-Control')=='public, max-age=31536000, immutable','Cache policy mismatch')
        n=int(response.headers.get('Content-Length','0'));check(0<n<=min(LIMIT,budget[0]),'Missing or oversized Content-Length')
        budget[0]-=n
        raw=response.read(n);check(len(raw)==n,'Byte length mismatch');return raw


def keys(layers):
    for l in layers:
        if l['kind']!='fill':yield l['imageSha256']
        if l.get('mask',{}).get('kind')=='alpha':yield from keys([l['mask']['image']])


def verify(doc,out,reader=fetch,*,stop_on_connection_error=True,prior=None,publication=None,stop_on_any_error=False):
    check(doc['schema']=='wand.src04.native-cdn-audit-input@1' and doc['privateOnly'] is True and doc['publicationAuthorized'] is False and doc['worldPlacementVerified'] is False and doc['gameVersion']=='1.26.2','Invalid audit input')
    assets=doc['images'];maps=doc['maps'];check(doc.get('sourceIdentityCount',len(assets))==118 and 0<len(assets)<=118 and len(maps)==10,'Unexpected audit coverage')
    check(set(assets)=={s for m in maps for s in keys(m['locked']+m['unlocked'])},'Unknown image reference')
    for s,m in assets.items():check(SHA.fullmatch(s) and SHA.fullmatch(m['pixelSha256']) and m['kind'] in ('texture','sdf') and type(m['width'])==type(m['height'])==int and 0<m['width']*m['height']<=100_000_000,'Invalid image witness')
    verified={};errors={};budget=[TOTAL];downloaded=0;stopped=None
    pin=digest(json.dumps(doc,sort_keys=True,separators=(',',':')).encode())
    if prior is not None:
        check(publication is not None and publication.get('canonicalMetadataVerified') is True and publication.get('bucket')=='dreamwishwand-media' and publication.get('gameVersion')==doc['gameVersion'],'Canonical receipt required for resume')
        objects=publication['objects']
        check(set(objects)=={'images/'+s+'.webp' for s in assets},'Receipt scope mismatch')
        check(prior.get('auditInputSha256',pin)==pin and prior.get('privateOnly') is True and prior.get('worldPlacementVerified') is False,'Prior audit mismatch')
        for sha,row in prior['verified'].items():
            check(sha in assets and row=={'bytes':objects['images/'+sha+'.webp'],'width':assets[sha]['width'],'height':assets[sha]['height']},'Prior image verification mismatch')
            verified[sha]=row
    resumed=len(verified)
    pending=[(s,m) for s,m in sorted(assets.items()) if s not in verified]
    print(f'Resuming: {resumed} verified; {len(pending)} remaining.',flush=True)
    def checkpoint():
        ready=[m for m in maps if set(keys(m['locked']+m['unlocked']))<=verified.keys()]
        report={'privateOnly':True,'publicationAuthorized':False,'cdnVerified':not errors and set(verified)==set(assets),'auditInputSha256':pin,'resumedVerified':resumed,'stoppedReason':stopped,'notAttempted':len(assets)-len(verified)-len(errors),'worldPlacementVerified':False,'verified':verified,'errors':errors,'downloadBytes':downloaded,'reservedReadBytes':TOTAL-budget[0],'readyMaps':[m['id'] for m in ready]}
        tmp=out/'audit.tmp';tmp.write_text(json.dumps(report,indent=2));tmp.replace(out/'audit.json')
        return report,ready
    checkpoint()
    for i,(sha,meta) in enumerate(pending,1):
        try:
            check(budget[0]>0,'Read budget exhausted');raw=reader(sha,budget);downloaded+=len(raw)
            n=verify_bytes(sha,meta,raw);verified[sha]={'bytes':n,'width':meta['width'],'height':meta['height']}
        except Exception as exc:
            errors[sha]=type(exc).__name__+': '+str(exc)[:160]
            if stop_on_connection_error and (stop_on_any_error or i==1 or isinstance(exc,(HTTPError,URLError,ConnectionError,TimeoutError))):
                stopped=errors[sha]
                print('CDN audit stopped: '+stopped,flush=True)
                break
        checkpoint()
        if i==1 and sha in verified:print('First remaining image verified; continuing.',flush=True)
        if i%10==0 or i==len(pending):print(f'CDN {len(verified)}/{len(assets)}; verified {len(verified)}; errors {len(errors)}',flush=True)
    report,ready=checkpoint()
    for m in ready:
        folder=out/m['id'];folder.mkdir();used=set(keys(m['locked']+m['unlocked']))
        (folder/'manifest.json').write_text(json.dumps({'schema':'wand.media.native-cdn-preview@1','gameVersion':'1.26.2','privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,'cdnVerified':True,'sourcePixelsVerified':True,'images':{s:verified[s] for s in sorted(used)},'maps':[m]},separators=(',',':')))
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='mode',required=True)
    a=sub.add_parser('prepare');a.add_argument('--plan',type=Path,required=True);a.add_argument('--packs',type=Path,nargs='+',required=True);a.add_argument('--out',type=Path,required=True)
    b=sub.add_parser('verify');b.add_argument('--input',type=Path,required=True);b.add_argument('--out',type=Path,required=True);b.add_argument('--confirm-read',action='store_true');b.add_argument('--resume',type=Path);b.add_argument('--publication',type=Path);b.add_argument('--transport',choices=('urllib','curl'),default='urllib')
    args=p.parse_args();out=args.out.resolve();check(not out.exists() and not any((q/'.git').exists() for q in out.parents),'New private output outside Git required')
    if args.mode=='prepare':
        doc=prepare(json.loads(args.plan.read_bytes()),args.packs);out.write_text(json.dumps(doc,separators=(',',':')));print(len(doc['images']),'original pixel witnesses; no network');return
    check(args.confirm_read,'Explicit read confirmation required (118 GETs, at most 500 MB, no writes)')
    doc=json.loads(args.input.read_bytes())
    prior=json.loads(args.resume.read_bytes()) if args.resume else None
    publication=json.loads(args.publication.read_bytes()) if args.publication else None
    out.mkdir()
    if args.transport=='curl':
        from native_cdn_curl import CurlReader
        check(publication is not None and publication.get('canonicalMetadataVerified') is True and publication.get('bucket')=='dreamwishwand-media' and publication.get('gameVersion')==doc['gameVersion'],'Canonical receipt required for curl')
        check(set(publication['objects'])=={'images/'+s+'.webp' for s in doc['images']},'Receipt scope mismatch')
        pending=sorted(set(doc['images'])-set(prior['verified'] if prior else {}))
        with CurlReader(pending,publication['objects']) as reader:
            r=verify(doc,out,reader,prior=prior,publication=publication,stop_on_any_error=True)
    else:
        r=verify(doc,out,prior=prior,publication=publication)
    print(len(r['verified']),'verified;',len(r['readyMaps']),'complete maps')
    raise SystemExit(0 if r['cdnVerified'] else 2)

if __name__=='__main__':main()
