"""Private native hair input inventory; reuse shared DB-01 wire and Unity readers.

Preserves native palette array indices, independent display order and exact
body-specific prefab GUIDs. Does not infer shader semantics or publish raw data.
"""
import argparse
import json
import math
from pathlib import Path
import re
import sys

from resolve_animation_bundle import Reader, digest, serialized_objects, unityfs

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'db-01-items'))
from build_full_native_fields import frames, fields, require
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src-04-r2'))
from resolve_shop_catalog import resolve

SLOTS = {5: 'BodHair', 16: 'FaceHairUpper', 17: 'FaceHairLower'}


def declaration(dump, kind, name):
    rows = re.findall(r'^public (?:sealed )?' + kind + ' ' + re.escape(name) + r'(?=[: \n])[^\n]*\n\{\n(.*?)^\}', dump, re.M | re.S)
    require(len(rows) == 1, 'missing or ambiguous declaration: ' + name)
    return rows[0]


def verify_declarations(dump):
    c = declaration(dump, 'class', 'ClothingItemData')
    names = dict(re.findall(r'public const int (\w+)FieldNumber = (\d+);', c))
    require(all(names.get(k) == str(v) for k, v in {'ID':1,'Name':2,'PrefabAddress':5,'MalePrefabAddress':19}.items()), 'ClothingItemData wire layout')
    e = declaration(dump, 'enum', 'ClothingItemType')
    require(all(re.search(r'public const ClothingItemType '+name+r' = '+str(slot)+r';', e) for slot,name in SLOTS.items()), 'clothing slot enum')
    c = declaration(dump, 'class', 'AvatarHairColorConfig')
    require('List<AvatarHairColorConfig.HairColorOption> hairColorOptions;' in c and 'List<AvatarHairColorConfig.HighlightColorOption> highlightColorOptions;' in c, 'native hair config layout')
    for name, expected in [('HairColorOption',['baseColor','firstColor','secondColor','displayOrder']),('HighlightColorOption',['baseColor','displayOrder'])]:
        c = declaration(dump, 'struct', 'AvatarHairColorConfig.'+name)
        require(re.findall(r'public (?:Color|int) (\w+);', c) == expected, 'native hair row layout')


def palette(raw):
    version, objects = serialized_objects(raw)
    require(version == '6000.0.62f1', 'unsupported Unity revision')
    hits = []
    for pid, (cls, off, size) in objects.items():
        if cls != 114:
            continue
        data = raw[off:off+size]
        r = Reader(data)
        game_object = r.unpack('iq')
        enabled, = r.unpack('I')
        script = r.unpack('iq')
        if r.string() != 'AvatarHairColorConfig':
            continue
        require(game_object == (0,0) and enabled == 1 and script[1] != 0, 'invalid hair config')
        def color():
            value = r.unpack('4f')
            require(all(math.isfinite(x) and 0 <= x <= 1 for x in value), 'invalid native RGBA')
            return value
        base = []
        for i in range(r.count(52)):
            base.append(dict(index=i,baseColor=color(),firstColor=color(),secondColor=color(),displayOrder=r.unpack('i')[0]))
        highlight = []
        for i in range(r.count(20)):
            highlight.append(dict(index=i,baseColor=color(),displayOrder=r.unpack('i')[0]))
        require(r.pos == len(data), 'unparsed hair config tail')
        for rows in (base,highlight):
            require(rows and sorted(x['displayOrder'] for x in rows) == list(range(len(rows))), 'invalid display order')
        hits.append(dict(pathId=str(pid),objectSha256=digest(data),base=base,highlight=highlight))
    require(len(hits) == 1, 'missing or ambiguous hair config')
    return hits[0]


def clothing(raw):
    result = {}
    for _, frame in frames(raw):
        values = {}
        for n,w,v,_ in fields(frame):
            if n in (1,2,5,19):
                require(n not in values and w == (0 if n == 1 else 2), 'invalid clothing identity')
                values[n] = v
        item = values.get(1,0)
        require(item//10000000 == 5 and 2 in values, 'invalid clothing item')
        slot = item//100000%100
        if slot not in SLOTS:
            continue
        require(item not in result, 'duplicate hair item')
        def address(n):
            v = values.get(n,b'').decode()
            m = re.fullmatch(r'guid:([0-9a-f]{32})',v)
            return dict(address=v,guid=m[1] if m else None)
        result[item] = dict(itemId=item,slot=slot,nativeSlot=SLOTS[slot],nativeName=values[2].decode(),female=address(5),male=address(19))
    require(result, 'empty hair inventory')
    return result


def prefab_hits(path, guids):
    raw = path.read_bytes()
    version, files = unityfs(raw)
    require(version == '6000.0.62f1', 'unsupported hair bundle revision')
    hits = []
    for cab,data in files.items():
        _, objects = serialized_objects(data)
        for cls,off,size in objects.values():
            if cls != 142:
                continue
            r = Reader(data[off:off+size])
            r.string()
            n = r.count(12)
            r.take(12*n)
            for _ in range(r.count(24)):
                key = r.string()
                start,count,f,p = r.unpack('iiiq')
                require(0 <= start <= n and 0 <= count <= n-start, 'invalid preload range')
                if key not in guids or f != 0 or p not in objects or objects[p][0] != 1:
                    continue
                _,o,s = objects[p]
                q = Reader(data[o:o+s])
                components = [q.unpack('iq') for _ in range(q.count(12))]
                q.take(4)
                name = q.string()
                hits.append(dict(guid=key,bundle=path.name,bundleSha256=digest(raw),assetFile=cab,pathId=str(p),name=name,components=[dict(fileId=a,pathId=str(b)) for a,b in components]))
    return hits


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--resources',type=Path,required=True)
    p.add_argument('--clothing',type=Path,required=True)
    p.add_argument('--dump',type=Path,required=True)
    p.add_argument('--bundle',type=Path,action='append',default=[])
    p.add_argument('--catalog',type=Path,required=True,help='Directory of original split Addressables catalog')
    p.add_argument('--male-avatar',type=Path)
    p.add_argument('--female-avatar',type=Path)
    p.add_argument('--out',type=Path,required=True)
    a = p.parse_args()
    out = a.out.resolve()
    require(not any((x/'.git').exists() for x in (out,*out.parents)), 'private output only')
    resources,items,dump = a.resources.read_bytes(),a.clothing.read_bytes(),a.dump.read_bytes()
    verify_declarations(dump.decode('utf-8-sig'))
    colors,rows = palette(resources),clothing(items)
    guids = {r[b]['guid'] for r in rows.values() for b in ('male','female') if r[b]['guid']}
    locations, catalog_pins = resolve(a.catalog, guids, resource_classes=('UnityEngine.GameObject',))
    hits = [h for path in a.bundle for h in prefab_hits(path,guids)]
    for hit in hits:
        candidates = locations[hit['guid']]
        bundle_name = hit['bundle'].removesuffix('.bin')
        require(any(bundle_name in {d.replace(chr(92),'/').rsplit('/',1)[-1] for d in row['dependencies']} for row in candidates), 'Prefab bundle is not an original catalog dependency')
    require(bool(a.male_avatar)==bool(a.female_avatar), 'provide both avatar bundles or neither')
    geometry = []
    if a.male_avatar:
        from pose_mesh import body_source
        from pose_outfit import read_objects
        from pose_skinned_attachment import extract_attachment
        bodies = {}
        for sex in ('male','female'):
            data,_ = read_objects(getattr(a,sex+'_avatar').read_bytes())
            _,body,_,_ = body_source(data,sex)
            bodies[sex] = body
        bundle_paths = {p.name:p for p in a.bundle}
        require(len(bundle_paths)==len(a.bundle), 'ambiguous input bundle filename')
        for guid,sex in sorted({(row[sex]['guid'],sex) for row in rows.values() for sex in ('male','female') if row[sex]['guid']}):
            bundles = {h['bundle'] for h in hits if h['guid']==guid}
            if not bundles:
                continue
            require(len(bundles)==1,'ambiguous prefab bundle')
            raw = bundle_paths[next(iter(bundles))].read_bytes()
            try:
                g = extract_attachment(raw,guid,bodies[sex])
                geometry.append(dict(guid=guid,body=sex,status='bind_verified',extraBoneCount=g['extraBoneCount'],parts=[dict(rendererPathId=p['rendererPathId'],meshPathId=p['meshPathId'],meshSha256=p['mesh']['sha256'],vertices=len(p['mesh']['attrs'][0]),jointCount=len(p['joints']),sourceBindError=p['sourceBindError'],combinedBindError=p['combinedBindError'],materials=p['materials']) for p in g['parts']]))
            except (ValueError, KeyError, IndexError, OverflowError) as error:
                geometry.append(dict(guid=guid,body=sex,status='unresolved',reason=str(error)))
    coverage = dict(itemCount=len(rows),guidCount=len(guids),uniqueCatalogLocations=sum(len(v)==1 for v in locations.values()),missingCatalogLocations=sum(not v for v in locations.values()),ambiguousCatalogLocations=sum(len(v)>1 for v in locations.values()))
    report = dict(schema='wand.photo-mode.private-hair-inputs@1',privateOnly=True,publicationAuthorized=False,shaderParityVerified=False,sourceSha256=dict(resources=digest(resources),clothing=digest(items),dump=digest(dump)),palette=colors,items=list(rows.values()),prefabs=hits,catalogSha256=catalog_pins,locations=locations,coverage=coverage,geometry=geometry)
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x',encoding='utf-8') as f:
        json.dump(report,f,allow_nan=False,separators=(',',':'))
    print('hair rows',len(rows),'base colors',len(colors['base']),'highlight colors',len(colors['highlight']),'prefab candidates',len(hits))


if __name__ == '__main__':
    main()
