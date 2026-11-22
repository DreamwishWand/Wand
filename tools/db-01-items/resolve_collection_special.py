"""Source-exact current Collection selectors: Character, MemoryShard, Figurine,
Pet and Sidekick (Steam v1.26.2).

This resolves original static predicates, including the one negated memory
filter, without asserting runtime Collection UI visibility or DLC ownership.
The 39,067-item private SQLite, raw source files and current IL2CPP field
declarations are independently SHA-pinned and never written into public Git.
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
import resolve_collection_universes as source

SCHEMA = 'wand.db01.collection-special-predicates@1'
EVIDENCE = 'current_original_collection_static_predicate'
CATEGORIES = ('CollectionSet','Tag','Character','MemoryShard','BoardGame','Companion')
SELECTOR_FAMILIES = {2:'CharacterUniverse', 7:'MemoryShard',
                     9:'BoardGameFigurine', 10:'Pet',11:'SidekickUniverse'}
WIRE_FIELDS = {
    'CollectionItemType': {
        'IgnoreFieldNumber':1,'CharacterUniverseFieldNumber':2,
        'MemoryShardFieldNumber':7,'BoardGameFigurineFieldNumber':9,
        'PetFieldNumber':10,'SidekickUniverseFieldNumber':11,
    },
    'CollectionMemoryShard':{
        'UniverseFieldNumber':1,'MemoryShardSubTypeFieldNumber':2,
    },
    'CollectionBoardGameFigurine':{'UniverseFieldNumber':1},
    'CollectionPet':{'IsNotableFieldNumber':1},
    'CharacterItemData':{'TagsFieldNumber':12,'IsSidekickFieldNumber':15},
    'MemoryShardItemData':{
        'UniverseTagItemIDFieldNumber':8,'MemoryShardTagItemIDFieldNumber':10,
    },
    'FigurineItemData':{'TagsFieldNumber':13},
    'PetItemData':{'IsNotableFieldNumber':8},
    'CollectionGroup':{
        'CollectionsByTypeFieldNumber':2,'CollectionsByItemFieldNumber':1,
    },
    'CollectionSetItemData':{'GroupsFieldNumber':9,'SubmenuFieldNumber':8},
}


def require(ok, reason):
    if not ok:
        raise ValueError('DB01_COLLECTION_SPECIAL_' + reason)


def verify_dump(dump: Path):
    text=dump.read_text(encoding='utf-8')
    for name,fields in WIRE_FIELDS.items():
        pattern=r'public sealed class '+re.escape(name)+r'\s*:'
        matches=list(re.finditer(pattern,text))
        require(len(matches)==1,'IL2CPP_CLASS_'+name)
        end=text.find('\n}',matches[0].end())
        require(end>=0 and end-matches[0].end()<50000,'IL2CPP_CLASS_END')
        body=text[matches[0].end():end]
        for symbol,index in fields.items():
            require(re.search(r'\bpublic const int '+symbol+r'\s*=\s*'+
                              str(index)+r'\s*;',body),
                    'IL2CPP_FIELD_'+name+'_'+symbol)
    companion=re.search(
        r'// Namespace: Definitions\.Items\s+public enum CompanionItemType '
        r'// TypeDefIndex: \d+\s*\{(?P<body>.*?)\n\}',text,re.S)
    require(companion and
            re.search(r'\bpublic const CompanionItemType Pet = 0;',companion['body']),
            'IL2CPP_COMPANION_PET_ENUM')


def raw_values(record:list,field:int)->list[int]:
    return source.original_packed(record,field)


def only_bool(record,field,default=0):
    values=[v for n,w,v in record if n==field and w==0]
    require(len(values)<=1 and all(v in (0,1) for v in values),
            'BOOLEAN_SHAPE')
    return values[0] if values else default


def decode_predicate(kind:int,encoding:int,value,tag_keys:dict):
    if kind in (2,11):
        require(encoding==0,'SCALAR_UNIVERSE_WIRE')
        tag_id=value
        field='Tags'
    elif kind in (7,9):
        require(encoding==2,'UNIVERSE_NESTED_WIRE')
        entries=wire.fields(value)
        require(len(entries)==1 and entries[0][1]==0 and
                entries[0][0] in ((1,2) if kind==7 else (1,)),
                'SUBFILTER_SHAPE')
        field='UniverseTagItemID' if entries[0][0]==1 else 'MemoryShardTagItemID'
        tag_id=entries[0][2]
    elif kind==10:
        require(encoding==2,'PET_NESTED_WIRE')
        entries=wire.fields(value)
        require(not entries or len(entries)==1 and entries[0][0]==1 and
                entries[0][1]==0 and entries[0][2]==1,
                'PET_NOTABLE_FILTER_SHAPE')
        return 'PetIsNotable',1 if entries else 0,None
    else:
        raise ValueError('DB01_COLLECTION_SPECIAL_UNSUPPORTED_KIND')
    require(tag_id in tag_keys,'UNKNOWN_SOURCE_TAG_ID')
    tag_key=tag_keys[tag_id]
    if field=='Tags' or field=='UniverseTagItemID':
        require(wire.tag_group(tag_id,tag_key)=='disneyUniverse',
                'UNIVERSE_TAG_CLASS')
    return field,tag_id,tag_key


def produce(sqlite_path:Path, original_dir:Path, il2cpp_path:Path,
            output:Path, *, expected_sqlite_sha256:str,
            expected_il2cpp_sha256:str)->dict:
    sqlite_path, original_dir, il2cpp_path, output=(
        Path(p).expanduser().resolve() for p in
        (sqlite_path,original_dir,il2cpp_path,output))
    require(sqlite_path.is_file() and original_dir.is_dir() and
            il2cpp_path.is_file() and not output.exists(),'INPUT_OR_OUTPUT_PATH')
    for p in (output,*output.parents):
        require(not (p/'.git').exists() and not
                ((p/'package.json').exists() and (p/'src').is_dir()),
                'OUTPUT_IN_PUBLIC_REPOSITORY')
    for p in (sqlite_path,il2cpp_path,original_dir):
        require(output!=p and output not in p.parents and p not in output.parents,
                'OUTPUT_INPUT_OVERLAP')
    require(type(expected_sqlite_sha256) is str and
            wire.SHA.fullmatch(expected_sqlite_sha256) and
            source.sha(sqlite_path)==expected_sqlite_sha256,'SQLITE_SHA')
    require(type(expected_il2cpp_sha256) is str and
            wire.SHA.fullmatch(expected_il2cpp_sha256) and
            source.sha(il2cpp_path)==expected_il2cpp_sha256,'IL2CPP_SHA')
    verify_dump(il2cpp_path)
    db=sqlite3.connect('file:'+sqlite_path.as_posix()+'?mode=ro&immutable=1',uri=True)
    try:
        require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok',
                'SQLITE_INTEGRITY')
        metadata=db.execute(
            'SELECT platform,game_version,items_sha256,definition_count,'
            'publication_authorized FROM catalog WHERE id=1').fetchone()
        require(metadata and metadata[0]=='Steam' and metadata[4]==0,
                'PRIVATE_STEAM_SOURCE')
        canonical={}
        for id,cat,key,digest in db.execute(
                'SELECT item_id,native_category,native_key,source_sha256 FROM definition'):
            require(id not in canonical,'DUPLICATE_CANONICAL_ID')
            canonical[id]=(cat,key,digest)
        require(len(canonical)==metadata[3],'CANONICAL_COUNT_MISMATCH')
        frames={}
        original_hashes={}
        for cat in CATEGORIES:
            frames[cat],original_hashes[cat]=source.original_records(
                cat,original_dir,canonical)
        tag_keys=wire.load_tag_dictionary(wire.read_original(original_dir,'Tag'))
        original_tag_ids=set(tag_keys)
        # Source-proven family: Character.Tags, MemoryShard UniverseTag or
        # MemoryShardTag, Figurine.Tags, Pet.IsNotable (Pet subtype 0).
        by_tag=defaultdict(lambda:defaultdict(set))
        for cat,field in (('Character',12),('MemoryShard',8),
                          ('MemoryShard',10),('BoardGame',13)):
            for item_id,record in frames[cat].items():
                for tag in raw_values(record,field):
                    if tag in original_tag_ids:
                        by_tag[(cat,field)][tag].add(item_id)
        sidekicks={id for id,row in frames['Character'].items()
                   if only_bool(row,15)==1}
        pet_fields={}
        for id,row in frames['Companion'].items():
            # The current Steam's IL2CPP CompanionItemType enum confirms
            # Pet=0. Only known source Companion IDs are admitted.
            require(id//10_000_000==12,'COMPANION_NATIVE_ITEM_TYPE')
            if id % 10_000_000 // 100_000 != 0:
                continue
            pet_fields[id]=only_bool(row,8)
        require(pet_fields,'NO_SOURCE_PET_CLASS')

        candidates=defaultdict(list)
        selector_rows=[]
        handled=Counter()
        excluded=Counter()
        total_selectors=0
        ignored_selectors=0
        unresolved=0
        for collection_set_id,row in sorted(frames['CollectionSet'].items()):
            submenu=direct.field_single(row,8,0,0)
            for group_index,raw_group in enumerate(
                    v for n,w,v in row if n==9 and w==2):
                group=wire.fields(raw_group)
                explicit_excludes=set()
                for entry in (v for n,w,v in group if n==1 and w==2):
                    spec=wire.fields(entry)
                    if only_bool(spec,1)==1:
                        explicit_excludes.update(direct.item_list_ids(spec))
                positive=[]
                negative={}
                for selector_index,raw_selector in enumerate(
                        v for n,w,v in group if n==2 and w==2):
                    total_selectors+=1
                    selector=wire.fields(raw_selector)
                    fields=[(n,w,v) for n,w,v in selector if n!=1]
                    require(len(fields)==1,'SELECTOR_ONEOF')
                    kind,encoding,payload=fields[0]
                    if kind not in SELECTOR_FAMILIES:
                        unresolved+=1
                        continue
                    ignore=only_bool(selector,1)
                    member_field,criterion,tag_key=decode_predicate(
                        kind,encoding,payload,tag_keys)
                    family=SELECTOR_FAMILIES[kind]
                    if kind in (2,11):
                        found=set(by_tag[('Character',12)].get(criterion,()))
                        if kind==11:found.intersection_update(sidekicks)
                    elif kind==7:
                        f=8 if member_field=='UniverseTagItemID' else 10
                        found=set(by_tag[('MemoryShard',f)].get(criterion,()))
                    elif kind==9:
                        found=set(by_tag[('BoardGame',13)].get(criterion,()))
                    else:
                        found={id for id,v in pet_fields.items() if v==criterion}
                    if ignore:
                        # A selector-wide Ignore is a negative filter,
                        # never a positive Collection association.
                        ignored_selectors+=1
                        negative.setdefault(family,set()).update(found)
                        selector_rows.append({
                            'setId':collection_set_id,'submenuCode':submenu,
                            'groupIndex':group_index,'selectorIndex':selector_index,
                            'selectorKind':kind,'family':family,
                            'field':member_field,'criterion':criterion,
                            'tagKey':tag_key,'negative':True,
                            'sourceMatchedItemCount':len(found),
                            'candidateIncludedCount':0,
                            'gameUiMembershipVerified':False,
                        })
                        handled[kind]+=1
                        continue
                    positive.append((selector_index,kind,family,member_field,
                                     criterion,tag_key,found))
                for selector_index,kind,family,member_field,criterion,tag_key,found in positive:
                    suppressed=found & (explicit_excludes|negative.get(family,set()))
                    included=sorted(found-suppressed)
                    excluded[kind]+=len(suppressed)
                    handled[kind]+=1
                    for item_id in included:
                        require(item_id in canonical,'UNRESOLVED_ORIGINAL_ID')
                        cat=canonical[item_id][0]
                        candidates[item_id].append({
                            'setId':collection_set_id,'submenuCode':submenu,
                            'groupIndex':group_index,'selectorIndex':selector_index,
                            'selectorKind':kind,'family':family,
                            'nativeCategory':cat,'originalField':member_field,
                            'criterion':criterion,'tagKey':tag_key,
                            'evidence':EVIDENCE,
                            'sourcePredicateMatched':True,
                            'gameUiMembershipVerified':False,
                            'gameUiVisibilityVerified':False,
                            'worldAvailabilityVerified':False,
                            'dlcOwnershipVerified':False,
                        })
                    selector_rows.append({
                        'setId':collection_set_id,'submenuCode':submenu,
                        'groupIndex':group_index,'selectorIndex':selector_index,
                        'selectorKind':kind,'family':family,
                        'field':member_field,'criterion':criterion,
                        'tagKey':tag_key,'negative':False,
                        'sourceMatchedItemCount':len(found),
                        'candidateIncludedCount':len(included),
                        'explicitOrNegativeExcludedCount':len(suppressed),
                        'gameUiMembershipVerified':False,
                    })
        require(total_selectors==sum(handled.values())+unresolved,
                'SELECTOR_COVERAGE')
        require(sum(handled.values())==len(selector_rows),
                'SELECTOR_LEDGER')
        for cat,digest in original_hashes.items():
            require(source.sha_bytes(wire.read_original(original_dir,cat))==digest,
                    'ORIGINAL_CHANGED_'+cat)
        require(source.sha(sqlite_path)==expected_sqlite_sha256 and
                source.sha(il2cpp_path)==expected_il2cpp_sha256,
                'SOURCE_CHANGED_AFTER_READ')
        buckets=[[] for _ in range(256)]
        for id,links in sorted(candidates.items()):
            buckets[id%256].append({
                'itemId':id,'nativeCategory':canonical[id][0],
                'sourceSha256':canonical[id][2],
                'memberships':sorted(links,key=lambda v:(
                    v['setId'],v['groupIndex'],v['selectorIndex'])),
            })
        files={}
        outputs={'selectors.json':wire.packed_json(sorted(selector_rows,
            key=lambda v:(v['setId'],v['groupIndex'],v['selectorIndex'])))}
        outputs.update({f'id/{i:02x}.json':wire.packed_json(rows)
                        for i,rows in enumerate(buckets)})
        for name,content in outputs.items():
            files[name]={
                'sha256':source.sha_bytes(content),'bytes':len(content),
                'count':len(selector_rows) if name=='selectors.json' else
                          len(buckets[int(name[3:5],16)]),
            }
        manifest={
            'schema':SCHEMA,'platform':'Steam','gameVersion':metadata[1],
            'privateOnly':True,'publicationAuthorized':False,
            'sourceSqliteSha256':expected_sqlite_sha256,
            'sourceItemsSha256':metadata[2],
            'sourceIl2cppDumpSha256':expected_il2cpp_sha256,
            'originalCategorySha256':dict(sorted(original_hashes.items())),
            'definitionCount':len(canonical),
            'collectionSetCount':len(frames['CollectionSet']),
            'totalDynamicSelectors':total_selectors,
            'handledSourceSelectors':sum(handled.values()),
            'unresolvedDynamicSelectors':unresolved,
            'negativeSelectorsHandled':ignored_selectors,
            'selectorsBySourceKind':dict(sorted(
                (str(k),v) for k,v in handled.items())),
            'explicitOrNegativeExcludedCount':sum(excluded.values()),
            'candidateItemIds':len(candidates),
            'candidateMemberships':sum(len(v) for v in candidates.values()),
            'bucketCount':256,
            'gameRuntimeMembershipVerified':False,
            'gameUiVisibilityComplete':False,
            'dlcOwnershipVerified':False,
            'worldAvailabilityVerified':False,
            'files':files,
        }
        output.mkdir(parents=True,exist_ok=False)
        for name,content in outputs.items():
            wire.write_atomic(output/name,content)
        wire.write_atomic(output/'manifest.json',wire.packed_json(manifest))
        return {name:manifest[name] for name in (
            'gameVersion','definitionCount','collectionSetCount',
            'totalDynamicSelectors','handledSourceSelectors',
            'unresolvedDynamicSelectors','negativeSelectorsHandled',
            'selectorsBySourceKind','candidateItemIds','candidateMemberships',
            'explicitOrNegativeExcludedCount')}
    finally:
        db.close()


def main():
    p=argparse.ArgumentParser(description='Private original Character/Memory/Figurine/Pet/Sidekick collection source joins')
    p.add_argument('--sqlite',type=Path,required=True)
    p.add_argument('--original-dir',type=Path,required=True)
    p.add_argument('--il2cpp-dump',type=Path,required=True)
    p.add_argument('--expected-sqlite-sha256',required=True)
    p.add_argument('--expected-il2cpp-sha256',required=True)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    try:
        result=produce(args.sqlite,args.original_dir,args.il2cpp_dump,args.out,
            expected_sqlite_sha256=args.expected_sqlite_sha256,
            expected_il2cpp_sha256=args.expected_il2cpp_sha256)
    except (ValueError,OSError,UnicodeError,sqlite3.Error,TypeError) as exc:
        p.exit(1,'DB-01 source collection selectors failed: '+str(exc)+'\n')
    print(json.dumps(result,ensure_ascii=False,sort_keys=True))


if __name__=='__main__':
    main()
