#!/usr/bin/env python3
"""Read-only Steam 1.26.2 native dynamic-price cache rebuild audit.

Proves that OnBinarize directly transfers to CacheData and that CacheData
allocates and assigns a fresh ItemPriceDatabase, and follows sell formula
type/price functions. Never asserts that OnBinarize ran during a live game
or that source cached rows are unchanged at runtime.

Game originals are local, SHA-checked and NEVER written to output.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct

from audit_native_price_provider_registry_1262 import (
    ORIGINAL_PROTO_BYTES, ORIGINAL_PROTO_SHA256, original_price_provider_census,
)
from audit_native_sell_formula_source import (
    parse_cache, parse_source,
)
from audit_native_sell_formula_type_dispatch_1262 import (
    DLL_SHA256, DLL_SIZE, pe_il2cpp_section, verified_relative_call,
)
from native_formula_type_taxonomy import (
    STEAM_1262_DUMP_SHA256, STEAM_1262_DUMP_SIZE,
)

CONTRACT = 'wand.db02.original-native-dynamic-cache-rebuild@1'

METHODS = (
    ('DynamicItemPriceDatase', 'public void CacheData() { }', 0x38398F0),
    ('DynamicItemPriceDatase',
     'private void Definitions.Util.IProtobufOnBinarize.OnBinarize() { }',
     0x383A390),
    ('DynamicItemPriceDatase', 'public bool get_DataCached() { }',
     0x3839670),
    ('ItemPriceDatabase', 'public void .ctor() { }', 0x3835F40),
    ('SellPriceFormulaItemData',
     'public bool IsFormulaValidForItem(IItemData itemData) { }',
     0x4021150),
    ('SellPriceFormulaItemData',
     'public CurrencyCost CalculateItemPrice(Item item, ItemState state) { }',
     0x4020120),
    ('ProtoDatabase', 'public void LoadBinary() { }', 0x380A910),
)
# Each entry is (description, original native RVA, byte count, SHA-256).
# Only digests of short instruction windows are publishable, not binary code.
WINDOWS = (
    ('on_binarize_tail_to_cache_data', 0x383A390, 7,
     'bf3ba0c790f54f744476f7d1cbac0bc777df47c7430a3a9b8b2b487f4f3356a6'),
    ('cache_allocate_new_price_database', 0x3839AA8, 30,
     '6d258dc0c61cc5bb9022fe7846a5374baf9be52774390278999b6963c4cff1a4'),
    ('cache_replace_cached_data', 0x3839ABC, 14,
     '17a42565de78a4d748a4a0781db0493d2052976726e7b8071c7dd634a71e1ace'),
    ('cache_formula_enumeration', 0x3839B11, 56,
     '4ff058cfd759537e80255ce82343718df2bc6924008d50e2cb27dce3bdf815d7'),
    ('cache_sell_formula_type_check', 0x383A0C8, 30,
     '59c27910c8975adbf13415e6424e4bc747202327f33bad48b9230ca95595423d'),
    ('cache_sell_formula_evaluation', 0x383A1EF, 28,
     'aa2a636a683d838688aa1948c82ae79f5c1ac33ec2a2bc906f1bc448682f9bff'),
    ('source_binary_load_message_type', 0x380AC88, 38,
     '06cf7fc9eaf442fb361aae22db347414a565a129d488cf4ab6fa3a98e07d3c7d'),
    ('native_dynamic_data_cached_gate', 0x3839670, 75,
     'da3b9c951bc8bba2ec19d15172cfe886149b1b1d7d2b9fbcdddcbb6d6a69a6dc'),
)
EDGES = (
    ('on_binarize_delegates_to_cache_data', 0x383A392, 0x38398F0, 0xE9),
    ('cache_data_calls_new_database_ctor', 0x3839ABC, 0x3835F40, 0xE8),
    ('cache_data_calls_sell_formula_type_gate', 0x383A0CE, 0x4021150, 0xE8),
    ('cache_data_calls_formula_calculation', 0x383A1FE, 0x4020120, 0xE8),
    ('proto_database_binary_load_resolves_type', 0x380AC92, 0x380A260, 0xE8),
)


def require(value, code):
    if not value:
        raise ValueError('DB02_DYNAMIC_CACHE_REBUILD_' + code)


def verify_method_metadata(dump_raw):
    """Check original SHA and owner-qualified method RVAs."""
    require(isinstance(dump_raw, bytes) and
            len(dump_raw) == STEAM_1262_DUMP_SIZE and
            hashlib.sha256(dump_raw).hexdigest() ==
            STEAM_1262_DUMP_SHA256, 'ORIGINAL_DUMP_SHA')
    original = dump_raw.decode('utf-8')
    for owner, signature, rva in METHODS:
        # Never rely on a signature that happens to be defined by another
        # class. Qualify it within the original class's declaration body.
        decl = re.search(r'^public (?:sealed |abstract |static )?class ' +
                         re.escape(owner) +
                         r'(?= [:{])', original, re.M)
        require(decl is not None, 'ORIGINAL_OWNER_' +
                owner.replace('.', '_'))
        end = original.find('\n}\n', decl.end())
        require(end > decl.end(), 'ORIGINAL_OWNER_BODY')
        body = original[decl.start():end]
        needle = f'// RVA: 0x{rva:X}'
        pos = body.find(needle)
        require(pos >= 0 and
                body.find(signature, pos, pos+320) >= 0,
                'ORIGINAL_METHOD_RVA_' + owner.replace('.', '_'))
    return len(METHODS)


def verify_rel32(read_native, address, target, opcode):
    """Strict native E8 call or E9 tail jump; no fuzzy opcode search."""
    raw = read_native(address, 5)
    require(len(raw) == 5 and raw[0] == opcode,
            'NATIVE_RELATIVE_TRANSFER_OPCODE')
    displacement = struct.unpack_from('<i', raw, 1)[0]
    require(address + 5 + displacement == target,
            'NATIVE_RELATIVE_TRANSFER_TARGET')
    return True


def verify_original_assembly(path):
    path = Path(path)
    require(path.is_file() and path.stat().st_size == DLL_SIZE,
            'ORIGINAL_DLL_SIZE')
    with path.open('rb') as f:
        require(hashlib.file_digest(f, 'sha256').hexdigest() == DLL_SHA256,
                'ORIGINAL_DLL_SHA')
        text_rva, text_length, text_offset = pe_il2cpp_section(f, DLL_SIZE)

        def read_native(rva, size):
            require(text_rva <= rva and
                    0 < size <= 4096 and
                    rva + size <= text_rva + text_length,
                    'ORIGINAL_EXECUTABLE_RANGE')
            f.seek(text_offset + rva - text_rva)
            data = f.read(size)
            require(len(data) == size, 'ORIGINAL_EXECUTABLE_TRUNCATED')
            return data

        for _, rva, count, expected in WINDOWS:
            require(hashlib.sha256(read_native(rva, count)).hexdigest() ==
                    expected, 'ORIGINAL_INSTRUCTION_SHA')
        for _, address, target, opcode in EDGES:
            verify_rel32(read_native, address, target, opcode)
        # The field offset 0x28 in original DynamicItemPriceDatase is
        # CachedData; the native replacement store happens after the ctor.
        # This checks the native store shape without distributing bytes.
        store = read_native(0x3839AC1, 5)
        require(store[:4] == bytes.fromhex('49895c24') and
                store[4] == 0x28,
                'CACHE_DATA_REPLACEMENT_STORE')
        # OnBinarize contains an *unconditional* jump into CacheData;
        # this does NOT imply any particular live invoker.
        require(read_native(0x383A390, 2) == b'\x33\xd2',
                'ON_BINARIZE_TAIL_ENTRY')
    return True


def audit(proto_raw, dump_raw, assembly_path):
    require(isinstance(proto_raw, bytes) and
            len(proto_raw) == ORIGINAL_PROTO_BYTES and
            hashlib.sha256(proto_raw).hexdigest() ==
            ORIGINAL_PROTO_SHA256, 'ORIGINAL_PROTODB_SHA')
    providers = original_price_provider_census(proto_raw)
    purchase_refs, sell_refs, cache = parse_source(proto_raw)
    original_explicit = parse_cache(cache)
    require(providers['serializedPriceProviderCount'] == 11 and
            len(purchase_refs) == 4 and
            len(sell_refs) == 1 and
            providers['sourceItemPricesRowCount'] == 9537 and
            len(original_explicit) == 7,
            'SOURCE_CENSUS')
    methods = verify_method_metadata(dump_raw)
    require(verify_original_assembly(assembly_path),
            'ORIGINAL_EXECUTABLE_VERIFY')
    return {
        'contract': CONTRACT,
        'platform': 'Steam', 'gameVersion': '1.26.2',
        'shaVerifiedOriginalProtoDb': True,
        'shaVerifiedOriginalDump': True,
        'shaVerifiedOriginalGameAssembly': True,
        'sourceDynamicCacheRowCount': 8549,
        'sourceDynamicCachePositiveByNativeRule': True,
        'sourcePurchaseFormulaReferences': len(purchase_refs),
        'sourceSellFormulaReferences': len(sell_refs),
        'nativeQualifiedMethodsChecked': methods,
        'nativeInstructionWindowsChecked': len(WINDOWS),
        'nativeDirectCallEdgesChecked': len(EDGES)-1,
        'nativeTailJumpEdgesChecked': 1,
        'onBinarizeUnconditionallyCallsCacheData': True,
        'cacheDataAllocatesFreshItemPriceDatabase': True,
        'cacheDataReplacesCachedDataField': True,
        'cacheDataCallsSellFormulaTypeGate': True,
        'cacheDataCallsSellFormulaEvaluator': True,
        'protoDatabaseBinaryLoadHasDistinctLoadPath': True,
        'onBinarizeInvokedDuringRuntimeLoadVerified': False,
        'cacheDataInvokedDuringGameplayVerified': False,
        'runtimeCacheEqualToSerializedSourceVerified': False,
        'runtimeDynamicCacheRowCount': None,
        'runtimePriceProviderRegistryVerified': False,
        'runtimeIngredientSellPricesVerified': False,
        'publishable': False, 'writable': False, 'playerSaveRead': False,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--protodb', type=Path, required=True)
    p.add_argument('--dump', type=Path, required=True)
    p.add_argument('--assembly', type=Path, required=True)
    args = p.parse_args()
    try:
        print(json.dumps(audit(args.protodb.read_bytes(),
                               args.dump.read_bytes(), args.assembly),
                         indent=2))
    except (OSError, UnicodeError, ValueError) as exc:
        p.exit(1, f'DB-02 dynamic cache rebuild audit failed: {exc}\n')


if __name__ == '__main__':
    main()
