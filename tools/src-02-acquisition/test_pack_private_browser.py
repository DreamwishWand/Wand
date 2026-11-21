import tempfile
import unittest
from pathlib import Path

from pack_private_browser import pack, refuse_public_destination


class PrivateBrowserPackTests(unittest.TestCase):
    def test_refuses_git_paths_and_existing_outputs(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            checkout = root / 'repo'
            checkout.mkdir()
            (checkout / '.git').mkdir()
            with self.assertRaisesRegex(ValueError, 'REFUSE_GIT_DIRECTORY'):
                refuse_public_destination(checkout / 'private.zip')
            existing = root / 'private.zip'
            existing.touch()
            with self.assertRaisesRegex(ValueError, 'REFUSE_OVERWRITE'):
                refuse_public_destination(existing)

    def test_requires_independent_64_hex_pin_before_node_verifier(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source'
            source.mkdir()
            with self.assertRaisesRegex(ValueError, 'BAD_INDEPENDENT_PIN'):
                pack(source, root / 'output.zip', 'untrusted')
            self.assertFalse((root / 'output.zip').exists())

    def test_does_not_pack_missing_source_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaisesRegex(ValueError, 'UNTRUSTED_SOURCE'):
                pack(root / 'missing', root / 'archive.zip', 'a' * 64)


if __name__ == '__main__':
    unittest.main()