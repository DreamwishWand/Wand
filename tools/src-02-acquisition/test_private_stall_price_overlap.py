"""CI tests use only synthetic non-proprietary blobs, never private game data."""
import pathlib
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import audit_private_stall_price_overlap as audit


class PrivateShopPriceAuditTest(unittest.TestCase):
    def test_source_hash_pins_cannot_be_forged_by_manifest(self):
        self.assertEqual(audit.R5_MANIFEST,
          'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c')
        self.assertEqual(audit.PRICE_MANIFEST,
          '641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975')
        self.assertEqual(len(audit.R5_ZIP),64)
        self.assertEqual(len(audit.PRICE_ZIP),64)

    def test_missing_and_fake_source_archive_rejected_before_parsing(self):
        with tempfile.TemporaryDirectory() as path:
            file=pathlib.Path(path)/'fake.zip'
            with self.assertRaisesRegex(ValueError,'SOURCE_FILE'):
                audit.read_release(file,audit.R5_ZIP,audit.R5_MANIFEST,audit.R5_FILES)
            with zipfile.ZipFile(file,'w') as z:
                z.writestr('manifest.json','{}')
            with self.assertRaisesRegex(ValueError,'ZIP_SHA'):
                audit.read_release(file,audit.R5_ZIP,audit.R5_MANIFEST,audit.R5_FILES)

    def test_no_synthetic_prices_promoted_to_valid_source(self):
        with self.assertRaisesRegex(ValueError,'SOURCE_COUNTS'):
            audit.analyze([],[],[],[],[])

    def test_observed_census_requires_matching_native_shop_keys(self):
        # A full census of fabricated rows is still rejected by source validation.
        stalls=[{'stallId':n,'shopDataKey':'example'} for n in range(1,66)]
        shops=[{'shopKey':'example'+str(n),'slots':[]} for n in range(44)]
        prices=[{'itemId':n} for n in range(1,989)]
        links=[{'stallId':n,'shopKey':'wrong'} for n in range(1,66)]
        with self.assertRaisesRegex(ValueError,'STALL_KEY'):
            audit.analyze(stalls,[],prices,shops,links)


if __name__=='__main__':
    unittest.main()
