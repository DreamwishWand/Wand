#!/usr/bin/env python3
"""Prepare native map originals from the two version-pinned game bundles without staging PNGs."""
import argparse
import json
import math
import re
from pathlib import Path
from audit_native_map_cdn import clean, keys, pixels, check, SHA
from encode_native_map_originals import private_path, reuse_candidates, match_reuse, encode_one, finish


def prepare_geometry(plan, registration):
    check(plan['privateOnly'] is True and plan['publicationAuthorized'] is False and
          registration['schema']=='wand.src04.native-map-registration-candidate@1' and
          registration['privateOnly'] is True and registration['publicationAuthorized'] is False and
          registration['worldPlacementVerified'] is False, 'Expected private native candidates')
    refs=plan['refs']
    check(len(refs)==118 and len(dict(refs))==118 and len({v for _,v in refs})==118 and
          all(re.fullmatch(r'cab-[0-9a-f]{32}/-?\d+',k) and SHA.fullmatch(v) for k,v in refs),
          'Invalid native reference coverage')
    regs={r['prefab']:r for r in registration['maps']}
    maps=plan['maps']
    check(len(maps)==len(regs)==len(registration['maps'])==10 and
          len({m['id'] for m in maps})==10 and set(regs)=={m['id'] for m in maps},
          'Incomplete map identity coverage')
    check(sum(len(m['lockedPlan']) for m in maps)==213 and
          sum(len(m['unlockedPlan']) for m in maps)==119,'Unexpected draw coverage')
    expected={}
    def visit(layer):
        if layer['kind']!='fill':
            sha=layer['imageSha256']
            w,h=layer['size']
            check(SHA.fullmatch(sha) and type(w)==type(h)==int and 0<w*h<=100_000_000 and
                  w>0 and h>0 and layer['kind'] in ('texture','sdf'),'Invalid source image')
            meta={'width':w,'height':h,'kind':layer['kind']}
            check(expected.setdefault(sha,meta)==meta,'Conflicting source dimensions or kind')
        if layer.get('mask',{}).get('kind')=='alpha':
            visit(layer['mask']['image'])
    out=[]
    for m in maps:
        name=m['id'];r=regs[name]
        check(re.fullmatch(r'MapVillage[A-Za-z0-9]+',name) and r['worldPlacementVerified'] is False,
              'Unexpected map identity')
        w,h=m['width'],m['height'];matrix=r['halfWorldTicksToCanvasCandidate']
        check(type(w)==type(h)==int and 0<w<=32768 and 0<h<=32768 and
              len(matrix)==6 and all(math.isfinite(v) for v in matrix) and
              matrix[0]==matrix[3]>0 and matrix[1]==matrix[2]==0,'Invalid map extent or projection')
        row={'id':name,'width':w,'height':h,'ticksToCanvas':matrix}
        for state in ('locked','unlocked'):
            row[state]=[clean(l) for l in m[state+'Plan']]
            for l in row[state]:visit(l)
        out.append(row)
    check(set(expected)=={v for _,v in refs},'Unreferenced texture or unknown layer')
    return {'schema':'wand.src04.native-cdn-audit-input@1','gameVersion':'1.26.2',
            'privateOnly':True,'publicationAuthorized':False,'worldPlacementVerified':False,
            'images':expected,'maps':out}


def run(plan,registration,hires,lowres,out,roots,ledger=None):
    from verify_native_map_egl import index_assets, decode
    from verified_image_ledger import index, lookup
    prior=index(ledger) if ledger else {}
    out=private_path(out)
    audit=prepare_geometry(plan,registration)
    rows=index_assets(hires,lowres,plan['refs'])
    check(set(rows)==set(audit['images']),'Original texture index mismatch')
    out.mkdir(parents=True,exist_ok=True)
    (out/'images').mkdir(exist_ok=True)
    (out/'receipts').mkdir(exist_ok=True)
    candidates=reuse_candidates(roots)
    receipts={}
    for sha,meta in sorted(audit['images'].items()):
        row=rows[sha]
        check((meta['width'],meta['height'])==tuple(row[4:6]) and
              (meta['kind']=='sdf')==(row[6]==63),'Native texture dimensions or format changed')
        # Decode the version-pinned texture; never trust an old encoded filename as its pixel witness.
        with decode(row) as original:
            meta['pixelSha256']=pixels(original,meta['kind'])
            published=lookup(prior,sha,meta)
            if published:
                receipts[sha]=published
            else:
                reusable=None if (out/'receipts'/(sha+'.json')).is_file() else match_reuse(candidates,meta)
                receipts[sha]=encode_one(sha,None,meta,out,reusable,decoded=original)
        r=receipts[sha]
        print(f"Verified {len(receipts)}/118: {r['sha256']} ({r['bytes']} bytes)",flush=True)
    return finish(audit,receipts,out,native_refs=dict(plan['refs']))


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('plan','registration','hires','lowres','out'):
        p.add_argument('--'+key,type=Path,required=True)
    p.add_argument('--reuse-dir',type=Path,action='append',default=[])
    p.add_argument('--ledger',type=Path)
    a=p.parse_args()
    summary=run(json.loads(a.plan.read_bytes()),json.loads(a.registration.read_bytes()),
                a.hires,a.lowres,a.out,a.reuse_dir,json.loads(a.ledger.read_bytes()) if a.ledger else None)
    print(summary['uniqueImages'],'unique original WebPs;',summary['totalBytes'],'bytes; no network writes')


if __name__=='__main__':
    main()
