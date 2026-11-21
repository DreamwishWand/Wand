#!/usr/bin/env python3
"""Disassemble source-pinned PRIVATE GameAssembly method BYTE WINDOWS, not methods.

Requires optional Capstone 5.0.9. Original DLL, dump.cs, and any real bytes
never enter Git. This produces an incomplete linear x86-64 disassembly for
manual research, NOT evidence of native logic, control-flow completeness,
function length, rotation, collision, or placement permission.
"""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

from native_pe_evidence import validate_private_report
from verify_bundle import read_json, validate_snapshot

SCHEMA = "wand.db04.native-disassembly@1"
MAX_INSTRUCTIONS = 20_480
MAX_REPORT_BYTES = 8 * 1024 * 1024
ENGINE_VERSION = "5.0.9"


def _source_sha(report):
    return hashlib.sha256(
        json.dumps(report, sort_keys=True, separators=(",", ":"),
                   ensure_ascii=False).encode("utf-8")).hexdigest()


def _capstone():
    try:
        import capstone
    except ImportError as error:
        raise RuntimeError(
            "Optional Capstone==5.0.9 is required for private native "
            "disassembly") from error
    # The Python package's distribution release is what we pin. The module's
    # __version__ is a native core version and need not match that release.
    from importlib.metadata import version
    if version("capstone") != ENGINE_VERSION:
        raise RuntimeError(
            "Unsupported Capstone distribution version: require pinned 5.0.9")
    return capstone


def disassemble_private_windows(native_pe_report, *, engine=None):
    """Decode a contiguous prefix of each bounded original PE byte window."""
    source = validate_private_report(native_pe_report)
    if source["status"] not in (
            "version_asserted_il2cpp_rva_byte_windows_captured",
            "original_metadata_v31_native_method_windows_captured"):
        raise ValueError("original-source-correlated native method windows required")
    cs = engine if engine is not None else _capstone()
    decoder = cs.Cs(cs.CS_ARCH_X86, cs.CS_MODE_64)
    decoder.detail = True
    result = []
    total = 0
    for window in source["methodWindows"]:
        native_bytes = bytes.fromhex(window["rawWindowHex"])
        instructions = []
        decoded = 0
        for ins in decoder.disasm(native_bytes, window["rva"]):
            if total >= MAX_INSTRUCTIONS:
                raise ValueError("native instruction count limit reached")
            if ins.address != window["rva"] + decoded or not (
                    1 <= ins.size <= 15):
                raise ValueError("disassembly address or instruction size mismatch")
            observed = native_bytes[decoded:decoded + ins.size]
            if observed != bytes(ins.bytes):
                raise ValueError("disassembler bytes mismatch original private source")
            if ins.group(cs.CS_GRP_CALL):
                control = "call"
            elif ins.group(cs.CS_GRP_JUMP):
                control = "jump"
            elif ins.group(cs.CS_GRP_RET):
                control = "return"
            else:
                control = "other"
            instructions.append({
                "rva": ins.address,
                "fileOffset": window["fileOffset"] + decoded,
                "size": ins.size, "bytesHex": observed.hex(),
                "mnemonic": ins.mnemonic[:48],
                "operands": ins.op_str[:256],
                "controlFlowKind": control,
                "machineCodeSemanticsVerified": False,
            })
            decoded += ins.size
            total += 1
        result.append({
            "symbol": window["symbol"],
            "windowRva": window["rva"],
            "windowFileOffset": window["fileOffset"],
            "sourceWindowSha256": window["windowSha256"],
            "sourceWindowLength": len(native_bytes),
            "decodedPrefixBytes": decoded,
            "undecodedTrailingBytes": len(native_bytes) - decoded,
            "instructionCount": len(instructions),
            "instructionWindowMayIncludeNeighboringFunctions": True,
            "nativeFunctionBoundaryVerified": False,
            "instructions": instructions,
        })
    report = {
        "schema": SCHEMA,
        "status": "partial_native_window_disassembly_not_semantics",
        "gameVersion": source["gameVersion"],
        "originalDllSha256": source["dllSha256"],
        "nativePEEvidenceSha256": _source_sha(source),
        "engine": "capstone",
        "engineVersion": ENGINE_VERSION,
        "architecture": "x86_64",
        "totalInstructions": total,
        "methodWindows": result,
        "nativeFunctionBoundaryVerified": False,
        "nativeControlFlowVerified": False,
        "nativeCodeBodyVerified": False,
        "nativeFloorIndexToXYVerified": False,
        "nativeFootprintRotationVerified": False,
        "placementLegalityVerified": False,
    }
    return validate_disassembly_report(report, source)


def validate_disassembly_report(report, native_pe_report):
    """Check original-byte prefix continuity and all unverified claims."""
    source = validate_private_report(native_pe_report)
    if not isinstance(report, dict) or report.get("schema") != SCHEMA or (
            report.get("status") !=
            "partial_native_window_disassembly_not_semantics"):
        raise ValueError("invalid private native disassembly schema/status")
    if (report.get("gameVersion") != source["gameVersion"] or
            report.get("originalDllSha256") != source["dllSha256"] or
            report.get("nativePEEvidenceSha256") != _source_sha(source) or
            report.get("engine") != "capstone" or
            report.get("engineVersion") != ENGINE_VERSION or
            report.get("architecture") != "x86_64"):
        raise ValueError("private disassembly source/engine mismatch")
    for field in (
        "nativeFunctionBoundaryVerified", "nativeControlFlowVerified",
        "nativeCodeBodyVerified", "nativeFloorIndexToXYVerified",
        "nativeFootprintRotationVerified", "placementLegalityVerified",
    ):
        if report.get(field) is not False:
            raise ValueError("unsupported native disassembly verification claim")
    windows = report.get("methodWindows")
    native_windows = source["methodWindows"]
    if not isinstance(windows, list) or len(windows) != len(native_windows):
        raise ValueError("native disassembly window count mismatch")
    total = 0
    for window, native in zip(windows, native_windows):
        if not isinstance(window, dict) or (
                window.get("symbol") != native["symbol"] or
                window.get("windowRva") != native["rva"] or
                window.get("windowFileOffset") != native["fileOffset"] or
                window.get("sourceWindowSha256") != native["windowSha256"] or
                window.get("sourceWindowLength") != native["windowLength"] or
                window.get("nativeFunctionBoundaryVerified") is not False or
                window.get("instructionWindowMayIncludeNeighboringFunctions")
                is not True):
            raise ValueError("native disassembly method identity mismatch")
        expected_bytes = bytes.fromhex(native["rawWindowHex"])
        instructions = window.get("instructions")
        if not isinstance(instructions, list):
            raise ValueError("native disassembly instruction list missing")
        offset = 0
        for ins in instructions:
            if not isinstance(ins, dict):
                raise ValueError("invalid native instruction")
            size = ins.get("size")
            if (type(size) is not int or not 1 <= size <= 15 or
                    ins.get("rva") != native["rva"] + offset or
                    ins.get("fileOffset") != native["fileOffset"] + offset or
                    ins.get("bytesHex") !=
                    expected_bytes[offset:offset + size].hex() or
                    ins.get("controlFlowKind") not in
                    ("call", "jump", "return", "other") or
                    ins.get("machineCodeSemanticsVerified") is not False or
                    not isinstance(ins.get("mnemonic"), str) or
                    len(ins["mnemonic"]) > 48 or
                    not isinstance(ins.get("operands"), str) or
                    len(ins["operands"]) > 256):
                raise ValueError("native disassembly instruction/source mismatch")
            offset += size
            total += 1
        if (offset > len(expected_bytes) or
                window.get("instructionCount") != len(instructions) or
                window.get("decodedPrefixBytes") != offset or
                window.get("undecodedTrailingBytes") != len(expected_bytes)-offset):
            raise ValueError("native disassembly coverage mismatch")
    if total > MAX_INSTRUCTIONS or report.get("totalInstructions") != total:
        raise ValueError("native disassembly instruction count invalid")
    return report


def write_private_disassembly(report, native_pe_report, destination):
    validate_disassembly_report(report, native_pe_report)
    target = Path(destination).resolve()
    if target.suffix.lower() != ".json" or target.exists():
        raise ValueError("private disassembly must use a new JSON destination")
    if any((p / ".git").exists() for p in (target.parent, *target.parent.parents)):
        raise ValueError("private original game disassembly cannot enter Git")
    payload = (json.dumps(report, sort_keys=True, ensure_ascii=False,
                          indent=2) + "\n").encode("utf-8")
    if len(payload) > MAX_REPORT_BYTES:
        raise ValueError("private native disassembly exceeds size limit")
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(
        prefix=".db04-asm-", suffix=".tmp", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
        if target.exists():
            raise ValueError("native disassembly target created concurrently")
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    args = parser.parse_args()
    try:
        root = args.snapshot.resolve(strict=True)
        integrity = validate_snapshot(root)
        native = read_json(root / "native-pe-evidence.json")
        validate_private_report(native, game_version=integrity["gameVersion"])
        report = disassemble_private_windows(native)
        path = root / "native-disassembly.json"
        write_private_disassembly(report, native, path)
        print(json.dumps({
            "status": report["status"],
            "gameVersion": report["gameVersion"],
            "methodWindows": len(report["methodWindows"]),
            "totalInstructions": report["totalInstructions"],
            "nativeCodeBodyVerified": False,
            "path": str(path),
        }, sort_keys=True))
    except (OSError, ValueError, TypeError, RuntimeError,
            UnicodeError, json.JSONDecodeError) as error:
        parser.exit(1, f"DB-04 private native disassembly failed: {error}\n")


if __name__ == "__main__":
    main()
