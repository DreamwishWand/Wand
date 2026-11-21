"""Synthetic-only regression tests: no game originals or private outputs in Git."""
import io
from pathlib import Path
import sys
import unittest
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parent))
import protodb_shop_prices as shop


def vi(x):
    require=bytearray()
    while x > 127:
        require.append((x&127)|128)
        x >>= 7
    require.append(x)
    return bytes(require)


def fv(n, value):
    return vi(n << 3) + vi(value)


def fb(n, value):
    return vi((n << 3) | 2) + vi(len(value)) + value


class ProtoShopPricesTest(unittest.TestCase):
    def test_cost_preserves_absence_of_amount(self):
        absent=shop.cost(fv(1,80000000))
        self.assertEqual(absent['amount'],None)
        self.assertFalse(absent['amountFieldPresent'])
        zero=shop.cost(fv(1,80000000)+fv(2,0))
        self.assertEqual(zero['amount'],0)
        self.assertTrue(zero['amountFieldPresent'])
        with self.assertRaisesRegex(ValueError,'MISSING_REQUIRED_FIELD'):
            shop.cost(fv(2,15))

    def test_static_prices_do_not_mix_purchase_sell(self):
        inner=(fv(1,1234)+fb(2,fv(1,80000000)+fv(2,200))+
               fb(2,fv(1,80100000)+fv(2,5))+
               fb(3,fv(1,80000000)+fv(2,10)))
        rows=shop.parse_prices('synthetic_prices',7,fb(1,inner))
        self.assertEqual(len(rows),1)
        self.assertEqual([x['amount'] for x in rows[0]['purchaseCostDefinitions']],[200,5])
        self.assertEqual(rows[0]['sellValueDefinitions'][0]['amount'],10)
        self.assertFalse(rows[0]['currentShopPriceVerified'])
        self.assertFalse(rows[0]['currentPurchaseEligibilityVerified'])
        with self.assertRaisesRegex(ValueError,'PRICE_DUPLICATE_CURRENCY'):
            shop.parse_prices('synthetic_prices',7,fb(1,fv(1,1)+
                fb(2,fv(1,10)+fv(2,1))+fb(2,fv(1,10)+fv(2,2))))

    def test_shop_slots_are_not_live_stock(self):
        first=fb(1,fv(4,80000000)+fb(2,b'fatigue'))
        second=fb(1,fv(4,80000000))
        row=shop.parse_shop('TestShop',13,first+second+fb(3,fv(1,80000000)+fv(2,25)))
        self.assertEqual(row['slotCount'],2)
        self.assertEqual(row['refreshCost']['amount'],25)
        self.assertFalse(row['currentOffersVerified'])
        self.assertFalse(row['stockVerified'])
        self.assertIsNone(row['slots'][1]['fatigueSourceSha256'])

    def test_fail_closed_no_original_or_forged_zip(self):
        with self.assertRaisesRegex(ValueError,'PROTODB_SOURCE_SHA'):
            shop.parse_proto(fb(1,b'fixture'))
        with self.assertRaisesRegex(ValueError,'R5_ZIP_SHA'):
            shop.private_stalls(b'fake')
        with self.assertRaisesRegex(ValueError,'NONCANONICAL_VARINT'):
            shop.fields(bytes([8,128,0]))
        with self.assertRaisesRegex(ValueError,'TRUNCATED_LENGTH'):
            shop.fields(bytes([10,9,1]))

    def test_source_constants_are_pinned(self):
        self.assertEqual(shop.SCHEMA,'wand.db02.protodb-shops@1')
        self.assertEqual(len(shop.PROTO_SHA),64)
        self.assertEqual(len(shop.R5_ZIP_SHA),64)
        self.assertEqual(len(shop.R5_MANIFEST_SHA),64)


if __name__ == '__main__':
    unittest.main()
