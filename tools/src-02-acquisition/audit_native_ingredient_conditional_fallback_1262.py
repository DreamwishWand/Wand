#!/usr/bin/env python3
"""Original Steam 1.26.2 native ingredient fallback *condition* verifier.

Connects SHA-checked original 625-recipe / 11-provider source gap with
SHA-checked native branch instructions. This is NOT a runtime trace or
proof that the live engine ever returned the fallback value for an item.
Does not print original Item IDs, price values, or machine-code bytes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

from audit_fixed_ingredient_price_source_gap_1262 import audit as source_gap_audit
from audit_native_sell_formula_type_dispatch_1262 import (
    DLL_SHA256, DLL_SIZE, pe_il2cpp_section, verified_relative_call,
)

CONTRACT = 'wand.db02.native-ingredient-conditional-fallback@1'
# Private original assembly instructions are deliberately represented by
# short-window SHA hashes; no original disassembly is published here.
WINDOWS = (
    ('recorded_ingredient_default_one', 0x3E1FE25, 27,
     '8e0c82de05d52210e467d47f0532af139f3dfe3b03b54b1e8d57230614390efb'),
    ('fallback_ingredient_default_one', 0x3E1FFBE, 23,
     '818c7df9245fc33fcada50fccac0b292c81ef47239525604236d1fb8090e7f46'),
    ('soft_currency_try_sell_wrapper', 0x383B4EA, 38,
     '7d2380ecc9c6b22c40d0061d25839e4646780105306958b7aff69bd7011d847b'),
    ('soft_currency_default_vs_result', 0x383B500, 19,
     'c7810cf2e5ebf35b76e3c99f671d0185565fe9db17ec5ebe729dd3a6431abdf1'),
    ('dynamic_cache_controls_formula', 0x383B8A8, 32,
     '58394747bf3d8198c429f42efb78e6378722cf6ee2fb1d071d2cb68af0adf579'),
    ('registered_database_lookup', 0x383B908, 50,
     'f48ad99f01796d06220d4ca3bb03b43aab7e680ac9b1e4ac6eb18a5e9a9198b7'),
    ('terminal_failed_lookup', 0x383BA10, 16,
     '55950d1898ec67c0edf0ce9b21f273cefa41fccc874605fdddb703f96b147953'),
    ('static_missing_price_row', 0x3836F65, 32,
     'e7a5d6775f6ec58ed12760742a562c46914ad912331fe0d9760ed8c1600537f5'),
    ('dynamic_missing_price_row', 0x3839830, 60,
     '338b437b06453a93b5bad953927fcf9cdb9a517766104b31c2eb6e0436c20685'),
)
DIRECT_EDGES = (
    ('recorded_ingredient_helper', 0x3E1FE36, 0x383B420),
    ('soft_currency_wrapper_to_try_sell', 0x383B500, 0x383B5D0),
    ('native_data_cached_gate', 0x383B8AD, 0x3839670),
    ('uncached_formula_calculation', 0x383B8D7, 0x4020D90),
    ('registered_provider_enumeration', 0x383B912, 0x17F8160),
)
TAIL_EDGE = ('recipe_fallback_ingredient_helper', 0x3E1FFD0, 0x383B420)


def require(condition, code):
    if not condition:
        raise ValueError('DB02_NATIVE_FALLBACK_' + code)


def verify_relative_transfer(reader, location, target, opcode):
    raw = reader(location, 5)
    require(len(raw) == 5 and raw[0] == opcode,
            'DIRECT_TRANSFER_OPCODE')
    displacement = struct.unpack_from('<i', raw, 1)[0]
    require(location + 5 + displacement == target,
            'DIRECT_TRANSFER_TARGET')
    return True


def verify_original_native_fallback(assembly_path):
    path = Path(assembly_path)
    require(path.is_file() and path.stat().st_size == DLL_SIZE,
            'ORIGINAL_DLL_SIZE')
    with path.open('rb') as handle:
        require(hashlib.file_digest(handle, 'sha256').hexdigest() ==
                DLL_SHA256, 'ORIGINAL_DLL_SHA')
        section_rva, section_length, section_offset = pe_il2cpp_section(
            handle, DLL_SIZE)

        def read_native(rva, count):
            require(section_rva <= rva and 0 < count <= 4096 and
                    rva + count <= section_rva + section_length,
                    'NATIVE_EXECUTABLE_SECTION_RANGE')
            handle.seek(section_offset + rva - section_rva)
            data = handle.read(count)
            require(len(data) == count, 'NATIVE_SHORT_READ')
            return data

        for _, addr, length, digest in WINDOWS:
            require(hashlib.sha256(read_native(addr, length)).hexdigest() ==
                    digest, 'ORIGINAL_INSTRUCTION_WINDOW_SHA')
        for _, site, target in DIRECT_EDGES:
            verified_relative_call(read_native, site, target)
        verify_relative_transfer(read_native, TAIL_EDGE[1], TAIL_EDGE[2],
                                 0xE9)

        # Both meal ingredient helper bodies pass r8d=1, ItemState=null
        # to GetSoftCurrencySellPrice. The native wrapper returns
        # the supplied default only when TryGetSellPrice reports false.
        require(read_native(0x3E1FE2E, 6) ==
                b'\x41\xb8\x01\x00\x00\x00' and
                read_native(0x3E1FFC3, 6) ==
                b'\x41\xb8\x01\x00\x00\x00',
                'INGREDIENT_DEFAULT_ONE_ARGUMENTS')
        require(read_native(0x383B505, 10) ==
                b'\x84\xc0\x8b\xc6\x74\x04\x8b\x44\x24\x40',
                'WRAPPER_BOOL_GATE_AND_FALLBACK')

        # DataCached=true bypasses the uncached formula path.
        require(read_native(0x383B8B2, 6) ==
                b'\x84\xc0\x75\x2f\x48\x8b',
                'FORMULA_SKIP_WHEN_CACHED')
        # A fully exhausted TryGetSellPrice writes an out-price 0
        # and returns false. Neither 0 nor 1 is an observed value
        # for a specific item without a runtime trace.
        require(read_native(0x383BA18, 5) ==
                b'\x45\x89\x37\x32\xc0',
                'TERMINAL_FALSE_AND_OUT_ZERO')
    return {
        'nativeInstructionWindowsAuthenticated': len(WINDOWS),
        'nativeDirectCallEdgesAuthenticated': len(DIRECT_EDGES),
        'nativeTailJumpEdgesAuthenticated': 1,
        'bothIngredientHelpersPassDefaultOne': True,
        'nativeTrySellPriceBooleanControlsDefault': True,
        'nativeCachedDynamicGateSkipsUncachedFormula': True,
        'nativeTerminalTrySellPriceFalseAndOutZero': True,
    }


def audit(manifest, recipes, original_proto, original_assembly):
    source = source_gap_audit(manifest, recipes, original_proto)
    require(source['fixedIngredientsWithNoSerializedPriceRowInAnyProvider']
            == 160, 'ORIGINAL_MISSING_ROW_COUNT')
    native = verify_original_native_fallback(original_assembly)
    return {
        'contract': CONTRACT, 'platform': 'Steam',
        'gameVersion': '1.26.2',
        'originalRecipePriceProviderAndNativeBinarySourcesAuthenticated': True,
        'originalFixedCookingIngredients': 371,
        'sourceIngredientsWithoutAnyOriginalPriceRow': 160,
        **native,
        'conditionalDefaultArgumentOnFullRuntimeLookupFailure': 1,
        'runtimeRegisteredProvidersExactlySourceVerified': False,
        'runtimeDynamicCacheMatchesSourceVerified': False,
        'runtimeItemClassIdentityVerified': False,
        'runtimeLookupFailedForAnyOriginalMissingItemVerified': False,
        'actualFallbackUsedForAnyItem': None,
        'actualIngredientSellPrice': None,
        'actualMealSellPrice': None,
        'sourceOnlyConditionalInference': True,
        'publishable': False, 'writable': False, 'playerSaveRead': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--recipes', required=True, type=Path)
    parser.add_argument('--protodb', required=True, type=Path)
    parser.add_argument('--assembly', required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(audit(
            args.manifest.read_bytes(),
            args.recipes.read_bytes(),
            args.protodb.read_bytes(),
            args.assembly,
        ), indent=2))
    except (OSError, ValueError) as exc:
        parser.exit(1, f'DB-02 original native fallback audit failed: {exc}\n')


if __name__ == '__main__':
    main()
