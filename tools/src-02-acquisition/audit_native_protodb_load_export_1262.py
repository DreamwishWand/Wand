#!/usr/bin/env python3
"""Read-only Steam v1.26.2 ProtoDatabase load/export call-graph audit.

Authenticates exact original Steam GameAssembly.dll, dump.cs and protoDb.bin.
A direct relative call graph is NOT a runtime execution trace and does not
cover indirect/interface calls. Prints aggregated evidence only; never
emits original code, IDs, names of items, or price values.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import struct

from audit_native_price_provider_registry_1262 import (
    ORIGINAL_PROTO_BYTES, ORIGINAL_PROTO_SHA256, original_price_provider_census,
)
from audit_native_sell_formula_type_dispatch_1262 import (
    DLL_SHA256, DLL_SIZE, pe_il2cpp_section,
)
from native_formula_type_taxonomy import (
    STEAM_1262_DUMP_SHA256, STEAM_1262_DUMP_SIZE,
)

CONTRACT = 'wand.db02.native-protodb-load-export-callgraph@1'

# Exact owner-qualified native signatures, authenticated against dump.cs.
METHODS = (
    ('ProtoDatabase', 'public void Refresh() { }', 0x380AD70),
    ('ProtoDatabase', 'public void LoadBinary() { }', 0x380A910),
    ('ProtoDatabase',
     'public void SaveBinary(IFileSystem fs, Dictionary<string, bool> exportIgnoreFolders) { }',
     0x380A400),
    ('ProtoDatabase',
     'public void ExportForBuild(IFileSystem outputFileSystem, HashSet<string> handledFiles, bool useExportIgnore = False) { }',
     0x380CF80),
    ('ProtoDatabase',
     'public static ProtoDatabase Init(IReadOnlyFileSystem fs, IEnumerable<Assembly> assemblies, bool isEditor = True, SimpleLogger logger) { }',
     0x380C8A0),
    ('ProtoDatabase',
     'public static ProtoDatabase ReInit(IReadOnlyFileSystem fs, IEnumerable<Assembly> assemblies, bool isEditor = True, SimpleLogger logger) { }',
     0x380CA30),
    ('ProtoDatabase',
     'private Type FindType(string typeName) { }', 0x380A260),
    ('DynamicItemPriceDatase',
     'public void CacheData() { }', 0x38398F0),
    ('DynamicItemPriceDatase',
     'private void Definitions.Util.IProtobufOnBinarize.OnBinarize() { }',
     0x383A390),
)

# (name, rel32 instruction RVA, target RVA, expected opcode)
EDGES = (
    ('init_to_constructor', 0x380C973, 0x3809B40, 0xE8),
    ('reinit_to_constructor', 0x380CC14, 0x3809B40, 0xE8),
    ('constructor_tail_to_refresh', 0x380A232, 0x380AD70, 0xE9),
    ('refresh_calls_load_binary', 0x380B475, 0x380A910, 0xE8),
    ('load_binary_resolves_type', 0x380AC92, 0x380A260, 0xE8),
    ('export_for_build_calls_save_binary', 0x380D515, 0x380A400, 0xE8),
    ('save_binary_type_check_for_message', 0x380A767, 0x6084C0, 0xE8),
    ('save_binary_conditional_interface_dispatch', 0x380A77D, 0x2240, 0xE8),
    ('on_binarize_tail_to_cache_data', 0x383A392, 0x38398F0, 0xE9),
    ('try_sell_price_enumerates_proto_database', 0x383B912,
     0x17F8160, 0xE8),
)

# Bounded hashes from the original executable. These do not copy game code.
WINDOWS = (
    ('constructor_refresh_tail', 0x380A22C, 18,
     '0fc07dfdea452dd05147f8f8b2c53c1e1fc66f0130bd7a7f59d598716f6869c1'),
    ('refresh_binary_reload', 0x380B468, 25,
     '92ad1f6140c3947f4530c69f8f8cd1818338a5685327cb310dcbabbb534818b8'),
    ('binary_record_type_resolution', 0x380AC88, 38,
     '06cf7fc9eaf442fb361aae22db347414a565a129d488cf4ab6fa3a98e07d3c7d'),
    ('build_export_to_save', 0x380D50A, 20,
     '52c2ecf317ec8d7c9909c90edb4fc77f22e32c01a8b32abaee70ab61f12a9fbf'),
    ('save_binary_message_type_gate', 0x380A75C, 38,
     'bd2635761f0a7762c45553e23720ad283b6b214965aad03d2099afe9bb202530'),
    ('save_binary_interface_call_guard', 0x380A76C, 31,
     'edb9c4b7f897aabddb354357449e6792e23d66f632a2db9ab83a6d8ca678cb20'),
    ('on_binarize_to_cache_data', 0x383A390, 7,
     'bf3ba0c790f54f744476f7d1cbac0bc777df47c7430a3a9b8b2b487f4f3356a6'),
    ('provider_enum_from_sell_lookup', 0x383B908, 22,
     '622510718407d15cbf09008f655897fffffe4fc53d6b090b1b7416cae17433c8'),
    ('init_constructor', 0x380C966, 25,
     '6f01bf67f0d1b4af2b3fa03d98e31112666d1a8e55fd02c704d84a71a7ffe191'),
    ('reinit_constructor', 0x380CC08, 24,
     '185a762c0904ac97bae944d19e3b04fbf7de7433381205d955027b13273419cb'),
)

# Complete IL2CPP direct rel32 targets, NOT complete dynamic dispatch.
SCANNED_DIRECT_TARGETS = {
    0x383A390: (),                          # OnBinarize: no direct rel32 call
    0x38398F0: ((0x383A392, 0xE9),),       # CacheData: tail from OnBinarize
    0x380A910: ((0x380B475, 0xE8),),       # LoadBinary: called by Refresh
    0x380AD70: ((0x380A232, 0xE9),),       # Refresh: tail from constructor
    0x380A400: ((0x380D515, 0xE8),),       # SaveBinary: called by ExportForBuild
}


def require(condition, code):
    if not condition:
        raise ValueError('DB02_PROTODB_CALLGRAPH_' + code)


def verify_method_metadata(dump_raw):
    require(isinstance(dump_raw, bytes) and
            len(dump_raw) == STEAM_1262_DUMP_SIZE and
            hashlib.sha256(dump_raw).hexdigest() ==
            STEAM_1262_DUMP_SHA256, 'ORIGINAL_DUMP_SHA')
    source = dump_raw.decode('utf-8')
    owner_bodies = {}
    for owner, _, _ in METHODS:
        if owner in owner_bodies:
            continue
        match = re.search(
            r'^public (?:sealed |abstract |static )?class ' +
            re.escape(owner) + r'(?= [:{])', source, re.M)
        require(match is not None, 'MISSING_OWNER')
        stop = source.find('\n}\n', match.end())
        require(stop > match.end(), 'OWNER_SCOPE')
        owner_bodies[owner] = source[match.start():stop]
    for owner, signature, rva in METHODS:
        body = owner_bodies[owner]
        pos = body.find(f'// RVA: 0x{rva:X}')
        require(pos >= 0 and signature in body[pos:pos+350],
                'MISMATCHED_METHOD_IDENTITY')
    require(
        source.count('private IMessage <Message>k__BackingField; // 0x40') == 1,
        'PROTO_DESC_MESSAGE_OFFSET')
    require(
        len(re.findall(r'^public interface IProtobufOnBinarize\b',
                       source, re.M)) == 1,
        'PROTO_ON_BINARIZE_INTERFACE')
    return len(METHODS)


def verify_rel32(reader, site, target, opcode):
    b = reader(site, 5)
    require(len(b) == 5 and b[0] == opcode, 'REL32_OPCODE')
    displacement = struct.unpack_from('<i', b, 1)[0]
    require(site + 5 + displacement == target, 'REL32_TARGET')
    return True


def scan_direct_rel32_targets(raw, source_rva, targets):
    """Unaligned byte-level index; does not cover dynamic/interface dispatch.

    Source must be the original PE IL2CPP executable section or a synthetic
    fixture. Matches are cross-checked against exact opcode instruction windows.
    """
    require(isinstance(raw, bytes) and len(raw) <= 150*1024*1024 and
            isinstance(source_rva, int) and source_rva >= 0 and
            isinstance(targets, (tuple, list, set)) and
            all(isinstance(x, int) and x >= 0 for x in targets),
            'INVALID_REL32_SCAN_INPUT')
    observed = defaultdict(list)
    desired = set(targets)
    for opcode in (0xE8, 0xE9):
        cursor = 0
        needle = bytes((opcode,))
        while True:
            at = raw.find(needle, cursor)
            if at < 0 or at + 5 > len(raw):
                break
            displacement = struct.unpack_from('<i', raw, at + 1)[0]
            target = source_rva + at + 5 + displacement
            if target in desired:
                observed[target].append((source_rva + at, opcode))
            cursor = at + 1
    return {key: tuple(sorted(observed.get(key, ())))
            for key in sorted(desired)}


def verify_assembly(assembly_path):
    path = Path(assembly_path)
    require(path.is_file() and path.stat().st_size == DLL_SIZE,
            'ORIGINAL_DLL_SIZE')
    with path.open('rb') as handle:
        require(hashlib.file_digest(handle, 'sha256').hexdigest() ==
                DLL_SHA256, 'ORIGINAL_DLL_SHA')
        rva, size, offset = pe_il2cpp_section(handle, DLL_SIZE)

        def read_native(address, count):
            require(rva <= address and
                    0 < count <= 4096 and
                    address + count <= rva + size,
                    'ORIGINAL_EXECUTABLE_RANGE')
            handle.seek(offset + address - rva)
            b = handle.read(count)
            require(len(b) == count, 'SHORT_NATIVE_READ')
            return b

        for _, address, length, digest in WINDOWS:
            require(hashlib.sha256(read_native(address, length)).hexdigest()
                    == digest, 'ORIGINAL_WINDOW_SHA')
        for _, site, target, opcode in EDGES:
            verify_rel32(read_native, site, target, opcode)
        require(size <= 150*1024*1024, 'IL2CPP_SCAN_SIZE')
        handle.seek(offset)
        full = handle.read(size)
        require(len(full) == size, 'IL2CPP_SECTION_READ')
        actual = scan_direct_rel32_targets(
            full, rva, SCANNED_DIRECT_TARGETS.keys())
        require(actual == SCANNED_DIRECT_TARGETS, 'DIRECT_REF_CENSUS')
    return {
        'shaVerifiedOriginalNativeExecutable': True,
        'nativeSourceInstructionWindowsChecked': len(WINDOWS),
        'nativeRelativeTransferEdgesChecked': len(EDGES),
        'entireOriginalIl2cppSectionDirectTransferCensusChecked': True,
        'originalDirectTransfersToOnBinarize': 0,
        'originalDirectTransfersToCacheData': 1,
        'interfaceAndOtherIndirectDispatchExcludedFromDirectScan': True,
    }


def audit(proto_raw, dump_raw, assembly):
    require(isinstance(proto_raw, bytes) and
            len(proto_raw) == ORIGINAL_PROTO_BYTES and
            hashlib.sha256(proto_raw).hexdigest() ==
            ORIGINAL_PROTO_SHA256, 'ORIGINAL_PROTO_SHA')
    price = original_price_provider_census(proto_raw)
    require(price['serializedPriceProviderCount'] == 11 and
            price['sourceDistinctItemPriceIds'] == 9537,
            'SOURCE_PROVIDER_CENSUS')
    method_count = verify_method_metadata(dump_raw)
    native = verify_assembly(assembly)
    return {
        'contract': CONTRACT, 'gameVersion': '1.26.2',
        'platform': 'Steam', 'originalSourceAuthenticated': True,
        'originalSerializedProviderDefinitions': 11,
        'originalSerializedItemPriceIds': 9537,
        'originalNativeMetadataMethodsChecked': method_count,
        **native,
        'nativeInitHasConstructorCall': True,
        'nativeReInitHasConstructorCall': True,
        'nativeConstructorHasTailToRefresh': True,
        'nativeRefreshHasCallToLoadBinary': True,
        'nativeLoadBinaryResolvesSerializedTypes': True,
        'nativeExportForBuildHasCallToSaveBinary': True,
        'nativeSaveBinaryChecksProtoDescMessageRuntimeType': True,
        'nativeSaveBinaryHasConditionalInterfaceSlotDispatch': True,
        'saveBinaryConditionalInterfaceTypeIdentityVerified': False,
        'onBinarizeMethodIsThatExactDispatchedInterfaceTargetVerified': False,
        'nativeSellProviderQueryUsesProtoDatabaseEnumerator': True,
        'nativeOnBinarizeTailDelegatesToCacheData': True,
        'directCallGraphDoesNotProveRuntimeOrder': True,
        'onBinarizeInvokedDuringLoadVerified': False,
        'onBinarizeInvokedDuringGameVerified': False,
        'runtimeProviderPopulationSetVerified': False,
        'runtimeProviderOrderVerified': False,
        'runtimeCacheRebuildOccurred': None,
        'effectiveIngredientOrMealSellPrices': None,
        'publishable': False, 'writable': False, 'playerSaveRead': False,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--protodb', required=True, type=Path)
    p.add_argument('--dump', required=True, type=Path)
    p.add_argument('--assembly', required=True, type=Path)
    args = p.parse_args()
    try:
        print(json.dumps(audit(
            args.protodb.read_bytes(),
            args.dump.read_bytes(),
            args.assembly,
        ), indent=2))
    except (OSError, ValueError, UnicodeError) as exc:
        p.exit(1, f'DB-02 ProtoDatabase callgraph audit failed: {exc}\n')


if __name__ == '__main__':
    main()
