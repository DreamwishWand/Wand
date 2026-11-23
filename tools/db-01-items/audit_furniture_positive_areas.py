"""Source-exact Steam v1.26.2 positive CollectionArea predicates for Furniture.

Private/offline only. Independently checks:
* original UnityFS CollectionAreaConfig ORDER and exact Tag definitions
* 14 original GetAreaConfigs/GetAreaTags machine-code anchors
* 11 original IHasTags.HasTag/IHasSet.SetItemData machine-code anchors
* all seven Furniture.json protobuf subtype layouts against pinned IL2CPP
* each original Furniture -> native direct+inherited Set Tag -> positive area
* six disjoint positive areas and the 443 unresolved zero-positive cases

The native AllAreas config (GameplayTagID=0) is NOT evaluated. In particular,
unmatched source items must NOT be labeled DreamlightValley by fallback.
This is not CollectionGroup runtime membership or player ownership/entitlement.
Raw source files and per-item private evidence NEVER enter the public repo.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


def imported(name: str, filename: str):
    path=Path(__file__).with_name(filename)
    spec=importlib.util.spec_from_file_location(name,path)
    if spec is None or spec.loader is None:
        raise RuntimeError("DB01_FURNITURE_AREA_MISSING_MODULE_"+filename)
    module=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=module
    spec.loader.exec_module(module)
    return module


_furniture=imported(
    "db01_area_verified_furniture_types","extract_furniture_subtypes.py")
_area=imported(
    "db01_area_verified_unity_configs","extract_collection_area_config.py")
_route=imported(
    "db01_area_verified_native_router","audit_collection_area_native_routing.py")
_has_tag=imported(
    "db01_area_verified_native_has_tag","audit_native_has_tag_sets.py")

SCHEMA="wand.db01.native-furniture-positive-areas.private-audit@1"
EXPECTED_AREAS={
    1:4315,2:434,3:422,4:431,5:478,4097:223,
}
EXPECTED_UNASSIGNED=443
EXPECTED_DIRECT_POSITIVE=6303
ORIGINAL_FURNITURE_COUNT=6746
EXPECTED_AREA_ORDER=(1,2,3,4,5,4097,0)


def require(value:object,code:str)->None:
    if not value:
        raise ValueError("DB01_FURNITURE_AREA_"+code)


def source_summary(
    original_furniture:list,
    known_tag_ids:set[int],
    original_set_tags:dict[int,tuple[int,...]],
    serialized_configs:list[dict],
    *,
    pin_original_census:bool,
)->dict:
    require(len(original_furniture)==ORIGINAL_FURNITURE_COUNT and
            isinstance(known_tag_ids,set) and len(known_tag_ids)>0,
            "ORIGINAL_FURNITURE_SOURCE_COUNT")
    typed=_furniture.classify_corpus(original_furniture,known_tag_ids)
    require(len(serialized_configs)==7 and
            tuple(c["collectionArea"] for c in serialized_configs)==
                EXPECTED_AREA_ORDER and
            all(c["gameplayTagId"]>0 for c in serialized_configs[:6]) and
            serialized_configs[-1]["gameplayTagId"]==0 and
            len({c["gameplayTagId"] for c in serialized_configs[:6]})==6 and
            all(c["gameplayTagId"] in known_tag_ids
                for c in serialized_configs[:6]),
            "ORIGINAL_SERIALIZED_AREA_CONFIG")
    expected_tags=tuple(c["gameplayTagId"] for c in serialized_configs[:6])
    positive=Counter()
    classes=Counter()
    absent_by_class=Counter()
    inherited_hits=Counter()
    multiple=0
    direct_count=0
    for row in typed:
        classes[row.data_class]+=1
        direct=set(row.native_tags)
        inherited=set()
        if row.implements_has_set and row.set_item_id:
            require(row.set_item_id in original_set_tags,
                    "ORIGINAL_SET_LOOKUP_NOT_COMPLETE")
            inherited=set(original_set_tags[row.set_item_id])
        native_tags=direct|inherited
        # Every original non-Critter Furniture subtype implements IHasTags.
        # HasTag = direct.Tags OR IHasSet.SetItemData.Tags. The last config,
        # AllAreas=0, uses a native default Item requiring separate proof.
        source_codes=[serialized_configs[i]["collectionArea"]
                      for i,tag in enumerate(expected_tags)
                      if tag in native_tags]
        direct_count+=bool(source_codes)
        multiple+=len(source_codes)>1
        positive.update(source_codes)
        inherited_hits.update(code for code in source_codes if
            serialized_configs[
                EXPECTED_AREA_ORDER.index(code)]["gameplayTagId"] not in direct)
        if not source_codes:
            absent_by_class[row.data_class]+=1
    unmatched=sum(absent_by_class.values())
    totals={code:positive.get(code,0) for code in EXPECTED_AREA_ORDER[:-1]}
    if pin_original_census:
        require(totals==EXPECTED_AREAS and
                unmatched==EXPECTED_UNASSIGNED and
                direct_count==EXPECTED_DIRECT_POSITIVE and
                multiple==0 and
                all(inherited_hits[code]==0 for code in totals),
                "ORIGINAL_AREA_TAG_CENSUS_DRIFT")
    return {
        "originalFurnitureCount":len(typed),
        "byOriginalFurnitureSubtype":dict(sorted(classes.items())),
        "positiveNativeAreaTagMatches":dict(sorted(totals.items())),
        "positiveNativeAreaTagItems":direct_count,
        "withoutPositiveNativeAreaTag":unmatched,
        "withoutPositiveByNativeSubtype":dict(sorted(absent_by_class.items())),
        "sourceItemsMatchingMultiplePositiveAreas":multiple,
        "sourceInheritedPositiveAreaMatches":
            sum(inherited_hits.values()),
        "originalAllAreasDefaultHasTagEvaluated":False,
        "gameRuntimeCollectionGroupMembershipVerified":False,
        "gameWorldAvailabilityVerified":False,
        "playerEntitlementVerified":False,
    }


def audit(
    itemlist:Path,il2cpp_dump:Path,gameassembly:Path,
    unity_bundle:Path,scene_list:Path,
)->dict:
    source=itemlist.resolve(strict=True)
    require(source.is_dir() and not source.is_symlink(),
            "SOURCE_ITEMLIST_DIRECTORY")
    tag_blob=_furniture.verified_file(
        source/"Tag.json",_furniture.TAG_SHA256,"TAG")
    set_blob=_furniture.verified_file(
        source/"Set.json",_furniture.SET_SHA256,"SET")
    furniture_blob=_furniture.verified_file(
        source/"Furniture.json",_furniture.FURNITURE_SHA256,"FURNITURE")
    original_tag=_furniture.original_records(tag_blob,"Tag")
    original_set=_furniture.original_records(set_blob,"Set")
    original_furniture=_furniture.original_records(furniture_blob,"Furniture")
    tags={item_id:name for item_id,name,_ in original_tag}
    require(len(tags)==409 and len(set(tags))==409,"ORIGINAL_TAG_CENSUS")
    sets=_furniture.original_set_tags(original_set,set(tags))
    dump=_furniture.verified_file(
        il2cpp_dump,_furniture.IL2CPP_SHA256,"IL2CPP").decode("utf-8")
    binary=_has_tag.exact(
        gameassembly,_has_tag.GAMEASSEMBLY_SHA256,"GAMEASSEMBLY")
    _furniture.verify_il2cpp_contract(dump)
    _has_tag.verify_native_dump(dump)
    _has_tag.verify_instructions(binary)
    _route.audit_dump(dump)
    _route.audit_instructions(binary)
    serialized=_area.extract(unity_bundle,source/"Tag.json",
                             scene_list,il2cpp_dump)
    require(serialized["originalItemLocationExceptionIds"] and
            serialized["nativeItemToCollectionAreaMembershipVerified"]
                is False,
            "ORIGINAL_UNITY_AREA_METADATA")
    stats=source_summary(
        original_furniture,set(tags),sets,
        serialized["originalAreaConfigs"],pin_original_census=True)
    return {
        "schema":SCHEMA,"platform":"Steam","gameVersion":"1.26.2",
        "privateOnly":True,"publicationAuthorized":False,
        "originalFurnitureSha256":_furniture.FURNITURE_SHA256,
        "originalTagSha256":_furniture.TAG_SHA256,
        "originalSetSha256":_furniture.SET_SHA256,
        "originalIl2cppSha256":_furniture.IL2CPP_SHA256,
        "originalGameAssemblySha256":_has_tag.GAMEASSEMBLY_SHA256,
        "originalUnityFsSha256":_area.BUNDLE_SHA256,
        "originalSceneSha256":_area.SCENE_SHA256,
        "getAreaRoutingInstructionAnchorsVerified":
            len(_route.INSTRUCTION_ANCHORS),
        "nativeHasTagInstructionAnchorsVerified":
            len(_has_tag.ANCHORS),
        "positiveAreaSourcePredicateVerified":True,
        "allAreasDefaultPredicateVerified":False,
        "actualGameCollectionAreaMembershipVerified":False,
        "census":stats,
    }


def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--itemlist",type=Path,required=True)
    parser.add_argument("--il2cpp-dump",type=Path,required=True)
    parser.add_argument("--gameassembly",type=Path,required=True)
    parser.add_argument("--unity-bundle",type=Path,required=True)
    parser.add_argument("--scene-list",type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(audit(
        args.itemlist,args.il2cpp_dump,args.gameassembly,
        args.unity_bundle,args.scene_list),
        sort_keys=True,ensure_ascii=False))


if __name__=="__main__":
    main()
