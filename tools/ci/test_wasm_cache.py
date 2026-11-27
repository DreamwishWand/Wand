import tempfile
import unittest
from pathlib import Path
from wasm_cache import fingerprint, write_receipt, verify_receipt, Unsupported

class WasmCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.tracked = set()
        self.put("crates/core/Cargo.toml", '[package]\nname="core"\nversion="0.1.0"\n[dependencies]\npatch={path="../patch"}')
        self.put("crates/core/src/lib.rs", 'const X: &str = include_str!("../../../data/catalog.json");')
        self.put("crates/patch/Cargo.toml", '[package]\nname="patch"\nversion="0.1.0"')
        self.put("crates/patch/src/lib.rs", 'pub fn value()->u8{1}')
        self.put("data/catalog.json", '{"id":1}')
        self.put("crates/core/Cargo.lock", 'resolved version 1', track=False)

    def put(self, name, text, track=True):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        if track:
            self.tracked.add(name)

    def key(self, version="rustc 1"):
        return fingerprint(self.root, "crates/core", "src/lib/core/wasm/pkg", "",
                           self.tracked, {"rustc": version})

    def test_exact_dependencies_and_embedded_data(self):
        before = self.key()
        self.put("src/routes/collection/+page.svelte", "unrelated UI")
        self.assertEqual(before, self.key())
        self.put("data/catalog.json", '{"id":2}')
        changed = self.key()
        self.assertNotEqual(before, changed)
        self.put("crates/patch/src/lib.rs", 'pub fn value()->u8{2}')
        self.assertNotEqual(changed, self.key())
        before = self.key()
        self.put("crates/core/Cargo.lock", "resolved version 2", track=False)
        self.assertNotEqual(before, self.key())
        self.assertNotEqual(self.key(), self.key("rustc 2"))

    def test_uncertain_inputs_disable_reuse(self):
        self.put("crates/core/src/lib.rs", 'const X: &str = include_str!(concat!("data/", "x"));')
        with self.assertRaises(Unsupported):
            self.key()
        self.put("crates/core/src/lib.rs", 'const X: &str = include_str!("../../../data/catalog.json");')
        self.put("crates/patch/build.rs", 'fn main(){}')
        with self.assertRaises(Unsupported):
            self.key()

    def test_invalid_package_never_reused(self):
        out = self.root / "pkg"
        out.mkdir()
        (out / "core_bg.wasm").write_bytes(b"\0asm\1\0\0\0")
        (out / "core.js").write_text("generated")
        (out / "core.d.ts").write_text("generated types")
        write_receipt(out, "key-1")
        self.assertTrue(verify_receipt(out, "key-1"))
        self.assertFalse(verify_receipt(out, "key-2"))
        (out / "core.js").write_text("altered")
        self.assertFalse(verify_receipt(out, "key-1"))
        (out / "core_bg.wasm").unlink()
        self.assertFalse(verify_receipt(out, "key-1"))

if __name__ == "__main__":
    unittest.main()
