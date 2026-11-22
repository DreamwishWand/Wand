#!/usr/bin/env python3
"""DB-02 original Steam v1.26.2 native sell-formula type dispatch audit.

Inspects SHA-pinned *private* originals read-only. Outputs only counts,
native call graph attestations, and unresolved flags; never emits formula
equations, source IDs, price rows, machine code or player save data.
The observed native dispatch is NOT a runtime quote / provider selection.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct

from audit_native_sell_formula_source import (
    audit as audit_formula_join, frames, one, string,
)
from native_formula_type_taxonomy import (
    STEAM_1262_DUMP_SHA256, STEAM_1262_DUMP_SIZE, enum_values,
)

CONTRACT = 'wand.db02.native-sell-formula-type-dispatch@1'
DLL_SIZE = 176820736
DLL_SHA256 = 'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653'
IMAGE_BASE = 0x180000000

# Method identifiers are cross-checked against original IL2CPP dump.cs.
METHODS = (
    ('SellPriceFormulaItemData',
     'private ItemDatabase.ItemTypeMetaInfo GetObjectTypeMetaInfo() { }',
     0x40208A0),
    ('SellPriceFormulaItemData',
     'public bool IsFormulaValidForItem(IItemData itemData) { }',
     0x4021150),
    ('SellPriceFormulaItemData',
     'public static SellPriceFormulaItemData GetSellPriceFormulaItemData(IItemData itemData, Item forCurrency) { }',
     0x4020E60),
    ('ItemDatabase.ItemTypeMetaInfo',
     'public static ItemDatabase.ItemTypeMetaInfo GetItemTypeMetaInfo(ItemType itemType, Enum subType) { }',
     0x40EB580),
    ('ItemDatabase.ItemTypeMetaInfo',
     'public static bool TryGetItemTypeMetaInfo(ItemType type, out ItemDatabase.ItemTypeMetaInfo info) { }',
     0x40EB9D0),
)

# E8 rel32 near-call edges extracted from the authenticated GameAssembly.dll.
# They establish the *native code path*, not which item is actually selected.
CALL_EDGES = (
    ('object_type_split', 0x402097A, 0x50C1550),
    ('first_type_metadata_lookup', 0x4020A25, 0x40EB9D0),
    ('subtype_enum_parse', 0x4020AF5, 0x52D88E0),
    ('subtype_metadata_lookup', 0x4020B62, 0x40EB580),
    ('candidate_object_type_resolution', 0x402115B, 0x40208A0),
    ('item_runtime_type_reflection', 0x4021195, 0x609BF0),
    ('selection_validity_gate', 0x4021082, 0x4021150),
)

# Full SHA-256 of short instruction windows, rather than distributing
# proprietary native instructions or disassembly to public GitHub.
WINDOWS = (
    ('object_type_path_split', 0x402096F, 21,
     'f504512aac314d06c2e0f506eb27132904a17fe82bef5b1a83cea6f9dfd3d168'),
    ('object_type_top_level_lookup', 0x4020A1B, 17,
     '80f4775edf7513278a04191b3403d2ab3cbf2f8bc71cf95d5b9e3464fa6d86a0'),
    ('object_type_subtype_lookup', 0x4020B5A, 13,
     '3a27332fef8f0f723b1cea4f04c574c6f7bc98c9d9f714a8f65fd1bf36a2ef2f'),
    ('formula_resolves_meta', 0x4021156, 24,
     'b00eab2933b56b9d530f438ed7b0a9fdd7fb52426e34b350b1db239ba298483d'),
    ('formula_meta_protobuf_class', 0x402116E, 24,
     '92d78e4a46c321149701ed0d984e71f071c85d7421f4ee56cbbdab986850da6e'),
    ('formula_item_runtime_type', 0x402118E, 12,
     'ba7c914ce5d0686eb528dbd11897e94dc45da93380eac35a81b072b504084cad'),
    ('formula_exact_type_identity', 0x40211B2, 17,
     'fd793033b22345303eb31a6d12d93b8da3c454fa4c43cf15db59f7248b74488f'),
    ('formula_currency_and_type_selection', 0x4021070, 25,
     'cc407f88d21eef2531b5c4199ea521c327353cf04dedc26a4bf9e2827c31989d'),
    ('object_type_subtype_enum_conversion', 0x4020AEF, 17,
     '784cd68230c0a0d1c7937e029ac024491bb8235e94aaf5ae441c559d0c8a0080'),
)


def require(condition, reason):
    if not condition:
        raise ValueError('DB02_NATIVE_TYPE_DISPATCH_' + reason)


def source_method_rva(dump_text, owner, signature):
    """Require exactly one named method in its declared IL2CPP class."""
    pattern = (r'(?ms)^public (?:sealed|abstract) class ' +
               re.escape(owner) + r' (?::|//).*?^\}')
    blocks = list(re.finditer(pattern, dump_text))
    require(len(blocks) == 1, 'DUMP_CLASS_NOT_UNIQUE')
    pending, matches = None, []
    for line in blocks[0].group().splitlines():
        line = line.strip()
        m = re.match(r'// RVA: (0x[0-9A-Fa-f]+) ', line)
        if m:
            pending = int(m.group(1), 16)
        if line == signature:
            require(pending is not None, 'DUMP_MISSING_METHOD_RVA')
            matches.append(pending)
    require(len(matches) == 1, 'DUMP_METHOD_NOT_UNIQUE')
    return matches[0]


def original_method_map(dump_text):
    actual = {}
    for owner, signature, rva in METHODS:
        found = source_method_rva(dump_text, owner, signature)
        require(found == rva, 'ORIGINAL_METHOD_RVA_MISMATCH')
        actual[owner + '.' + signature.split('(')[0].split(' ')[-1]] = rva
    require('public abstract Type get_ProtobufClassType();' in dump_text,
            'NATIVE_META_CLASS_TYPE_ABSTRACT')
    enums = enum_values(dump_text, 'ActivityItemType')
    for name, value in (('Meal', 3), ('Crop', 2), ('Fish', 10),
                        ('Ingredient', 11), ('Consummable', 15)):
        require(enums.get(name) == value, 'CATEGORY_ENUM_MISMATCH')
    require(len({enums[k] for k in
                 ('Meal', 'Crop', 'Fish', 'Ingredient', 'Consummable')}) == 5,
            'CATEGORY_SUBTYPE_COLLISION')
    require(len(re.findall(r'(?m)^public sealed class MealItemData : ',
                           dump_text)) == 1,
            'MEAL_CLASS_MISSING')
    return actual


def pe_il2cpp_section(handle, size):
    handle.seek(0)
    dos = handle.read(0x40)
    require(len(dos) == 0x40 and dos[:2] == b'MZ', 'PE_DOS_HEADER')
    pe_at = struct.unpack_from('<I', dos, 0x3C)[0]
    require(0 < pe_at < 1024, 'PE_HEADER_OFFSET')
    handle.seek(pe_at)
    coff = handle.read(24)
    require(coff[:4] == b'PE\x00\x00', 'PE_SIGNATURE')
    machine, count = struct.unpack_from('<HH', coff, 4)
    opt_size = struct.unpack_from('<H', coff, 20)[0]
    require(machine == 0x8664 and 0 < count < 64 and opt_size >= 32,
            'PE_ARCHITECTURE')
    opt = handle.read(opt_size)
    require(struct.unpack_from('<H', opt)[0] == 0x20B and
            struct.unpack_from('<Q', opt, 24)[0] == IMAGE_BASE,
            'PE_IMAGE_BASE')
    for _ in range(count):
        raw = handle.read(40)
        require(len(raw) == 40, 'PE_SECTION_TRUNCATED')
        name = raw[:8].split(b'\x00')[0]
        if name != b'il2cpp':
            continue
        virtual_size, rva, raw_size, offset = struct.unpack_from('<IIII', raw, 8)
        flags = struct.unpack_from('<I', raw, 36)[0]
        require((flags & 0x20000000) != 0 and
                raw_size > 0 and virtual_size > 0 and
                offset + raw_size <= size,
                'PE_EXECUTABLE_SECTION')
        return rva, min(virtual_size, raw_size), offset
    raise ValueError('DB02_NATIVE_TYPE_DISPATCH_PE_NO_IL2CPP_SECTION')


def verified_relative_call(code_reader, site_rva, expected_target):
    raw = code_reader(site_rva, 5)
    require(len(raw) == 5 and raw[0] == 0xE8, 'MISSING_DIRECT_CALL')
    displacement = struct.unpack_from('<i', raw, 1)[0]
    require(site_rva + 5 + displacement == expected_target,
            'UNEXPECTED_CALL_TARGET')
    return True


def verify_original_native_dispatch(assembly_path, dump_bytes, formula_raw, proto_raw):
    """Authenticate all four originals and derive only a bounded public report."""
    require(isinstance(dump_bytes, bytes) and
            len(dump_bytes) == STEAM_1262_DUMP_SIZE and
            hashlib.sha256(dump_bytes).hexdigest() ==
            STEAM_1262_DUMP_SHA256, 'ORIGINAL_DUMP_SHA')
    # Reuses the strict 5/5 reference and 7/7 original cache join.
    source = audit_formula_join(formula_raw, proto_raw, dump_bytes)
    require(source['originalNativeTypeMetadataVerified'] and
            source['sourceObjectTypeNativeEnumCorrespondenceVerified'],
            'ORIGINAL_SOURCE_METADATA_JOIN')
    defined = frames(formula_raw)
    matching = []
    for ff in defined.values():
        raw_type = one(ff, 6, 2)
        if raw_type is not None and string(raw_type) == 'ActivityItem/Consummable':
            matching.append(True)
    require(len(defined) == 32 and len(matching) == 1,
            'SOURCE_SELL_OBJECT_TYPE_UNIQUE')
    methods = original_method_map(dump_bytes.decode('utf-8'))

    path = Path(assembly_path)
    require(path.is_file() and path.stat().st_size == DLL_SIZE,
            'ORIGINAL_GAMEASSEMBLY_SIZE')
    with path.open('rb') as handle:
        require(hashlib.file_digest(handle, 'sha256').hexdigest() ==
                DLL_SHA256, 'ORIGINAL_GAMEASSEMBLY_SHA')
        section_rva, section_size, section_offset = pe_il2cpp_section(
            handle, DLL_SIZE)

        def read_native(rva, n):
            require(isinstance(rva, int) and 0 < n <= 4096 and
                    section_rva <= rva and
                    rva + n <= section_rva + section_size,
                    'NATIVE_CODE_SECTION_BOUNDS')
            handle.seek(section_offset + rva - section_rva)
            data = handle.read(n)
            require(len(data) == n, 'NATIVE_CODE_TRUNCATED')
            return data

        for _, rva, n, digest in WINDOWS:
            require(hashlib.sha256(read_native(rva, n)).hexdigest() ==
                    digest, 'NATIVE_INSTRUCTION_WINDOW_SHA')
        for _, site, target in CALL_EDGES:
            verified_relative_call(read_native, site, target)
        # Original IsFormulaValidForItem: resolved protobuf Type vs item.GetType
        # are compared with exact pointer equality, returning sete al.
        require(read_native(0x4021184, 2) == b'\xff\xd0' and
                read_native(0x40211B2, 3) == b'\x48\x3b\xfb' and
                read_native(0x40211BA, 3) == b'\x0f\x94\xc0',
                'NATIVE_EXACT_CLASS_COMPARISON')

    return {
        'contract': CONTRACT,
        'gameVersion': '1.26.2',
        'platform': 'Steam',
        'status': 'ORIGINAL_TYPE_DISPATCH_CODE_VERIFIED',
        'originalFormulaProtoDumpAndGameAssemblySHA256Verified': True,
        'nativeTypeDispatchMethodDeclarationsVerified': len(methods),
        'verifiedNativeDirectCallEdges': len(CALL_EDGES),
        'verifiedNativeInstructionWindows': len(WINDOWS),
        'sellFormulaSourceType': 'ActivityItem/Consummable',
        'originalNativeConsummableEnumValue': 15,
        'originalNativeMealEnumValue': 3,
        'cookingMealAndFixedIngredientSubtypesDifferFromFormula': True,
        'objectTypeNativeTopAndSubTypeMetadataLookupVerified': True,
        'formulaNativeObjectTypeMetadataResolverCallVerified': True,
        'formulaNativeExactProtobufClassRuntimeTypeEqualityVerified': True,
        'formulaNativeCurrencyAndTypeGateOrderVerified': True,
        'nativeItemTypeRegistryPopulationVerified': False,
        'actualRegisteredPriceProviderOrderVerified': False,
        'actualItemTypeInAnyLoadedGameInstanceVerified': False,
        'effectiveMealOrIngredientSellPrice': None,
        'publishable': False,
        'writable': False,
        'playerSaveRead': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--formula', required=True, type=Path)
    parser.add_argument('--protodb', required=True, type=Path)
    parser.add_argument('--dump', required=True, type=Path)
    parser.add_argument('--assembly', required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(verify_original_native_dispatch(
            args.assembly,
            args.dump.read_bytes(),
            args.formula.read_bytes(),
            args.protodb.read_bytes(),
        ), indent=2))
    except (OSError, UnicodeError, ValueError) as exc:
        parser.exit(1, f'DB-02 native type-dispatch audit failed: {exc}\n')


if __name__ == '__main__':
    main()
