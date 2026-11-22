"""Exact committed, source-hashed Guide reward Item labels are reproducible."""
import unittest
from pathlib import Path
from guide_event_item_labels import produce, BASE, OUT, digest, OUTPUT_SHA


class EventItemLabelsTests(unittest.TestCase):
    def test_current_source_exact_release(self):
        generated = produce(BASE)
        published = (BASE / OUT).read_bytes()
        self.assertEqual(generated, published)
        self.assertEqual(digest(generated), OUTPUT_SHA)
        self.assertEqual(len(generated), 29585)

    def test_fails_on_missing_complete_source(self):
        # This exporter must not infer catalog membership when source files are absent.
        with self.assertRaises(FileNotFoundError):
            produce(Path('/nonexistent-db03-source-dir'))


if __name__ == '__main__':
    unittest.main()