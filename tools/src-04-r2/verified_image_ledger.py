#!/usr/bin/env python3
"""Durable image reuse index, independent of local WebP files."""
import argparse
import json
from pathlib import Path
from audit_native_map_cdn import check, SHA, LIMIT
from encode_native_map_originals import write_json, private_path

SCHEMA='wand.media.verified-image-ledger@1'
PROFILE='native-map-original-rgba-or-sdf-red@1'


def witness_key(meta):
    w,h,k,p=meta['width'],meta['height'],meta['kind'],meta['pixelSha256']
    check(type(w)==type(h)==int and 0<w*h<=100_000_000 and w>0 and h>0 and
          k in ('texture','sdf') and SHA.fullmatch(p),'Invalid original witness')
    return (PROFILE,k,w,h,p)


def index(doc):
    check(doc['schema']==SCHEMA and doc['profile']==PROFILE,'Unknown image ledger')
    result={}
    for sha,row in doc['images'].items():
        check(SHA.fullmatch(sha) and type(row['bytes'])==int and 20<=row['bytes']<=LIMIT
              and row['cdnVerified'] is True,'Unverified ledger entry')
        k=witness_key(row['witness'])
        # Keep existing encoded object identities even if multiple encoders produced equivalent pixels.
        result.setdefault(k,[]).append({'sha256':sha,**row})
    for candidates in result.values():candidates.sort(key=lambda row:(row['bytes'],row['sha256']))
    return result


def build(plan,audit,publication,cdn,prior=None):
    check(plan['schema']=='wand.src04.native-map-lossless-plan@1' and
          audit['schema']=='wand.src04.native-cdn-audit-input@1' and
          publication['schema']=='wand.src04.native-map-publication-plan@1' and
          publication['canonicalMetadataVerified'] is True and cdn['cdnVerified'] is True and
          not cdn['errors'] and plan['gameVersion']==audit['gameVersion']==publication['gameVersion'],
          'Complete canonical and CDN verification required')
    doc={'schema':SCHEMA,'profile':PROFILE,'images':{},'releases':{}}
    if prior:
        index(prior)
        doc=json.loads(json.dumps(prior))
    by_sha={}
    bindings={}
    for source,row in plan['images'].items():
        sha=row['sha256'];meta=row['witness'];n=row['bytes']
        check(SHA.fullmatch(source) and row['sourceSha256']==source and SHA.fullmatch(sha) and
              meta==audit['images'].get(sha) and publication['objects'].get('images/'+sha+'.webp')==n and
              cdn['verified'].get(sha)=={'bytes':n,'width':meta['width'],'height':meta['height']},
              'Source, canonical object or CDN witness mismatch')
        witness_key(meta)
        item={'bytes':n,'witness':meta,'cdnVerified':True}
        check(doc['images'].setdefault(sha,item)==item,'Conflicting historical object witness')
        by_sha[sha]=n
        bindings[source]=sha
    check(set(by_sha)==set(audit['images'])==set(cdn['verified']) and
          sum(by_sha.values())==plan['totalBytes'] and len(bindings)==plan['sourceIdentityCount'],
          'Incomplete release coverage')
    release={'bindings':bindings}
    if 'nativeSourceRefs' in plan:
        refs=plan['nativeSourceRefs']
        check(set(refs.values())==set(bindings),'Incomplete source reference mapping')
        release['nativeSourceRefs']=refs
    v=plan['gameVersion']
    check(doc['releases'].get(v,release)==release,'Release mapping changed; retain prior ledger before replacement')
    doc['releases'][v]=release
    index(doc)
    return doc


def lookup(entries,source,meta):
    matches=entries.get(witness_key(meta),[])
    if not matches:return None
    best=matches[0]
    return {'sourceSha256':source,'sha256':best['sha256'],'bytes':best['bytes'],
            'witness':meta,'reusedLocal':False,'reusedPublished':True}


def delta(entries,witnesses):
    reusable={s:r for s,m in witnesses.items() if (r:=lookup(entries,s,m)) is not None}
    return {'sourceCount':len(witnesses),'publishedReuse':len(reusable),
            'needsLocalPreparation':len(witnesses)-len(reusable),
            'reusedBytes':sum({r['sha256']:r['bytes'] for r in reusable.values()}.values())}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,required=True)
    p.add_argument('--cdn-report',type=Path,required=True)
    p.add_argument('--prior',type=Path)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();root=private_path(a.root);out=private_path(a.out)
    check(not out.exists(),'Use a new ledger file')
    read=lambda p:json.loads(p.read_bytes())
    doc=build(read(root/'native-map-lossless-plan.json'),read(root/'native-cdn-audit-input.json'),
              read(root/'native-map-publication-receipt.json'),read(a.cdn_report),
              read(a.prior) if a.prior else None)
    write_json(out,doc)
    print(len(doc['images']),'verified historical image objects; keep this ledger independently of local images')


if __name__=='__main__':main()
