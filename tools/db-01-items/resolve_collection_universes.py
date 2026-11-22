"""Original-source join for CollectionFurniture/CollectionClothing Universe selectors.

This proves an exact *static selector predicate match*, NOT visibility, game
runtime collection membership, acquisition world, or DLC ownership. Source:
CollectionSet.{Groups.CollectionsByType}, {Furniture,Clothing}.SetItemID,
Set.Tags, and Tag definitions. Never infer from Item ID numeric ranges.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import extract_classification as wire
import extract_collection_menu as direct

SCHEMA = 'wand.db01.collection-set-universe-predicates@1'
RULE = 'source_item_set_disney_universe_tag_equals_collection_filter'
REQUIRED = {
    'CollectionItemType':{'FurnitureFieldNumber':3,'ClothingFieldNumber':4,
                          'IgnoreFieldNumber':1},
    'CollectionFurniture':{'UniverseFieldNumber':2},
    'CollectionClothing':{'UniverseFieldNumber':2},
    'CollectionGroup':{'CollectionsByTypeFieldNumber':2,
                       'CollectionsByItemFieldNumber':1},
    'CollectionSetItemData':{'GroupsFieldNumber':9,'SubmenuFieldNumber':8},
    'FurnitureItemData':{'SetItemIDFieldNumber':8},
    'ClothingItemData':{'SetItemIDFieldNumber':8},
    'SetItemData':{'TagsFieldNumber':6},
}


def require(ok, code):
    if not ok:
        raise ValueError('DB01_COLLECTION_SET_UNIVERSE_' + code)


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as src:
        for block in iter(lambda:src.read(2*1024*1024),b''):
            h.update(block)
    return h.hexdigest()


def validate_dump(dump: Path):
    text=dump.read_text(encoding='utf-8')
    for name, fields in REQUIRED.items():
        matches=list(re.finditer(r'public sealed class '+name+r'\s*:',text))
        require(len(matches)==1,'SOURCE_IL2CPP_CLASS_'+name)
        end=text.find('\n}', matches[0].end())
        require(end>=0 and end-matches[0].end()<50000,'SOURCE_IL2CPP_BOUNDARY_'+name)
        block=text[matches[0].end():end]
        for field, code in fields.items():
            require(re.search(r'\bpublic const int '+field+r'\s*=\s*'+str(code)+r'\s*;',block),
                    'IL2CPP_FIELD_'+name+'_'+field)


def original_records(category:str, original:Path, canonical:dict):
    content=wire.read_original(original,category)
    data={}
    hashes={original_sha for _,(native,_,original_sha) in canonical.items()
            if native==category}
    require(len(hashes)==1 and sha_bytes(content) in hashes,'SOURCE_SHA_'+category)
    source_sha=sha_bytes(content)
    for row in wire.source_frames(content):
        item_id=wire.one(row,1,0)
        name=wire.one(row,2,2).decode('utf-8')
        require(item_id not in data and
                canonical.get(item_id)==(category,name,source_sha),
                'CANONICAL_IDENTITY_'+category)
        data[item_id]=row
    require(len(data)==sum(v[0]==category for v in canonical.values()),
            'SOURCE_COVERAGE_'+category)
    return data,source_sha


def sha_bytes(content:bytes)->str:
    return hashlib.sha256(content).hexdigest()


def original_packed(row,field):
    values=[]
    for number,kind,value in row:
        if number!=field:
            continue
        require(kind in (0,2),'INVALID_PACKED_WIRE')
        values.extend([value] if kind==0 else wire.packed_ids(value))
    return values


def produce(sqlite_path:Path, original_dir:Path, il2cpp:Path, output:Path, *,
            expected_sqlite_sha256:str, expected_il2cpp_sha256:str)->dict:
    sqlite_path,original_dir,il2cpp,output=(
        Path(p).expanduser().resolve() for p in
        (sqlite_path,original_dir,il2cpp,output))
    require(sqlite_path.is_file() and original_dir.is_dir() and
            il2cpp.is_file() and not output.exists(),'INPUT_OR_OUTPUT_PATH')
    for parent in (output,*output.parents):
        require(not (parent/'.git').exists() and not
                ((parent/'package.json').exists() and (parent/'src').is_dir()),
                'OUTPUT_INSIDE_PUBLIC_GIT')
    for src in (sqlite_path,il2cpp,original_dir):
        require(output!=src and output not in src.parents and
                src not in output.parents,'OUTPUT_OVERLAP')
    require(type(expected_sqlite_sha256) is str and
            wire.SHA.fullmatch(expected_sqlite_sha256) and
            sha(sqlite_path)==expected_sqlite_sha256,'SQLITE_SHA')
    require(type(expected_il2cpp_sha256) is str and
            wire.SHA.fullmatch(expected_il2cpp_sha256) and
            sha(il2cpp)==expected_il2cpp_sha256,'IL2CPP_SHA')
    validate_dump(il2cpp)
    db=sqlite3.connect('file:'+sqlite_path.as_posix()+'?mode=ro&immutable=1',
                       uri=True)
    try:
        require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLITE_INTEGRITY')
        metadata=db.execute(
            'SELECT platform,game_version,items_sha256,definition_count,'
            'publication_authorized FROM catalog WHERE id=1').fetchone()
        require(metadata and metadata[0]=='Steam' and metadata[4]==0,
                'PRIVATE_STEAM_SOURCE')
        canonical={}
        for id,cat,key,hash_value in db.execute(
            'SELECT item_id,native_category,native_key,source_sha256 FROM definition'):
            require(id not in canonical,'DUPLICATE_ID')
            canonical[id]=(cat,key,hash_value)
        require(len(canonical)==metadata[3],'SQLITE_COUNT')
        sources={}
        frames={}
        for cat in ('CollectionSet','Tag','Set','Furniture','Clothing'):
            frames[cat],sources[cat]=original_records(cat,original_dir,canonical)
        tag_keys=wire.load_tag_dictionary(wire.read_original(original_dir,'Tag'))
        set_tags={}
        for set_id,row in frames['Set'].items():
            ids=original_packed(row,6)
            require(all(tag in tag_keys for tag in ids),'UNKNOWN_SET_TAG_ID')
            set_tags[set_id]=set(ids)
        item_set={}
        for cat in ('Furniture','Clothing'):
            for id,row in frames[cat].items():
                ids=[v for n,w,v in row if n==8 and w==0]
                require(len(ids)<=1,'DUPLICATE_SET_REFERENCE')
                set_id=ids[0] if ids else None
                # A non-Set sentinel or unresolved reference is not promoted.
                item_set[id]=(cat,set_id if set_id in set_tags else None)
        candidates=defaultdict(list)
        selectors=[]
        identified=Counter()
        excluded=Counter()
        total_selectors=0
        dynamic_unresolved=0
        set_count=0
        for sid,row in sorted(frames['CollectionSet'].items()):
            set_count+=1
            subcode=direct.field_single(row,8,0,0)
            for group_index,raw_group in enumerate(v for n,w,v in row if n==9 and w==2):
                group=wire.fields(raw_group)
                excludes=set()
                for raw_list in (v for n,w,v in group if n==1 and w==2):
                    spec=wire.fields(raw_list)
                    ignore=direct.field_single(spec,1,0,0)
                    if ignore:
                        excludes.update(direct.item_list_ids(spec))
                for raw_selector in (v for n,w,v in group if n==2 and w==2):
                    total_selectors+=1
                    sel=wire.fields(raw_selector)
                    cases=[(n,w,v) for n,w,v in sel if n!=1]
                    require(len(cases)==1,'COLLECTION_SELECTOR_ONEOF')
                    kind,encoding,raw_case=cases[0]
                    if kind not in (3,4):
                        dynamic_unresolved+=1
                        continue
                    require(encoding==2,'COLLECTION_UNIVERSE_WIRE')
                    branch=wire.fields(raw_case)
                    require(len(branch)==1 and branch[0][0]==2 and branch[0][1]==0,
                            'COLLECTION_UNIVERSE_SELECTOR_SHAPE')
                    universe=branch[0][2]
                    require(universe in tag_keys and
                            wire.tag_group(universe,tag_keys[universe])=='disneyUniverse',
                            'UNIVERSE_TAG_CLASS')
                    ignore_selector=direct.field_single(sel,1,0,0)
                    require(ignore_selector==0,'UNSUPPORTED_NEGATED_UNIVERSE')
                    category='Furniture' if kind==3 else 'Clothing'
                    matched=0
                    skipped=0
                    for item_id,(item_cat,item_set_id) in item_set.items():
                        if item_cat!=category or item_set_id is None or \
                           universe not in set_tags[item_set_id]:
                            continue
                        if item_id in excludes:
                            skipped+=1
                            continue
                        candidates[item_id].append({
                            'setId':sid,'groupIndex':group_index,
                            'nativeCategory':category,
                            'sourceSetItemId':item_set_id,
                            'universeTagId':universe,
                            'universeTagKey':tag_keys[universe],
                            'selectorField':kind,
                            'rule':RULE,
                            'sourcePredicateMatched':True,
                            'gameUiMembershipVerified':False,
                            'gameUiVisibilityVerified':False,
                            'worldAvailabilityVerified':False,
                            'dlcOwnershipVerified':False,
                        })
                        matched+=1
                    selectors.append({
                        'setId':sid,'groupIndex':group_index,
                        'submenuCode':subcode,'nativeCategory':category,
                        'universeTagId':universe,
                        'universeTagKey':tag_keys[universe],
                        'matchedCandidateCount':matched,
                        'explicitIgnoredMatches':skipped,
                        'rule':RULE,'gameRuntimeMembershipVerified':False,
                    })
                    identified[category]+=1
                    excluded[category]+=skipped
        require(total_selectors==len(selectors)+dynamic_unresolved,
                'DYNAMIC_SELECTOR_TOTAL')
        # Full source hashes pinned before use and re-verified before output.
        for cat,old_hash in sources.items():
            require(sha(wire.read_original(original_dir,cat))==old_hash,
                    'SOURCE_CHANGED_'+cat)
        require(sha(sqlite_path)==expected_sqlite_sha256 and
                sha(il2cpp)==expected_il2cpp_sha256,
                'INPUT_CHANGED')
        files={}
        buckets=[[] for _ in range(256)]
        for item_id,links in sorted(candidates.items()):
            require(item_id in canonical,'CANDIDATE_NOT_IN_CANONICAL')
            buckets[item_id%256].append({'itemId':item_id,
                'memberships':sorted(links,key=lambda x:(x['setId'],x['groupIndex']))})
        outputs={'selectors.json':wire.packed_json(
            sorted(selectors,key=lambda x:(x['setId'],x['groupIndex'])))}
        outputs.update({f'id/{i:02x}.json':wire.packed_json(rows)
                        for i,rows in enumerate(buckets)})
        for path,content in outputs.items():
            files[path]={'sha256':sha_bytes(content),'bytes':len(content),
                'count':len(selectors) if path=='selectors.json' else
                         len(buckets[int(path[3:5],16)])}
        manifest={
            'schema':SCHEMA,'privateOnly':True,'publicationAuthorized':False,
            'platform':'Steam','gameVersion':metadata[1],
            'sourceSqliteSha256':expected_sqlite_sha256,
            'sourceItemsSha256':metadata[2],
            'sourceIl2cppDumpSha256':expected_il2cpp_sha256,
            'originalCategorySha256':dict(sorted(sources.items())),
            'sourceDefinitionCount':metadata[3],
            'collectionSetCount':set_count,
            'dynamicSelectorCount':total_selectors,
            'resolvedSourcePredicateSelectors':len(selectors),
            'unresolvedDynamicSelectors':dynamic_unresolved,
            'resolvedByNativeCategory':dict(sorted(identified.items())),
            'explicitIgnoreMatches':sum(excluded.values()),
            'candidateItemIds':len(candidates),
            'candidateMemberships':sum(map(len,candidates.values())),
            'bucketCount':256,'sourcePredicateMatched':True,
            'gameRuntimeMembershipVerified':False,
            'gameUiVisibilityComplete':False,
            'dlcOwnershipVerified':False,'worldAvailabilityVerified':False,
            'files':files,
        }
        output.mkdir(parents=True,exist_ok=False)
        for path,content in outputs.items():
            wire.write_atomic(output/path,content)
        wire.write_atomic(output/'manifest.json',wire.packed_json(manifest))
        return {k:manifest[k] for k in (
            'gameVersion','sourceDefinitionCount','collectionSetCount',
            'dynamicSelectorCount','resolvedSourcePredicateSelectors',
            'unresolvedDynamicSelectors','candidateItemIds',
            'candidateMemberships','explicitIgnoreMatches')}
    finally:
        db.close()


def main():
    parser=argparse.ArgumentParser(description='Source-exact Furniture/Clothing collection universe selector join')
    parser.add_argument('--sqlite',type=Path,required=True)
    parser.add_argument('--original-dir',type=Path,required=True)
    parser.add_argument('--il2cpp-dump',type=Path,required=True)
    parser.add_argument('--expected-sqlite-sha256',required=True)
    parser.add_argument('--expected-il2cpp-sha256',required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(produce(args.sqlite,args.original_dir,
            args.il2cpp_dump,args.out,
            expected_sqlite_sha256=args.expected_sqlite_sha256,
            expected_il2cpp_sha256=args.expected_il2cpp_sha256),
            sort_keys=True,ensure_ascii=False))
    except (ValueError,OSError,sqlite3.Error,UnicodeError,TypeError) as exc:
        parser.exit(1,'DB-01 Collection Universe join failed: '+str(exc)+'\n')


if __name__=='__main__':
    main()
