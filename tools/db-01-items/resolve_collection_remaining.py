"""Resolve remaining original Steam v1.26.2 CollectionActivity/Crafting predicates.

Zero numeric guesswork about in-game Collection UI or DLC. Original
ActivityItem fields and CraftingRecipeItemData.RecipeType/Result.ItemID are
independently checked against source IL2CPP declarations and a SHA-pinned
complete private SQLite catalog. Negative Crafting selectors remain
negative EXCLUSIONS, never positive category links.

Outputs are private-only, 256 lazy Item-ID shards plus exact selector ledger.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

import extract_classification as proto
import extract_collection_menu as menus
import resolve_collection_universes as original

SCHEMA = 'wand.db01.collection-activity-crafting@1'
EVIDENCE = 'current_original_activity_or_crafting_predicate'
CATEGORIES = ('CollectionSet', 'Tag', 'ActivityItem', 'ActivityData')
ACTIVITY_SUBTYPES = {
    3: ('Meal', 'MealItemData', 15),
    8: ('Flower', 'FlowerItemData', 8),
    10: ('Fish', 'FishItemData', 14),
    11: ('Ingredient', 'IngredientItemData', 13),
    16: ('Mineral', 'MineralItemData', 9),
    17: ('CraftingMaterial', 'ActivityItemData', 11),
    2: ('Crop', 'CropItemData', 30),
}
ACTIVITY_ENUM = {'Flower': 8, 'Fish': 10, 'Mineral': 16,
                 'CraftingMaterial': 17}
EXPECTED_FIELDS = {
    'CollectionItemType': {'ActivityItemFieldNumber': 6,
                           'CraftingFieldNumber': 8,
                           'IgnoreFieldNumber': 1},
    'CollectionActivity': {'CropFieldNumber': 1, 'MealFieldNumber': 2,
                           'FlowerFieldNumber': 3, 'FishFieldNumber': 4,
                           'IngredientFieldNumber': 5,
                           'CraftingMaterialFieldNumber': 6,
                           'MineralFieldNumber': 7,
                           'ByGameplayTagFieldNumber': 8},
    'CollectionMeal': {'MealTypeFieldNumber': 1},
    'CollectionCrafting': {'MaterialBasicFieldNumber': 1,
                           'RecipeTypeFieldNumber': 2},
    'ActivityItemData': {'TagsFieldNumber': 11},
    'CropItemData': {'TagsFieldNumber': 30},
    'FlowerItemData': {'TagsFieldNumber': 8},
    'FishItemData': {'TagsFieldNumber': 14},
    'IngredientItemData': {'TagsFieldNumber': 13,
                           'CookingIngredientTypeFieldNumber': 8},
    'MealItemData': {'TagsFieldNumber': 16,
                     'MealTypeFieldNumber': 15},
    'MineralItemData': {'TagsFieldNumber': 9},
    'CraftingRecipeItemData': {'RecipeTypeFieldNumber': 8,
                               'ResultFieldNumber': 6},
    'CraftingRecipeItemData.Types.ResultInstance': {'ItemIDFieldNumber': 1},
    'CollectionGroup': {'CollectionsByItemFieldNumber': 1,
                        'CollectionsByTypeFieldNumber': 2},
    'CollectionSetItemData': {'GroupsFieldNumber': 9,
                              'SubmenuFieldNumber': 8},
}

def require(ok, reason):
    if not ok:
        raise ValueError('DB01_REMAINING_' + reason)

def source_field_class(dump, name, numbers):
    token = r'public sealed class ' + re.escape(name) + r'\s*:'
    matches = list(re.finditer(token, dump))
    require(len(matches) == 1, 'MISSING_CLASS_' + name)
    end = dump.find('\n}', matches[0].end())
    require(end > matches[0].end() and end-matches[0].end() < 90000,
            'CLASS_BOUNDARY_' + name)
    body = dump[matches[0].end():end]
    for field, number in numbers.items():
        require(re.search(r'\bpublic const int ' + field +
                          r'\s*=\s*' + str(number) + r'\s*;', body),
                'FIELD_MISMATCH_' + name + '_' + field)

def source_enum(dump, enum_name, expected):
    matches = list(re.finditer(r'public enum ' + re.escape(enum_name) +
                               r' // TypeDefIndex: \d+\s*\{(?P<body>.*?)\n\}',
                               dump, re.S))
    require(len(matches) == 1, 'ENUM_MISSING_' + enum_name)
    body = matches[0]['body']
    for key, code in expected.items():
        require(re.search(r'\bpublic const ' + re.escape(enum_name) + ' ' +
                          key + r' = ' + str(code) + ';', body),
                'ENUM_FIELD_' + enum_name + '_' + key)

def verify_dump(path):
    text = path.read_text(encoding='utf-8')
    for name, fields in EXPECTED_FIELDS.items():
        source_field_class(text, name, fields)
    source_enum(text, 'ActivityItemType', ACTIVITY_ENUM)
    source_enum(text, 'ActivityDataItemType', {'CraftingRecipe': 3})
    source_enum(text, 'ItemType', {'ActivityItem': 3, 'ActivityData': 205})

def one_scalar(record, index, default=None):
    found = [v for n,w,v in record if n == index and w == 0]
    require(len(found) <= 1, 'MULTIPLE_SCALAR')
    return found[0] if found else default

def one_bytes(record, index):
    found = [v for n,w,v in record if n == index and w == 2]
    require(len(found) <= 1, 'MULTIPLE_NESTED')
    return found[0] if found else None

def tagged(record, index, tag_id):
    return tag_id in original.original_packed(record, index)

def case_activity(payload, activity, tags):
    fields = proto.fields(payload)
    require(len(fields) == 1, 'ACTIVITY_SELECTOR_ONEOF')
    kind,wire,value = fields[0]
    matches = []
    if kind in (3,4,6,7):
        require(wire == 2 and value == b'', 'ACTIVITY_EMPTY_SELECTOR')
        types = {3:8,4:10,6:17,7:16}
        subtype = types[kind]
        matches = [(id, 'ActivityItemType',
                    subtype) for id,(typ,row) in activity.items()
                   if typ == subtype]
        criterion = subtype
        selector_field = ACTIVITY_ENUM[{3:'Flower',4:'Fish',
                                        6:'CraftingMaterial',7:'Mineral'}[kind]]
        require(selector_field == subtype, 'ACTIVITY_ENUM_MISMATCH')
        field_name = 'ActivityItemType'
        tag_name = None
    elif kind in (2,5,8):
        if kind == 8 or kind == 5:
            require(wire == 0, 'ACTIVITY_TAG_WIRE')
            criterion = value
            if kind == 8:
                # This original predicate addresses activity gameplay tags
                # (e.g. IsFruit). The currently verified original labels
                # occur as direct CropItemData.Tags (field 30); no inferred
                # equivalence to Ingredient/CropType is necessary.
                filtered = [(item_id,typ,row) for item_id,(typ,row)
                            in activity.items() if typ in ACTIVITY_SUBTYPES]
                matches = [(id, 'CropItemData.Tags', criterion)
                           for id,typ,row in filtered
                           if typ==2 and tagged(row,30,criterion)]
                field_name = 'CropItemData.Tags'
            else:
                matches = [(id, 'IngredientItemData.CookingIngredientType',criterion)
                           for id,(typ,row) in activity.items()
                           if typ==11 and one_scalar(row,8)==criterion]
                field_name = 'IngredientItemData.CookingIngredientType'
        else:
            require(wire == 2, 'MEAL_NESTED_WIRE')
            nested = proto.fields(value)
            require(len(nested) == 1 and nested[0][0]==1 and
                    nested[0][1]==0, 'MEAL_NESTED_SHAPE')
            criterion = nested[0][2]
            matches = [(id,'MealItemData.MealType',criterion)
                       for id,(typ,row) in activity.items()
                       if typ==3 and one_scalar(row,15)==criterion]
            field_name = 'MealItemData.MealType'
        require(criterion in tags, 'UNKNOWN_ACTIVITY_TAG')
        tag_name = tags[criterion]
    else:
        raise ValueError('DB01_REMAINING_UNSUPPORTED_ACTIVITY_CASE')
    return kind,field_name,criterion,tag_name,matches

def produce(sqlite_path:Path, original_dir:Path, dump_path:Path,
            output:Path, *, expected_sqlite_sha256:str,
            expected_il2cpp_sha256:str,
            expected_selector_counts:tuple[int,int]=(12,28)):
    sqlite_path,original_dir,dump_path,output = (
        Path(p).expanduser().resolve() for p in
        (sqlite_path,original_dir,dump_path,output))
    require(sqlite_path.is_file() and original_dir.is_dir() and
            dump_path.is_file() and not output.exists(), 'PATH')
    for ancestor in (output,*output.parents):
        require(not (ancestor/'.git').exists() and not
                ((ancestor/'package.json').is_file() and
                 (ancestor/'src').is_dir()), 'PUBLIC_OUTPUT')
    for input_path in (sqlite_path,original_dir,dump_path):
        require(output != input_path and
                output not in input_path.parents and
                input_path not in output.parents, 'OUTPUT_OVERLAP')
    require(type(expected_sqlite_sha256) is str and
            proto.SHA.fullmatch(expected_sqlite_sha256) and
            original.sha(sqlite_path) == expected_sqlite_sha256,
            'SQLITE_SOURCE_SHA')
    require(type(expected_il2cpp_sha256) is str and
            proto.SHA.fullmatch(expected_il2cpp_sha256) and
            original.sha(dump_path) == expected_il2cpp_sha256,
            'IL2CPP_SOURCE_SHA')
    verify_dump(dump_path)
    con=sqlite3.connect('file:'+sqlite_path.as_posix()+
                        '?mode=ro&immutable=1',uri=True)
    try:
        require(con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok',
                'SQLITE_INTEGRITY')
        meta = con.execute(
            'SELECT platform,game_version,items_sha256,definition_count,'
            'publication_authorized FROM catalog WHERE id=1').fetchone()
        require(meta and meta[0]=='Steam' and meta[4]==0,
                'PRIVATE_STEAM_CATALOG')
        canonical={}
        for id,cat,key,sha in con.execute(
            'SELECT item_id,native_category,native_key,source_sha256 '
            'FROM definition'):
            require(id not in canonical,'DUPLICATE_CANONICAL_ID')
            canonical[id]=(cat,key,sha)
        require(len(canonical)==meta[3],'DEFINITION_COUNT')
        rows={}
        hashes={}
        for name in CATEGORIES:
            rows[name],hashes[name]=original.original_records(
                name,original_dir,canonical)
        tags=proto.load_tag_dictionary(proto.read_original(original_dir,'Tag'))
        # Do not interpret unknown GameObject tags or class codes by guessing.
        activity={}
        for id,row in rows['ActivityItem'].items():
            require(id//10_000_000==3,'ACTIVITY_NATIVE_ITEMTYPE')
            activity[id]=((id%10_000_000)//100_000,row)
        recipes=defaultdict(list)
        for recipe_id,row in rows['ActivityData'].items():
            require(recipe_id//10_000_000==205,'ACTIVITYDATA_NATIVE_ITEMTYPE')
            if recipe_id%10_000_000//100_000 != 3:
                continue
            recipe_type=one_scalar(row,8)
            require(recipe_type in tags,'UNKNOWN_RECIPE_TYPE')
            result=one_bytes(row,6)
            require(result is not None,'MISSING_RECIPE_RESULT')
            rec=proto.fields(result)
            target=one_scalar(rec,1)
            require(target in canonical,'UNRESOLVED_CRAFTED_RESULT_ID')
            recipes[recipe_type].append((target,recipe_id))

        selectors=[]
        positive=defaultdict(list)
        negative=defaultdict(list)
        coverage=Counter()
        blocked=Counter()
        grouped_negative=defaultdict(set)
        all_raw=[]
        for set_id,row in sorted(rows['CollectionSet'].items()):
            sub=one_scalar(row,8,0)
            for group_index,payload in enumerate(
                    value for n,w,value in row if n==9 and w==2):
                group=proto.fields(payload)
                excluded=set()
                for specification in (v for n,w,v in group if n==1 and w==2):
                    spec=proto.fields(specification)
                    if one_scalar(spec,1,0):
                        excluded.update(menus.item_list_ids(spec))
                for selector_index,sel_payload in enumerate(
                        v for n,w,v in group if n==2 and w==2):
                    selector=proto.fields(sel_payload)
                    choices=[(n,w,v) for n,w,v in selector if n!=1]
                    require(len(choices)==1,'SELECTOR_ONEOF')
                    kind,wire,value=choices[0]
                    if kind==6:
                        require(wire==2,'ACTIVITY_WIRE')
                        activity_kind,field_name,criterion,tag_name,matches=(
                            case_activity(value,activity,tags))
                        rule='source_activity_field_equals_collection_condition'
                        evidence_type='activity'
                        provenance=[(i,None) for i,_,_ in matches]
                        require(not one_scalar(selector,1,0),
                                'UNEXPECTED_NEGATED_ACTIVITY')
                    elif kind==8:
                        require(wire==2,'CRAFT_WIRE')
                        craft=proto.fields(value)
                        require(len(craft)==1 and craft[0][0]==2 and
                                craft[0][1]==0,'CRAFT_RECIPE_TYPE_SHAPE')
                        criterion=craft[0][2]
                        require(criterion in tags,'UNKNOWN_CRAFT_RECIPE_TAG')
                        tag_name=tags[criterion]
                        field_name='CraftingRecipeItemData.RecipeType'
                        rule='source_crafting_recipe_type_and_result_item_id'
                        evidence_type='crafting'
                        provenance=recipes.get(criterion,[])
                        activity_kind=None
                    else:
                        continue
                    ignored=one_scalar(selector,1,0)
                    require(ignored in (0,1),'SELECTOR_NEGATION')
                    counted=0
                    blocked_count=0
                    for target,recipe in provenance:
                        if ignored:
                            negative[target].append({
                                'collectionSetId':set_id,'groupIndex':group_index,
                                'selectorIndex':selector_index,'criterion':criterion,
                                'criterionName':tag_name,'sourceRecipeItemId':recipe,
                                'sourceRule':rule,'evidence':EVIDENCE,
                                'negative':True,'gameUiMembershipVerified':False,
                            })
                            grouped_negative[(set_id,group_index)].add(target)
                            counted+=1
                            continue
                        if target in excluded:
                            blocked_count+=1
                            continue
                        positive[target].append({
                            'collectionSetId':set_id,'groupIndex':group_index,
                            'selectorIndex':selector_index,
                            'activityCase':activity_kind,
                            'sourceField':field_name,'criterion':criterion,
                            'criterionName':tag_name,'sourceRecipeItemId':recipe,
                            'sourceRule':rule,'evidence':EVIDENCE,
                            'sourcePredicateMatched':True,
                            'gameUiMembershipVerified':False,
                            'worldAvailabilityVerified':False,
                            'dlcOwnershipVerified':False,
                        })
                        counted+=1
                    coverage[evidence_type]+=1
                    selectors.append({
                        'collectionSetId':set_id,'submenuCode':sub,
                        'groupIndex':group_index,'selectorIndex':selector_index,
                        'sourceKind':evidence_type,'activityCase':activity_kind,
                        'sourceField':field_name,'criterion':criterion,
                        'criterionName':tag_name,'negative':bool(ignored),
                        'matchedSourceRecordCount':len(provenance),
                        'selectedItemIdCount':counted,'explicitlyExcludedCount':blocked_count,
                        'sourceRule':rule,'gameUiMembershipVerified':False,
                    })
        require(coverage['activity']==expected_selector_counts[0] and
                coverage['crafting']==expected_selector_counts[1],
                'CURRENT_SELECTOR_FAMILY_COUNTS')
        require(len(selectors)==sum(expected_selector_counts),
                'SELECTOR_COVERAGE')
        # A negative Crafting selector acts on other POSITIVE selectors
        # of its same CollectionSet/group, including any external Furniture
        # Universe predicate. It never authorizes a positive Collection row.
        suppressed=0
        for id,links in list(positive.items()):
            retained=[link for link in links
                      if id not in grouped_negative[
                          (link['collectionSetId'],link['groupIndex'])]]
            suppressed+=len(links)-len(retained)
            if retained:
                positive[id]=retained
            else:
                del positive[id]
        for cat,old_sha in hashes.items():
            require(original.sha_bytes(
                proto.read_original(original_dir,cat))==old_sha,
                'SOURCE_CHANGED_'+cat)
        require(original.sha(sqlite_path)==expected_sqlite_sha256 and
                original.sha(dump_path)==expected_il2cpp_sha256,
                'INPUT_CHANGED')
        all_ids=sorted(set(positive)|set(negative))
        buckets=[[] for _ in range(256)]
        for id in all_ids:
            require(id in canonical,'RESULT_ID_MISSING_IN_CATALOG')
            native,key,source_sha=canonical[id]
            buckets[id%256].append({
                'itemId':id,'nativeCategory':native,
                'sourceSha256':source_sha,
                'positive':positive.get(id,[]),
                'negative':negative.get(id,[]),
            })
        files={}
        outputs={'selectors.json':proto.packed_json(sorted(
            selectors,key=lambda v:(v['collectionSetId'],v['groupIndex'],
                                    v['selectorIndex'])))}
        outputs.update({f'id/{i:02x}.json':proto.packed_json(rows)
                        for i,rows in enumerate(buckets)})
        for file,body in outputs.items():
            files[file]={'sha256':original.sha_bytes(body),
                         'bytes':len(body),
                         'count':len(selectors) if file=='selectors.json'
                            else len(buckets[int(file[3:5],16)])}
        manifest={
            'schema':SCHEMA,'platform':'Steam','gameVersion':meta[1],
            'privateOnly':True,'publicationAuthorized':False,
            'sourceSqliteSha256':expected_sqlite_sha256,
            'sourceItemsSha256':meta[2],
            'sourceIl2cppDumpSha256':expected_il2cpp_sha256,
            'originalCategorySha256':dict(sorted(hashes.items())),
            'definitionCount':len(canonical),
            'sourceSelectorCount':len(selectors),
            'resolvedActivitySelectors':coverage['activity'],
            'resolvedCraftingSelectors':coverage['crafting'],
            'unresolvedActivityCraftingSelectors':0,
            'sourceMatchedPositiveItemIds':len(positive),
            'sourceMatchedNegativeItemIds':len(negative),
            'sourceMatchedCombinedItemIds':len(all_ids),
            'positiveAssociations':sum(map(len,positive.values())),
            'negativeAssociations':sum(map(len,negative.values())),
            'sameGroupActivityPositiveSuppressed':suppressed,
            'gameRuntimeMembershipVerified':False,
            'worldAvailabilityVerified':False,
            'dlcOwnershipVerified':False,
            'bucketCount':256,'files':files,
        }
        output.mkdir(parents=True,exist_ok=False)
        for file,body in outputs.items():
            proto.write_atomic(output/file,body)
        proto.write_atomic(output/'manifest.json',proto.packed_json(manifest))
        return {k:manifest[k] for k in (
            'gameVersion','sourceSelectorCount','resolvedActivitySelectors',
            'resolvedCraftingSelectors','sourceMatchedPositiveItemIds',
            'sourceMatchedNegativeItemIds','sourceMatchedCombinedItemIds',
            'positiveAssociations','negativeAssociations',
            'sameGroupActivityPositiveSuppressed',
        )}
    finally:
        con.close()

def main():
    parser=argparse.ArgumentParser(
        description='Original Collection activity and crafting predicate source joins')
    parser.add_argument('--sqlite',type=Path,required=True)
    parser.add_argument('--original-dir',type=Path,required=True)
    parser.add_argument('--il2cpp-dump',type=Path,required=True)
    parser.add_argument('--expected-sqlite-sha256',required=True)
    parser.add_argument('--expected-il2cpp-sha256',required=True)
    parser.add_argument('--out',type=Path,required=True)
    a=parser.parse_args()
    try:
        print(json.dumps(produce(a.sqlite,a.original_dir,a.il2cpp_dump,a.out,
            expected_sqlite_sha256=a.expected_sqlite_sha256,
            expected_il2cpp_sha256=a.expected_il2cpp_sha256),
            ensure_ascii=False,sort_keys=True))
    except (ValueError,OSError,UnicodeError,sqlite3.Error,TypeError) as error:
        parser.exit(1,'DB-01 remaining Collection selectors failed: '+str(error)+'\n')

if __name__=='__main__':
    main()
