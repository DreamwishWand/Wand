"""Project selected, verified item-like definitions into a sanitized DB-01 extension.
No save data, original files, private shards or unverified field semantics are published.
Input is the complete Steam source catalog and the audited same-release overlays.
"""
import argparse, collections, hashlib, json, re, zipfile
from pathlib import Path

FAMILIES = {
    'Companion': ('PetItemData','CritterItemData','SnippetItemData','MountItemData'),
    'Makeup': ('MakeupItemData',), 'Character': ('CharacterItemData',),
    'MemoryShard': ('MemoryShardItemData',), 'BoardGame': ('FigurineItemData',),
    'Skin': ('CharacterSkinItemData','BuildingOtherSkinItemData','StallSkinItemData','SceneAssetsSkinItemData','MountSkinItemData','HouseSkinItemData','BoatSkinItemData'),
    'Tool': ('ToolItemData',), 'MountGear': ('MountGearItemData',),
    'PhotoMode': ('PhotoFrameItemData',), 'AvatarFeature': ('EyeballItemData','SprintEffectItemData','AvatarEmotePoseItemData'),
}
BASE_CLASSES = ('ActivityItem','Furniture','Clothing','Trimming')
LOCALES=('en','fr','it','de','es-ES','ja','zh-CN','pt-BR')
SHA = re.compile(r'[0-9a-f]{64}\Z')
GUID = re.compile(rb'guid:([0-9a-f]{32})\Z')

def require(value, code):
    if not value: raise ValueError('DB01_COLLECTIBLE_EXTENSION_'+code)

def digest(data): return hashlib.sha256(data).hexdigest()

def read_zip(path):
    z=zipfile.ZipFile(path)
    m=json.loads(z.read('manifest.json'))
    for name, meta in m['files'].items():
        data=z.read(name)
        require(len(data)==meta['bytes'] and digest(data)==meta['sha256'], 'SHARD_DIGEST_'+name)
        rows=json.loads(data)
        if isinstance(rows,list): require(len(rows)==meta['count'],'SHARD_COUNT_'+name)
    return z,m

def id_rows(z):
    result={}
    for name in z.namelist():
        if re.fullmatch(r'id/[0-9a-f]{2}\.json',name):
            data=json.loads(z.read(name))
            require(isinstance(data,list),'ID_SHARD_FORMAT')
            for row in data:
                key=row['itemId']; require(key not in result and (key&255)==int(name[3:5],16),'DUPLICATE_OR_BUCKET')
                result[key]=row
    return result

def varint(data,pos):
    for i in range(10):
        require(pos<len(data),'TRUNCATED_VARINT')
        b=data[pos];pos+=1
        if i==0: value=0
        require(i!=9 or b<=1,'VARINT_OVERFLOW')
        value|=(b&127)<<(7*i)
        if b<128: return value,pos
    raise ValueError('VARINT')

def fields(data):
    pos=0; result=[]
    while pos<len(data):
        key,pos=varint(data,pos); f,w=key>>3,key&7
        require(f>0 and w in (0,1,2,5),'WIRE')
        if w==0: v,pos=varint(data,pos)
        else:
            if w==2: n,pos=varint(data,pos)
            else: n=8 if w==1 else 4
            require(n<=len(data)-pos,'TRUNCATED_FIELD');v=data[pos:pos+n];pos+=n
        result.append((f,w,v))
    return result

def frames(data):
    pos=0;seen=set()
    while pos<len(data):
        offset,pos=varint(data,pos);size,pos=varint(data,pos)
        require(size>0 and size<=len(data)-pos and offset not in seen,'FRAME')
        seen.add(offset); yield fields(data[pos:pos+size]);pos+=size

def one(row,n,w,optional=False):
    values=[v for f,t,v in row if f==n and t==w]
    require(len(values)<=1 and (optional or len(values)==1),'FIELD_'+str(n))
    return values[0] if values else None

def guid(row,field):
    v=one(row,field,2,True)
    if v in (None,b''): return None
    m=GUID.fullmatch(v)
    require(m,'INVALID_ARTWORK_FIELD_'+str(field))
    return m[1].decode()

def validate_dump(path,expected):
    b=path.read_bytes();require(digest(b)==expected,'DUMP_DIGEST');s=b.decode('utf-8')
    for cls in sorted({c for classes in FAMILIES.values() for c in classes}):
        matches=list(re.finditer(r'(?m)^public sealed class '+cls+r'\b[^\n]*\n\{',s))
        require(any(re.search(r'(?m)^\tpublic const int IconAddressFieldNumber = 4;',s[m.end():s.find('\n\t// Properties',m.end(),m.end()+200000)]) for m in matches),'ICON_DECLARATION_'+cls)
    # Memory image and mask semantics are exact source field declarations.
    m=re.search(r'(?m)^public sealed class MemoryShardItemData\b[^\n]*\n\{',s)
    part=s[m.end():s.find('\n\t// Properties',m.end())]
    require('ImageAddressFieldNumber = 6;' in part and 'MaskDataAddressFieldNumber = 7;' in part,'MEMORY_ARTWORK_FIELDS')

def build(root):
    z,cm=read_zip(root/'db01-steam-v1262-full-catalog-typescript-v2-private.zip')
    tz,tm=read_zip(root/'db01-steam-v1262-il2cpp-item-types-private.zip')
    gz,gm=read_zip(root/'db01-steam-v1262-source-tags-v2-private.zip')
    sz,sm=read_zip(root/'db01-steam-v1262-collection-special-predicates-private.zip')
    dz,dm=read_zip(root/'db01-steam-v1262-collection-menu-direct-private.zip')
    for m in (tm,gm,sm,dm):
        require(m['gameVersion']==cm['gameVersion'] and m['platform']==cm['platform'] and m['sourceItemsSha256']==cm['sourceItemsSha256'],'VERSION_OR_CATALOG_MISMATCH')
    require(cm['fullCorpusParsed'] and cm['sourceFilesVerified']==cm['sourceFilesTotal'],'INCOMPLETE_CATALOG')
    require(tm['sourceIl2cppDumpSha256']==sm['sourceIl2cppDumpSha256'],'IL2CPP_SOURCE_MISMATCH')
    validate_dump(root/'dump.cs',tm['sourceIl2cppDumpSha256'])
    cat=id_rows(z); types=id_rows(tz); tags=id_rows(gz); special=id_rows(sz)
    direct={r['itemId']:r['memberships'] for r in json.loads(dz.read('direct-items.json'))}
    require(set(cat)==set(types)==set(tags) and len(cat)==cm['definitions'],'CENSUS_MISMATCH')
    rows=[]; counts={}; hashes={}
    for family in FAMILIES:
        expected={i:r for i,r in cat.items() if r['nativeCategory']==family}
        b=(root/(family+'.json')).read_bytes(); sha=digest(b)
        require(expected and all(r['sourceSha256']==sha for r in expected.values()),'ORIGINAL_HASH_'+family)
        hashes[family]=sha; found=set()
        for wire in frames(b):
            i=one(wire,1,0); r=expected[i]
            require(i not in found and one(wire,2,2).decode()==r['nativeKey'],'IDENTITY_'+family)
            found.add(i); t=types[i]; g=tags[i]
            require(t['sourceSha256']==g['sourceSha256']==sha and t['nativeCategory']==g['nativeCategory']==family,'OVERLAY_IDENTITY')
            require(set(r['names'])==set(LOCALES),'LOCALE_SET')
            artwork={'iconGuid':guid(wire,4)}
            if family=='MemoryShard': artwork.update(imageGuid=guid(wire,6),maskGuid=guid(wire,7))
            tag_rows=[{'id':v['tagId'],'key':v['tagKey'],'facet':v['facet'],'sourceField':v['wireField']} for v in g['tagReferences']]
            links=[]
            for p in direct.get(i,[]):
                links.append({'setId':p['setId'],'groupIndex':p['groupIndex'],'submenuCode':p['submenuCode'],'evidence':p['evidence'],'labelKey':p['collectionLabelKey']})
            for p in special.get(i,{}).get('memberships',[]):
                q={'setId':p['setId'],'groupIndex':p['groupIndex'],'submenuCode':p['submenuCode'],'evidence':p['evidence'],'criterion':p['criterion'],'sourceField':p['originalField'],'sourceRule':p['family']}
                if p['tagKey'] is not None:
                    q['tagKey']=p['tagKey']
                    if p['originalField'] in ('Tags','UniverseTagItemID'):
                        q['universeTagId']=p['criterion'];q['universeTagKey']=p['tagKey']
                links.append(q)
            universe_ids=sorted({a['id'] for a in tag_rows if a['facet']=='disneyUniverse'} | {a['universeTagId'] for a in links if 'universeTagId' in a})
            # No tag in this projection is not equivalent to NonIP, particularly Critters.
            status='source_linked' if universe_ids else ('no_universe_in_verified_tag_fields' if family in ('Makeup','Character','MemoryShard','BoardGame') or family=='Companion' and t['subtypeName']=='Pet' else 'unresolved_source')
            row={'itemId':i,'nativeCategory':family,'nativeKey':r['nativeKey'],'names':r['names'],'nameVerified':all(r['names'].values()),'iconGuid':artwork['iconGuid'],'artwork':artwork,'itemType':{'code':t['itemTypeCode'],'name':t['itemTypeName'],'subtypeCode':t['subtypeCode'],'subtypeEnum':t['subtypeEnumName'],'subtypeName':t['subtypeName'],'subtypeNameVerified':t['subtypeNameVerified']},'tags':tag_rows,'collectionSourceCandidates':links,'universeTagIds':universe_ids,'universeSourceStatus':status,'collectionMembershipVerified':False,'worldMembershipVerified':False,'availabilityVerified':False}
            rows.append(row)
        require(found==set(expected),'ORIGINAL_CENSUS_'+family)
        counts[family]=len(found)
    rows.sort(key=lambda r:r['itemId'])
    require(len({r['itemId'] for r in rows})==len(rows),'DUPLICATE_ITEM_ID')
    base={i for i,r in cat.items() if r['nativeCategory'] in BASE_CLASSES}
    require(not (base&{r['itemId'] for r in rows}),'BASE_OVERLAP')
    coverage={'byNativeCategory':counts,'nameVerified':sum(r['nameVerified'] for r in rows),'iconGuid':sum(r['iconGuid'] is not None for r in rows),'universeSourceLinked':sum(bool(r['universeTagIds']) for r in rows),'universeStates':dict(collections.Counter(r['universeSourceStatus'] for r in rows)),'collectionCandidateItemIds':sum(bool(r['collectionSourceCandidates']) for r in rows),'collectionCandidateReferences':sum(len(r['collectionSourceCandidates']) for r in rows)}
    return {'schema':'wand.item-master.collectible-extension@1','target':{'platform':cm['platform'],'gameVersion':cm['gameVersion']},'baseRelease':'steam-'+cm['gameVersion']+'-item-id-master-v1','baseCount':len(base),'count':len(rows),'sourceItemsSha256':cm['sourceItemsSha256'],'sourceIl2cppDumpSha256':tm['sourceIl2cppDumpSha256'],'originalCategorySha256':hashes,'coverage':coverage,'items':rows}

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();d=build(a.input)
    # Each item is one deterministic line for streaming and transfer; valid JSON.
    rows=d.pop('items'); header=json.dumps(d,ensure_ascii=False,separators=(',',':'))[:-1]+',"items":[\n'; out=header+',\n'.join(json.dumps(row,ensure_ascii=False,separators=(',',':')) for row in rows)+'\n]}\n';a.output.write_text(out,encoding='utf-8');print(json.dumps({'count':d['count'],'baseCount':d['baseCount'],'sha256':digest(out.encode()),'coverage':d['coverage']},ensure_ascii=False))
if __name__=='__main__':main()
