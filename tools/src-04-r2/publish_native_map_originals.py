#!/usr/bin/env python3
"""Plan and optionally publish source-pixel-verified map originals, never activate a product manifest."""
import argparse
import json
from pathlib import Path
from audit_native_map_cdn import verify_bytes, keys, check, SHA
from encode_native_map_originals import private_path, write_json
from publish_bundle_thumbnails import key, census, publish, BUCKET
from publish_world_map_parts import split
from publish_recovered_map_parts import client


def load(root,ledger=None):
    from verified_image_ledger import index, witness_key
    prior=index(ledger) if ledger else {}
    audit = json.loads((root/'native-cdn-audit-input.json').read_bytes())
    plan = json.loads((root/'native-map-lossless-plan.json').read_bytes())
    check(audit['schema']=='wand.src04.native-cdn-audit-input@1' and
          plan['schema']=='wand.src04.native-map-lossless-plan@1' and
          all(d['gameVersion']=='1.26.2' and d['privateOnly'] is True and
              d['publicationAuthorized'] is False and d['worldPlacementVerified'] is False
              for d in (audit,plan)), 'Expected private Steam 1.26.2 candidates')
    check(audit['sourceIdentityCount']==plan['sourceIdentityCount']==len(plan['images'])==118
          and len(audit['maps'])==10 and len(audit['images'])==plan['uniqueImages']
          and set(audit['images'])=={s for m in audit['maps'] for s in keys(m['locked']+m['unlocked'])},
          'Incomplete source or map coverage')
    by_sha={}
    reused=set()
    for source,row in plan['images'].items():
        sha=row['sha256']
        check(SHA.fullmatch(source) and source==row['sourceSha256'] and SHA.fullmatch(sha)
              and row['witness']==audit['images'].get(sha),'Source witness mismatch')
        if sha in by_sha:
            check(by_sha[sha]==row['bytes'],'Conflicting byte count')
        by_sha[sha]=row['bytes']
        if row.get('reusedPublished') is True:
            matches=prior.get(witness_key(row['witness']),[])
            check(any(r['sha256']==sha and r['bytes']==row['bytes'] for r in matches),'Published reuse requires matching verified ledger')
            reused.add(sha)
    check(set(by_sha)==set(audit['images']),'Unreferenced source')
    assets={}
    for sha,meta in audit['images'].items():
        k=key(sha)
        p=root/k
        if p.is_file():
            n=verify_bytes(sha,meta,p.read_bytes())
        else:
            check(sha in reused,'Missing local image without verified published reuse: '+sha)
            n=by_sha[sha]
        check(n==by_sha[sha],'Local byte count mismatch')
        assets[k]={'sha256':sha,'bytes':n,'width':meta['width'],'height':meta['height']}
    check(sum(v['bytes'] for v in assets.values())==plan['totalBytes'],'Local total mismatch')
    return assets


def run(root,r2,max_objects,max_bytes,ledger=None):
    root=private_path(root)
    assets=load(root,ledger)
    summary={'schema':'wand.src04.native-map-publication-plan@1','gameVersion':'1.26.2',
        'bucket':BUCKET,'privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,
        'cdnVerified':False,'uniqueImages':len(assets),'totalBytes':sum(v['bytes'] for v in assets.values()),
        'generatedCompositeImages':0,'deleteRequests':0,'copyRequests':0}
    if not r2:
        print(json.dumps(summary,indent=2));return
    s3=client()
    _,canonical,pages,_=census(s3)
    existing,pending=split(assets,canonical)
    summary.update(existing=len(existing),newUploads=len(pending),newBytes=sum(v['bytes'] for v in pending.values()),
                   listRequests=pages,classAUpperBound=pages+len(pending),classBUpperBound=len(assets))
    missing=[k for k in pending if not (root/k).is_file()]
    check(not missing,'Previously verified objects missing in R2; restore or regenerate before publication: '+', '.join(missing[:3]))
    write_json(root/'native-map-publication-plan.json',summary)
    print(json.dumps(summary,indent=2),flush=True)
    check(len(pending)<=max_objects and summary['newBytes']<=max_bytes,
          'Explicit upload limits exceeded; no writes')
    if input('Confirm remaining account-wide free allowance. Type UPLOAD: ')!='UPLOAD':
        return
    verified=publish(s3,root,existing,pending)
    check(verified=={k:v['bytes'] for k,v in assets.items()},'Incomplete canonical receipt')
    write_json(root/'native-map-publication-receipt.json',{**summary,'canonicalMetadataVerified':True,
               'objects':verified})
    print('Canonical metadata verified. CDN source pixels and game-frame/placement verification are separate.')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,required=True)
    p.add_argument('--r2',action='store_true')
    p.add_argument('--max-new-objects',type=int,default=0)
    p.add_argument('--max-new-bytes',type=int,default=0)
    p.add_argument('--ledger',type=Path)
    a=p.parse_args()
    check(0<=a.max_new_objects<=118 and a.max_new_bytes>=0,'Invalid upload limit')
    run(a.root,a.r2,a.max_new_objects,a.max_new_bytes,json.loads(a.ledger.read_bytes()) if a.ledger else None)


if __name__=='__main__':
    main()
