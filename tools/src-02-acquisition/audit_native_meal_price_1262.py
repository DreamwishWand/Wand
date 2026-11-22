#!/usr/bin/env python3
"""DB-02 verify owner-private Steam and Switch v1.26.2 native meal-price code.

Only fingerprints, method RVAs and bounded code-window hashes are source
controlled. This tool reads the owner's original binaries locally and prints
a narrow evidence report. It never uploads, copies, executes or publishes
game code. Verified percentage arithmetic is NOT a full cooked-meal formula.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct

from native_meal_price_probe import (
    parse_pe_headers, map_executable_rva, CLASS, ADDRESS, digest_file
)

CONTRACT = "wand.db02.native-meal-price-cross-platform@1"
GAME_VERSION = "1.26.2"
STEAM_FULLVERSION = "releases_1.26ex-v1.26.2-6-g77de7caf1acf-incremental-22"
STEAM_VERSION_SHA = "e0aad8c7c19ebd3f441161db4d27f7838dd62b261927a974793f54fc0a81fc98"
STEAM_DLL_SHA = "a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653"
STEAM_DUMP_SHA = "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08"
SWITCH_MAIN_SHA = "c6c444e8c9938c1213470d80333cfb07c1fd8feb5616bfcc9428e71e3a27dfbe"
SWITCH_DUMP_SHA = "440427d3865e45ed9010cc54439dc1cac4b6ae068984efc117dd4a994fc4411c"
SWITCH_TEXT_SHA = "c8a030a1fcd2d672fb99cf8a5b23a48281571ffe140b61c1f717481c4bfef89d"
SWITCH_BUILD_ID = "bb9556d4bb715252a1f4fd16b29fece0"
STEAM_SIZE = 176820736
STEAM_DUMP_SIZE = 89453137
SWITCH_SIZE = 99771988
SWITCH_DUMP_SIZE = 62282813
SWITCH_TEXT_SIZE = 162397712

TARGET_NAMES = (
    ("ItemPriceDatabases", "GetSoftCurrencySellPrice"),
    ("ItemPriceDatabases", "GetSellPrice"),
    ("ItemPriceDatabases", "TryGetSellPrice"),
    ("ItemPriceDatabases", "GetDefaultSellPrice"),
    ("MealItemData", "GetLowestPriceIngredients"),
    ("MealItemData", "TotalIngredientsValue"),
    ("MealItemData", "TotalIngredientsSellPrice"),
    ("MealItemData", "GetSellPrice"),
    ("ItemPriceDatabase", "TryGetSellPrice"),
    ("DynamicItemPriceDatase", "TryGetSellPrice"),
    ("DynamicItemPriceDatase", "get_DataCached"),
    ("SellPriceFormulaItemData", "GetSellPriceFormulaItemData"),
    ("SellPriceFormulaItemData", "IsFormulaValidForItem"),
    ("SellPriceFormulaItemData", "CalculateItemPrice"),
)
STEAM_RVAS = (
    0x383B420, 0x383B530, 0x383B5D0, 0x383BA40,
    0x3E1DA20, 0x3E1E0F0, 0x3E1E710, 0x3E1ECC0,
    0x3836F50, 0x3839820, 0x3839670,
    0x4020E60, 0x4021150, 0x4020120,
)
SWITCH_RVAS = (
    0x417EF70, 0x417F0C0, 0x417F160, 0x417FA60,
    0x4A3E3E0, 0x4A3EC50, 0x4A3F640, 0x4A3F880,
    0x41784C0, 0x417B5A0, 0x417B3D0,
    0x4D50C40, 0x4D51140, 0x4D4F930,
)
# The source-control-safe hashes cover complete native instruction windows,
# NOT proprietary instructions, full methods or original asset content.
STEAM_WINDOWS = (
    ("integer_percent_truncation", 0x3E1E5FC, 31,
     "8009919fbd8025485dcfed354bb1dba00987a6d88a25436141d35ba6bb988414"),
    ("soft_currency_fallback", 0x383B500, 16,
     "f820e51ad84e42d8a81d936c26b9b6631d6905a0d7d4872b49b970cad11e99fb"),
    ("sell_wrapper_to_total_value", 0x3E1E868, 21,
     "1d37c559b29305dcddd7f8cbe2921739b63fd944e5fab68fae9eb7a8ae427435"),
    ("addition_after_ingredient", 0x3E1E625, 8,
     "e1fcb2715dd8ae865bea71c1f08597c4efd283a5ab86fcc3c1985af6b60c7a7f"),
    ("upper_bound_clamp", 0x3E1E6B4, 13,
     "46de03360e17364d7e19093321c7aba8ec5adf780804736b6420970b9b436cee"),
    ("base_and_default_setup", 0x3E1E25C, 19,
     "8577d990ed31b44e6edeb23ddaacdd3aa3ae668869096097a5283f6b4dce643f"),
    ("conditional_base_callback", 0x3E1E2F9, 26,
     "23d9db79d5516a0cd67bf68005adaf28e27c8cc912194a58dbf6c18f61e0fd5d"),
    ("signed32_component_accumulation", 0x3E1E625, 8,
     "e1fcb2715dd8ae865bea71c1f08597c4efd283a5ab86fcc3c1985af6b60c7a7f"),
    ("signed32_final_upper_bound", 0x3E1E6B4, 13,
     "46de03360e17364d7e19093321c7aba8ec5adf780804736b6420970b9b436cee"),
    ("get_sell_recorded_or_fallback", 0x3E1EDBE, 80,
     "db700a604534e64239e07fbaaa7340a7413fc70afffb91690bde4505693db8e2"),
    ("lowest_price_ingredient_default_one", 0x3E1FFC3, 20,
     "886fdde5ce5527f10febbc62ad55ada48226cded01101ba84015077048bb8f3a"),
    ("recorded_price_tuple_default_one", 0x3E1FE25, 30,
     "db1adf2e3d3408aed96be9e1c6f6d6be2ea53313fad4c5065b856109c10921ee"),
    ("sell_wrapper_null_base_and_cap", 0x3E1E856, 35,
     "ffd35c2299bb25ea6b706bc6d5b073ff9fe49a5495a20167a20588aee571a59a"),
    ("sell_star_percentage_selector", 0x3B3E0C0, 20,
     "debe8635b1247cb18ba0348f70fddae8b074e32947b9091a314654e8fc4cc874"),
    ("direct_calculator_currency_gate", 0x383B76D, 32,
     "275584ffa715845bb8b643750e3132e1e1801def5fd2439e6a7500dad7b5c59a"),
    ("direct_calculator_sale_return", 0x383B7DC, 31,
     "9eb770d283c6a5efec01c39bc84e259af452452d75152fb19f01a0bb21c17fec"),
    ("uncached_formula_gate", 0x383B8A8, 23,
     "b362ae188ed35d65ece6d8893a1bc0bffa008e74b8d69d2f24eb223a4fec2db0"),
    ("uncached_formula_price_call", 0x383B8CB, 29,
     "b125834005897826ab0bd2ed8017715e5ced4d64b90f9f4003fd888b7b9b0392"),
    ("registered_price_database_dispatch", 0x383B995, 29,
     "a6a7a4b84d1f0c28a6f8ef932b9db6bcf6771b31e65241355127cac94f6600da"),
    ("final_lookup_failure_zero", 0x383BA10, 13,
     "dbe21dfc865f9b22fc4dcc3481a0b558f9e9e89bfe49336ab383f0b64a0ae8e2"),
    ("static_item_price_lookup", 0x3836F65, 18,
     "e59e28d76d41bffdc049003b8d407501d1d9736761569bf66d95e5fd4d35f33b"),
    ("static_sell_currency_match", 0x3836FAF, 20,
     "0c0d55b03e8b26478a3dac076ce826ff11a3476d8415eee23fd772c6e3fc8d9a"),
    ("static_sell_missing_out_one", 0x3836FC1, 28,
     "1a65346b508149265995ee23822dd5ad8a418b5c7f34711a94fd7b6bff96b35f"),
    ("dynamic_initial_out_zero", 0x3839830, 21,
     "5796c99c03c9d70f3f81304a3773cf498dffe56613d9cfbe95ea7fa52b6d70c3"),
    ("dynamic_cached_row_query", 0x3839854, 23,
     "d5ff84a8d8743031a14a1218a0e3eb472d442fe32be4c338442134f659292b88"),
    ("dynamic_missing_out_one", 0x38398B6, 39,
     "7a5d4e7c589f1d055bfda1fe58fb2c6d4c7ce805852e6a1a4107272e454f5cda"),
    ("dynamic_data_cached_positive_count", 0x383969A, 45,
     "2c39913bcad0e0130749168656aba038506528a41113c9174b9f73b0101f15d9"),
    ("formula_currency_match", 0x4021070, 22,
     "fc10717f20831184455622aae2753affd815deb82da79e917bbaac0416313f17"),
    ("formula_item_type_eligibility_call", 0x4021079, 18,
     "4c79629d5209a3224a2f158a7221b6afe159bf56582b7497bceefe246dc2fb17"),
    ("formula_first_eligible_return", 0x40210A6, 12,
     "6a7d4c70976fd4a852fa16d0271cd1a2ff031a8297bf5fdedba7eada075ebd9b"),
    ("formula_resolved_type_identity", 0x40211B2, 15,
     "4a206e75cd13314ce295861dbd2aa3eb19cbc6277224f391b81e5b366469a7fa"),
    ("formula_float_truncate_to_int32", 0x4020303, 20,
     "672e5c6c047ffc2a4a9a71e7eec986512982c15a8df04ba7a13314bc5aa344c4"),
)
SWITCH_WINDOWS = (
    ("integer_percent_truncation", 0x4A3F1AC, 32,
     "e183b8a285e413e375f50c6aee6c54921e633615873468fe8240e2fbb07b1c42"),
    ("soft_currency_fallback", 0x417EFF4, 20,
     "13aa1a44860ab209949197fd8995e1d329ab940008673acf86102ad744a8dece"),
    ("sell_wrapper_to_total_value", 0x4A3F784, 44,
     "7c0282d67b899db821296f2118c903fdfe9e56ebdc936b7620b9d98ffc5240bc"),
    ("base_and_default_setup", 0x4A3EED4, 16,
     "eb887644bf0775087e7045b717777b3885bb949c6f9688d5a1a59eec000e04eb"),
    ("conditional_base_callback", 0x4A3EEAC, 30,
     "4403907897b380b125f1b0e4b5fa9c3134c7c0204ce2eda3124c2752733d0dc4"),
    ("signed32_component_accumulation", 0x4A3F044, 4,
     "e680058368a8a314222a4ba6c08eb0e7f6cd87d9f8d35bbe80e62028d6d17dc8"),
    ("signed32_final_upper_bound", 0x4A3F264, 12,
     "5aa10c2a9d9579d559da70acc4a80cad7b7ce4a4b7b3d5c7c7cf1dd2e547ec9f"),
    ("get_sell_recorded_or_fallback", 0x4A3F92C, 68,
     "afaaf958d693decb3dcc223a7df3197c5565b3e40504efeaa225cfab1a60d8e4"),
    ("lowest_price_ingredient_default_one", 0x4A410D0, 32,
     "8ba99352f418d341fcb3af86c82c7f1a434a292672179060fe2cf75b70d95d09"),
    ("recorded_price_tuple_default_one", 0x4A40E44, 28,
     "73f17977175ac8c8f96fba3e7e4102e6e99b5469ff9105496a44756f2a584031"),
    ("sell_star_percentage_selector", 0x4A41130, 12,
     "c14ab65759500e9dca7fa4b73ce34bed4c86a45faf609e82e66ee9af2901c5c3"),
    ("direct_calculator_currency_gate", 0x417F43C, 32,
     "371d2ea00700d741bc99e56829bc3733d2367a129b7cdce77fc94a88d1d97a6f"),
    ("direct_calculator_sale_return", 0x417F48C, 40,
     "ad85b698ff6a3b295c9a180a81b97066a6e1abb43b06585c962fa78cc8dcb3e3"),
    ("uncached_formula_gate", 0x417F600, 44,
     "6d33a79b7589c7989cbf0aca836f31e014dfc3fa94b48db28e0db541ec2fc585"),
    ("uncached_formula_price_call", 0x417F634, 28,
     "ed073ee895de03553276c9791686b7cfb6c83df0047e814f56a64fb8b2397cb8"),
    ("registered_price_database_dispatch", 0x417F8EC, 36,
     "7646ae4c46d47e4fe66a6e17393b313d3b595ba855f2514c138acf247465161f"),
    ("final_lookup_failure_zero", 0x417F994, 40,
     "b16f55ec558d4794d4d58705304cf9c9d183e6f2c420f55800e7a01c31f328de"),
    ("static_item_price_lookup", 0x41784D4, 20,
     "1b0b6895992ab5cac6e092b7998cf93f9cb484941583cfb5f2bf6ba5daaf7d2b"),
    ("static_sell_currency_match", 0x4178510, 28,
     "ceadea8ec68fe1d47b03db31408a1d58388ecace57e105f0547aaa965c56db1b"),
    ("static_sell_missing_out_one", 0x4178584, 24,
     "c2a2914c9750f2b4f39936944013f191ba3d741a274cf7906821a413e7a889f6"),
    ("dynamic_initial_out_zero", 0x417B5A0, 24,
     "a9df3e05ae6e59026cad1fe8b4745a454af89b9bd34e6f7c7531bd60587db20f"),
    ("dynamic_cached_row_query", 0x417B5C0, 24,
     "47f0befb4e9294a0f7ad4f6142fdc3a3342d83dbb867ef88e5c0bd5399e67577"),
    ("dynamic_missing_out_one", 0x417B65C, 24,
     "c2a2914c9750f2b4f39936944013f191ba3d741a274cf7906821a413e7a889f6"),
    ("dynamic_data_cached_positive_count", 0x417B40C, 40,
     "2089aa16808cadd1d5928ca9fbb42675c89eb5278a72ce8317770dc45fcf7c8b"),
    ("formula_currency_match", 0x4D50F64, 38,
     "b12827c9244626eaae5f6d4f002d4987c5024248a5487fe0f70ee75366618d65"),
    ("formula_item_type_eligibility_call", 0x4D50F90, 64,
     "a0cbae7e6566d198e1caaea2c192b8239b7dbcb5301e0086ec8b1683a7d3b14a"),
    ("formula_first_eligible_return", 0x4D51040, 30,
     "69d47fa3de06f0e1eee4d7f6906e6aea4140ab4a9feb4eb409013b5d518cde44"),
    ("formula_resolved_type_identity", 0x4D511E8, 8,
     "4e277315f24e49143e6afcb9a39cbc4b331a23d036dadaaff0bb45a1594ed856"),
    ("formula_float_truncate_to_int32", 0x4D4FAF0, 24,
     "974a44f85469bd634789e4c7064ae1513ff9f4a237ad3fbea819c536bdaba9a1"),
)
MAX_DUMP = 160 * 1024 * 1024


def require(ok, code):
    if not ok:
        raise ValueError("DB02_NATIVE_CROSS_" + code)


def verify_file(path: Path, length: int, expected_sha: str):
    require(path.is_file() and not path.is_symlink(),
            "OWNER_PRIVATE_FILE_REQUIRED")
    require(path.stat().st_size == length, "ORIGINAL_SIZE_MISMATCH")
    actual = digest_file(path, max(length, 1))
    require(actual == expected_sha, "ORIGINAL_SHA_MISMATCH")
    return actual


def direct_rvas(dump_path: Path):
    """Read owner-qualified target signatures, not guessed RVAs."""
    expected = {
        owner + "." + method: (" " + method + "(")
        for owner, method in TARGET_NAMES
    }
    seen = {}
    owner = None
    pending = None
    with dump_path.open("rt", encoding="utf-8") as source:
        for line in source:
            if line.startswith("// Namespace:"):
                owner, pending = None, None
            if "TypeDefIndex:" in line and " class " in line:
                match = CLASS.search(line)
                if match:
                    owner = match.group(1)
            match = ADDRESS.search(line)
            if match:
                pending = int(match.group(1), 16)
                continue
            if pending is not None and owner is not None and \
                    line.rstrip().endswith("{ }"):
                for qualified, needle in expected.items():
                    if qualified.startswith(owner + ".") and needle in line:
                        require(qualified not in seen, "DUPLICATE_METHOD")
                        seen[qualified] = pending
                        break
                pending = None
    require(len(seen) == len(expected), "INCOMPLETE_METHOD_SIGNATURES")
    return tuple(seen[owner + "." + method] for owner, method in TARGET_NAMES)


def verify_rvas(actual, expected):
    require(tuple(actual) == tuple(expected), "METHOD_RVA_MISMATCH")
    return len(actual)


def digest_bytes(data: bytes):
    return hashlib.sha256(data).hexdigest()


def verify_code_windows(read_code, windows):
    seen = []
    for meaning, rva, count, expected in windows:
        raw = read_code(rva, count)
        require(len(raw) == count and digest_bytes(raw) == expected,
                "CODE_WINDOW_" + meaning.upper())
        seen.append(meaning)
    return seen


def verify_steam(version_path, dump_path, assembly_path):
    verify_file(version_path, 55, STEAM_VERSION_SHA)
    require(version_path.read_text("ascii").strip() == STEAM_FULLVERSION,
            "STEAM_BUILD_VERSION")
    verify_file(dump_path, STEAM_DUMP_SIZE, STEAM_DUMP_SHA)
    verify_rvas(direct_rvas(dump_path), STEAM_RVAS)
    verify_file(assembly_path, STEAM_SIZE, STEAM_DLL_SHA)
    with assembly_path.open("rb") as binary:
        base, image_size, sections = parse_pe_headers(binary, STEAM_SIZE)
        require(base == 0x180000000, "STEAM_PE_IMAGE_BASE")
        def read_code(rva, count):
            require(rva + count <= image_size, "STEAM_IMAGE_RANGE")
            offset, section = map_executable_rva(rva, sections, STEAM_SIZE,
                                                  count)
            require(section == "il2cpp", "STEAM_IL2CPP_SECTION")
            binary.seek(offset)
            return binary.read(count)
        for rva in STEAM_RVAS:
            require(len(read_code(rva, 16)) == 16, "STEAM_METHOD_BOUNDS")
        verified = verify_code_windows(read_code, STEAM_WINDOWS)
    return {
        "platform": "Steam", "gameVersionFromFile": GAME_VERSION,
        "originalGameAssemblySha256": STEAM_DLL_SHA,
        "originalDumpSha256": STEAM_DUMP_SHA,
        "methodRvasChecked": len(STEAM_RVAS),
        "instructionWindowsVerified": verified,
        "nativeMachine": "amd64-pe32-plus",
    }


def parse_nso_text(binary: bytes):
    """Strict Nintendo NSO0 compressed text reader. No Switch code executes."""
    require(len(binary) == SWITCH_SIZE, "SWITCH_BINARY_SIZE")
    require(binary[:4] == b"NSO0", "SWITCH_NSO_MAGIC")
    flags = struct.unpack_from("<I", binary, 0x0C)[0]
    file_off, memory_off, size = struct.unpack_from("<III", binary, 0x10)
    compressed_size = struct.unpack_from("<I", binary, 0x60)[0]
    build_id = binary[0x40:0x50].hex()
    require(flags & 1 and file_off == 0x10D and memory_off == 0 and
            size == SWITCH_TEXT_SIZE and
            compressed_size == 0x4C205C6 and
            file_off + compressed_size <= len(binary),
            "SWITCH_NSO_LAYOUT")
    require(build_id == SWITCH_BUILD_ID, "SWITCH_BUILD_ID")
    try:
        import lz4.block
    except ImportError as exc:
        raise RuntimeError(
            "DB02 native Switch verification requires local 'lz4' Python "
            "module (pip install lz4); no game file is uploaded."
        ) from exc
    decoded = lz4.block.decompress(
        binary[file_off:file_off + compressed_size],
        uncompressed_size=size)
    require(len(decoded) == SWITCH_TEXT_SIZE and
            digest_bytes(decoded) == SWITCH_TEXT_SHA,
            "SWITCH_DECOMPRESSED_TEXT_SHA")
    return decoded, build_id


def verify_switch(dump_path, nso_path):
    verify_file(dump_path, SWITCH_DUMP_SIZE, SWITCH_DUMP_SHA)
    verify_rvas(direct_rvas(dump_path), SWITCH_RVAS)
    verify_file(nso_path, SWITCH_SIZE, SWITCH_MAIN_SHA)
    text, build_id = parse_nso_text(nso_path.read_bytes())
    def read_code(rva, count):
        require(rva >= 0 and rva + count <= len(text),
                "SWITCH_TEXT_RVA_RANGE")
        return text[rva:rva + count]
    for rva in SWITCH_RVAS:
        require(len(read_code(rva, 16)) == 16, "SWITCH_METHOD_BOUNDS")
    verified = verify_code_windows(read_code, SWITCH_WINDOWS)
    return {
        "platform": "Switch", "buildIdFromNso": build_id,
        "folderGameVersionClaim": GAME_VERSION,
        "originalExeFsMainSha256": SWITCH_MAIN_SHA,
        "originalDumpSha256": SWITCH_DUMP_SHA,
        "decompressedTextSha256": SWITCH_TEXT_SHA,
        "methodRvasChecked": len(SWITCH_RVAS),
        "instructionWindowsVerified": verified,
        "nativeMachine": "aarch64-nso0",
    }


def run_audit(steam_version, steam_dump, steam_dll, switch_dump, switch_main):
    steam = verify_steam(steam_version, steam_dump, steam_dll)
    switch = verify_switch(switch_dump, switch_main)
    require(steam["methodRvasChecked"] == switch["methodRvasChecked"] == 14,
            "CROSS_PLATFORM_METHOD_SET")
    return {
        "contract": CONTRACT,
        "status": "ORIGINAL_STEAM_SWITCH_NATIVE_METHOD_EVIDENCE_PASS",
        "steam": steam,
        "switch": switch,
        "nativePercentUsesSigned32Product": True,
        "nativePercentDivisor100TruncatesTowardZero": True,
        "softCurrencySellGetterUsesDefaultWhenNoPriceFound": True,
        "totalSellMethodDelegatesToTotalIngredientsValue": True,
        "conditionalNativeBaseAndFinalSignedCapStageVerified": True,
        "recordedVersusFallbackIngredientBranchVerified": True,
        "ingredientSoftCurrencyLookupDefaultOneVerified": True,
        "sellWrapperZeroBaseAndInt32MaxDefaultVerified": True,
        "sellRecipeStarPercentageSelectorVerified": True,
        "itemCalculatorCurrencyGateFirst": True,
        "uncachedSellFormulaPathVerified": True,
        "registeredPriceDatabaseIterationVerified": True,
        "lookupFailureZeroOutAndFalseVerified": True,
        "staticSerializedProviderMissingOutOneVerified": True,
        "dynamicSerializedProviderNullCacheOutZeroVerified": True,
        "dynamicSerializedProviderMissingOutOneVerified": True,
        "dynamicDataCachedRequiresPositiveRowCountVerified": True,
        "sellFormulaCurrencyGateVerified": True,
        "sellFormulaResolvedTypeIdentityGateVerified": True,
        "sellFormulaConditionalFirstEligibleCandidateVerified": True,
        "sellFormulaFloatingResultTruncatesTowardZeroVerified": True,
        "actualSellFormulaReferenceRuntimeResolutionVerified": False,
        "actualRegisteredDatabaseIterationOrderVerified": False,
        "reportedNativeInstructionWindowsOnly": True,
        "exactIngredientPriceResolutionVerified": False,
        "completeNativeSellFormulaVerified": False,
        "perMealSalePriceCalculated": False,
        "playerSaveRead": False,
        "publishableOriginalSource": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steam-version-file", required=True, type=Path)
    parser.add_argument("--steam-dump", required=True, type=Path)
    parser.add_argument("--steam-gameassembly", required=True, type=Path)
    parser.add_argument("--switch-dump", required=True, type=Path)
    parser.add_argument("--switch-main", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        output = run_audit(
            args.steam_version_file, args.steam_dump,
            args.steam_gameassembly, args.switch_dump, args.switch_main)
        print(json.dumps(output, indent=2, ensure_ascii=False))
    except (OSError, UnicodeError, ValueError, RuntimeError) as exc:
        parser.exit(1, str(exc) + "\n")


if __name__ == "__main__":
    main()
