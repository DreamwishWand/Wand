#!/usr/bin/env python3
"""Deterministic game-only terrain projection from a verified DB-04 source ZIP.
No Save, native object states, raw source file blobs or account identifiers.
The original source-local raster is not placement legality or world coordinates.
"""
import argparse,base64,hashlib,json,zlib,zipfile
from collections import Counter
from pathlib import Path

def digest(data): return hashlib.sha256(data).hexdigest()
def build(archive,scope):
    with zipfile.ZipFile(archive) as z:
        manifest=json.loads(z.read('manifest.json'))
        if manifest['platform']!='Steam' or manifest['gameVersion']!='1.26.2':
            raise ValueError('unverified terrain version')
        def member(name):
            data=z.read(name)
            if digest(data)!=manifest['outputSha256'][name]:
                raise ValueError('source digest '+name)
            return json.loads(data)
        grids={g['gridId']:g for g in member('grids.json')}
        layouts=member('layouts.json')
        rows=[]
        for layout in layouts:
            lid=layout['layoutId']
            if not lid.startswith('SceneLayouts/'+scope+'/'): continue
            refs=layout.get('nativeGridEntries',[])
            path_counts=Counter(ref['gridDataPath'] for ref in refs)
            for ref in refs:
                # Mainland initial release exposes the eight primary biome
                # grids only; no furniture sub-grids are mislabeled as areas.
                path=ref['gridDataPath']
                if scope=='Village04' and (ref['gridIdNative']!=0 or 'DefaultVillageLayout01-' not in lid): continue
                if not (path.startswith('GridData/Villages/') or path.startswith('GridData/FloatingIslands/') or scope=='VillageExpansion04UnderwaterAreas' and path.startswith('GridData/OffGridBuildings/Expansion04/')): continue
                g=grids.get(path)
                if g is None: continue
                sx,sy=g['sizeX'],g['sizeY'];n=sx*sy
                if not (0<n<=250000 and g['nativeFloorIndexToLocalXYCorroborated'] and g['terrainFlagValuesVerified'] and ref['tessellationFactor'] in (1,2)):
                    continue
                if g['nativeFloorTypes'] is not None:
                    values=g['nativeFloorTypes']
                else:
                    raw=base64.b64decode(g['compactedFloorTypesBase64'],validate=True)
                    if digest(raw)!=g['nativeCompactedSha256']: raise ValueError('packed digest')
                    bits=g['terrainDecoding']['cellBits']
                    if bits not in (1,2,4,8) or g['terrainDecoding']['packing']!='x_major_msb_first': raise ValueError('encoding')
                    indices=[(raw[i*bits//8]>>(8-bits-i*bits%8))&((1<<bits)-1) for i in range(n)]
                    if [indices.count(i) for i in range(len(g['nativeFloorTypePalette']))]!=g['nativePaletteIndexCellCounts']:raise ValueError('histogram')
                    values=[g['nativeFloorTypePalette'][i] for i in indices]
                if len(values)!=n or any(type(v) is not int or not 0<=v<=0xffffffff for v in values):raise ValueError('floor values')
                palette=sorted(set(values))
                if len(palette)>256:continue
                lookup={v:i for i,v in enumerate(palette)}
                data=bytes(lookup[values[x*sy+y]] for y in range(sy) for x in range(sx))
                counts=Counter(values)
                key=lid.split('DefaultVillageLayout01-')[1].split('Grids')[0] if scope=='Village04' else lid+'#'+str(ref['gridIdNative'])
                if path_counts[path]!=1: raise ValueError('ambiguous layout/data path pair')
                rows.append(dict(key=key,layoutId=lid,gridDataPath=ref['gridDataPath'],gridIdNative=ref['gridIdNative'],sizeX=sx,sizeY=sy,factor=ref['tessellationFactor'],palette=palette,counts=[counts[v] for v in palette],sha256=digest(data),data=base64.b64encode(zlib.compress(data,9)).decode('ascii')))
        return dict(schema='wand.db04.terrain-projection@1',platform='Steam',gameVersion='1.26.2',coordinateBasis='source_grid_local_y_major',sourceGridSha256=manifest['outputSha256']['grids.json'],sourceLayoutSha256=manifest['outputSha256']['layouts.json'],completeWorldCoverage=False,placementLegalityVerified=False,grids=rows)

SCOPES=('Village04','VillageExpansion01','VillageExpansion02','VillageExpansion03','VillageExpansion04','VillageExpansion04UnderwaterAreas','VillageWinnieDLC','FloatingIslands')
def build_release(archive,output):
    output.mkdir(parents=True,exist_ok=True)
    entries=[]
    for scope in SCOPES:
        result=build(archive,scope)
        path=scope.lower()+'.json'
        payload=json.dumps(result,separators=(',',':'))+'\n'
        (output/path).write_text(payload,encoding='utf-8')
        grids=[{k:v for k,v in g.items() if k not in ('data','palette','counts','sha256')} for g in result['grids']]
        entries.append(dict(scope=scope,path=path,sha256=digest(payload.encode()),gridCount=len(grids),cellCount=sum(g['sizeX']*g['sizeY'] for g in grids),grids=grids))
    index=dict(schema='wand.db04.terrain-release@1',platform='Steam',gameVersion='1.26.2',completeWorldCoverage=False,entries=entries)
    (output/'index.json').write_text(json.dumps(index,separators=(',',':'))+'\n',encoding='utf-8')
    print(sum(e['gridCount'] for e in entries),'grids',sum(e['cellCount'] for e in entries),'cells')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('output',type=Path);p.add_argument('--scope',default='Village04')
    p.add_argument('--all',action='store_true')
    a=p.parse_args()
    if a.all:
        build_release(a.archive,a.output)
        raise SystemExit(0)
    result=build(a.archive,a.scope);a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf-8')
    print(len(result['grids']),'grids',sum(g['sizeX']*g['sizeY'] for g in result['grids']),'cells')
