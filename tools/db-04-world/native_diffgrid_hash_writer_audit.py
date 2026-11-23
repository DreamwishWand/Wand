"""Private Steam 1.26.2 DiffGrid hash-write path verification.

Reads ONLY the caller's original FullVersion.txt, global-metadata.dat and
GameAssembly.dll. Resolves the original C# DiffGrid.Create token into a
PE64 source function via strict .pdata evidence, checks original compiled
getter/setter leaf functions, and confirms two virtual result write sites.

This is a writer-PROVENANCE audit. It NEVER calculates hash values,
assumes a virtual target's concrete GetHashCode implementation, processes
a Save, or authorizes DiffGrid edits. Do not publish raw files or output.
"""
import argparse
import hashlib
import json
import mmap
import struct
from pathlib import Path

from native_diffgrid_hash_discovery import discover_native_diffgrid_hash_methods
from native_method_pointers import (
    Metadata31, PE64Image, DLL_MAX, _mapped_source,
    resolve_native_grid_methods
)

VERSION="1.26.2"
TYPE="DiffGrid"
NAMESPACE="Meta.Grids"
# Two x64 virtual calls via vtable entry +0x158, followed by stored int32.
VIRTUAL_CODE=bytes.fromhex(
    "48 8b 11 48 8b 82 58 01 00 00 "
    "48 8b 92 60 01 00 00 FF D0")
LOAD_GRID=bytes.fromhex("48 8B 4F 58")
LOAD_GRID_DATA=bytes.fromhex("48 8B 49 58")
FIELD_LAYOUT={
    "get_DefaultGridHashCode": (0,bytes.fromhex("8B 41 34 C3")),
    "set_DefaultGridHashCode": (1,bytes.fromhex("89 51 34 C3")),
    "get_DefaultGridDataHashCode": (0,bytes.fromhex("8B 41 38 C3")),
    "set_DefaultGridDataHashCode": (1,bytes.fromhex("89 51 38 C3")),
}
FIRST_WRITE=VIRTUAL_CODE+bytes.fromhex("89 47 34")
SECOND_WRITE=VIRTUAL_CODE+bytes.fromhex("89 47 38")

def require(condition,reason):
    if not condition:
        raise ValueError("DB04_NATIVE_DIFF_HASH_WRITER:"+reason)


def inspect_native_writer_body(body):
    """Prove original x64 field writes are fed by two distinct virtual calls.

    The first call's object is loaded as the original default Grid; for
    the second call that original Grid's +0x58 GridData pointer is read.
    These bytes don't by themselves prove which virtual method is used.
    """
    require(isinstance(body,bytes) and 96<=len(body)<=16_384,
            "INVALID_SOURCE_METHOD_BODY")
    first=body.find(FIRST_WRITE)
    second=body.find(SECOND_WRITE)
    require(first>=0 and second>first and
            body.find(FIRST_WRITE,first+1)<0 and
            body.find(SECOND_WRITE,second+1)<0,
            "MISSING_OR_AMBIGUOUS_VIRTUAL_HASH_WRITES")
    # Original code has a loaded default Grid instance before first virtual
    # invocation, then the default Grid's GridData pointer for the second.
    first_context=body[max(0,first-56):first]
    second_context=body[max(0,second-48):second]
    require(LOAD_GRID in first_context and
            LOAD_GRID in second_context and
            LOAD_GRID_DATA in second_context,
            "MISSING_ORIGINAL_GRID_OBJECT_LOADS")
    return {
        "defaultGridVirtualResultWriteOffset":first+len(VIRTUAL_CODE),
        "defaultGridDataVirtualResultWriteOffset":second+len(VIRTUAL_CODE),
        "virtualDispatchTableByteOffset":0x158,
        "sourceDefaultGridLoadCorroborated":True,
        "sourceGridDataChildLoadCorroborated":True,
        "virtualMethodConcreteTargetVerified":False,
    }


def verify_leaf_getter_or_setter(binary,pe,pointer,expected):
    """No .pdata entry is required for a complete exact 4-byte x64 leaf."""
    require(type(pointer) is int and pointer>pe.image_base,
            "INVALID_NATIVE_LEAF_POINTER")
    address=pe.va_to_file(pointer,len(expected),executable=True)
    require(binary[address:address+len(expected)]==expected,
            "MISMATCHED_ORIGINAL_DIFFGRID_FIELD_ACCESS")
    return True


def audit_native_diffgrid_hash_writer(metadata_path,version_file,dll_path):
    inventory=discover_native_diffgrid_hash_methods(
        metadata_path,version_file)
    require(inventory["sourceGameVersion"]==VERSION,
            "UNSUPPORTED_ORIGINAL_SOURCE_VERSION")
    dll=_mapped_source(dll_path,DLL_MAX)
    # A named virtual method is not a verified computed hash. We corroborate
    # the exact original Create body and getter/setter storage offsets only.
    _,methods=Metadata31(Path(metadata_path).read_bytes()).type_methods(
        NAMESPACE,TYPE,
        [("Create",2), *[(name,param) for name,(param,_) in FIELD_LAYOUT.items()]])
    method_map={(m["symbol"].rsplit(".",1)[-1],m["parameterCount"]):m
                for m in methods}
    create=method_map[("Create",2)]
    resolved=resolve_native_grid_methods(
        dll,metadata_path,namespace=NAMESPACE,type_name=TYPE,
        requested_methods=[("Create",2)])
    require(len(resolved["methods"])==1 and
            resolved["methods"][0]["token"]==create["token"] and
            resolved["originalMetadataSha256"]==
            inventory["originalMetadataSha256"],
            "SOURCE_CREATE_TOKEN_MISMATCH")
    native=resolved["methods"][0]
    begin,end=native["rva"],native["peUnwindFunctionEndRva"]
    require(96<=end-begin<=16_384,"UNSUPPORTED_NATIVE_CREATE_BODY_LENGTH")
    with dll.open("rb") as stream, mmap.mmap(
            stream.fileno(),0,access=mmap.ACCESS_READ) as binary:
        pe=PE64Image(binary)
        source_address=pe.image_base+begin
        source_offset=pe.va_to_file(source_address,end-begin,executable=True)
        code=bytes(binary[source_offset:source_offset+end-begin])
        writer=inspect_native_writer_body(code)
        # Establish one exact original CodeGenModule pointer table by
        # requiring the already verified original Create code pointer.
        name=resolved["moduleName"].encode("utf-8")+b"\0"
        module_string_file=binary.find(name)
        require(module_string_file>=0,"MISSING_ORIGINAL_CODEGEN_MODULE")
        module_address=pe.file_to_va(module_string_file,len(name))
        pointer_name=struct.pack("<Q",module_address)
        required=max(m["tokenRid"] for m in methods)
        pointer_tables=[]
        cursor=0
        while True:
            pos=binary.find(pointer_name,cursor)
            if pos<0:break
            cursor=pos+1
            try:
                _,count,pointer_va=struct.unpack_from("<QQQ",binary,pos)
                if count<required or count>2_000_000:continue
                table_file=pe.va_to_file(pointer_va,count*8)
                writer_pointer=struct.unpack_from(
                    "<Q",binary,table_file+(create["tokenRid"]-1)*8)[0]
                if writer_pointer==source_address:
                    pointer_tables.append((count,table_file))
            except (ValueError,struct.error):
                continue
        require(len(pointer_tables)==1,
                "MISSING_OR_AMBIGUOUS_ORIGINAL_CODEGEN_POINTER_TABLE")
        count,table_file=pointer_tables[0]
        for name,(params,expected) in FIELD_LAYOUT.items():
            m=method_map[(name,params)]
            pointer=struct.unpack_from(
                "<Q",binary,table_file+(m["tokenRid"]-1)*8)[0]
            verify_leaf_getter_or_setter(binary,pe,pointer,expected)
    return {
        "schema":"wand.db04.native-diffgrid-hash-write-provenance@1",
        "status":"original_steam1262_native_virtual_write_sites_verified",
        "sourceGameVersion":VERSION,
        "originalMetadataSha256":inventory["originalMetadataSha256"],
        "originalGameAssemblySha256":resolved["originalDllSha256"],
        "sourceCodeModule":resolved["moduleName"],
        "sourceWriterSymbol":create["symbol"],
        "sourceWriterMethodToken":f"0x{create['token']:08x}",
        "sourceWriterRva":begin,
        "sourceWriterCodeWindowSha256":hashlib.sha256(code).hexdigest(),
        "sourceFieldLeafGetterSetterCorroborated":True,
        **writer,
        "nativeDefaultGridHashCodeCalculated":False,
        "nativeDefaultGridDataHashCodeCalculated":False,
        "sourceVirtualMethodTargetsVerified":False,
        "saveHashValuesMatched":False,
        "diffGridIdentityVerified":False,
        "saveWritingAuthorized":False,
    }


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--metadata",type=Path,required=True)
    p.add_argument("--version",type=Path,required=True)
    p.add_argument("--dll",type=Path,required=True)
    args=p.parse_args(argv)
    try:
        result=audit_native_diffgrid_hash_writer(
            args.metadata,args.version,args.dll)
        print(json.dumps(result,ensure_ascii=False,sort_keys=True,indent=2))
    except (OSError,ValueError,UnicodeError,struct.error) as error:
        p.exit(1,f"DB-04 private native hash writer audit failed: {error}\n")

if __name__=="__main__":
    main()
