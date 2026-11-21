#!/usr/bin/env python3
"""Source-native PE64 .pdata RVA/start corroboration for PRIVATE IL2CPP evidence.

The x64 PE exception directory describes function unwind ranges. Matching a
dump.cs method RVA to a .pdata BeginAddress supports its *entry boundary*, not
its symbol identity or semantics. Mismatches forbid capturing a window under
a misleading method name. Source details stay outside public Git.
"""
from bisect import bisect_right
from collections import Counter
from pathlib import Path
import argparse
import hashlib
import json
import struct

MAX_DLL_BYTES = 1024 * 1024 * 1024
MAX_PDATA_ENTRIES = 600_000


def read_pe_runtime_functions(dll):
    dll = Path(dll)
    if (dll.is_symlink() or not dll.is_file() or
            not 4096 <= dll.stat().st_size <= MAX_DLL_BYTES):
        raise ValueError("unsafe or invalid native GameAssembly.dll")
    size = dll.stat().st_size
    with dll.open("rb") as file:
        dos = file.read(64)
        if len(dos) != 64 or dos[:2] != b"MZ":
            raise ValueError("invalid native MZ header")
        pe_offset = struct.unpack_from("<I", dos, 0x3c)[0]
        if not 64 <= pe_offset < min(size - 256, 16 * 1024 * 1024):
            raise ValueError("invalid native PE header offset")
        file.seek(pe_offset)
        if file.read(4) != b"PE\x00\x00":
            raise ValueError("invalid native PE header")
        coff = file.read(20)
        if len(coff) != 20:
            raise ValueError("truncated native COFF header")
        machine, section_count, _, _, _, optional_size, _ = struct.unpack(
            "<HHIIIHH", coff)
        if (machine != 0x8664 or not 1 <= section_count <= 96 or
                not 144 <= optional_size <= 4096):
            raise ValueError("expected AMD64 PE32+ original binary")
        optional = file.read(optional_size)
        if len(optional) != optional_size or optional[:2] != b"\x0b\x02":
            raise ValueError("invalid PE32+ optional header")
        # PE32+ DataDirectory[IMAGE_DIRECTORY_ENTRY_EXCEPTION] = slot 3.
        exception_rva, exception_bytes = struct.unpack_from(
            "<II", optional, 112 + 3 * 8)
        if (exception_bytes < 12 or exception_bytes % 12 or
                exception_bytes > MAX_PDATA_ENTRIES * 12):
            raise ValueError("invalid AMD64 PE exception directory")
        raw_sections = file.read(section_count * 40)
        if len(raw_sections) != section_count * 40:
            raise ValueError("truncated PE64 section directory")
        sections = []
        for i in range(section_count):
            sec = raw_sections[i * 40:(i + 1) * 40]
            virtual_size, rva, raw_size, offset = struct.unpack_from(
                "<IIII", sec, 8)
            characteristics = struct.unpack_from("<I", sec, 36)[0]
            if offset > size or raw_size > size - offset:
                raise ValueError("PE64 section exceeds native DLL")
            sections.append((rva, virtual_size, raw_size, offset,
                             characteristics))
        pdata = [
            s for s in sections if s[0] <= exception_rva and
            exception_rva - s[0] <= s[2] and
            exception_bytes <= s[2] - (exception_rva - s[0])
        ]
        if len(pdata) != 1:
            raise ValueError("ambiguous PE64 exception directory mapping")
        file.seek(pdata[0][3] + (exception_rva - pdata[0][0]))
        raw = file.read(exception_bytes)
        if len(raw) != exception_bytes:
            raise ValueError("truncated native PE exception table")

    records = []
    for i in range(0, len(raw), 12):
        begin, end, unwind = struct.unpack_from("<III", raw, i)
        if begin == end == unwind == 0:
            continue
        if end <= begin:
            raise ValueError("invalid native PE runtime function interval")
        mapped = [
            sec for sec in sections if (sec[4] & 0x20000000) and
            sec[0] <= begin < end <= sec[0] + min(sec[1], sec[2])
        ]
        if len(mapped) != 1:
            raise ValueError("native PE unwind interval outside executable source")
        records.append((begin, end, unwind))
    if not records:
        raise ValueError("no original PE64 runtime function intervals")
    records.sort()
    starts = [entry[0] for entry in records]
    if len(set(starts)) != len(starts):
        raise ValueError("ambiguous duplicate native unwind function starts")
    return records, starts, hashlib.sha256(raw).hexdigest()


def correlate_rvas(dll, methods):
    """Report exact unwind-start vs interior/unknown RVAs; never infer symbols."""
    if not isinstance(methods, list) or not methods or len(methods) > 20:
        raise ValueError("invalid native method correlation request")
    records, starts, source_hash = read_pe_runtime_functions(dll)
    outcomes = []
    statuses = Counter()
    seen = set()
    for method in methods:
        symbol = method.get("symbol")
        rva = method.get("rva")
        if (not isinstance(symbol, str) or not symbol or symbol in seen or
                type(rva) is not int or not 0 <= rva <= 0xffffffff):
            raise ValueError("ambiguous target IL2CPP RVA")
        seen.add(symbol)
        index = bisect_right(starts, rva) - 1
        containing = records[index] if index >= 0 and (
            rva < records[index][1]) else None
        if containing and containing[0] == rva:
            status = "exact_pe_unwind_function_start"
        elif containing:
            status = "inside_other_pe_unwind_function"
        else:
            status = "no_corresponding_pe_unwind_function"
        statuses[status] += 1
        outcomes.append({
            "symbol": symbol, "claimedRva": rva,
            "status": status,
            "unwindFunctionBeginRva": (
                containing[0] if containing else None),
            "unwindFunctionEndRva": (
                containing[1] if containing else None),
            "distanceFromRuntimeFunctionStart": (
                rva - containing[0] if containing else None),
            "nativeMethodIdentityVerified": False,
            "nativeCodeBodyVerified": False,
        })
    return {
        "schema": "wand.db04.pe-unwind-correlation@1",
        "status": ("all_target_rvas_at_native_unwind_starts" if
                   statuses["exact_pe_unwind_function_start"] == len(methods)
                   else "unresolved_or_mismatched_method_rvas"),
        "originalPeUnwindTableSha256": source_hash,
        "originalPeUnwindRecordCount": len(records),
        "targetMethodCount": len(methods),
        "counts": dict(sorted(statuses.items())),
        "methods": outcomes,
        "allTargetRvasAtPeUnwindStarts": (
            statuses["exact_pe_unwind_function_start"] == len(methods)),
        "nativeMethodIdentityVerified": False,
        "nativeCodeBodyVerified": False,
        "placementLegalityVerified": False,
    }


def main():
    from native_pe_evidence import read_version, target_methods_from_dump

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-root", type=Path, required=True)
    parser.add_argument("--dump-cs", type=Path, required=True)
    parser.add_argument("--dump-game-version", required=True)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    try:
        game_root = args.game_root.resolve(strict=True)
        if read_version(game_root) != args.dump_game_version:
            raise ValueError("IL2CPP dump assertion differs from original Steam version")
        methods = target_methods_from_dump(args.dump_cs)
        result = correlate_rvas(game_root / "GameAssembly.dll", methods)
        result["gameVersion"] = args.dump_game_version
        result["originalDllSha256"] = hashlib.sha256(
            (game_root / "GameAssembly.dll").read_bytes()).hexdigest()
        result["dumpCsSha256"] = hashlib.sha256(
            args.dump_cs.read_bytes()).hexdigest()
        if args.out:
            target = args.out.resolve()
            if target.exists() or target.suffix.lower() != ".json" or any(
                    (p / ".git").exists()
                    for p in (target.parent, *target.parent.parents)):
                raise ValueError("private PE audit output must be new and outside Git")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(result, indent=2, sort_keys=True)
                              + "\n", encoding="utf-8")
        print(json.dumps(result, sort_keys=True))
        if not result["allTargetRvasAtPeUnwindStarts"]:
            parser.exit(2, "DB-04 PE source method RVA/start mismatch: "
                        "do not label these bytes as GridData methods\n")
    except (ValueError, OSError, TypeError, UnicodeError) as error:
        parser.exit(1, f"DB-04 native PE unwind audit failed: {error}\n")


if __name__ == "__main__":
    main()
