"""Synthetic tests: separate absent provider row from absent Amount wire field."""
import unittest

from audit_fixed_ingredient_price_source_gap_1262 import (
    audit, classify_fixed_ingredient_price_rows, fixed_ingredient_ids,
    native_provider_row_by_id,
)


class FixedIngredientPriceSourceGapTests(unittest.TestCase):
    def test_all_source_gap_types_are_separate(self):
        ids = {30200001, 30200002, 31000001, 31000002,
               31100001, 31100002}
        source = {
            30200001: [(80000000, True)],
            30200002: [(80000000, False)],
            31000001: [(80000001, True)],
            31100001: [],
        }
        actual = classify_fixed_ingredient_price_rows(ids, source)
        self.assertEqual(actual[302]['soft_sell_amount_explicit'], 1)
        self.assertEqual(actual[302]['soft_sell_amount_field_omitted'], 1)
        self.assertEqual(actual[310]['row_without_soft_sell_currency'], 1)
        self.assertEqual(actual[310]['no_source_price_row'], 1)
        self.assertEqual(actual[311]['row_without_soft_sell_currency'], 1)
        self.assertEqual(actual[311]['no_source_price_row'], 1)

    def test_no_source_row_is_not_zero_or_an_omitted_amount(self):
        actual = classify_fixed_ingredient_price_rows(
            {31100003}, {})
        self.assertEqual(actual[311]['no_source_price_row'], 1)
        self.assertEqual(actual[311]['soft_sell_amount_field_omitted'], 0)

    def test_rejects_duplicate_currency_in_source_row(self):
        with self.assertRaisesRegex(ValueError, 'INVALID_SOURCE_PRICE_ROW'):
            classify_fixed_ingredient_price_rows(
                {30200001}, {30200001: [
                    (80000000, True), (80000000, False)
                ]})

    def test_rejects_unsupported_ingredient_family(self):
        with self.assertRaisesRegex(ValueError, 'UNSUPPORTED_ITEM_FAMILY'):
            classify_fixed_ingredient_price_rows({30300005}, {})

    def test_rejects_malformed_row_and_id(self):
        with self.assertRaisesRegex(ValueError, 'INVALID_SOURCE_PRICE_ROW'):
            classify_fixed_ingredient_price_rows({30200001},
                                                 {30200001: [(0, True)]})
        with self.assertRaisesRegex(ValueError, 'INVALID_INPUT'):
            classify_fixed_ingredient_price_rows([], {})

    def test_original_sources_are_mandatory(self):
        with self.assertRaisesRegex(ValueError, 'R5_MANIFEST_SHA'):
            fixed_ingredient_ids(b'{}', b'')
        with self.assertRaisesRegex(ValueError, 'PROTO_SHA'):
            native_provider_row_by_id(b'not original')
        with self.assertRaisesRegex(ValueError, 'R5_MANIFEST_SHA'):
            audit(b'{}', b'', b'')


if __name__ == '__main__':
    unittest.main()
