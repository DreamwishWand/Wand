import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from select_checks import isolated_unit_files, source_checks
from run_unit_tests import selected_files

class UnitSelectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        for name in ("a", "b"):
            self.write("tests/" + name + ".test.mjs", "export {}")
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)

    def write(self, path, data):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(data, encoding="utf-8")

    def test_selection(self):
        a = "tests/a.test.mjs"
        self.assertEqual(isolated_unit_files([a], self.root), [a])
        self.assertEqual(selected_files(json.dumps([a]), self.root), [a])
        self.assertEqual(len(selected_files("[]", self.root)), 2)
        self.assertEqual(isolated_unit_files([a, "src/lib/shared.ts"], self.root), [])
        self.assertEqual(isolated_unit_files(["tests/deleted.test.mjs"], self.root), [])
        self.write("tests/b.test.mjs", 'import "./a.test.mjs";')
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        self.assertEqual(isolated_unit_files([a], self.root), [])

    def test_invalid_paths(self):
        for value in ('["../a.test.mjs"]', '["tests/deleted.test.mjs"]', '["tests/a.test.mjs","tests/a.test.mjs"]'):
            with self.assertRaises(ValueError):
                selected_files(value, self.root)

    def test_save_dependency(self):
        self.assertTrue(source_checks(["static/ddv/world/steam-1.26.2/room-terrain.json"])["db05"])
        self.assertTrue(source_checks(["src/lib/world/fence-family-candidates.json"])["db05"])

if __name__ == "__main__":
    unittest.main()
