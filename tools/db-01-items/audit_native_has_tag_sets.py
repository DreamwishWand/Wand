"""Original Steam v1.26.2 IHasTags.HasTag + IHasSet source audit.

Reads SHA-pinned original Set/Tag/Furniture/Clothing/Trimming archives and
the matching original GameAssembly/dump.cs. Both direct Tags and SetItemData
Tags (field 6) are counted. Native machine-code call/branch anchors are also
checked against exact original RVAs. All raw source files stay private.

This does not imply native CollectionItem progress/visibility, DLC entitlement,
save ownership, or runtime UI grouping. An original Tag/Set link is a verified
native HasTag predicate only for the pinned source class and Item definitions.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct

HELPER = Path(__file__).resolve().parents[1] / "collection" / "extract_scope_evidence.py"
_spec = importlib.util.spec_from_file_location("db01_hastag_wire", HELPER)
if _spec is None or _spec.loader is None:
    raise RuntimeError("DB01_HAS_TAG_WIRE_HELPER_MISSING")
_wire = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_wire)

SCHEMA = "wand.db01.original-has-tag-set-audit.private@1"
ORIGINAL_SHA = {
    "Tag": "bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4",
    "Set": "3682f4888244a9a460d08300a00cc873307c9ad3553fb929aaca135efb38708f",
    "Furniture": "cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196",
    "Clothing": "a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946",
    "Trimming": "a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c",
}
EXPECTED_ROWS = {"Tag": 409,"Set": 727,"Furniture": 6746,
                 "Clothing": 2041,"Trimming": 365}
IL2CPP_SHA256 = "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08"
GAMEASSEMBLY_SHA256 = "a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653"
NATIVE_CLASSES = {
    "FurnitureItemData": (8, 9),
    "ClothingItemData": (8, 9),
    "DecalItemData": (6, 9),
    "MakeupItemData": (14, 15),
    "EyeballItemData": (14, 15),
    "TrimmingItemData": (9, 10),
}
SOURCE_FAMILIES = {
    "Furniture": (8, 9),
    "Clothing": (8, 9),
    "Trimming": (9, 10),
}
AREA_TAG_NATIVE_NAMES = {
    "IsDreamlightValley", "IsEternityIsle", "IsStorybookVale",
    "IsWishBlossomMountains", "isSeaOfSecrets", "isHoneywood",
}
# Machine-code branch proof (owner-private, same-version DLL).
ANCHORS = {
    "direct_interface_tags": (0x4108972, "b9010000004c"),
    "direct_interface_call": (0x410897A, "e8c198effb"),
    "direct_repeated_contains": (0x4108994, "e867edf3fb"),
    "direct_positive_short_circuit": (0x4108999, "84c00f8507010000"),
    "isinst_has_set": (0x41089AB, "e810fb4ffc"),
    "has_set_nil_branch": (0x41089B3, "4885c00f84da0000"),
    "get_set_item_interface": (0x41089E5, "e85698effb"),
    "get_original_set_itemdata": (0x4108A1D, "e87e4b64fd"),
    "set_field_40_tags": (0x4108A7B, "488b48404885c97436"),
    "set_tags_contains": (0x4108A8D, "e86eecf3fb"),
    "positive_result": (0x4108AAD, "b001"),
}
METHOD = "public static bool HasTag(IHasTags hasTagsItemData, Item tag) { }"
NATIVE_HASH_SOURCE_FAMILIES = "Steam 1.26.2"


def require(ok: object, code: str) -> None:
    if not ok:
        raise ValueError("DB01_NATIVE_HAS_TAG_" + code)


def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def exact(path: Path, digest: str, name: str) -> bytes:
    require(path.is_file() and not path.is_symlink(), "SOURCE_MISSING_" + name)
    blob = path.read_bytes()
    require(sha(blob) == digest, "SOURCE_SHA_" + name)
    return blob


def verify_native_dump(dump: str) -> None:
    for cls,(set_no,tags_no) in NATIVE_CLASSES.items():
        m = re.search(
            r"public sealed class " + re.escape(cls) +
            r"\b[^\n]*\n\{(.*?)\n\t// Properties", dump,re.S)
        require(m is not None and ", IHasTags," in m.group(0) and
                ", IHasSet," in m.group(0),
                "MISSING_NATIVE_HAS_SET_" + cls)
        require(
            f"public const int SetItemIDFieldNumber = {set_no};" in m.group(1) and
            f"public const int TagsFieldNumber = {tags_no};" in m.group(1),
            "NATIVE_SOURCE_FIELD_DRIFT_" + cls)
    set_def = re.search(
        r"public sealed class SetItemData\b[^\n]*\n\{(.*?)\n\t// Properties",
        dump,re.S)
    require(set_def is not None and
            "public const int TagsFieldNumber = 6;" in set_def.group(1) and
            "private readonly RepeatedField<int> tags_; // 0x40" in set_def.group(1),
            "NATIVE_SET_TAG_FIELD_DRIFT")
    require("public interface IHasSet // " in dump and
            "public abstract Item get_SetItem();" in dump and
            "public interface IHasTags // " in dump and
            "public abstract RepeatedField<int> get_Tags();" in dump and
            "// RVA: 0x41088E0 Offset: 0x41070E0 VA: 0x1841088E0\n\t" +
            METHOD in dump,"NATIVE_HAS_TAG_SIGNATURE_DRIFT")


def pe_rva(blob: bytes, rva: int, length: int) -> bytes:
    require(len(blob)>512 and blob[:2]==b"MZ","BAD_PE_DOS")
    p=struct.unpack_from("<I",blob,0x3c)[0]
    require(0x40<=p<len(blob)-256 and blob[p:p+4]==b"PE\0\0",
            "BAD_PE_SIGNATURE")
    count=struct.unpack_from("<H",blob,p+6)[0]
    size=struct.unpack_from("<H",blob,p+20)[0]
    require(1<=count<=20 and size>=112 and
            struct.unpack_from("<H",blob,p+24)[0]==0x20B and
            0<length<=32, "BAD_PE_LAYOUT")
    base=p+24+size
    require(base+count*40<=len(blob),"BAD_PE_SECTIONS")
    for i in range(count):
        at=base+40*i
        vs,vr,raw_size,raw_at=struct.unpack_from("<IIII",blob,at+8)
        delta=rva-vr
        if 0<=delta and delta+length<=min(vs,raw_size):
            require(raw_at+delta+length<=len(blob),"BAD_PE_RAW")
            return blob[raw_at+delta:raw_at+delta+length]
    raise ValueError("DB01_NATIVE_HAS_TAG_UNMAPPED_RVA")


def verify_instructions(blob: bytes) -> None:
    for name,(rva,hex_code) in ANCHORS.items():
        require(pe_rva(blob,rva,len(hex_code)//2)==bytes.fromhex(hex_code),
                "NATIVE_MACHINE_CODE_DRIFT_"+name)


def source_records(blob: bytes, family: str) -> list[tuple[int,str,list]]:
    seen=set()
    result=[]
    for _,raw in _wire.frames(blob):
        ff=list(_wire.fields(raw))
        ids=[value for f,w,value in ff if f==1 and w==0]
        names=[value for f,w,value in ff if f==2 and w==2]
        require(len(ids)==len(names)==1 and type(ids[0]) is int and
                ids[0]>0 and ids[0] not in seen and names[0],
                "ORIGINAL_RECORD_ID_"+family)
        seen.add(ids[0])
        result.append((ids[0],names[0].decode("utf-8"),ff))
    require(len(result)==EXPECTED_ROWS[family],
            "ORIGINAL_ROW_CENSUS_"+family)
    return result


def exactly_one_packed(
    fields: list,field:int,tag_ids:set[int],
) -> tuple[int,...]:
    found=[bytes(v) for f,w,v in fields if f==field and w==2]
    require(len(found)<=1,"MULTIPLE_PACKED_TAG_FIELDS")
    if not found:return ()
    raw=found[0]
    if not raw:return ()
    resolved=_wire.packed_tags(raw,tag_ids)
    require(bool(resolved) and len(resolved)==len(set(resolved)),
            "UNRECOGNIZED_TAG_IDS")
    return tuple(resolved)


def one_set_reference(fields: list,field:int) -> int|None:
    found=[v for f,w,v in fields if f==field and w==0]
    require(len(found)<=1 and all(type(x) is int and x>=0 for x in found),
            "INVALID_SET_REFERENCE")
    return found[0] if found else None


def join_source(
    tag_rows:list[tuple[int,str,list]],
    set_rows:list[tuple[int,str,list]],
    families:dict[str,list[tuple[int,str,list]]],
)->dict:
    tags={item_id:name for item_id,name,_ in tag_rows}
    require(len(tags)==409,"TAG_CENSUS")
    world={tid for tid,name in tags.items()
           if name in AREA_TAG_NATIVE_NAMES}
    require(len(world)==6,"WORLD_TAG_IDS")
    definition={}
    for sid,_,ff in set_rows:
        definition[sid]=set(exactly_one_packed(ff,6,set(tags)))
    require(len(definition)==727,"SET_CENSUS")
    result={
        "originalSetDefinitions":len(definition),
        "originalSetsWithTags":sum(bool(v) for v in definition.values()),
        "originalSetsWithCollectionAreaTags":
            sum(bool(v&world) for v in definition.values()),
    }
    by_family={}
    for family,(set_field,tag_field) in SOURCE_FAMILIES.items():
        rows=families[family]
        stats=Counter()
        for _,_,ff in rows:
            direct=set(exactly_one_packed(ff,tag_field,set(tags)))
            source_set=one_set_reference(ff,set_field)
            linked=definition.get(source_set,set())
            stats["items"]+=1
            stats["directTagItems"]+=bool(direct)
            stats["withSetItemReference"]+=source_set is not None
            stats["resolvedSetItemReference"]+=source_set in definition
            stats["unresolvedSetItemReference"]+=(
                source_set is not None and source_set not in definition)
            stats["setInheritedAnyTag"]+=bool(linked-direct)
            stats["directCollectionAreaTag"]+=bool(direct&world)
            stats["setInheritedCollectionAreaTag"]+=bool((linked-direct)&world)
            stats["nativeHasTagAnyAreaCandidate"]+=bool((direct|linked)&world)
        by_family[family]=dict(stats)
    require(result["originalSetsWithCollectionAreaTags"]==0 and
            all(c["setInheritedCollectionAreaTag"]==0
                for c in by_family.values()),
            "UNEXPECTED_WORLD_SET_TAG_INHERITANCE")
    result["sourceFamilyCounts"]=by_family
    return result


def audit(source_dir:Path,dump_path:Path,assembly_path:Path)->dict:
    require(source_dir.is_dir() and not source_dir.is_symlink(),
            "SOURCE_DIR_MISSING")
    originals={family:source_records(
        exact(source_dir/(family+".json"),expected,family),family)
        for family,expected in ORIGINAL_SHA.items()}
    verify_native_dump(exact(dump_path,IL2CPP_SHA256,"IL2CPP").decode("utf-8"))
    verify_instructions(exact(assembly_path,GAMEASSEMBLY_SHA256,"GAMEASSEMBLY"))
    census=join_source(
        originals["Tag"],originals["Set"],
        {family:originals[family] for family in SOURCE_FAMILIES})
    return {
        "schema":SCHEMA,"platform":"Steam","gameVersion":"1.26.2",
        "privateOnly":True,"publicationAuthorized":False,
        "originalSourceSha256":ORIGINAL_SHA,
        "originalIl2cppSha256":IL2CPP_SHA256,
        "originalGameAssemblySha256":GAMEASSEMBLY_SHA256,
        "nativeHasTagSetFallbackVerified":True,
        "nativeMachineCodeAnchorsVerified":len(ANCHORS),
        "sourceSetTagsCollectionAreaTagCountVerified":True,
        "nativeCollectionUiMembershipVerified":False,
        "playerOwnershipVerified":False,
        "dlcEntitlementVerified":False,
        "census":census,
    }


def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--itemlist",type=Path,required=True)
    parser.add_argument("--il2cpp-dump",type=Path,required=True)
    parser.add_argument("--gameassembly",type=Path,required=True)
    args=parser.parse_args()
    print(json.dumps(audit(
        args.itemlist,args.il2cpp_dump,args.gameassembly),
        sort_keys=True,ensure_ascii=False))


if __name__=="__main__":
    main()
