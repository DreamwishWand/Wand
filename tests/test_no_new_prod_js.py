"""Git fixture checks for the no-new-production-JS architecture gate."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "tools/ci/check_no_new_prod_js.py"
spec = importlib.util.spec_from_file_location("architecture_guard", SCRIPT)
assert spec is not None and spec.loader is not None
architecture_guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(architecture_guard)


class ArchitectureGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.run_git("init", "-q")
        self.run_git("config", "user.email", "ci@example.test")
        self.run_git("config", "user.name", "CI Fixture")
        self.write("src/lib/legacy.mjs", "export const old = 1;\n")
        self.write("src/lib/a.ts", "export const a: number = 1;\n")
        self.commit()
        self.base = self.run_git("rev-parse", "HEAD").strip()

    def run_git(self, *args: str) -> str:
        return subprocess.check_output(["git", *args], cwd=self.root, text=True)

    def write(self, path: str, content: str) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def commit(self) -> str:
        self.run_git("add", "-A")
        self.run_git("commit", "-qm", "fixture")
        return self.run_git("rev-parse", "HEAD").strip()

    def violations(self) -> list[str]:
        head = self.commit()
        old_cwd = Path.cwd()
        import os
        try:
            os.chdir(self.root)
            return architecture_guard.check(self.base, head)
        finally:
            os.chdir(old_cwd)

    def test_new_production_js_is_rejected(self) -> None:
        self.write("src/lib/new-worker.mjs", "export const x = 1;\n")
        self.assertIn("NEW production JavaScript", "\n".join(self.violations()))

    def test_existing_production_js_growth_is_rejected(self) -> None:
        self.write("src/lib/legacy.mjs", "export const old = 1;\nexport const newFeature = 2;\n")
        self.assertIn("GROWING legacy JavaScript", "\n".join(self.violations()))

    def test_existing_production_js_reduction_is_allowed(self) -> None:
        self.write("src/lib/legacy.mjs", "export {};\n")
        self.assertEqual([], self.violations())

    def test_typescript_and_rust_are_allowed(self) -> None:
        self.write("src/lib/new.ts", "export const value: number = 42;\n")
        self.write("crates/example/src/lib.rs", "pub fn value() -> i32 { 42 }\n")
        self.assertEqual([], self.violations())

    def test_test_and_build_js_are_allowed(self) -> None:
        self.write("src/lib/feature.test.mjs", "export const test = true;\n")
        self.write("tests/browser-smoke.mjs", "export const smoke = true;\n")
        self.write("vite.config.js", "export default {};\n")
        self.assertEqual([], self.violations())

    def test_generated_wasm_bindings_are_allowed(self) -> None:
        self.write("src/lib/collection/wasm/pkg/wand_collection_core.js", "export function init() {}\n")
        self.write("src/lib/save/wasm/p1g-pkg/ddv_p1g_codec.js", "export function init() {}\n")
        self.assertEqual([], self.violations())

    def test_non_generated_js_under_wasm_is_rejected(self) -> None:
        self.write("src/lib/collection/wasm/custom-worker.mjs", "export const feature = true;\n")
        self.assertIn("NEW production JavaScript", "\n".join(self.violations()))

    def test_test_file_renamed_to_production_is_rejected(self) -> None:
        self.write("src/lib/feature.test.mjs", "export const test = true;\n")
        self.commit()
        (self.root / "src/lib/feature.test.mjs").rename(self.root / "src/lib/feature.mjs")
        self.assertIn("NEW production JavaScript", "\n".join(self.violations()))


if __name__ == "__main__":
    unittest.main()
