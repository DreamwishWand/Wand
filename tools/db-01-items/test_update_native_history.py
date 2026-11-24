import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import update_native_history as h

def varint(n):
    result = bytearray()
    while n > 127:
        result.append((n & 127) | 128)
        n >>= 7
    result.append(n)
    return bytes(result)

def frame(key, item_id, name, amount=1):
    label = name.encode()
    payload = b"\x08"+varint(item_id)+b"\x12"+varint(len(label))+label+b"\x18"+varint(amount)
    return varint(key)+varint(len(payload))+payload

def fixture(root, version, build, furniture, condition):
    game = root / "game"
    directory = game / h.PREFIX
    directory.mkdir(parents=True)
    categories = ["ActivityItem","Furniture","Clothing","Condition","Mission","ItemCondition"] + [
        "Synthetic"+str(i) for i in range(33)]
    for category in categories:
        body = furniture if category == "Furniture" else condition if category == "Condition" else b""
        (directory / (category+".json")).write_bytes(body)
    (game/"FullVersion.txt").write_text("releases-v"+version+"-"+build,encoding="utf8")
    rows = []
    for path in sorted(game.rglob("*")):
        if path.is_file():
            data=path.read_bytes()
            rows.append({"path":path.relative_to(game).as_posix(),"size":len(data),"sha256":h.digest(data)})
    scan=root/"scan.json"
    pin=h.write_atomic(scan,{"schema_version":1,"status":"complete","errors":[],
        "platform":{"value":"steam"},"game_version":{"value":version,"status":"verified_from_file"},
        "files":rows})
    return game,scan,pin

class NativeHistoryTests(unittest.TestCase):
    def test_delta_and_same_version_content_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            one=fixture(root/"one","1.24.0","a",frame(0,101,"A")+frame(1,102,"B"),frame(0,201,"C"))
            old=h.update(*one)
            self.assertIsNone(old["history"]["101"]["introducedVersion"])
            self.assertEqual(len(old["delta"]["decodedCategories"]),39)
            ledger=root/"old.json";pin=h.write_atomic(ledger,old)
            two=fixture(root/"two","1.24.0","b",frame(0,101,"A",2)+frame(1,103,"D"),frame(0,201,"C"))
            with patch.object(h,"decode",wraps=h.decode) as decode:
                new=h.update(*two,ledger,pin,"content-example")
                self.assertEqual(decode.call_count,1)
            self.assertEqual(new["delta"]["newlyObservedIds"],[103])
            self.assertEqual(new["delta"]["changedFrameIds"],[101])
            self.assertEqual(new["delta"]["absentInCurrentSourceIds"],[102])
            self.assertFalse(new["history"]["102"]["presentInCurrentSource"])
            self.assertIsNone(new["history"]["101"]["introducedVersion"])
            self.assertEqual(new["history"]["103"]["introducedVersion"],"1.24.0")
            self.assertEqual(new["history"]["103"]["contentReleaseId"],"content-example")
            self.assertNotEqual(new["history"]["103"]["introducedAfterSourceScanSha256"],
                                new["history"]["103"]["introducedSourceScanSha256"])
            ledger2=root/"new.json";pin2=h.write_atomic(ledger2,new)
            three=fixture(root/"three","1.25.0","c",frame(0,101,"A",2)+frame(1,102,"B")+frame(2,103,"D"),frame(0,201,"C"))
            final=h.update(*three,ledger2,pin2)
            self.assertEqual(final["delta"]["reappearedIds"],[102])
            self.assertIsNone(final["history"]["102"]["introducedVersion"])
            self.assertEqual(final["history"]["103"]["introducedVersion"],"1.24.0")
            self.assertEqual(final["history"]["103"]["contentReleaseId"],"content-example")
            self.assertFalse(final["gameWideRemovalVerified"])
            self.assertEqual([r[0] for r in h.public_history(final)["items"]],[101,102,103,201])

    def test_source_tamper_and_coverage_loss_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            game,scan,pin=fixture(root/"one","1.26.2","a",frame(0,101,"A"),b"")
            old=h.update(game,scan,pin)
            ledger=root/"old.json";oldpin=h.write_atomic(ledger,old)
            (game/h.PREFIX/"Furniture.json").write_bytes(b"bad")
            with self.assertRaisesRegex(ValueError,"SOURCE_DIGEST"):
                h.update(game,scan,pin,ledger,oldpin)
            with self.assertRaisesRegex(ValueError,"PIN_MISMATCH"):
                h.update(game,scan,"0"*64)
            game2,scan2,pin2=fixture(root/"two","1.26.3","b",frame(0,101,"A"),b"")
            (game2/h.PREFIX/"Synthetic0.json").unlink()
            with self.assertRaisesRegex(ValueError,"SOURCE_CENSUS"):
                h.update(game2,scan2,pin2,ledger,oldpin)

if __name__=="__main__":
    unittest.main()
