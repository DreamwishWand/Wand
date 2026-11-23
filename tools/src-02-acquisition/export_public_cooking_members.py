#!/usr/bin/env python3
"""Rebuild the public Steam v1.26.2 cooking selector candidate index.

Input is ONLY the two original game files ActivityData.json / ActivityItem.json.
Reuse acquisition.py's source-typed parsers, without reading any private SRC-02
r5 archive or player save. CookingIngredientType and IHasTags.Tags are
different namespaces. Only observed Crop/Fish/Ingredient native members
are indexed; no live eligibility or inventory assertion.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from acquisition import parse_activity, parse_ingredient_selector_membership, PINNED

SOURCE_ITEM_SHA="4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2"
SOURCE_ACTIVITY_SHA="2b9be2e95fde793ab081429d8a162b96fb7b927cc14635acee321948e4c04296"
PUBLIC_SHA="8b54025011fb056e634fee16e45fb7db20fa720c4d6c090fb2696a93023ca46a"
PUBLIC_BYTES=20065
FAMILIES={"CropItemData":0,"FishItemData":1,"IngredientItemData":2}

def require(ok:bool,code:str)->None:
    if not ok:raise ValueError("DB02_PUBLIC_COOKING_"+code)

def original(path:Path,digest:str,size:int)->bytes:
    source=path.read_bytes()
    require(len(source)==size and hashlib.sha256(source).hexdigest()==digest,
            "PINNED_ORIGINAL_SOURCE_REQUIRED")
    return source

def generate(activity_data:Path,activity_item:Path)->bytes:
    require(PINNED["activity"]==SOURCE_ACTIVITY_SHA and
            PINNED["activity_item"]==SOURCE_ITEM_SHA,"EXTRACTOR_PINS")
    a=original(activity_data,SOURCE_ACTIVITY_SHA,260627)
    b=original(activity_item,SOURCE_ITEM_SHA,1339476)
    recipes,paths,unknown=parse_activity(a)
    require(len(recipes)==1943 and len(paths)==663 and len(unknown)==24,
            "ACTIVITY_CENSUS")
    members,stats,missing=parse_ingredient_selector_membership(b,recipes)
    require(len(members)==469 and stats=={
        "selectorIdsReferenced":13,
        "selectorUses":238,
        "selectorIdsWithObservedMembers":13,
        "selectorIdsWithoutObservedMembers":0
    } and not missing,"MEMBERSHIP_CENSUS")
    original_rows=[]
    types=set()
    tags=set()
    class_counts=[0,0,0]
    tag_count=0
    for member in members:
        cls=FAMILIES[member["nativeClass"]]
        iid=member["itemId"]
        type_id=member["cookingIngredientTypeId"]
        item_tags=sorted(member["tagIds"])
        require(iid//100000==[302,310,311][cls] and
                2001400000<=type_id<2001500000 and
                len(set(item_tags))==len(item_tags) and
                all(2001200000<=tag<2001300000 for tag in item_tags),
                "NATIVE_CLASS_FIELDS")
        original_rows.append([iid,cls,type_id,item_tags])
        class_counts[cls]+=1
        types.add(type_id)
        tags.update(item_tags)
        tag_count+=len(item_tags)
    original_rows.sort(key=lambda r:r[0])
    require(class_counts==[165,103,201] and len(types)==13 and
            len(tags)==21 and tag_count==580 and
            len(set(r[0] for r in original_rows))==469,
            "SOURCE_MEMBER_TOTALS")
    uses=[]
    for recipe in recipes:
        for ingredient in recipe["ingredients"]:
            if ingredient["kind"]=="anyTag":
                uses.append(ingredient["tagId"])
            elif ingredient["kind"]=="tagAlternatives":
                uses.extend(ingredient["tagIds"])
    selectors=sorted(set(uses))
    by_selector=set(types)|set(tags)
    require(len(uses)==238 and len(selectors)==13 and
            set(selectors)<=by_selector,"RECIPE_SELECTORS")
    data={
        "schema":"wand.db02.public-cooking-members@1",
        "target":{"platform":"Steam","gameVersion":"1.26.2"},
        "source":{
            "activityItemFile":"ddv_Data/StreamingAssets/itemlist/ActivityItem.json",
            "activityItemSha256":SOURCE_ITEM_SHA,"activityItemBytes":1339476,
            "activityDataFile":"ddv_Data/StreamingAssets/itemlist/ActivityData.json",
            "activityDataSha256":SOURCE_ACTIVITY_SHA,"activityDataBytes":260627
        },
        "familyFields":{
            "0":["CropItemData",302,11,30],
            "1":["FishItemData",310,10,14],
            "2":["IngredientItemData",311,8,13]
        },
        "coverage":{
            "sourceActivityItemDefinitions":4050,
            "observedCookingMembers":469,
            "observedCropItems":165,
            "observedFishItems":103,
            "observedIngredientItems":201,
            "observedTypeIds":13,
            "observedTagIds":21,
            "observedTypeMemberships":469,
            "observedTagMemberships":580,
            "recipeSelectorUses":238,
            "recipeSelectorIdsReferenced":13,
            "recipeSelectorIdsWithObservedMembers":13,
            "recipeSelectorIdsWithoutObservedMembers":0,
            "allCookingItemClassesCovered":False,
            "liveAvailabilityVerified":False,
            "playerOwnershipVerified":False,
            "runtimeIngredientEligibilityVerified":False
        },
        "recipeSelectors":selectors,"members":original_rows
    }
    result=(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n").encode()
    require(len(result)==PUBLIC_BYTES and
            hashlib.sha256(result).hexdigest()==PUBLIC_SHA,
            "PUBLIC_PROJECTION_SHA")
    return result

def main()->None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--activity-data",required=True,type=Path)
    parser.add_argument("--activity-item",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    options=parser.parse_args()
    result=generate(options.activity_data,options.activity_item)
    options.output.parent.mkdir(parents=True,exist_ok=True)
    options.output.write_bytes(result)
    print(f"verified {len(result)} bytes SHA256={PUBLIC_SHA}, members=469, selectors=13")

if __name__=="__main__":
    main()
