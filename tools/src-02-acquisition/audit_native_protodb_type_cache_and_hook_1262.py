#!/usr/bin/env python3
"""Steam v1.26.2 original ProtoDatabase search-cache and binarize-hook audit.

Read-only. Requires all three SHA-pinned owner-private original game sources,
checks 9 native code windows + exact calls + source interface implementers.
Exposes only aggregate control-flow facts, never source item IDs or prices.

A concrete interface type at a runtime IL2CPP metadata slot is NOT verified
by the source-only binary, and direct call graphs omit indirect dispatch.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct

from audit_native_protodb_load_export_1262 import (
    audit as base_audit, DLL_SHA256, DLL_SIZE, pe_il2cpp_section,
    verify_rel32, require,
)

CONTRACT = 'wand.db02.original-protodb-type-cache-and-binarize-hook@1'

# Native ELF/PE original code windows (RVA, byte length, SHA-256 only).
WINDOWS = (
    ('refresh_editor_flag_gate', 0x380AEDC, 20,
     '59a4179215d0411248beca9c793235340c2e00869a951f5cdf7f49d6a7cd166f'),
    ('refresh_cached_searches_clear', 0x380AEF6, 34,
     '782815013bd3c85fce2ea3be5500acb967928a1a47aeff002954fe287b3e4875'),
    ('refresh_binary_load', 0x380B468, 19,
     'd572294ed6e15021bd4ac85f04a2247ebab00de2073167dcafb05bc8e59c9f2b'),
    ('enumerate_cached_type_lookup', 0x17F8255, 125,
     'f91b4362ca10a004b08cf1862d8dcbf9823f99706cb636ebaf449ba707b016a3'),
    ('enumerate_memoize_type_array', 0x17F8514, 58,
     'd48887806ac51520c93a574c22ad3906da9886caf616492ac004f143a0e2c846'),
    ('try_set_cached_searches_access', 0x380BD6A, 40,
     'dc4ce0e977a320539f106619020c2b760340e733a80f6f333c8ed9db9884cacb'),
    ('save_binary_conditional_cast_and_interface_call', 0x380A75C, 40,
     '9ae08c4642bc588c94666042d6ff082e46e95999f6664f81d32aed15c0b5f89b'),
    ('generic_interface_invoker', 0x2240, 67,
     '6a1581bb47aebb37ff8295805291fbab40eed53a6ee31feaa8ea8a4a329ccc24'),
    ('dictionary_clear_helper', 0x31ACD80, 87,
     '24411753c6def947781f02311ebd95be937d1532c22e07895d0196cfe022be86'),
)

EDGES = (
    ('refresh_clears_type_search_cache', 0x380AF12, 0x31ACD80),
    ('refresh_binary_load', 0x380B475, 0x380A910),
    ('enumerate_checks_memoized_type', 0x17F82C5, 0x339FFF0),
    ('enumerate_memoizes_type_result', 0x17F8548, 0x339EED0),
    ('save_binary_interface_cast', 0x380A767, 0x6084C0),
    ('save_binary_interface_dispatch', 0x380A77D, 0x2240),
)

IMPLEMENTERS = ('DynamicItemPriceDatase', 'GridData', 'AudioGridData')


def native_pins(reader):
    for label, rva, size, digest in WINDOWS:
        require(hashlib.sha256(reader(rva, size)).hexdigest() == digest,
                'ORIGINAL_WINDOW_' + label.upper())
    for label, caller, callee in EDGES:
        verify_rel32(reader, caller, callee, 0xE8)

    # Exact isEditor flag byte at ProtoDatabase offset 0x48. The flag
    # is compared against zero; false jumps to binary LoadBinary path.
    require(reader(0x380AEDC, 4) == bytes.fromhex('45387d48'),
            'EDITOR_FLAG_FIELD')
    opcode = reader(0x380AEE0, 6)
    require(opcode[:2] == bytes.fromhex('0f84') and
            0x380AEE0 + 6 + struct.unpack_from('<i', opcode, 2)[0]
            == 0x380B470, 'NON_EDITOR_BRANCH_TO_BINARY_LOAD')
    require(reader(0x380AEFE, 4) == bytes.fromhex('498b4d50'),
            'REFRESH_TYPE_SEARCH_CACHE_FIELD')
    require(reader(0x17F8255, 4) == bytes.fromhex('498b7750'),
            'ENUMERATE_TYPE_SEARCH_CACHE_FIELD')
    require(reader(0x17F8514, 4) == bytes.fromhex('498b4f50'),
            'ENUMERATE_MEMOIZE_TYPE_FIELD')
    require(reader(0x380BD6A, 4) == bytes.fromhex('4d8b4e50'),
            'TRYSET_TYPE_SEARCH_CACHE_FIELD')

    # Dictionary.Clear native implementation resets _count and
    # _freeCount and sets _freeList=-1, rather than merely reading.
    require(reader(0x31ACDB8, 3) == bytes.fromhex('894320') and
            reader(0x31ACDBE, 3) == bytes.fromhex('894328') and
            reader(0x31ACDC3, 7) == bytes.fromhex('c74324ffffffff'),
            'CLEAR_DICTIONARY_COUNT_AND_FREELIST')
    # SaveBinary's conditional invoke is slot 0. Which interface TypeInfo
    # is at 0x9B2F018 after IL2CPP metadata initialization isn't proven.
    require(reader(0x380A76C, 2) == bytes.fromhex('4885') and
            reader(0x380A771, 2) == bytes.fromhex('33c9'),
            'SAVE_BINARY_INTERFACE_DISPATCH_SLOT_ZERO')
    return {'nativeInstructionWindowHashesVerified':len(WINDOWS),
            'nativeExactDirectCallsVerified':len(EDGES),
            'originalRefreshNonEditorBranchTargetsLoadBinary':True,
            'originalRefreshEditorBranchClearsCachedSearches':True,
            'originalEnumeratorChecksTypeSearchCache':True,
            'originalEnumeratorMemoizesTypeResult':True,
            'originalTrySetAccessesCachedSearches':True,
            'originalSaveBinaryDispatchSlotZero':True}


def check_implementer_metadata(dump_raw):
    require(isinstance(dump_raw, bytes), 'INVALID_METADATA')
    source = dump_raw.decode('utf-8')
    require('private readonly bool isEditor; // 0x48' in source and
            'private readonly Dictionary<Type, Array> cachedSearches; // 0x50'
            in source, 'PROTODB_FIELD_DECLARATIONS')
    matches = tuple(re.findall(
        r'(?m)^public (?:sealed )?class ([A-Za-z_][A-Za-z_0-9]*) : '
        r'[^\n]*\bIProtobufOnBinarize\b', source))
    require(len(matches) == len(IMPLEMENTERS) and
            set(matches) == set(IMPLEMENTERS), 'PROTODB_HOOK_IMPLEMENTERS')
    require('public interface IProtobufOnBinarize // TypeDefIndex: 8361'
            in source and
            'public abstract void OnBinarize();' in source,
            'PROTODB_HOOK_INTERFACE_METHOD')
    for owner in IMPLEMENTERS:
        pat = (r'(?ms)^public (?:sealed )?class ' + re.escape(owner) +
               r' : [^\n]*\bIProtobufOnBinarize\b(.*?)^\}')
        match = re.search(pat, source)
        require(match is not None and
                'Definitions.Util.IProtobufOnBinarize.OnBinarize()'
                in match.group(1), 'PROTODB_HOOK_CONCRETE_METHOD')
    return len(matches)


def audit(proto_raw, dump_raw, assembly_path):
    base = base_audit(proto_raw, dump_raw, assembly_path)
    file = Path(assembly_path)
    with file.open('rb') as handle:
        require(hashlib.file_digest(handle,'sha256').hexdigest() == DLL_SHA256
                and file.stat().st_size == DLL_SIZE, 'ORIGINAL_EXECUTABLE')
        rva, size, offset = pe_il2cpp_section(handle, DLL_SIZE)
        def read(address, count):
            require(0<count<=4096 and rva<=address and
                    address+count<=rva+size, 'EXECUTABLE_RANGE')
            handle.seek(offset+address-rva)
            raw = handle.read(count)
            require(len(raw)==count, 'EXECUTABLE_READ')
            return raw
        native = native_pins(read)
    impl_count = check_implementer_metadata(dump_raw)
    return {
        'contract':CONTRACT,'gameVersion':'1.26.2','platform':'Steam',
        'fullOriginalProtoDumpAndAssemblyShaAuthenticated':True,
        'originalSerializedPriceProviders':base['originalSerializedProviderDefinitions'],
        'originalSerializedPriceIds':base['originalSerializedItemPriceIds'],
        'originalConcreteBinarizeHookImplementers':impl_count,
        **native,
        'refreshEditorBranchDoesNotLoadBinaryAtThatPoint':True,
        'refreshNonEditorBranchLoadsBinary':True,
        'sourceEditorFlagRuntimeValue':None,
        'hookInterfaceSlotZeroDeclarationVerified':True,
        'saveBinaryConcreteInterfaceTypeIdentityVerified':False,
        'saveBinaryCallTargetsSpecificOnBinarizeVerified':False,
        'refreshCallsOnBinarizeForAnySourceVerified':False,
        'loadBinaryCallsOnBinarizeForAnySourceVerified':False,
        'runtimeHookInvoked':None,
        'runtimeTypeCacheEntries':None,
        'runtimePriceProviderRegistrationOrderVerified':False,
        'runtimePriceProviderEffectiveRowsVerified':False,
        'realizedIngredientSellPrice':None,'realizedMealSellPrice':None,
        'publishable':False,'writable':False,'playerSaveRead':False
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--protodb',type=Path,required=True)
    parser.add_argument('--dump',type=Path,required=True)
    parser.add_argument('--assembly',type=Path,required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(audit(args.protodb.read_bytes(),
                               args.dump.read_bytes(),args.assembly),
                         indent=2))
    except (OSError,UnicodeError,ValueError) as exc:
        parser.exit(1, f'DB-02 ProtoDatabase type cache audit failed: {exc}\n')


if __name__=='__main__':
    main()
