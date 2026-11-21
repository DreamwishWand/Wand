@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "SRC04_SELF=%~f0"
set "SRC04_HELPER=%TEMP%\DreamwishWand_SRC04_identity_probe_v2.py"
set "SRC04_OUTPUT=%USERPROFILE%\Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2"
set "SRC04_GAME=C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley"
if not exist "%SRC04_OUTPUT%" mkdir "%SRC04_OUTPUT%"
echo SRC-04: resolve GUID-to-Sprite/Texture2D identities in 24 bundles (metadata only)...
echo Existing images will not be modified.
echo Log: "%SRC04_OUTPUT%\catalog-identity-v2-console.log"
py -3 -c "import os,pathlib; d=pathlib.Path(os.environ['SRC04_SELF']).read_bytes(); m=b'# __SRC04_PYTHON_PAYLOAD_BELOW__'; assert m in d; p=pathlib.Path(os.environ['SRC04_HELPER']); p.write_bytes(d.rsplit(m,1)[1].lstrip(b'\r\n'))"
if errorlevel 1 goto :failed
py -3 "%SRC04_HELPER%" --game "%SRC04_GAME%" --out "%SRC04_OUTPUT%" --all > "%SRC04_OUTPUT%\catalog-identity-v2-console.log" 2>&1
set "RC=%ERRORLEVEL%"
type "%SRC04_OUTPUT%\catalog-identity-v2-console.log"
if not "%RC%"=="0" goto :failed
echo.
echo SRC-04 metadata-only identity diagnostic complete.
echo Please upload: "%SRC04_OUTPUT%\catalog-identity-report.json"
goto :finish
:failed
echo.
echo SRC-04 diagnostic encountered an error. Please upload:
echo "%SRC04_OUTPUT%\catalog-identity-v2-console.log"
echo Existing images and game files were not modified.
:finish
echo.
echo Press any key to close this window.
pause >nul
exit /b
# __SRC04_PYTHON_PAYLOAD_BELOW__
"""Read-only SRC-04 catalog-to-Unity object identity probe, revision 2.

Inspects selected *existing* Unity AssetBundle serialized container metadata.
No image decoding, re-extraction, file changes, uploads, or fuzzy matching.
Only a bundle key containing the exact GUID AND a matching serialized Unity
path_id can establish item->object identity. Everything else is diagnostics.
"""
import argparse
import collections
import hashlib
import json
import re
import struct
import traceback
from pathlib import Path

CATALOG_SHA = {
    'keyData': '20be86edc02effe8f236e722ac0125459790de5415e9ba2f1456e3c85b5f6176',
    'bucketData': 'bcfdf91e4206bc09ea7a013a298f4f2432b9f84905deebc753776e800b07bc9e',
    'entryData': 'fc4a579b494b4e80c0ebfba5ca0d8d2d4abca10c34f3555b9ad84146b6aba866',
    'InternalIds': '09d7a580c211d1a3606488403ea6431fdae3c63aa281152ccf3bccab7402b4c6',
}
TARGETS = ('buffelixir_01c14456.bundle', 'fish_3f084647.bundle',
           'wallpaper_753ee7b6.bundle', 'accessory_93d391f5.bundle')
GKEY = re.compile(r'^[0-9a-f]{32}$')
GTOKEN = re.compile(r'(?<![a-zA-Z0-9])(?:guid:)?([0-9a-f]{32})(?![a-zA-Z0-9])', re.I)
BUNDLE = re.compile(r'([a-z0-9_-]+\.bundle)', re.I)


def read_dict(path):
    return json.loads(path.read_text(encoding='utf-8'))


def read_dict_inline(text):
    return json.loads(text)


def dump_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True)+'\n', encoding='utf-8')
    tmp.replace(path)


def read_catalog(game, wanted):
    root = game / 'ddv_Data' / 'StreamingAssets' / 'aa'
    blobs = {}
    for name, expected in CATALOG_SHA.items():
        data = (root/('catalog.'+name+'.bin')).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('catalog digest mismatch: '+name)
        blobs[name] = data
    keys = blobs['keyData']
    buckets = blobs['bucketData']
    entries = blobs['entryData']
    ids = blobs['InternalIds'].decode('utf-8-sig').splitlines()
    nkeys = struct.unpack_from('<I', keys)[0]
    nbuckets = struct.unpack_from('<I', buckets)[0]
    nentries = struct.unpack_from('<I', entries)[0]
    if nkeys != nbuckets or len(entries) != 4+28*nentries:
        raise ValueError('catalog record counts are inconsistent')
    pos = 4
    by_bundle = collections.defaultdict(set)
    for _ in range(nbuckets):
        offset, cnt = struct.unpack_from('<ii', buckets, pos)
        pos += 8
        if cnt < 0 or pos+cnt*4 > len(buckets):
            raise ValueError('invalid bucket length')
        key = ''
        if 0 <= offset <= len(keys)-5 and keys[offset] == 0:
            kl = struct.unpack_from('<I', keys, offset+1)[0]
            if 0 <= kl <= 4096 and offset+5+kl <= len(keys):
                key = keys[offset+5:offset+5+kl].decode('utf-8', errors='replace').lower()
        if GKEY.fullmatch(key) and key in wanted:
            for (entry_index,) in struct.iter_unpack('<i', buckets[pos:pos+cnt*4]):
                if not 0 <= entry_index < nentries:
                    raise ValueError('invalid entry index')
                values = struct.unpack_from('<7i', entries, 4+28*entry_index)
                dep_idx = values[2]
                # Do not iterate dependency buckets here. The key->bundle
                # relationships are independently captured by our uploaded
                # catalog-dependency-report.json and checked below.
                by_bundle[str(dep_idx)].add(key)
        pos += cnt*4
    if pos != len(buckets):
        raise ValueError('bucket table trailing bytes')
    return by_bundle


def normalize_container(source, owner=''):
    """Yield (key, PPtr-like pointer) from UnityPy container variants."""
    if source is None:
        return
    if isinstance(source, dict):
        iterator = source.items()
    else:
        iterator = iter(source)
    for item in iterator:
        if isinstance(item, (tuple, list)) and len(item) == 2:
            key, ptr = item
        else:
            key, ptr = getattr(item,'first',None), getattr(item,'second',None)
        if key is None:
            continue
        if hasattr(ptr, 'asset'):
            ptr = ptr.asset
        elif isinstance(ptr, dict):
            ptr = ptr.get('asset',ptr)
        yield str(key), ptr, owner


def ptr_id(ptr):
    if ptr is None:
        return None
    if isinstance(ptr, dict):
        for name in ('m_PathID','path_id','pathId'):
            if name in ptr:
                try: return int(ptr[name])
                except (TypeError,ValueError): return None
    for name in ('path_id','m_PathID','pathId'):
        value = getattr(ptr,name,None)
        if value is not None:
            try: return int(value)
            except (TypeError,ValueError): return None
    return None


def exact_guid_from_key(key, allowed):
    return {m.lower() for m in GTOKEN.findall(key) if m.lower() in allowed}


def resolve_guid_images(candidate_rows):
    """Resolve a GUID's exact Unity PPtrs without conflating Sprite and Texture2D.

    A game icon normally has two serialized objects under the same exact GUID:
    one Sprite and one Texture2D. The Sprite is the display image when present.
    A Texture2D-only pointer is valid when no Sprite exists. Multiple distinct
    Sprite or Texture2D identities are ambiguous and fail closed.
    """
    unique = {}
    for row in candidate_rows:
        if row.get('assetClass') not in ('Sprite', 'Texture2D'):
            return None, 'unexpected_class'
        ident = row.get('assetId')
        if not isinstance(ident, str) or not ident:
            return None, 'missing_asset_identity'
        unique[ident] = row
    if not unique:
        return None, 'missing_checkpoint_image'
    by_class = collections.defaultdict(list)
    for row in unique.values():
        by_class[row['assetClass']].append(row)
    if len(by_class['Sprite']) > 1 or len(by_class['Texture2D']) > 1:
        return None, 'multiple_distinct_objects_of_same_class'
    preferred = (by_class['Sprite'] or by_class['Texture2D'])[0]
    alternate = by_class['Texture2D'][0] if by_class['Sprite'] and by_class['Texture2D'] else None
    return {'assetId': preferred['assetId'],
            'assetClass': preferred['assetClass'],
            'decodedSha256': preferred['decodedSha256'],
            'variants': preferred['variants'],
            'sourceWidth': preferred.get('sourceWidth'),
            'sourceHeight': preferred.get('sourceHeight'),
            'counterpartAssetId': alternate['assetId'] if alternate else None,
            'pointerObjectCount':len(unique),
            'identityEvidence':'exact_catalog_key_and_serialized_bundle_path_id'}, None


def inspect_bundle(game, output, name, allowed, max_keys=100000):
    import UnityPy
    root = game / 'ddv_Data' / 'StreamingAssets' / 'aa' / 'win' / 'ui-images-generatedicons_assets_assets'
    source = root/name
    if not source.is_file() or source.is_symlink():
        raise ValueError('bundle not found or linked: '+name)
    checkpoints = []
    for ckpt in (output/'bundles').glob('*.json'):
        doc = read_dict(ckpt)
        if not doc.get('complete') or Path(doc.get('containerPath','')).name.lower() != name.lower():
            continue
        if hashlib.sha256(source.read_bytes()).hexdigest() != doc['containerSha256']:
            raise ValueError('extracted checkpoint is from a different bundle: '+name)
        checkpoints.append(doc)
    if len(checkpoints) != 1:
        raise ValueError('expected exactly one completed checkpoint: '+name)
    checkpoint = checkpoints[0]
    by_path = collections.defaultdict(list)
    for row in checkpoint.get('images',[]):
        by_path[(str(row['unityAssetsFile']).casefold(), int(row['unityPathId']))].append(row)
    env = UnityPy.load(str(source))
    objs = env.objects.values() if isinstance(env.objects,dict) else env.objects
    objs = list(objs)
    result = {
        'bundle':name,'serializedObjectCount':len(objs),
        'types':dict(collections.Counter(obj.type.name for obj in objs)),
        'checkpointImageCount':len(checkpoint['images']),
        'environmentContainerKeyCount':0,'assetBundleContainerKeyCount':0,
        'exactGuidKeyCount':0,'exactGuidPointerCount':0,
        'verifiedGuidToImage':[], 'unverifiedGuidKeySamples':[],
        'containerKeyExamples':[], 'assetBundleObjects':[], 'errors':[],
    }
    pairs=[]
    try:
        pairs.extend(normalize_container(getattr(env,'container',None)))
    except Exception as e:
        result['errors'].append('environment container: '+str(e)[:150])
    result['environmentContainerKeyCount'] = len(pairs)
    for obj in objs:
        if obj.type.name!='AssetBundle':continue
        try:
            ab=obj.read()
            container = getattr(ab,'m_Container',None)
            new_pairs=list(normalize_container(container, str(getattr(getattr(obj,'assets_file',None),'name',''))))
            result['assetBundleContainerKeyCount']+=len(new_pairs)
            pairs.extend(new_pairs)
            result['assetBundleObjects'].append({
                'pathId':str(obj.path_id),
                'name':str(getattr(ab,'m_Name',''))[:180],
                'containerEntries':len(new_pairs),
                'preloadCount':len(getattr(ab,'m_PreloadTable',[]) or []),
            })
        except Exception as e:
            result['errors'].append('AssetBundle object '+str(obj.path_id)+': '+str(e)[:150])
    seen_guid_keys=set()
    guid_rows=collections.defaultdict(list)
    unmatched_pointer_count=0
    for key, pointer, owner in pairs[:max_keys]:
        if len(result['containerKeyExamples'])<14:
            result['containerKeyExamples'].append({'key':key[:220],
                                                    'pathId':str(ptr_id(pointer))})
        guids=exact_guid_from_key(key, allowed)
        if not guids:continue
        seen_guid_keys.update(guids)
        path=ptr_id(pointer)
        if path is None:
            unmatched_pointer_count += len(guids)
            if len(result['unverifiedGuidKeySamples'])<15:
                result['unverifiedGuidKeySamples'].append({'key':key[:160],'reason':'no_asset_pointer'})
            continue
        file_id = getattr(pointer, 'm_FileID', getattr(pointer, 'file_id', 0))
        ptr_file = str(getattr(getattr(pointer, 'assets_file', None), 'name', ''))
        # An unresolved external-file PPtr is not a verified identity.
        if file_id not in (None, 0) and not ptr_file:
            unmatched_pointer_count += len(guids)
            if len(result['unverifiedGuidKeySamples'])<15:
                result['unverifiedGuidKeySamples'].append({'key':key[:160],
                    'pathId':str(path), 'reason':'external_file_pointer'})
            continue
        source_file = ptr_file or owner
        if not source_file:
            unmatched_pointer_count += len(guids)
            if len(result['unverifiedGuidKeySamples'])<15:
                result['unverifiedGuidKeySamples'].append({'key':key[:160],
                    'pathId':str(path), 'reason':'missing_file_identity'})
            continue
        candidates=by_path.get((source_file.casefold(), path), [])
        if len(candidates)!=1:
            unmatched_pointer_count += len(guids)
            if len(result['unverifiedGuidKeySamples'])<15:
                result['unverifiedGuidKeySamples'].append({'key':key[:160],
                                                            'pathId':str(path),
                                                            'candidateCount':len(candidates)})
            continue
        row=candidates[0]
        for guid in guids:
            guid_rows[guid].append(row)
    found={}
    for guid,rows in sorted(guid_rows.items()):
        verified, reason=resolve_guid_images(rows)
        if reason:
            result['errors'].append('ambiguous object identity for '+guid+': '+reason)
        else:
            found[guid]=verified
    result['exactGuidKeyCount']=len(seen_guid_keys)
    result['exactGuidPointerCount']=len(found)
    result['missingObjectPointerCount']=unmatched_pointer_count
    result['ambiguousGuidCount']=len(result['errors'])
    result['resolvedSpriteCount']=sum(row['assetClass']=='Sprite' for row in found.values())
    result['resolvedTextureOnlyCount']=sum(row['assetClass']=='Texture2D' for row in found.values())
    result['resolvedSpriteTexturePairs']=sum(bool(row['counterpartAssetId']) for row in found.values())
    result['verifiedGuidToImage']=[{'guid':'guid:'+guid,**details}
                                   for guid,details in sorted(found.items())[:40]]
    result['allVerifiedGuidToImage']={guid:details for guid,details in sorted(found.items())}
    return result


def probe(game, out, selected=TARGETS):
    dep=read_dict(out/'catalog-dependency-report.json')
    if dep.get('schema')!='wand.src04.dependency-probe@1' or dep.get('sourceGuidCount')!=9542:
        raise ValueError('expected current SRC-04 dependency report')
    source_path=out/'source-items'/'items.jsonl'
    manifest=read_dict(out/'source-items'/'manifest.json')
    if hashlib.sha256(source_path.read_bytes()).hexdigest()!=manifest['itemsSha256']:
        raise ValueError('SRC-01 item cache digest mismatch')
    wanted=set()
    with source_path.open('r', encoding='utf-8') as stream:
        for line in stream:
            token=read_dict_inline(line).get('iconGuid','')
            if isinstance(token,str) and token.startswith('guid:') and GKEY.fullmatch(token[5:]):
                wanted.add(token[5:])
    if len(wanted)!=dep['sourceGuidCount']:
        raise ValueError('catalog-dependency-report and SRC-01 GUID counts disagree')
    cat=read_catalog(game, wanted)
    group_by_name = collections.defaultdict(set)
    for k,v in dep['dependencyToCatalogGroups'].items():
        for b in v['bundleFilenames']:
            group_by_name[b.lower()].update(cat.get(k,set()))
    result={'schema':'wand.src04.identity-probe@2','status':'metadata_only',
            'publicationApproved':False,'imageDecodingPerformed':False,
            'bundles':{},'totalExactGuidKeyCount':0,
            'totalExactGuidPointerCount':0,'warnings':[]}
    private_links={}
    conflicting_guids=set()
    for name in selected:
        allowed=group_by_name.get(name.lower(),set())
        if not allowed:
            result['warnings'].append('No GUIDs in catalog group: '+name)
        try:
            row=inspect_bundle(game,out,name,allowed)
            row['catalogGroupGuidCount']=len(allowed)
            candidate_links=row.pop('allVerifiedGuidToImage')
            for guid, identified in candidate_links.items():
                if guid in conflicting_guids:
                    continue
                if guid in private_links and private_links[guid]['assetId'] != identified['assetId']:
                    result['warnings'].append('GUID mapped to multiple bundles: '+guid)
                    conflicting_guids.add(guid)
                    private_links.pop(guid, None)
                else:
                    private_links[guid]=identified
            result['bundles'][name]=row
            result['totalExactGuidKeyCount']+=row['exactGuidKeyCount']
            result['totalExactGuidPointerCount']+=row['exactGuidPointerCount']
            print(name, json.dumps({k:row[k] for k in ('catalogGroupGuidCount',
                'environmentContainerKeyCount','assetBundleContainerKeyCount',
                'exactGuidKeyCount','exactGuidPointerCount')},sort_keys=True),flush=True)
        except Exception as e:
            result['bundles'][name]={'error':type(e).__name__+': '+str(e)[:220]}
            print(name,'FAILED:',str(e)[:220],flush=True)
        result['crossBundleConflictCount']=len(conflicting_guids)
        result['totalVerifiedUniqueGuids']=len(private_links)
        result['processedBundleCount']=len(result['bundles'])
        result['targetBundleCount']=len(selected)
        dump_json(out/'catalog-identity-report.json',result)
        dump_json(out/'catalog-identity-links-private.json',{
            'schema':'wand.src04.identity-links@2',
            'publicationApproved':False,
            'guidToImage':private_links,
            'verifiedGuidCount':len(private_links),
        })
    return result


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--game',type=Path,required=True)
    ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--all',action='store_true',help='inspect all 24 icon bundles with confirmed catalog GUIDs')
    args=ap.parse_args()
    if args.all:
        dep=read_dict(args.out/'catalog-dependency-report.json')
        # Process inexpensive bundles first and record each result on disk.
        counts=dep.get('extractedBundleCounts',{})
        chosen=tuple(sorted(dep['dependencyBundleGuidCounts'],
                            key=lambda name: (counts.get(name,1000000),name)))
    else:
        chosen=TARGETS
    r=probe(args.game,args.out,selected=chosen)
    print(json.dumps({'totalExactGuidKeyCount':r['totalExactGuidKeyCount'],
                      'totalExactGuidPointerCount':r['totalExactGuidPointerCount'],
                      'totalVerifiedUniqueGuids':r['totalVerifiedUniqueGuids'],
                      'processedBundleCount':r['processedBundleCount'],
                      'targetBundleCount':r['targetBundleCount'],
                      'report':str(args.out/'catalog-identity-report.json')},ensure_ascii=False))
    return 0 if all('error' not in b for b in r['bundles'].values()) else 1

if __name__=='__main__':
    raise SystemExit(main())
