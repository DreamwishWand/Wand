"""Build a private SHA-pinned SRC-04 missing-object inspection plan.

Reads verified SRC-00 source inventory and exact Addressables location report.
Filters broad dependency groups and shader/runtime support bundles. It does not
claim item-image identity, touch game files, or publish game-derived datasets.
"""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

SCHEMA = 'wand.src04.missing-object-plan@1'
SHA = re.compile(r'^[a-f0-9]{64}$')
GUID = re.compile(r'^guid:([a-f0-9]{32})$')
GENERIC = {
 'shaders_assets_all.bundle',
 '6fee666c0313135484d5366180961639_monoscripts.bundle',
 'ddv_unitybuiltinshaders.bundle',
 'urp-materials_assets_all.bundle',
 'urp-shaders_assets_all.bundle',
 'avatar-tasks_assets_all.bundle',
 'navigation_assets_all.bundle',
}


def require(ok, code):
    if not ok: raise ValueError('SRC04_MISSING_PLAN_'+code)


def build(missing_bytes, source_bytes):
    missing = json.loads(missing_bytes)
    source = json.loads(source_bytes)
    require(missing.get('schema')=='wand.src04.missing-locations@1' and
            missing.get('publicationApproved') is False and
            missing.get('complete') is True, 'MISSING_REPORT_NOT_VERIFIED')
    require(missing.get('unresolvedGuidCount')==360 and
            missing.get('catalogLocatedGuidCount')==360 and
            missing.get('unresolvedItemCount')==2416, 'EXPECTED_INPUT_COUNT')
    require(source.get('status')=='complete' and
            isinstance(source.get('files'),list), 'SOURCE_INVENTORY_NOT_COMPLETE')
    sources=collections.defaultdict(list)
    for entry in source['files']:
        path=entry.get('path','')
        if not path.endswith('.bundle'): continue
        require(path.startswith('ddv_Data/StreamingAssets/aa/win/') and
                '..' not in path.split('/') and '\\' not in path and
                isinstance(entry.get('size'),int) and entry['size']>0 and
                isinstance(entry.get('sha256'),str) and SHA.fullmatch(entry['sha256']),
                'BAD_SOURCE_FILE')
        sources[path.split('/')[-1].lower()].append(entry)
    targets=collections.defaultdict(set)
    skipped=[]
    seen=set()
    for entry in missing.get('guids',[]):
        text=entry.get('iconGuid','')
        m=GUID.fullmatch(text)
        require(m is not None and m.group(1) not in seen,'INVALID_OR_DUPLICATE_GUID')
        guid=m.group(1)
        seen.add(guid)
        names=entry.get('bundleFilenames')
        require(isinstance(names,list) and names and len(set(names))==len(names), 'INVALID_BUNDLE_LOCATIONS')
        if len(names)>50:
            skipped.append(guid)
            continue
        specific=sorted(set(names)-GENERIC)
        require(specific,'NO_SPECIFIC_BUNDLE')
        for name in specific: targets[name].add(guid)
    require(len(seen)==360 and len(skipped)==2 and len(targets)==220, 'UNEXPECTED_SELECTION')
    bundles=[]
    for name, guids in targets.items():
        rows=sources[name]
        require(len(rows)==1, 'BUNDLE_NOT_UNIQUE_'+name)
        row=rows[0]
        bundles.append({'path':row['path'],'sha256':row['sha256'],
                        'size':row['size'],'guids':sorted(guids)})
    bundles.sort(key=lambda x:(x['size'],x['path']))
    return {'schema':SCHEMA, 'publicationApproved':False,
            'sourceItemsSha256':missing['sourceItemsSha256'],
            'missingReportSha256':hashlib.sha256(missing_bytes).hexdigest(),
            'selectionPolicy':'exclude_known_shared_shader_runtime_dependencies; defer_686_bundle_groups',
            'skippedBroadGuids':sorted(skipped),'bundles':bundles}


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--missing',type=Path,required=True)
    p.add_argument('--source-manifest',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    for ancestor in [args.out.resolve().parent,*args.out.resolve().parent.parents]:
        require(not (ancestor/'.git').exists(), 'PRIVATE_OUTPUT_IN_GIT')
    plan=build(args.missing.read_bytes(),args.source_manifest.read_bytes())
    require(not args.out.exists(), 'REFUSE_OVERWRITE')
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(plan,ensure_ascii=False,sort_keys=True,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'bundleCount':len(plan['bundles']),
       'scannableGuidCount':len({g for b in plan['bundles'] for g in b['guids']}),
       'skippedBroadGuidCount':len(plan['skippedBroadGuids']),
       'sourceBytes':sum(b['size'] for b in plan['bundles'])}))


if __name__=='__main__': main()
