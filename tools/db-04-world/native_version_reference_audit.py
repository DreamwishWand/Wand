#!/usr/bin/env python3
"""Compare PRIVATE original Steam 1.26.1/1.26.2 GridData x64 references.

Never emits original machine code, disassembly, original game assets, player
saves or original file paths. This is not decoder compatibility certification.
Requires GNU objdump for private original-byte disassembly.
"""
from __future__ import annotations
import argparse
from bisect import bisect_left
import hashlib
import json
import mmap
from pathlib import Path
import re
import subprocess
import tempfile

from native_method_pointers import PE64Image, resolve_native_grid_methods
from pe_unwind import read_pe_runtime_functions

PINS = {
    "1.26.1": {
        "GameAssembly.dll": "a11bdf8245c691e6c66c7579193de6f259edb01c035ecc9e01f19fd358ee034d",
        "global-metadata.dat": "5005195e74242ec0736987c50204e13efd68c9223cfd01dd00182fb2f388444f",
    },
    "1.26.2": {
        "GameAssembly.dll": "a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653",
        "global-metadata.dat": "a05e1ab76adaae54d410febd818cbf339141eae4ceae1a4eed1f54fd5c27d166",
    },
}
MAX_WINDOW = 16384
MAX_OUTPUT = 2_000_000
INSTRUCTION = re.compile(
    r"^\s*([0-9a-f]+):\s+((?:[0-9a-f]{2}\s+)+)\s*"
    r"([a-z][a-z0-9.]*)\s*(.*?)\s*$", re.I)
RIP_TARGET = re.compile(r"#\s*0x([0-9a-f]+)", re.I)
BRANCH_TARGET = re.compile(r"^0x([0-9a-f]+)(?:\s|$)", re.I)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_original(path, version, member):
    file = Path(path)
    if not file.is_file() or file.is_symlink():
        raise ValueError("original game source must be a regular file")
    if sha(file) != PINS[version][member]:
        raise ValueError("original " + version + " " + member + " SHA mismatch")


def parse_instructions(output, rva, length):
    """Reject invalid native disassembly boundaries or missing byte coverage."""
    rows = []
    cursor = 0
    for line in output.splitlines():
        match = INSTRUCTION.match(line)
        if not match:
            continue
        address = int(match.group(1), 16)
        raw = bytes.fromhex(match.group(2))
        if address != rva + cursor or not 1 <= len(raw) <= 15:
            raise ValueError("noncontiguous native instructions")
        opcode = match.group(3).lower()
        operand = match.group(4)
        if opcode in (".byte", "(bad)") or opcode.startswith("data"):
            raise ValueError("undecoded native instruction")
        kind = None
        target = None
        if "rip+" in operand or "rip-" in operand:
            hit = RIP_TARGET.search(operand)
            if hit:
                kind, target = "ripdata", int(hit.group(1), 16)
        elif opcode in ("call", "jmp") or opcode.startswith("j"):
            hit = BRANCH_TARGET.match(operand)
            if hit:
                kind, target = "branch", int(hit.group(1), 16)
        rows.append((cursor, raw, opcode, kind, target))
        cursor += len(raw)
    if not rows or cursor != length:
        raise ValueError("disassembly failed to cover original function window")
    return rows


def decode_window(data, rva, *, executable="objdump"):
    if not 1 <= len(data) <= MAX_WINDOW:
        raise ValueError("original function too large for reference audit")
    with tempfile.TemporaryDirectory(prefix="db04-private-") as dirname:
        source = Path(dirname) / "window.bin"
        source.write_bytes(data)
        proc = subprocess.run([
            executable, "-D", "-b", "binary", "-m", "i386:x86-64",
            "-M", "intel", "--insn-width=16", "--adjust-vma=" + hex(rva),
            str(source),
        ], check=True, capture_output=True, text=True, timeout=20)
    if len(proc.stdout) > MAX_OUTPUT:
        raise ValueError("unexpectedly large disassembler output")
    return parse_instructions(proc.stdout, rva, len(data))


def relocation_only(old, new, old_rva, new_rva):
    """Changes must be *only* rel32/rel8 displacement bytes, not immediates."""
    a, b = old[1], new[1]
    if (old[3] != new[3] or old[3] not in ("branch", "ripdata") or
            old[4] is None or new[4] is None or len(a) != len(b)):
        return False
    for width in ((4, 1) if old[3] == "branch" else (4,)):
        da = old[4] - (old_rva + old[0] + len(a))
        db = new[4] - (new_rva + new[0] + len(b))
        bound = 1 << (8 * width - 1)
        if not (-bound <= da < bound and -bound <= db < bound):
            continue
        wa = da.to_bytes(width, "little", signed=True)
        wb = db.to_bytes(width, "little", signed=True)
        positions = [
            i for i in range(len(a) - width + 1)
            if a[i:i + width] == wa and b[i:i + width] == wb and
            a[:i] == b[:i] and a[i + width:] == b[i + width:]
        ]
        if len(positions) == 1:
            return True
    return False


def compare_methods(left, right, old_rva, new_rva):
    if len(left) != len(right):
        raise ValueError("original native instruction count diverges")
    changed, downstream, data = 0, [], set()
    old_end = old_rva + sum(len(record[1]) for record in left)
    new_end = new_rva + sum(len(record[1]) for record in right)
    for a, b in zip(left, right):
        if (a[0], len(a[1]), a[2], a[3]) != (
                b[0], len(b[1]), b[2], b[3]):
            raise ValueError("original native instruction structure diverges")
        if a[1] != b[1]:
            if not relocation_only(a, b, old_rva, new_rva):
                raise ValueError("non-relative instruction bytes differ")
            changed += 1
        if a[3] == "ripdata" and a[4] is not None:
            data.add((a[4], b[4]))
        elif a[3] == "branch" and a[2] in ("call", "jmp") and (
                a[4] is not None and b[4] is not None):
            if not (old_rva <= a[4] < old_end and
                    new_rva <= b[4] < new_end):
                downstream.append((a[4], b[4]))
    return {
        "instructionCount": len(left),
        "relocationChangedInstructionCount": changed,
        "externalDirectTargets": downstream,
        "uniqueRipRelativeDataReferences": len(data),
    }


def mapped_callee_sha(pe, raw, rva):
    # A .pdata exact start and executable mapping are required. Do not label
    # unknown thunks or interior jump targets as byte-identical callees.
    index = bisect_left(pe.runtime_starts, rva)
    if index == len(pe.runtime_starts) or pe.runtime_starts[index] != rva:
        return None
    size = pe.runtime_ends[rva] - rva
    if not 1 <= size <= 512_000:
        return None
    try:
        offset = pe.va_to_file(pe.image_base + rva, size, executable=True)
    except ValueError:
        return None
    return hashlib.sha256(raw[offset:offset + size]).hexdigest()


def mapped_callee_bytes(pe, raw, rva):
    # A relocated callee can be structurally aligned without having identical
    # bytes, but only for a complete, mapped and bounded PE unwind function.
    index = bisect_left(pe.runtime_starts, rva)
    if index == len(pe.runtime_starts) or pe.runtime_starts[index] != rva:
        return None
    size = pe.runtime_ends[rva] - rva
    if not 1 <= size <= MAX_WINDOW:
        return None
    try:
        offset = pe.va_to_file(pe.image_base + rva, size, executable=True)
    except ValueError:
        return None
    return bytes(raw[offset:offset + size])


def run_audit(old_dll, old_metadata, new_dll, new_metadata, *, objdump="objdump"):
    for version, dll, meta in (
            ("1.26.1", old_dll, old_metadata),
            ("1.26.2", new_dll, new_metadata)):
        verify_original(dll, version, "GameAssembly.dll")
        verify_original(meta, version, "global-metadata.dat")
    old_source = resolve_native_grid_methods(old_dll, old_metadata)
    new_source = resolve_native_grid_methods(new_dll, new_metadata)
    if (old_source["metadataVersion"] != 31 or
            new_source["metadataVersion"] != 31 or
            old_source["moduleName"] != new_source["moduleName"]):
        raise ValueError("original IL2CPP module/metadata identity mismatch")

    keyed = lambda report: {
        (item["tokenRid"], item["symbol"]): item for item in report["methods"]}
    previous, current = keyed(old_source), keyed(new_source)
    if set(previous) != set(current):
        raise ValueError("original native method token identity mismatch")
    reports = []
    with Path(old_dll).open("rb") as af, Path(new_dll).open("rb") as bf:
        with mmap.mmap(af.fileno(), 0, access=mmap.ACCESS_READ) as a, \
             mmap.mmap(bf.fileno(), 0, access=mmap.ACCESS_READ) as b:
            pe_a, pe_b = PE64Image(a), PE64Image(b)
            for pe, dll in ((pe_a, old_dll), (pe_b, new_dll)):
                runtime, starts, _ = read_pe_runtime_functions(dll)
                pe.runtime_starts = starts
                pe.runtime_ends = {start: end for start, end, _ in runtime}
            for key, before in previous.items():
                after = current[key]
                start_a, start_b = before["rva"], after["rva"]
                length_a = before["peUnwindFunctionEndRva"] - start_a
                length_b = after["peUnwindFunctionEndRva"] - start_b
                if length_a != length_b or not 1 <= length_a <= MAX_WINDOW:
                    raise ValueError("native function unwind lengths differ")
                off_a = pe_a.va_to_file(pe_a.image_base + start_a,
                                        length_a, executable=True)
                off_b = pe_b.va_to_file(pe_b.image_base + start_b,
                                        length_b, executable=True)
                decoded_a = decode_window(bytes(a[off_a:off_a + length_a]),
                                          start_a, executable=objdump)
                decoded_b = decode_window(bytes(b[off_b:off_b + length_b]),
                                          start_b, executable=objdump)
                summary = compare_methods(decoded_a, decoded_b, start_a, start_b)
                destinations = set(summary.pop("externalDirectTargets"))
                matching, relocated, divergent, unmapped = 0, 0, 0, 0
                for dst_a, dst_b in destinations:
                    digest_a = mapped_callee_sha(pe_a, a, dst_a)
                    digest_b = mapped_callee_sha(pe_b, b, dst_b)
                    if digest_a is not None and digest_a == digest_b:
                        matching += 1
                        continue
                    code_a = mapped_callee_bytes(pe_a, a, dst_a)
                    code_b = mapped_callee_bytes(pe_b, b, dst_b)
                    if code_a is None or code_b is None:
                        unmapped += 1
                        continue
                    try:
                        decoded_a = decode_window(code_a, dst_a, executable=objdump)
                        decoded_b = decode_window(code_b, dst_b, executable=objdump)
                        compare_methods(decoded_a, decoded_b, dst_a, dst_b)
                        relocated += 1
                    except ValueError:
                        divergent += 1
                reports.append({
                    "symbol": before["symbol"], "tokenRid": key[0],
                    "functionByteCount": length_a, **summary,
                    "distinctExternalTargets": len(destinations),
                    "byteIdenticalDirectCallees": matching,
                    "relocationOnlyDirectCallees": relocated,
                    "divergentDirectCallees": divergent,
                    "unmappedDirectTargets": unmapped,
                    "uncorroboratedDirectTargets": relocated + divergent + unmapped,
                })
    return {
        "schema": "wand.db04.native-version-reference-audit@1",
        "status": "structural_only_not_decoder_compatibility_proof",
        "sourceVersionPair": ["1.26.1", "1.26.2"],
        "sourceSha256": {
            "steam1261Dll": old_source["originalDllSha256"],
            "steam1261Metadata": old_source["originalMetadataSha256"],
            "steam1262Dll": new_source["originalDllSha256"],
            "steam1262Metadata": new_source["originalMetadataSha256"],
        },
        "methods": reports,
        "allControlFlowSemanticsVerified": False,
        "allTransitiveCalleesVerified": False,
        "allReferencedDataVerified": False,
        "nativeTerrainDecoder1262Approved": False,
        "placementLegalityVerified": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("old-dll", "old-metadata", "new-dll", "new-metadata"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--objdump", default="objdump")
    args = parser.parse_args()
    try:
        report = run_audit(
            args.old_dll, args.old_metadata, args.new_dll,
            args.new_metadata, objdump=args.objdump)
        print(json.dumps(report, indent=2, sort_keys=True))
    except (ValueError, OSError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired) as exc:
        parser.exit(1, "DB-04 private original comparison failed: " + str(exc) + "\n")


if __name__ == "__main__":
    main()
