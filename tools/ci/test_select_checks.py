import unittest
from select_checks import classify, DOMAINS

class ScopeTests(unittest.TestCase):
    def test_docs(self):
        self.assertFalse(classify(["docs/decisions/example.md", "AGENTS.md"])["product"])
    def test_offline(self):
        p = ["tools/src-04-r2/test_example.py"]
        self.assertFalse(classify(p)["product"])
        self.assertTrue(all(classify(p, allow_offline=False).values()))
    def test_routes(self):
        result = classify(["src/routes/collection/+page.svelte"])
        self.assertTrue(result["collection"] and result["memory"] and result["product"])
        self.assertFalse(result["guide"] or result["world"] or result["save"] or result["explore"])
    def test_combined(self):
        result = classify(["src/routes/collection/+page.svelte", "src/routes/guide/+page.svelte"])
        self.assertTrue(result["collection"] and result["guide"])
        self.assertFalse(result["world"])
    def test_shared_or_unknown(self):
        for path in ["src/lib/ui/themes.css", "crates/ddv-save-schema/src/lib.rs", "static/ddv/game-db/active.json",
                     ".github/workflows/collection.yml", "tools/db-01-items/materialize-public-master.mjs",
                     "src/routes/new-service/+page.svelte", "tests/shared.test.mjs", "package.json"]:
            self.assertTrue(all(classify([path]).values()), path)
        self.assertTrue(all(classify([]).values()))
    def test_named_smoke(self):
        self.assertTrue(classify(["browser/world-graph-smoke.mjs"])["world"])
        self.assertFalse(classify(["browser/world-graph-smoke.mjs"])["guide"])

if __name__ == "__main__":
    unittest.main()
