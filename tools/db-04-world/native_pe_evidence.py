#!/usr/bin/env python3
"""Capture a bounded PRIVATE native-code evidence window from GameAssembly.dll.

This tool does NOT disassemble, interpret or certify machine-code semantics.
A GameAssembly RVAs file must be a *version-matched* Il2CppDumper dump.cs.
Without it, only the PE64 metadata and binary digest are collected. Never
commit these native code windows to public Git; private DB-04 snapshot only.
"""
import argparse
import hashlib
import json
import os
import re
import struct
import tempfile
from pathlib import Path

MAX_DLL_BYTES = 1024 * 1024 * 1024
MAX_DUMP_BYTES = 256 * 1024 * 1024
MAX_WINDOW = 1024
DEFAULT_WINDOW = 384
MAX_METHODS = 20
VERSION = re.compile(r"(?<![0-9.])([0-9]+\.[0-9]+\.[0-9]+)(?![0-9.])")
RVA_RE = re.compile(r"^\s*//\s*RVA:\s*0x([0-9A-Fa-f]+)\b")
NAMESPACE_RE = re.compile(r"^// Namespace:\s*(.*)")
TYPE_RE = re.compile(r"^\s*(?:public|private|internal|protected|abstract|sealed|"
                     r"partial|unsafe|static|\s)+\s*(?:class|struct)\s+(\w+)\b")
METHOD_RE = re.compile(r"\b(get_Item|set_Item|GetNumberOfBitsPerPosition|"
                       r"OnBinarize)\s*\(")
TARGET_TYPES = frozenset({
    "Definitions.Grid.GridData",
    "Definitions.Grid.GridAreaData",
})


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as data:
        for chunk in iter(lambda: data.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_version(game_root: Path) -> str:
    file = game_root / "FullVersion.txt"
    if file.is_symlink() or not file.is_file() or file.stat().st_size > 4096:
        raise ValueError("native source version file missing or unsafe")
    match = VERSION.search(file.read_text(encoding="utf-8-sig"))
    if not match:
        raise ValueError("unrecognized original game version")
    return match.group(1)


def pe64_sections(path: Path) -> list[dict]:
    """Map original AMD64 PE32+ executable sections from source bytes."""
    if (path.is_symlink() or not path.is_file() or
            not 4096 <= path.stat().st_size <= MAX_DLL_BYTES):
        raise ValueError("invalid or unsafe native GameAssembly.dll")
    size = path.stat().st_size
    with path.open("rb") as file:
        dos = file.read(64)
        if len(dos) != 64 or dos[:2] != b"MZ":
            raise ValueError("GameAssembly is not a valid PE DOS header")
        pe_offset = struct.unpack_from("<I", dos, 0x3c)[0]
        if not 64 <= pe_offset < min(size - 256, 16 * 1024 * 1024):
            raise ValueError("invalid native PE header address")
        file.seek(pe_offset)
        if file.read(4) != b"PE\x00\x00":
            raise ValueError("GameAssembly missing PE signature")
        coff = file.read(20)
        if len(coff) != 20:
            raise ValueError("truncated native PE COFF header")
        machine, count, _, _, _, optional_size, _ = struct.unpack(
            "<HHIIIHH", coff)
        if machine != 0x8664 or not 1 <= count <= 96:
            raise ValueError("expected AMD64 native GameAssembly PE")
        if not 112 <= optional_size <= 4096:
            raise ValueError("invalid native PE optional header size")
        optional = file.read(optional_size)
        if len(optional) != optional_size or optional[:2] != b"\x0b\x02":
            raise ValueError("expected valid native PE32+ optional header")
        headers = file.read(count * 40)
        if len(headers) != count * 40:
            raise ValueError("truncated native PE section table")
    sections = []
    for i in range(count):
        section = headers[i * 40:(i + 1) * 40]
        name = section[:8].rstrip(b"\x00").decode("ascii", errors="replace")
        virtual_size, rva, raw_size, raw_offset = struct.unpack_from(
            "<IIII", section, 8)
        flags = struct.unpack_from("<I", section, 36)[0]
        if not raw_size:
            continue
        if raw_offset > size or raw_size > size - raw_offset:
            raise ValueError("native PE section extends beyond original binary")
        if rva > 0xffffffff - max(virtual_size, raw_size):
            raise ValueError("native PE section RVA overflows")
        if not flags & 0x20000000:
            continue
        sections.append({
            "name": name, "virtualAddress": rva,
            "virtualSize": virtual_size, "rawSize": raw_size,
            "rawOffset": raw_offset, "executable": True,
        })
    if not sections:
        raise ValueError("GameAssembly has no executable PE64 sections")
    for i, section in enumerate(sections):
        for other in sections[i + 1:]:
            lo1, hi1 = (section["virtualAddress"],
                        section["virtualAddress"] + section["rawSize"])
            lo2, hi2 = (other["virtualAddress"],
                        other["virtualAddress"] + other["rawSize"])
            if max(lo1, lo2) < min(hi1, hi2):
                raise ValueError("ambiguous overlapping native PE code sections")
    return sections


def file_offset_for_rva(sections, rva: int, size: int) -> tuple[int, dict]:
    if type(rva) is not int or not 0 <= rva <= 0xffffffff:
        raise ValueError("invalid original native method RVA")
    if type(size) is not int or not 32 <= size <= MAX_WINDOW:
        raise ValueError("invalid native PE evidence window length")
    # Bytes past a PE section's VirtualSize are file-alignment padding, not
    # mapped executable code. Virtual zero-fill beyond SizeOfRawData has no
    # original binary bytes to capture. Both are excluded.
    matches = [entry for entry in sections if
               entry["virtualAddress"] <= rva <
               entry["virtualAddress"] + min(entry["rawSize"],
                                              entry["virtualSize"])]
    if len(matches) != 1:
        raise ValueError("method RVA is not in one source executable section")
    entry = matches[0]
    delta = rva - entry["virtualAddress"]
    available = min(entry["rawSize"], entry["virtualSize"]) - delta
    if available < 32:
        raise ValueError("native method RVA has fewer than 32 source code bytes")
    return entry["rawOffset"] + delta, {
        "section": entry["name"],
        "bytesAvailableInSection": available,
        "readLength": min(size, available),
    }


def target_methods_from_dump(path: Path) -> list[dict]:
    """Scan Il2CppDumper comments: Namespace, class, RVA, following method."""
    if (path.is_symlink() or not path.is_file() or
            path.stat().st_size > MAX_DUMP_BYTES):
        raise ValueError("missing or unsafe native IL2CPP dump.cs")
    namespace, class_name, pending_rva = "", None, None
    found = {}
    with path.open("r", encoding="utf-8-sig", errors="strict") as lines:
        for line in lines:
            ns = NAMESPACE_RE.match(line)
            if ns:
                namespace, class_name, pending_rva = ns.group(1).strip(), None, None
                continue
            if line.startswith("}"):
                class_name, pending_rva = None, None
                continue
            cls = TYPE_RE.match(line)
            if cls:
                class_name, pending_rva = cls.group(1), None
                continue
            fqtype = f"{namespace}.{class_name}"
            if fqtype not in TARGET_TYPES:
                continue
            loc = RVA_RE.match(line)
            if loc:
                pending_rva = int(loc.group(1), 16)
                continue
            if pending_rva is None:
                continue
            # An RVA comment must be followed by a real declaration, never
            # opportunistically associated with a matching comment line.
            if line.lstrip().startswith("//"):
                continue
            method = METHOD_RE.search(line)
            if method is None:
                # Do not let a stale RVA leak into a later matching method.
                # Blank lines, attributes and opening/closing braces are
                # permitted; unrelated method declarations terminate it.
                if "(" in line or (";" in line and "{" not in line):
                    pending_rva = None
                continue
            key = f"{fqtype}.{method.group(1)}"
            if key in found:
                raise ValueError("ambiguous IL2CPP target method RVA")
            found[key] = {
                "symbol": key,
                "rva": pending_rva,
                "dumpDeclaration": line.strip()[:320],
            }
            pending_rva = None
    if len(found) > MAX_METHODS:
        raise ValueError("too many IL2CPP methods selected for private audit")
    return [found[name] for name in sorted(found)]


def capture_native_pe(game_root, *, dump_cs=None, dump_game_version=None,
                      window_bytes=DEFAULT_WINDOW):
    if type(window_bytes) is not int or not 32 <= window_bytes <= MAX_WINDOW:
        raise ValueError("native PE method window bytes must be 32..1024")
    root = Path(game_root).resolve(strict=True)
    version = read_version(root)
    dll = root / "GameAssembly.dll"
    sections = pe64_sections(dll)
    evidence = {
        "schema": "wand.db04.native-pe-evidence@1",
        "gameVersion": version,
        "dllSizeBytes": dll.stat().st_size,
        "dllSha256": sha256_file(dll),
        "peMachine": "AMD64",
        "executableSectionCount": len(sections),
        "sourceRvaMappingVerified": False,
        "nativeCodeBodyVerified": False,
        "disassemblyVerified": False,
        "nativeFloorIndexToXYVerified": False,
        "nativeFootprintRotationVerified": False,
        "placementLegalityVerified": False,
        "methodWindows": [],
        "rawMethodWindowSize": window_bytes,
    }
    if dump_cs is None:
        if dump_game_version is not None:
            raise ValueError("IL2CPP dump version provided without source dump.cs")
        evidence["status"] = "pe64_binary_identified_no_version_matched_dump"
        return evidence
    if dump_game_version != version:
        raise ValueError("IL2CPP dump.cs game version differs from GameAssembly")
    dump_path = Path(dump_cs).resolve(strict=True)
    methods = target_methods_from_dump(dump_path)
    if not methods:
        raise ValueError("corresponding dump.cs has no target GridData methods")
    evidence["dumpCsSha256"] = sha256_file(dump_path)
    evidence["dumpCsVersionAssertion"] = dump_game_version
    with dll.open("rb") as binary:
        for method in methods:
            offset, mapping = file_offset_for_rva(
                sections, method["rva"], window_bytes)
            binary.seek(offset)
            raw = binary.read(mapping["readLength"])
            if len(raw) != mapping["readLength"]:
                raise ValueError("short native PE method byte window")
            evidence["methodWindows"].append({
                **method, "fileOffset": offset,
                "sectionName": mapping["section"],
                "windowLength": len(raw),
                "windowSha256": hashlib.sha256(raw).hexdigest(),
                "rawWindowHex": raw.hex(),
                "windowIsEntireMethod": False,
                "codeSemanticsVerified": False,
            })
    evidence["sourceRvaMappingVerified"] = True
    evidence["status"] = "version_asserted_il2cpp_rva_byte_windows_captured"
    return evidence


def validate_private_report(report: dict, *, game_version=None):
    """Fail closed if a private report claims stronger evidence than captured."""
    if not isinstance(report, dict) or report.get("schema") != (
            "wand.db04.native-pe-evidence@1"):
        raise ValueError("invalid private native PE evidence schema")
    version = report.get("gameVersion")
    if not isinstance(version, str) or not VERSION.fullmatch(version):
        raise ValueError("invalid native PE game version")
    if game_version is not None and version != game_version:
        raise ValueError("private native PE evidence game version mismatch")
    if report.get("peMachine") != "AMD64" or (
            type(report.get("dllSizeBytes")) is not int or
            not 4096 <= report["dllSizeBytes"] <= MAX_DLL_BYTES or
            type(report.get("executableSectionCount")) is not int or
            not 1 <= report["executableSectionCount"] <= 96):
        raise ValueError("invalid native PE original binary identity")
    for field in ("nativeCodeBodyVerified", "disassemblyVerified",
                  "nativeFootprintRotationVerified",
                  "nativeFloorIndexToXYVerified", "placementLegalityVerified"):
        if report.get(field) is not False:
            raise ValueError("unsupported native PE evidence verification claim")
    if (type(report.get("rawMethodWindowSize")) is not int or
            not 32 <= report["rawMethodWindowSize"] <= MAX_WINDOW):
        raise ValueError("invalid native PE method window configuration")
    if not isinstance(report.get("dllSha256"), str) or not re.fullmatch(
            r"[0-9a-f]{64}", report["dllSha256"]):
        raise ValueError("private native DLL digest missing")
    windows = report.get("methodWindows")
    if not isinstance(windows, list) or len(windows) > MAX_METHODS:
        raise ValueError("invalid private native method windows")

    status = report.get("status")
    if status == "pe64_binary_identified_no_version_matched_dump":
        if (windows or report.get("sourceRvaMappingVerified") is not False or
                "dumpCsSha256" in report or "dumpCsVersionAssertion" in report):
            raise ValueError("native PE metadata-only report falsely claims matched RVAs")
    elif status == "version_asserted_il2cpp_rva_byte_windows_captured":
        if (not windows or report.get("sourceRvaMappingVerified") is not True or
                report.get("dumpCsVersionAssertion") != version or
                not isinstance(report.get("dumpCsSha256"), str) or
                not re.fullmatch(r"[0-9a-f]{64}", report["dumpCsSha256"])):
            raise ValueError("native PE evidence lacks version-asserted IL2CPP source")
    else:
        raise ValueError("invalid native PE evidence status")

    seen = set()
    for window in windows:
        if not isinstance(window, dict):
            raise ValueError("malformed native PE method window")
        symbol = window.get("symbol")
        if (not isinstance(symbol, str) or
                not any(symbol.startswith(t + ".") for t in TARGET_TYPES) or
                symbol in seen):
            raise ValueError("duplicate or unrecognized IL2CPP method symbol")
        seen.add(symbol)
        raw_hex = window.get("rawWindowHex")
        if (not isinstance(raw_hex, str) or
                not re.fullmatch(r"[0-9a-f]{64,2048}", raw_hex) or
                len(raw_hex) % 2 or
                type(window.get("windowLength")) is not int or
                not 32 <= window["windowLength"] <= report["rawMethodWindowSize"] or
                window["windowLength"] != len(raw_hex) // 2 or
                hashlib.sha256(bytes.fromhex(raw_hex)).hexdigest()
                != window.get("windowSha256") or
                window.get("codeSemanticsVerified") is not False or
                window.get("windowIsEntireMethod") is not False or
                type(window.get("rva")) is not int or
                not 0 <= window["rva"] <= 0xffffffff or
                type(window.get("fileOffset")) is not int or
                window["fileOffset"] < 0 or
                window["fileOffset"] + window["windowLength"] >
                report["dllSizeBytes"]):
            raise ValueError("native PE method window digest or source claim invalid")
    return report

def write_private_report(report, target: Path):
    target = Path(target).resolve()
    if target.exists() or target.suffix.lower() != ".json":
        raise ValueError("native PE evidence must use a new JSON target")
    if any((parent / ".git").exists() for parent in
           (target.parent, *target.parent.parents)):
        raise ValueError("native code windows cannot be written into public Git")
    validate_private_report(report)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=target.parent, prefix=".db04-pe-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(report, stream, sort_keys=True, indent=2)
            stream.write("\n")
        if target.exists():
            raise ValueError("native report target created concurrently")
        os.replace(tmp_path, target)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--game-root", type=Path, required=True)
    cli.add_argument("--dump-cs", type=Path)
    cli.add_argument("--dump-game-version")
    cli.add_argument("--window-bytes", type=int, default=DEFAULT_WINDOW)
    cli.add_argument("--out", type=Path, required=True)
    args = cli.parse_args()
    try:
        report = capture_native_pe(
            args.game_root, dump_cs=args.dump_cs,
            dump_game_version=args.dump_game_version,
            window_bytes=args.window_bytes)
        write_private_report(report, args.out)
        print(json.dumps({
            "status": report["status"],
            "gameVersion": report["gameVersion"],
            "pe64SourceSha256": report["dllSha256"],
            "methodWindowsCount": len(report["methodWindows"]),
            "nativeCodeBodyVerified": False,
            "reportPath": str(args.out),
        }, ensure_ascii=False, sort_keys=True))
    except (OSError, UnicodeError, ValueError, TypeError) as error:
        cli.exit(1, f"DB-04 private native PE capture failed: {error}\n")


if __name__ == "__main__":
    main()
