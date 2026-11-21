"""Synthetic tests for optional, source-backed private Capstone x86-64 decoding."""
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

from disassemble_native_pe import (
    disassemble_private_windows, validate_disassembly_report,
    write_private_disassembly,
)

try:
    import capstone  # optional in local execution; explicitly installed in CI
except ImportError:
    capstone = None


def source_report(code=None):
    if code is None:
        code = bytes((0xe8, 0, 0, 0, 0, 0xc3)) + b"\x90" * 58
    return {
        "schema": "wand.db04.native-pe-evidence@1",
        "status": "version_asserted_il2cpp_rva_byte_windows_captured",
        "gameVersion": "1.26.2",
        "dllSizeBytes": 4096,
        "dllSha256": "2" * 64,
        "peMachine": "AMD64",
        "executableSectionCount": 1,
        "sourceRvaMappingVerified": True,
        "nativeCodeBodyVerified": False,
        "disassemblyVerified": False,
        "nativeFloorIndexToXYVerified": False,
        "nativeFootprintRotationVerified": False,
        "placementLegalityVerified": False,
        "rawMethodWindowSize": len(code),
        "dumpCsSha256": "1" * 64,
        "dumpCsVersionAssertion": "1.26.2",
        "peUnwindStartCorroborated": True,
        "peUnwindTableSha256": "3" * 64,
        "peUnwindRecordCount": 1,
        "methodWindows": [{
            "symbol": "Definitions.Grid.GridData.get_Item",
            "rva": 0x1020,
            "fileOffset": 0x420,
            "sectionName": ".text",
            "windowLength": len(code),
            "windowSha256": hashlib.sha256(code).hexdigest(),
            "rawWindowHex": code.hex(),
            "windowIsEntireMethod": False,
            "codeSemanticsVerified": False,
            "peUnwindStartCorroborated": True,
            "peUnwindFunctionEndRva": 0x1020 + len(code),
        }],
    }


@unittest.skipUnless(capstone is not None, "optional Capstone not installed")
class NativeWindowDisassemblyTests(unittest.TestCase):
    def test_source_matched_prefix_and_control_flow_hints_are_not_semantic_proof(self):
        source = source_report()
        disassembly = disassemble_private_windows(source)
        self.assertEqual(disassembly["gameVersion"], "1.26.2")
        self.assertEqual(disassembly["engineVersion"], "5.0.9")
        window = disassembly["methodWindows"][0]
        self.assertEqual(window["sourceWindowSha256"],
                         source["methodWindows"][0]["windowSha256"])
        self.assertEqual(window["decodedPrefixBytes"], 64)
        self.assertEqual(window["undecodedTrailingBytes"], 0)
        self.assertEqual(window["instructionCount"], 60)
        self.assertEqual(window["instructions"][0]["bytesHex"], "e800000000")
        self.assertEqual(window["instructions"][0]["controlFlowKind"], "call")
        self.assertEqual(window["instructions"][1]["controlFlowKind"], "return")
        self.assertEqual(window["instructions"][0]["rva"], 0x1020)
        self.assertEqual(window["instructions"][0]["fileOffset"], 0x420)
        self.assertFalse(disassembly["nativeControlFlowVerified"])
        self.assertFalse(disassembly["nativeCodeBodyVerified"])
        self.assertFalse(disassembly["placementLegalityVerified"])
        validate_disassembly_report(disassembly, source)

    def test_changed_source_sha_or_instruction_byte_is_rejected(self):
        original = source_report()
        report = disassemble_private_windows(original)
        changed = copy.deepcopy(report)
        changed["methodWindows"][0]["instructions"][0]["bytesHex"] = "9000000000"
        with self.assertRaisesRegex(ValueError, "instruction/source mismatch"):
            validate_disassembly_report(changed, original)
        changed = copy.deepcopy(report)
        changed["nativeFootprintRotationVerified"] = True
        with self.assertRaisesRegex(ValueError, "verification claim"):
            validate_disassembly_report(changed, original)
        changed = copy.deepcopy(report)
        changed["engineVersion"] = "4.0.2"
        with self.assertRaisesRegex(ValueError, "source/engine mismatch"):
            validate_disassembly_report(changed, original)
        other = source_report(code=b"\x90" * 64)
        with self.assertRaisesRegex(ValueError, "source/engine mismatch"):
            validate_disassembly_report(report, other)

    def test_metadata_only_and_filesystem_git_worktree_cannot_be_disassembled(self):
        source = source_report()
        source["methodWindows"] = []
        source["sourceRvaMappingVerified"] = False
        source["status"] = "pe64_binary_identified_no_version_matched_dump"
        del source["dumpCsSha256"]
        del source["dumpCsVersionAssertion"]
        with self.assertRaisesRegex(ValueError, "original-source-correlated"):
            disassemble_private_windows(source)

        valid = source_report()
        report = disassemble_private_windows(valid)
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "private.json"
            write_private_disassembly(report, valid, target)
            self.assertTrue(target.is_file())
            with self.assertRaisesRegex(ValueError, "new JSON destination"):
                write_private_disassembly(report, valid, target)
            git = Path(directory) / "repo"
            (git / ".git").mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, "cannot enter Git"):
                write_private_disassembly(report, valid, git / "private.json")


if __name__ == "__main__":
    unittest.main()
