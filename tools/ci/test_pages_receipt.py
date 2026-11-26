import json
import tempfile
import unittest
from pathlib import Path
from pages_receipt import artifact, metadata, verify_deployment, RECEIPT

class PagesReceiptTests(unittest.TestCase):
    def test_artifact_and_deployment(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            build, source = root / "build", root / "static"
            def put(path, data):
                if not isinstance(data, bytes):
                    data = json.dumps(data).encode()
                for target in (build, source):
                    dest = target / path
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(data)
                return metadata(data)
            for route in ("collection", "guide", "guide/quests", "guide/characters", "guide/star-path",
                          "guide/events", "guide/source", "guide/systems", "save/diagnostics"):
                put(route + "/index.html", b'<!DOCTYPE html>Collection noindex class="timeline-panel" class="guide-sections" class="event-guide"')
            put("_app/test.wasm", b"\0asm")
            directory = "ddv/game-db/releases/test"
            shard = put(directory + "/items.json", b"[]")
            search = put(directory + "/search.json", b"[]")
            index = put(directory + "/index.json", {
                "schema": "wand.game-db.release@1", "id": "test", "target": {"gameVersion": "2.0"},
                "count": 1, "shards": [{"file": "items.json", "count": 1, **shard}],
                "search": [{"file": "search.json", **search}]
            })
            put("ddv/game-db/active.json", {
                "schema": "wand.game-db.active@1", "kind": "db_snapshot", "snapshot": "test",
                "path": directory, "indexSha256": index["sha256"], "target": {"gameVersion": "2.0"}
            })
            for name, schema, key in (
                ("quest-index.json", "wand.db03.public-guide-quests@1", "detailFiles"),
                ("quest-targets-index.json", "wand.db03.public-quest-targets@1", "partFiles"),
            ):
                part = name.replace("-index", "-part")
                info = put("guide/public/" + part, b"[]")
                put("guide/public/" + name, {"schema": schema, key: {part: info}})
            put("ddv/sample.webp", b"RIFF0000WEBPdata")
            put("ddv/collection/item-images-r39.json", {
                "versionParityVerified": False, "matched": 1, "items": {"1": "ddv/sample.webp"}
            })
            commit = "a" * 40
            receipt = artifact(build, source, commit)
            self.assertEqual(receipt["commit"], commit)
            fetch = lambda path: (build / path).read_bytes()
            verify_deployment("https://example.invalid", commit, fetch)
            with self.assertRaisesRegex(ValueError, "expected commit"):
                verify_deployment("https://example.invalid", "b" * 40, fetch)
            (build / "guide/index.html").write_bytes(b"stale")
            with self.assertRaisesRegex(ValueError, "Deployed file mismatch"):
                verify_deployment("https://example.invalid", commit, fetch)
            with self.assertRaisesRegex(ValueError, "Route marker"):
                artifact(build, source, commit)

if __name__ == "__main__":
    unittest.main()
