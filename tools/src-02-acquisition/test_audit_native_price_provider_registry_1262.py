"""Synthetic, source-independent DB-02 price-provider uniqueness tests."""
import unittest

from audit_native_sell_formula_source import fields
from audit_native_price_provider_registry_1262 import (
    audit, scan_item_prices,
)


def varint(value):
    if not isinstance(value, int) or value < 0:
        raise ValueError('invalid test value')
    b = bytearray()
    while value > 127:
        b.append((value & 127) | 128)
        value >>= 7
    b.append(value)
    return bytes(b)


def field(number, value, wire=0):
    header = varint((number << 3) | wire)
    return header + (varint(len(value)) + value if wire == 2 else varint(value))


def row(item_id, buy=False, sell_costs=()):
    data = field(1, item_id)
    if buy:
        data += field(2, field(1, 80000000), 2)
    for currency, amount in sell_costs:
        cost = field(1, currency)
        if amount is not None:
            cost += field(2, amount)
        data += field(3, cost, 2)
    return fields(field(1, data, 2))[0]


class PriceProviderUniquenessTests(unittest.TestCase):
    def test_disjoint_providers_and_multiple_currencies(self):
        ids, costs = set(), set()
        a = scan_item_prices([
            row(31000001, buy=True, sell_costs=((80000000, 15),
                                                 (80000001, 21)))
        ], ids, costs)
        b = scan_item_prices([
            row(31100002, sell_costs=((80000000, 40),))
        ], ids, costs)
        self.assertEqual(len(ids), 2)
        self.assertEqual(len(costs), 3)
        self.assertEqual(a['sellCurrencyRecords'], 2)
        self.assertEqual(b['explicitSellAmountFields'], 1)

    def test_rejects_provider_duplicate_item_id(self):
        ids, costs = set(), set()
        scan_item_prices([row(30200001, sell_costs=((80000000, 8),))],
                         ids, costs)
        with self.assertRaisesRegex(ValueError, 'ITEM_ID_COLLISION'):
            scan_item_prices([row(30200001, buy=True)], ids, costs)

    def test_missing_source_amount_remains_missing(self):
        ids, costs = set(), set()
        c = scan_item_prices([row(31000002,
                                  sell_costs=((80000000, None),))],
                             ids, costs)
        self.assertEqual(c['omittedSellAmountFields'], 1)
        self.assertEqual(c['explicitSellAmountFields'], 0)
        self.assertEqual(c['sellRows'], 1)

    def test_duplicate_currency_in_one_item_fails(self):
        with self.assertRaisesRegex(ValueError,
                                    'DUPLICATE_OR_INVALID_SELL_CURRENCY'):
            scan_item_prices([row(30000001,
                                  sell_costs=((80000000, 2),
                                              (80000000, 4)))],
                             set(), set())

    def test_purchase_only_is_not_sell_row(self):
        counts = scan_item_prices([row(30000001, buy=True)],
                                  set(), set())
        self.assertEqual(counts['rows'], 1)
        self.assertEqual(counts['sellRows'], 0)
        self.assertEqual(counts['buyRows'], 1)

    def test_empty_and_invalid_id_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'EMPTY_ITEM_PRICES'):
            scan_item_prices([row(30000001)], set(), set())
        with self.assertRaisesRegex(ValueError, 'INVALID_ITEM_ID'):
            scan_item_prices([row(0, buy=True)], set(), set())

    def test_untrusted_original_rejected(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_PROTO_SHA'):
            audit(b'synthetic')


if __name__ == '__main__':
    unittest.main()
