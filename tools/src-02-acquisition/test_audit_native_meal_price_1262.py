#!/usr/bin/env python3
"""DB-02 synthetic-only tests; real Steam/Switch files stay owner-private."""
import hashlib
from pathlib import Path
import tempfile
import unittest

import audit_native_meal_price_1262 as audit
from test_native_meal_price_probe import synthetic_dump


class NativeCrossPlatformMathTests(unittest.TestCase):
    def test_owner_qualified_direct_rvas_are_extracted(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic.cs"
            path.write_text(synthetic_dump(), encoding="utf-8")
            values = audit.direct_rvas(path)
            self.assertEqual(len(values), 8)
            self.assertEqual(values[0], 0x2100)
            self.assertEqual(values[-1], 0x2800)
            with self.assertRaisesRegex(ValueError, "METHOD_RVA_MISMATCH"):
                audit.verify_rvas(values, audit.STEAM_RVAS)

    def test_truncated_native_method_metadata_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic.cs"
            path.write_text(synthetic_dump().split("// RVA:", 1)[0])
            with self.assertRaisesRegex(ValueError,
                                        "INCOMPLETE_METHOD_SIGNATURES"):
                audit.direct_rvas(path)

    def test_code_window_digest_is_byte_exact(self):
        code = b"\x90\x44\x55\xcc"
        sig = hashlib.sha256(code[1:3]).hexdigest()
        evidence = [("synthetic_arithmetic", 1, 2, sig)]
        self.assertEqual(
            audit.verify_code_windows(lambda at,n:code[at:at+n], evidence),
            ["synthetic_arithmetic"])
        with self.assertRaisesRegex(ValueError, "CODE_WINDOW_"):
            audit.verify_code_windows(
                lambda at,n:code[at:at+n], [("synthetic_arithmetic",1,2,"0"*64)])

    def test_untrusted_source_bytes_cannot_impersonate_original(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fake.dll"
            path.write_bytes(b"MZ" + b"\x00" * 10)
            with self.assertRaisesRegex(ValueError, "ORIGINAL_SIZE_MISMATCH"):
                audit.verify_file(path, audit.STEAM_SIZE, audit.STEAM_DLL_SHA)
            with self.assertRaisesRegex(ValueError, "ORIGINAL_SHA_MISMATCH"):
                audit.verify_file(path, 12, audit.STEAM_DLL_SHA)

    def test_invalid_switch_nso_rejected_prior_to_lz4(self):
        with self.assertRaisesRegex(ValueError, "SWITCH_BINARY_SIZE"):
            audit.parse_nso_text(b"NSO0")
        fake = bytearray(audit.SWITCH_SIZE)
        with self.assertRaisesRegex(ValueError, "SWITCH_NSO_MAGIC"):
            audit.parse_nso_text(fake)

    def test_shas_and_target_tables_remain_explicit(self):
        self.assertEqual(audit.CONTRACT,
                         "wand.db02.native-meal-price-cross-platform@1")
        self.assertEqual(len(audit.STEAM_RVAS), 8)
        self.assertEqual(len(audit.SWITCH_RVAS), 8)
        self.assertNotEqual(audit.STEAM_RVAS, audit.SWITCH_RVAS)
        self.assertEqual(len(audit.STEAM_WINDOWS), 20)
        self.assertEqual(len(audit.SWITCH_WINDOWS), 17)
        for windows in (audit.STEAM_WINDOWS, audit.SWITCH_WINDOWS):
            names = {window[0] for window in windows}
            self.assertTrue({
                "base_and_default_setup", "conditional_base_callback",
                "signed32_component_accumulation",
                "signed32_final_upper_bound",
                "get_sell_recorded_or_fallback",
                "lowest_price_ingredient_default_one",
                "recorded_price_tuple_default_one",
                "sell_star_percentage_selector",
                "direct_calculator_currency_gate",
                "direct_calculator_sale_return",
                "uncached_formula_gate",
                "uncached_formula_price_call",
                "registered_price_database_dispatch",
                "final_lookup_failure_zero"
            }.issubset(names))
        self.assertTrue(all(len(s)==64
                            for s in (audit.STEAM_DLL_SHA,
                                      audit.SWITCH_MAIN_SHA,
                                      audit.SWITCH_TEXT_SHA)))
        self.assertTrue(all(len(w[3]) == 64
                            for w in (*audit.STEAM_WINDOWS,
                                      *audit.SWITCH_WINDOWS)))


if __name__ == "__main__":
    unittest.main()
