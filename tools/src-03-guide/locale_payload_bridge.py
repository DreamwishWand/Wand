"""DB-03: verify same-content localization ZIPs across Steam builds.

A ZIP's byte hash may change only because of container metadata. Only exact,
verified uncompressed member path + payload identity permits reuse of an
older same-source localization projection. No game text is published.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile

SCHEMA = 'wand.db03.locale-payload-bridge@1'
LOCALES = {'en':'en-US','fr':'fr','it':'it','de':'de','es-ES':'es',
           'ja':'ja','zh-CN':'zh-CN','pt-BR':'pt-BR'}
HASH = re.compile(r'^[a-f0-9]{64}$')
MAX_ZIP = 64*1024*1024
MAX_ENTRIES = 50000
MAX_MEMBER = 4*1024*1024
MAX_TOTAL = 128*1024*1024

def require(ok, code):
    if not ok: raise ValueError('DB03_LOCALE_BRIDGE_' + code)

def digest(data): return hashlib.sha256(data).hexdigest()

def load(path):
    require(path.is_file() and not path.is_symlink(), 'MISSING_INPUT')
    require(0 < path.stat().st_size < 32*1024*1024, 'INVALID_JSON_SIZE')
    value=json.loads(path.read_text(encoding='utf-8-sig'))
    require(isinstance(value,dict), 'JSON_OBJECT_REQUIRED')
    return value

def inspect_zip(path, expected_sha, expected_count=None):
    require(path.is_file() and not path.is_symlink(), 'MISSING_ZIP')
    require(0 < path.stat().st_size <= MAX_ZIP, 'ZIP_SIZE_LIMIT')
    require(isinstance(expected_sha,str) and HASH.fullmatch(expected_sha), 'UNPINNED_ZIP')
    require(_file_sha(path)==expected_sha, 'ZIP_SHA_MISMATCH')
    try:
        with zipfile.ZipFile(path) as bundle:
            entries=bundle.infolist()
            require(bool(entries) and len(entries)<=MAX_ENTRIES, 'ZIP_ENTRY_COUNT')
            require(expected_count is None or len(entries)==expected_count,
                    'ZIP_CENSUS_MISMATCH')
            seen=set();total=0;items={}
            for info in entries:
                name=info.filename
                require(isinstance(name,str) and bool(name) and name not in seen,
                        'DUPLICATE_OR_EMPTY_ZIP_PATH')
                require(not info.is_dir() and name.endswith('.locbin')
                        and not name.startswith('/') and '\\' not in name
                        and not any(x in ('','.','..') for x in name.split('/')),
                        'UNSAFE_ZIP_MEMBER_PATH')
                require(not info.flag_bits&1 and info.file_size<=MAX_MEMBER
                        and info.compress_size<=MAX_ZIP, 'ZIP_MEMBER_LIMIT')
                total+=info.file_size
                require(total<=MAX_TOTAL, 'ZIP_EXPANDED_SIZE_LIMIT')
                seen.add(name)
                data=bundle.read(info)
                require(len(data)==info.file_size, 'ZIP_MEMBER_SHORT_READ')
                items[name]=digest(data)
    except (zipfile.BadZipFile, EOFError, OSError, RuntimeError) as exc:
        raise ValueError('DB03_LOCALE_BRIDGE_BAD_ARCHIVE') from exc
    tree=hashlib.sha256()
    for path_key in sorted(items):
        path_bytes=path_key.encode('utf-8')
        tree.update(len(path_bytes).to_bytes(4,'big'))
        tree.update(path_bytes)
        tree.update(bytes.fromhex(items[path_key]))
    return {'zipSha256':expected_sha,'memberCount':len(items),
            'uncompressedBytes':total,'memberTreeSha256':tree.hexdigest()}, items

def _file_sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def compare(baseline_dir, target_dir, baseline_manifest, target_probe,
            baseline_manifest_sha, target_probe_sha):
    old=baseline_manifest.get('target') or {}
    new=target_probe
    require(baseline_manifest.get('schema')=='wand.db03.native-guide@1'
            and target_probe.get('schema')=='wand.src01.format-probe@1'
            and old.get('platform')=='Steam' and new.get('platform')=='Steam'
            and isinstance(old.get('gameVersion'),str)
            and isinstance(new.get('gameVersion'),str)
            and old['gameVersion']!=new['gameVersion'], 'VERSION_PROVENANCE')
    require(isinstance(baseline_manifest_sha,str) and HASH.fullmatch(baseline_manifest_sha)
            and isinstance(target_probe_sha,str) and HASH.fullmatch(target_probe_sha),
            'UNPINNED_MANIFEST')
    sources=baseline_manifest.get('localizationSources') or {}
    target=new.get('localization') or {}
    require(set(sources)==set(LOCALES) and set(target)==set(LOCALES),
            'MISSING_LOCALE_PROVENANCE')
    rows={};all_identical=True
    for locale,suffix in sorted(LOCALES.items()):
        name=f'LocDB_{suffix}.zip'
        baseline=sources.get(locale)
        current=target.get(locale)
        require(isinstance(baseline,dict) and baseline.get('file')==name
                and isinstance(current,dict) and current.get('source')==
                    'ddv_Data/StreamingAssets/Localization/'+name
                and current.get('status')=='inspected'
                and type(current.get('archiveEntries')) is int
                and current['archiveEntries']>0, 'LOCALE_SOURCE_PROVENANCE')
        a,old_members=inspect_zip(baseline_dir/name,baseline.get('sha256'))
        b,new_members=inspect_zip(target_dir/name,current.get('sha256'),
                                  current['archiveEntries'])
        old_ids,new_ids=set(old_members),set(new_members)
        changed=sum(old_members[k]!=new_members[k] for k in old_ids & new_ids)
        added=len(new_ids-old_ids);removed=len(old_ids-new_ids)
        equal=added==removed==changed==0
        all_identical&=equal
        rows[locale]={
            'memberPayloadsIdentical':equal,
            'baseline':a,'target':b,
            'addedMembers':added,'removedMembers':removed,'changedMemberPayloads':changed,
            'zipContainerBytesIdentical':a['zipSha256']==b['zipSha256']
        }
    return {
        'schema':SCHEMA,
        'status':'PAYLOAD_IDENTICAL_ALL_EIGHT_LOCALES' if all_identical
                 else 'PAYLOAD_CHANGED_REEXTRACT_REQUIRED',
        'baseline':{'platform':'Steam','gameVersion':old['gameVersion'],
                    'manifestSha256':baseline_manifest_sha},
        'target':{'platform':'Steam','gameVersion':new['gameVersion'],
                  'sourceProbeSha256':target_probe_sha},
        'locales':rows,
        'localeCount':len(rows),
        'memberComparisons':sum(x['baseline']['memberCount'] for x in rows.values()),
        'limits':{'reusedScope':'uncompressed_localization_member_payload_only',
                  'conditionSemantics':'NOT_VERIFIED_BY_THIS_BRIDGE',
                  'playerProgressAndStarPath':'NOT_VERIFIED',
                  'publicTextDistribution':'NOT_AUTHORIZED'}
    }

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--baseline-loc-dir',type=Path,required=True)
    p.add_argument('--target-loc-dir',type=Path,required=True)
    p.add_argument('--baseline-manifest',type=Path,required=True)
    p.add_argument('--target-probe',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args(argv)
    require(args.baseline_loc_dir.resolve()!=args.target_loc_dir.resolve(),
            'SAME_SOURCE_FOLDERS')
    dest=args.out.resolve()
    inputs=[args.baseline_manifest.resolve(),args.target_probe.resolve()]
    require(dest not in inputs and not dest.is_relative_to(args.baseline_loc_dir.resolve())
            and not dest.is_relative_to(args.target_loc_dir.resolve()), 'OUTPUT_SOURCE_OVERLAP')
    checkout=Path(__file__).resolve().parents[2]
    if (checkout/'package.json').is_file():
        require(not dest.is_relative_to(checkout), 'REPORT_INSIDE_PUBLIC_CHECKOUT')
    report=compare(args.baseline_loc_dir,args.target_loc_dir,
                   load(args.baseline_manifest),load(args.target_probe),
                   _file_sha(args.baseline_manifest),_file_sha(args.target_probe))
    dest.parent.mkdir(parents=True,exist_ok=True)
    tmp=dest.with_name(dest.name+'.tmp')
    tmp.write_text(json.dumps(report,sort_keys=True,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    os.replace(tmp,dest)
    try:os.chmod(dest,0o600)
    except OSError:pass
    print(json.dumps({'status':report['status'],'locales':report['localeCount'],
                      'members':report['memberComparisons']},sort_keys=True))
    return 0

if __name__=='__main__':raise SystemExit(main())
