#!/usr/bin/env python3
"""SHA-authenticated cross-call-site IL2CPP TypeInfo pointer audit.

Original Steam v1.26.2 GameAssembly.dll and dump.cs read-only. Validates
the *same initialized type metadata slot* at ProtoDatabase.SaveBinary,
ItemDatabase.ExportForBuild, GridData.DataValidation, and
AudioGridData.DataValidation, including metadata usage tag decoding,
whole-IL2CPP-section RIP-relative references, and native call edges.

The recovered TypeInfo USAGE INDEX is not a managed class name.
Without exact metadata registration/type index mapping, this audit does
NOT certify that the common type is IProtobufOnBinarize. It never
executes game binaries, opens player saves or publishes original bytes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct

from audit_native_protodb_load_export_1262 import (
    DLL_SHA256, DLL_SIZE, pe_il2cpp_section,
    verify_rel32, require,
)
from native_formula_type_taxonomy import (
    STEAM_1262_DUMP_SHA256, STEAM_1262_DUMP_SIZE,
)

CONTRACT = 'wand.db02.original-il2cpp-shared-binarize-typeinfo@1'
TYPEINFO_RVA = 0x9B2F018
TYPEINFO_TOKEN = 0x2002283B
TYPEINFO_USAGE_KIND = 1
TYPEINFO_USAGE_INDEX = 70685
TYPEINFO_DATA_SHA = '546cd1f3933ab4ae6a499ceb98e2dfde11864aab80bf482c4dce5bab08b95735'

# Exact instruction sites: 4 lazy metadata initialization sites,
# 2 cast-and-call sites, 2 cloned-grid validation hooks.
# No source instructions are distributed; digests identify tiny windows.
WINDOWS = (
    ('proto_init', 0x380A4B4, 18,
     'd82542b7e1411d877fda1b2cbc2659039ee7222efb6426d92f67aa0f1b99f511'),
    ('proto_typecheck_dispatch', 0x380A75C, 43,
     '4411524487d8a433f90ef1099b1c85fbe85cc18640c0378d7368f9152aab7dde'),
    ('item_init', 0x40DCE07, 18,
     '3b66926737561c9f3de6513a82f452c5a05d8b7c6b9ab1722e00711ec773890c'),
    ('item_typecheck_dispatch', 0x40DD2E7, 43,
     'acde351518a045bbb41e7027bad7f6cb5ec342b835cc487b9be1baa16fb719f4'),
    ('grid_init', 0x390810F, 18,
     '4e034b71c29f0a31c0249064f21cbc4d07cb8c4c033856aa0f8c17c570416a71'),
    ('grid_dispatch', 0x390838B, 21,
     '7a76fd3987b1111b6fe09856b9fee13cb199ba100a936242c53c7dc941b6176d'),
    ('audio_init', 0x4113118, 18,
     'd47144f4192a69db618ee5eb1630df3f0668f59eed9b1b7677c4352e0ed800b9'),
    ('audio_dispatch', 0x4113289, 21,
     'ed9419a475067ac69e2c9263b36ee42a36361b2fafb3c4c1345d034ba39e2375'),
    ('metadata_usage_decoder', 0x5BDBF7, 67,
     'd3347d38ed5fcf51d9aa0c60ee1a7cd9b07364beae8e59e0672c066dd32b7d29'),
    ('metadata_type_resolver', 0x5BEA30, 121,
     '6a16c95ba59254c6c6eb0ee1b0d9ec6539bc33d5e2dd07be706082d8b5fed6e6'),
    ('interface_slot_dispatch', 0x2240, 145,
     '02d69be5d0a9860570467bbd274c0276eabea0bc765af5f986ba4c72630728bb'),
    ('runtime_cast_helper', 0x6084C0, 96,
     'cdd0bf750c3468c3471ec86c4f5af60d6474d04eced855fbc9decd4e63c79217'),
)

# Each exact RIP-relative site uses one shared slot. Two opcode forms:
# 48 8D 0D disp32 initializes it, 48 8B 15 disp32 reads it.
RIP_REFERENCES = (
    (0x380A4B4, '488d0d', 'ProtoDatabase.SaveBinary:init'),
    (0x380A75C, '488b15', 'ProtoDatabase.SaveBinary:cast'),
    (0x380A776, '488b15', 'ProtoDatabase.SaveBinary:invoke'),
    (0x40DCE07, '488d0d', 'ItemDatabase.ExportForBuild:init'),
    (0x40DD2E7, '488b15', 'ItemDatabase.ExportForBuild:cast'),
    (0x40DD300, '488b15', 'ItemDatabase.ExportForBuild:invoke'),
    (0x390810F, '488d0d', 'GridData.DataValidation:init'),
    (0x3908390, '488b15', 'GridData.DataValidation:invoke'),
    (0x4113118, '488d0d', 'AudioGridData.DataValidation:init'),
    (0x411328E, '488b15', 'AudioGridData.DataValidation:invoke'),
)

# Distinct, source-verified direct calls. The interface invocations
# themselves use an indirect tail jump inside the helper at 0x2240.
CALLS = (
    ('init_shared_type_proto', 0x380A4BB, 0x5BDBD0),
    ('init_shared_type_item', 0x40DCE0E, 0x5BDBD0),
    ('init_shared_type_grid', 0x3908116, 0x5BDBD0),
    ('init_shared_type_audio', 0x411311F, 0x5BDBD0),
    ('proto_cast', 0x380A767, 0x6084C0),
    ('proto_interface_invoke', 0x380A77D, 0x2240),
    ('item_cast', 0x40DD2F1, 0x6084C0),
    ('item_interface_invoke', 0x40DD307, 0x2240),
    ('grid_interface_invoke', 0x3908397, 0x2240),
    ('audio_interface_invoke', 0x4113295, 0x2240),
    ('metadata_usage_type_resolver', 0x5BDC29, 0x5BEA30),
)

OWNERS = (
    ('ProtoDatabase','public void SaveBinary(',0x380A400),
    ('ItemDatabase','public void ExportForBuild(',0x40DCCC0),
    ('GridData','public void DataValidation(',0x39080C0),
    ('AudioGridData','public void DataValidation(',0x41130D0),
)
CLONE_CTORS = (
    ('GridData','public void .ctor(GridData other) { }',0x3906230),
    ('AudioGridData','public void .ctor(AudioGridData other) { }',0x4114180),
)

def demand(ok, code):
    if not ok:
        raise ValueError('DB02_SHARED_TYPEINFO_' + code)

def decode_typeinfo_usage(raw):
    """IL2CPP raw encoded usage: top 3 bits kind; low 28 after shift index."""
    demand(isinstance(raw, bytes) and len(raw) == 8,
           'INVALID_METADATA_TOKEN')
    val,=struct.unpack('<Q',raw)
    demand(val <= 0xFFFFFFFF and val&1 == 1 and
           val>>29 == TYPEINFO_USAGE_KIND,
           'METADATA_USAGE_NOT_TYPEINFO')
    return (val>>29,(val>>1)&0x0FFFFFFF,val)

def checked_rip_target(read,site,prefix):
    raw=read(site,7)
    demand(raw[:3] == bytes.fromhex(prefix),'WRONG_RIP_OPCODE')
    offset,=struct.unpack_from('<i',raw,3)
    return site+7+offset

def scan_rip_typeinfo_references(binary,section_rva,target_rva):
    """Complete byte-pattern scan, not a full x64 disassembler."""
    demand(isinstance(binary, bytes) and len(binary)<=150*1024*1024 and
           section_rva >= 0 and target_rva >= 0,
           'INVALID_SECTION_SCAN')
    matches=set()
    for prefix in (bytes.fromhex('488d0d'),bytes.fromhex('488b15')):
        pos=0
        while True:
            at=binary.find(prefix,pos)
            if at<0:
                break
            if at+7<=len(binary):
                displ,=struct.unpack_from('<i',binary,at+3)
                if section_rva+at+7+displ==target_rva:
                    matches.add((section_rva+at,prefix.hex()))
            pos=at+1
    return matches

def verify_original_metadata(dump_raw):
    demand(isinstance(dump_raw,bytes) and
           len(dump_raw)==STEAM_1262_DUMP_SIZE and
           hashlib.sha256(dump_raw).hexdigest()==STEAM_1262_DUMP_SHA256,
           'DUMP_SHA')
    text=dump_raw.decode('utf-8')
    for owner,name,rva in (*OWNERS,*CLONE_CTORS):
        pat=r'^public (?:sealed |abstract |static )?class '+re.escape(owner)+r'(?= [:{/])'
        decl=re.search(pat,text,re.M)
        demand(decl is not None,'OWNER_'+owner)
        end=text.find('\n}\n',decl.end())
        demand(end>0,'OWNER_BODY')
        block=text[decl.start():end]
        pos=block.find(f'// RVA: 0x{rva:X}')
        demand(pos>=0 and name in block[pos:pos+350],'OWNER_METHOD_'+owner)
    # Both copied GridData/AudioGridData types implement IProtobufOnBinarize,
    # but this does not identify the shared runtime TypeInfo usage itself.
    for owner in ('GridData','AudioGridData','DynamicItemPriceDatase'):
        demand(re.search(r'^public sealed class '+owner+
                         r' : [^\n]*\bIProtobufOnBinarize\b',text,re.M)
               is not None,'NATIVE_INTERFACE_IMPLEMENTER')
    return len(OWNERS),len(CLONE_CTORS)

def verify_original_assembly(path):
    path=Path(path)
    demand(path.is_file() and path.stat().st_size==DLL_SIZE,'DLL_SIZE')
    with path.open('rb') as f:
        demand(hashlib.file_digest(f,'sha256').hexdigest()==DLL_SHA256,'DLL_SHA')
        il_rva,il_size,il_offset=pe_il2cpp_section(f,DLL_SIZE)
        # Map other sections without changing any source file.
        f.seek(0x3c)
        pe_offset,=struct.unpack('<I',f.read(4))
        f.seek(pe_offset+4)
        coff=f.read(20)
        count,=struct.unpack_from('<H',coff,2)
        optional_size,=struct.unpack_from('<H',coff,16)
        f.seek(pe_offset+24+optional_size)
        sections=[]
        for _ in range(count):
            hdr=f.read(40)
            sz,rva,rawsz,offset=struct.unpack_from('<IIII',hdr,8)
            demand(offset+rawsz<=DLL_SIZE,'SECTION_BOUNDS')
            sections.append((rva,rawsz,offset))
        def read(rva,n):
            demand(isinstance(rva,int) and n>0 and n<=4096,'READ_INPUT')
            for start,size,offset in sections:
                if start<=rva and rva+n<=start+size:
                    f.seek(offset+rva-start)
                    data=f.read(n)
                    demand(len(data)==n,'ORIGINAL_READ')
                    return data
            raise ValueError('DB02_SHARED_TYPEINFO_UNMAPPED_RVA')
        raw=read(TYPEINFO_RVA,8)
        demand(hashlib.sha256(raw).hexdigest()==TYPEINFO_DATA_SHA,
               'TYPEINFO_STORAGE_SHA')
        kind,index,token=decode_typeinfo_usage(raw)
        demand((kind,index,token)==
               (TYPEINFO_USAGE_KIND,TYPEINFO_USAGE_INDEX,TYPEINFO_TOKEN),
               'ORIGINAL_ENCODED_TYPE_USAGE')
        for label,addr,n,digest in WINDOWS:
            demand(hashlib.sha256(read(addr,n)).hexdigest()==digest,
                   'NATIVE_WINDOW_'+label)
        for name,site,dest in CALLS:
            data=read(site,5)
            demand(data[0]==0xE8,'NATIVE_CALL_OPCODE')
            value,=struct.unpack_from('<i',data,1)
            demand(site+5+value==dest,'NATIVE_CALL_TARGET_'+name)
        for site,prefix,context in RIP_REFERENCES:
            demand(checked_rip_target(read,site,prefix)==TYPEINFO_RVA,
                   'SHARED_TYPE_USAGE_'+context)
        # Native metadata initializer decodes usage type with 3 high bits,
        # shifts low index by one, then dispatches kind=1 through resolver.
        demand(read(0x5BDBF9,3)==bytes.fromhex('c1e81d') and
               read(0x5BDBFE,2)==bytes.fromhex('d1eb') and
               read(0x5BDC00,6)==bytes.fromhex('81e3ffffff0f') and
               struct.unpack('<I',read(0x5BDCFC,4))[0]==0x5BDC27,
               'NATIVE_TYPEINFO_DECODER')
        f.seek(il_offset)
        section=f.read(il_size)
        demand(len(section)==il_size,'IL2CPP_SECTION_READ')
        refs=scan_rip_typeinfo_references(section,il_rva,TYPEINFO_RVA)
        expected={(site,prefix) for site,prefix,_ in RIP_REFERENCES}
        demand(refs==expected,'FULL_SECTION_TYPEINFO_XREFS')
    return {
        'sourceAssemblyShaVerified':True,
        'typeInfoSlotShaVerified':True,
        'encodedTypeInfoUsageCategory':kind,
        'encodedTypeInfoUsageIndex':index,
        'exactNativeInstructionWindowsVerified':len(WINDOWS),
        'exactNativeDirectCallEdgesVerified':len(CALLS),
        'fullExecutableTypeInfoRipReferences':len(RIP_REFERENCES),
        'sharedTypeInfoSeenInFourNativeMethods':True,
        'commonTypeInfoUsedForTwoBuildExportPaths':True,
        'commonTypeInfoUsedForTwoGridValidationPaths':True,
        'nativeTypeInfoInitializedViaMetadataUsageResolver':True,
        'nativeSlotZeroInterfaceDispatchVerified':True,
        'runtimeTypeInfoManagedNameVerified':False,
        'commonTypeInfoIsIProtobufOnBinarizeVerified':False,
        'runtimeHookInvocationObserved':False,
    }

def audit(dump_raw,assembly):
    methods,clone_ctors=verify_original_metadata(dump_raw)
    native=verify_original_assembly(assembly)
    return {
        'contract':CONTRACT,'gameVersion':'1.26.2','platform':'Steam',
        'originalDumpClassMethodsAuthenticated':methods,
        'originalGridCloneConstructorsAuthenticated':clone_ctors,
        **native,
        'metadataDefinitionTableSuppliedForTypeIndexResolution':False,
        'cachedPriceDatabaseRebuiltInLiveGameVerified':False,
        'runtimeRegisteredPriceProviderSetVerified':False,
        'effectiveIngredientOrMealSellPrices':None,
        'originalGameBytesCopiedToOutput':False,
        'publishable':False,'writable':False,'playerSaveRead':False,
    }

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dump',type=Path,required=True)
    parser.add_argument('--assembly',type=Path,required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(audit(args.dump.read_bytes(),args.assembly),
                         indent=2))
    except (OSError,UnicodeError,ValueError) as exc:
        parser.exit(1,f'DB-02 shared TypeInfo audit failed: {exc}\n')

if __name__=='__main__':
    main()
