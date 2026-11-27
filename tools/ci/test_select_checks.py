import unittest
from select_checks import classify, DOMAINS, source_checks, publication_checks

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
    def test_source_gate_selection(self):
        self.assertTrue(source_checks(["tools/src-04-r2/test_example.py"])["r2"])
        self.assertFalse(source_checks(["tools/src-04-r2/test_example.py"])["db05"])
        self.assertTrue(source_checks(["crates/wand-acquisition-core/src/lib.rs"])["acquisition"])
        self.assertTrue(source_checks(["src/lib/save/new.ts"])["db05"])
        self.assertTrue(source_checks(["tests/world-new.test.mjs"])["db04"])
        self.assertTrue(all(source_checks(["tools/ci/select_checks.py"]).values()))
        self.assertTrue(all(source_checks([], full=True).values()))
        self.assertFalse(any(source_checks(["README.md"]).values()))
    def test_photo_publication_scope(self):
        for path in ("tools/photo-mode/prepare_companion_delta.py",
                     "src/lib/photo-mode/pages-preview.ts",
                     "browser/photo-mode-smoke.mjs", "static/photo-mode-preview/index.json"):
            self.assertTrue(publication_checks([path]), path)
        self.assertFalse(publication_checks(["src/routes/guide/+page.svelte"]))
    def test_named_smoke(self):
        self.assertTrue(classify(["browser/world-graph-smoke.mjs"])["world"])
        self.assertFalse(classify(["browser/world-graph-smoke.mjs"])["guide"])

if __name__ == "__main__":
    unittest.main()
