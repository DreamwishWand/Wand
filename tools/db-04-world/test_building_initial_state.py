import tempfile
import unittest
from pathlib import Path

from building_initial_state import scan
from world import encode_varint


def field(n, value):
    if isinstance(value, bytes):
        return encode_varint(n * 8 + 2) + encode_varint(len(value)) + value
    return encode_varint(n * 8) + encode_varint(value)


def obj(oid, item, state):
    record = field(1, oid) + field(2, item)
    if state is not None:
        record += field(6, state)
    return field(5, field(1, oid) + field(2, record))


def layout(*objects):
    return field(1, field(2, field(2, b"GridData/Villages/Test.json") + b"".join(objects)))


class InitialBuildingStateTest(unittest.TestCase):
    def test_native_messages_and_unclassified_states(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "TestGrids.json"
            path.write_bytes(layout(
                obj(1, 20300001, field(22, field(1, b""))),
                obj(2, 20100001, field(7, field(1, b""))),
                obj(6, 20100011, field(10, b"")),
                obj(3, 20200001, field(3, field(1, b"") * 2)),
                obj(4, 20000001, None),
                obj(5, 40000001, None),
            ))
            result = scan([path])
        self.assertEqual(result["instanceCount"], 5)
        self.assertEqual(result["itemCount"], 5)
        self.assertFalse(result["runtimeCreationVerified"])
        rows = {v["itemId"]: v["instances"][0] for v in result["items"]}
        self.assertFalse(rows[20000001]["statePresent"])
        self.assertEqual(rows[20100001]["knownMessages"][0]["kind"], "FishingStallData")
        self.assertEqual(rows[20100011]["unclassifiedFields"], [10])
        self.assertEqual(rows[20200001]["knownMessages"][0]["fieldShapes"],
                         [{"field": 1, "wire": 2, "count": 2}])
        self.assertEqual(rows[20300001]["knownMessages"][0]["kind"], "BuildingWithSkinData")

    def test_duplicate_identity_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "TestGrids.json"
            path.write_bytes(layout(obj(1, 20300001, None), obj(1, 20300002, None)))
            with self.assertRaisesRegex(ValueError, "GridObject map identity"):
                scan([path])


if __name__ == "__main__":
    unittest.main()
