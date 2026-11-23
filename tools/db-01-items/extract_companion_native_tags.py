"""Source-verified Steam v1.26.2 Companion.json three native subclasses.

The original Companion category contains:
  PetItemData (IHasTags.Tags = protobuf field 7)
  MountItemData (IHasTags.Tags = protobuf field 10)
  CritterItemData (NO IHasTags; Location/Scene oneof = field 6 or 7)

Critter CollectionArea cannot be inferred from Tags: the native original
GetAreaConfigs routes Location-case Critters through ProfileWorld scene state.
An untagged Mount is an IHasTags source negative; a Critter is UNRESOLVED,
not an IHasTags false match. Never silently assign either to DreamlightValley.

Offline Python only. SHA-pins original Companion, Tag and IL2CPP source,
writes 256 SHA-ledger private shards only. Never publish original source,
profile data or extracted rows to GitHub.
"""
from __future__ import annotations

import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import re
import sys

HELPER=Path(__file__).with_name("extract_furniture_subtypes.py")
_spec=importlib.util.spec_from_file_location(
    "db01_companion_original_wire",HELPER)
if _spec is None or _spec.loader is None:
    raise RuntimeError("DB01_COMPANION_WIRE_HELPER_MISSING")
_f=importlib.util.module_from_spec(_spec)
sys.modules[_spec.name]=_f
_spec.loader.exec_module(_f)

SCHEMA="wand.db01.original-companion-native-steam-1262@1"
VERSION="1.26.2"
COMPANION_SHA256="62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219"
EXPECTED_CLASSES={
    "PetItemData":241,"MountItemData":28,"CritterItemData":125,
}
POSITIVE_TAGS={
    1:2001200028,2:2001200029,3:2001200030,
    4:2001200040,5:2001200066,4097:2001200067,
}
EXPECTED_POSITIVE={1:170,2:20,3:16,4:19,5:17,4097:4}
EXPECTED_CRITTER_ONEOF={6:105,7:20}
EXPECTED_TOTAL=394
EXPECTED_TAGGED_SOURCE=246
EXPECTED_TAGGED_NO_POSITIVE=23
SHARDS=256


def require(value:object,reason:str)->None:
    if not value:
        raise ValueError("DB01_COMPANION_ORIGINAL_"+reason)


def native_classes(dump:str)->None:
    for cls,tags_field in [
        ("PetItemData",7),("MountItemData",10),("CritterItemData",None),
    ]:
        match=re.search(
            r"^public sealed class "+re.escape(cls)+
            r" :[^\n]*\n\{(.*?)\n\t// Properties",
            dump,re.M|re.S)
        require(match is not None,"ORIGINAL_IL2CPP_CLASS_"+cls)
        header=match.group(0).split("\n",1)[0]
        body=match.group(1)
        require(("IHasTags" in header)==(tags_field is not None) and
                "IHasSet" not in header,
                "ORIGINAL_NATIVE_INTERFACE_"+cls)
        if tags_field is None:
            require("TagsFieldNumber" not in body and
                    "public const int LocationFieldNumber = 6;" in body and
                    "public const int SceneFieldNumber = 7;" in body,
                    "ORIGINAL_CRITTER_NON_TAG_ONEOF")
        else:
            require(f"public const int TagsFieldNumber = {tags_field};"
                    in body,"ORIGINAL_TAG_FIELD_"+cls)


def original_kind(
    item_id:int,native_key:str,ff:list,
    known_tags:set[int],
)->dict:
    pairs={(f,w) for f,w,_ in ff}
    has=lambda field,wire:(field,wire) in pairs
    raw7=_f.single_value(ff,7,2) if has(7,2) else None
    pet_tags=_f.exact_tag_list(raw7,known_tags) if raw7 is not None else None
    critter=has(6,0) or (
        has(15,0) and has(16,2) and has(17,2))
    mount=(has(7,0) or any(has(field,0) for field in (50,51,52))) and (
        not has(15,0) and not has(16,2))
    pet=raw7 is not None and bool(pet_tags)
    classes=[name for name,ok in [
        ("PetItemData",pet),("MountItemData",mount),
        ("CritterItemData",critter)] if ok]
    require(len(classes)==1,
            "UNCLASSIFIED_OR_AMBIGUOUS_NATIVE_COMPANION")
    native=classes[0]
    location_case=None
    if native=="CritterItemData":
        require(has(6,0)!=has(7,0),
                "CRITTER_LOCATION_OR_SCENE_ONEOF")
        location_case=6 if has(6,0) else 7
        tags=None
        kind="critter"
    else:
        field=7 if native=="PetItemData" else 10
        raw=_f.single_value(ff,field,2)
        tags=_f.exact_tag_list(raw,known_tags)
        require(tags is not None and (
            native!="PetItemData" or bool(tags)),
            "NATIVE_IHAS_TAGS_FIELD_"+native)
        kind="pet" if native=="PetItemData" else "mount"
    return {
        "itemId":item_id,"nativeKey":native_key,
        "nativeCategory":"Companion",
        "originalNativeClass":native,"nativeKind":kind,
        "nativeTags":list(tags) if tags is not None else None,
        "tagsFieldNumber":None if tags is None else (
            7 if native=="PetItemData" else 10),
        "critterLocationOneofFieldNumber":location_case,
        "originalIHasTagsInterface":native!="CritterItemData",
        "originalIHasSetInterface":False,
        "nativeClassSourceVerified":True,
        "runtimeCritterWorldSceneVerified":False,
        "gameUiCollectionMembershipVerified":False,
        "dlcEntitlementVerified":False,
    }


def classify_original(
    originals:list[tuple[int,str,list]],
    known_tag_ids:set[int],*,check_census:bool=True,
)->tuple[list[dict],dict]:
    require(len(originals)==EXPECTED_TOTAL and
            len(known_tag_ids)==409,
            "ORIGINAL_SOURCE_CORPUS_COUNT")
    rows=[]
    observed=Counter()
    area=Counter()
    critters=Counter()
    tagged=Counter()
    unknown=0
    seen=set()
    for item_id,key,ff in originals:
        require(item_id not in seen,"DUPLICATE_ORIGINAL_ITEM_ID")
        seen.add(item_id)
        row=original_kind(item_id,key,ff,known_tag_ids)
        name=row["originalNativeClass"]
        observed[name]+=1
        if row["nativeKind"]=="critter":
            critters[row["critterLocationOneofFieldNumber"]]+=1
        else:
            matches=[code for code,tag in POSITIVE_TAGS.items()
                     if tag in row["nativeTags"]]
            require(len(matches)<=1,
                    "MULTIPLE_NATIVE_POSITIVE_AREA_TAGS")
            area.update(matches)
            tagged["has_tags"]+=bool(row["nativeTags"])
            tagged["without_positive"]+=not bool(matches)
        rows.append(row)
    if check_census:
        require(dict(observed)==EXPECTED_CLASSES and
                dict(area)==EXPECTED_POSITIVE and
                dict(critters)==EXPECTED_CRITTER_ONEOF and
                tagged["has_tags"]==EXPECTED_TAGGED_SOURCE and
                tagged["without_positive"]==EXPECTED_TAGGED_NO_POSITIVE,
                "ORIGINAL_CLASS_OR_AREA_CENSUS_DRIFT")
    report={
        "sourceDefinitions":len(rows),
        "originalNativeClasses":dict(sorted(observed.items())),
        "nativeTaggedItems":tagged["has_tags"],
        "nativeHasTagsWithoutPositiveArea":tagged["without_positive"],
        "nativePositiveAreaTagItems":sum(area.values()),
        "nativePositiveAreaByCode":{
            str(code):area[code] for code in POSITIVE_TAGS},
        "critterSourceLocationOneof":{
            str(case):critters[case] for case in (6,7)},
        "critterRuntimeProfileWorldSceneRequired":sum(critters.values()),
        "nativeAllAreasDefaultMatchVerified":False,
        "actualGameCollectionUiMembershipVerified":False,
    }
    return sorted(rows,key=lambda r:r["itemId"]),report


def build(itemlist:Path,il2cpp_dump:Path,private_output:Path)->dict:
    source=itemlist.resolve(strict=True)
    dump=il2cpp_dump.resolve(strict=True)
    output=private_output.resolve()
    _f.private_target(output,(source,dump))
    require(source.is_dir() and not source.is_symlink(),
            "ORIGINAL_SOURCE_DIRECTORY")
    original=_f.original_records(_f.verified_file(
        source/"Companion.json",COMPANION_SHA256,"COMPANION"),
        "Companion")
    tags=_f.original_records(_f.verified_file(
        source/"Tag.json",_f.TAG_SHA256,"TAG"),"Tag")
    known={id for id,_,_ in tags}
    native_classes(_f.verified_file(
        dump,_f.IL2CPP_SHA256,"IL2CPP").decode("utf-8"))
    rows,stats=classify_original(original,known)
    partitions=[[] for _ in range(SHARDS)]
    for row in rows:
        partitions[row["itemId"]%SHARDS].append(row)
    output.mkdir(parents=True,exist_ok=False)
    ledger={}
    for index,group in enumerate(partitions):
        path=f"id/{index:02x}.json"
        content=_f.json_bytes(group)
        _f.write_new(output/path,content)
        ledger[path]={
            "sha256":_f.digest(content),
            "bytes":len(content),"count":len(group),
        }
    manifest={
        "schema":SCHEMA,"platform":"Steam","gameVersion":VERSION,
        "privateOnly":True,"publicationAuthorized":False,
        "sourceCompanionSha256":COMPANION_SHA256,
        "sourceTagSha256":_f.TAG_SHA256,
        "sourceIl2cppDumpSha256":_f.IL2CPP_SHA256,
        "sourceDefinitionCount":EXPECTED_TOTAL,
        "originalNativeClassCounts":stats["originalNativeClasses"],
        "sourcePositiveAreaCountsVerified":True,
        "sourceCritterLocationOneofVerified":True,
        "sourceNativeHasTagsInterfacesVerified":True,
        "sourceCritterRuntimeWorldSceneVerified":False,
        "nativeAllAreasDefaultMatchVerified":False,
        "actualGameCollectionUiMembershipVerified":False,
        "playerOwnershipVerified":False,
        "dlcEntitlementVerified":False,
        "bucketCount":SHARDS,"files":ledger,
    }
    content=_f.json_bytes(manifest)
    _f.write_new(output/"manifest.json",content)
    return {
        "status":"PASS","schema":SCHEMA,
        "privateOnly":True,"originalSourceSHA256":COMPANION_SHA256,
        "shards":SHARDS,"census":stats,
        "manifestSHA256":_f.digest(content),
    }


def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--itemlist",type=Path,required=True)
    parser.add_argument("--il2cpp-dump",type=Path,required=True)
    parser.add_argument("--private-out",type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(build(args.itemlist,args.il2cpp_dump,
                           args.private_out),sort_keys=True))


if __name__=="__main__":
    main()
