#!/usr/bin/env python3
"""DB-02 offline IL2CPP meal-price disassembly probe.

No GameAssembly.dll or dump.cs may be committed to the public repository.
The pinned Steam v1.26.1 dump is METADATA ONLY, not executable instructions
for Steam v1.26.2. The PE/DLL method address mapping is allowed ONLY when the
owner supplies SAME-BUILD metadata, a matching independently expected DLL
fingerprint and an explicit offline output directory outside any Git checkout.
No function boundary, exact price formula, or runtime price selection is
inferred from a bounded disassembly excerpt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile

DUMP_1261_SHA256 = "0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08"
VERSION = "Steam v1.26.1"
MACHINE_AMD64 = 0x8664
PE32_PLUS = 0x20B
MAX_DLL_SIZE = 3 * 1024 * 1024 * 1024
MAX_DUMP_SIZE = 160 * 1024 * 1024
EXCERPT_SIZE = 256
MAX_EXCERPT_SIZE = 8192

# The explicit owner-qualified signature is used to avoid unrelated overloads.
TARGETS = (
    ("ItemPriceDatabases", "GetSoftCurrencySellPrice"),
    ("ItemPriceDatabases", "GetSellPrice"),
    ("ItemPriceDatabases", "TryGetSellPrice"),
    ("ItemPriceDatabases", "GetDefaultSellPrice"),
    ("MealItemData", "GetLowestPriceIngredients"),
    ("MealItemData", "TotalIngredientsValue"),
    ("MealItemData", "TotalIngredientsSellPrice"),
    ("MealItemData", "GetSellPrice"),
    ("MealItemData", "<TotalIngredientsValue>b__142_0"),
    ("MealItemData", "<GetSellPrice>g__CreateItemPriceTuple|146_0"),
    ("MealItemData.<>c", "<GetLowestPriceIngredients>b__138_0"),
    ("MealItemData.<>c", "<TotalIngredientsSellPrice>b__143_0"),
    ("MealItemData.<>c", "<GetSellPrice>b__146_1"),
)

# Correct ONLY for exact SHA-pinned v1.26.1 dump; not reused for v1.26.2.
EXPECTED_1261_RVAS = {
    "ItemPriceDatabases.GetSoftCurrencySellPrice": 0x383B420,
    "ItemPriceDatabases.GetSellPrice": 0x383B530,
    "ItemPriceDatabases.TryGetSellPrice": 0x383B5D0,
    "ItemPriceDatabases.GetDefaultSellPrice": 0x383BA40,
    "MealItemData.GetLowestPriceIngredients": 0x3E1DA20,
    "MealItemData.TotalIngredientsValue": 0x3E1E0F0,
    "MealItemData.TotalIngredientsSellPrice": 0x3E1E710,
    "MealItemData.GetSellPrice": 0x3E1ECC0,
    "MealItemData.<TotalIngredientsValue>b__142_0": 0x3E1FD90,
    "MealItemData.<GetSellPrice>g__CreateItemPriceTuple|146_0": 0x3E1FDB0,
    "MealItemData.<>c.<GetLowestPriceIngredients>b__138_0": 0x3E1FF80,
    "MealItemData.<>c.<TotalIngredientsSellPrice>b__143_0": 0x3B3E0C0,
    "MealItemData.<>c.<GetSellPrice>b__146_1": 0x18E2DF0,
}

CLASS = re.compile(r"\bclass\s+([^\s:]+)")
ADDRESS = re.compile(
    r"// RVA:\s*(0x[0-9A-Fa-f]+)\s+Offset:\s*(0x[0-9A-Fa-f]+)"
    r"\s+VA:\s*(0x[0-9A-Fa-f]+)"
)
HEX = re.compile(r"^[a-f0-9]{64}$")


def require(value: bool, reason: str):
    if not value:
        raise ValueError("DB02_NATIVE_PRICE_" + reason)


def digest_file(path: Path, limit: int) -> str:
    require(path.is_file() and not path.is_symlink(), "SOURCE_FILE_REQUIRED")
    size = path.stat().st_size
    require(0 < size <= limit, "SOURCE_SIZE_LIMIT")
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    require(size == path.stat().st_size, "SOURCE_SIZE_CHANGED")
    return h.hexdigest()


def extract_target_methods(text: str, expected_rvas: dict | None = None) -> list:
    """Extract owner-qualified methods. No binary method bodies exist here."""
    discovered = {}
    current_class = None
    pending = None
    names = {}
    for owner, method in TARGETS:
        names.setdefault(owner, {})[" " + method + "("] = owner + "." + method
    for line in text.splitlines():
        if line.startswith("// Namespace:"):
            current_class = None
            pending = None
        if "TypeDefIndex:" in line and " class " in line:
            match = CLASS.search(line)
            if match:
                current_class = match.group(1)
        match = ADDRESS.search(line)
        if match:
            pending = tuple(int(value, 16) for value in match.groups())
            continue
        if pending and current_class in names and line.strip().endswith("{ }"):
            for needle, full_name in names[current_class].items():
                if needle in line:
                    require(full_name not in discovered, "DUPLICATE_METHOD")
                    rva, offset, va = pending
                    require(0 < rva < 2**32 and 0 <= offset < 2**32,
                            "METHOD_ADDRESS_RANGE")
                    require(va >= rva, "METHOD_VA_INVALID")
                    discovered[full_name] = {
                        "name": full_name,
                        "rva": rva,
                        "dumpReportedOffset": offset,
                        "dumpReportedVa": va,
                        "signature": line.strip(),
                    }
                    break
            pending = None
    require(len(discovered) == len(TARGETS), "TARGET_METHODS_INCOMPLETE")
    if expected_rvas is not None:
        require(set(discovered) == set(expected_rvas), "PINNED_TARGET_SET")
        require(all(discovered[name]["rva"] == value
                    for name, value in expected_rvas.items()),
                "PINNED_RVA_MISMATCH")
    return [discovered[owner + "." + method] for owner, method in TARGETS]


def source_method_plan(dump_path: Path, dump_version: str,
                       expected_dump_sha256: str | None):
    require(dump_version in ("1.26.1", "1.26.2"), "UNSUPPORTED_DUMP_VERSION")
    if dump_version == "1.26.1":
        require(expected_dump_sha256 in (None, DUMP_1261_SHA256),
                "PINNED_1261_SHA_MISMATCH")
        expected = DUMP_1261_SHA256
        known_rvas = EXPECTED_1261_RVAS
    else:
        require(isinstance(expected_dump_sha256, str) and
                HEX.fullmatch(expected_dump_sha256) is not None,
                "NEW_DUMP_REQUIRES_OWNER_SHA")
        expected = expected_dump_sha256
        known_rvas = None
    actual = digest_file(dump_path, MAX_DUMP_SIZE)
    require(actual == expected, "DUMP_SHA_MISMATCH")
    text = dump_path.read_text("utf-8")
    targets = extract_target_methods(text, known_rvas)
    return {
        "contract": "wand.db02.native-meal-price-method-targets@1",
        "dumpVersionClaim": dump_version,
        "dumpSha256": actual,
        "metadataContainsExecutableBodies": False,
        "targetMethodCount": len(targets),
        "methods": targets,
        "disassemblyPerformed": False,
        "actualPriceFormulaVerified": False,
        "roundingRuleVerified": False,
    }


def _read_at(stream, offset, count: int):
    require(offset >= 0 and count >= 0, "PE_FILE_RANGE")
    stream.seek(offset)
    out = stream.read(count)
    require(len(out) == count, "PE_TRUNCATED")
    return out


def parse_pe_headers(stream, file_size: int):
    """Minimal non-executing PE32+ section mapper; never executes the DLL."""
    require(file_size >= 512, "PE_TOO_SMALL")
    dos = _read_at(stream, 0, 64)
    require(dos[:2] == b"MZ", "PE_DOS_MAGIC")
    pe_offset = struct.unpack_from("<I", dos, 0x3C)[0]
    require(64 <= pe_offset <= min(file_size - 24, 64 * 1024),
            "PE_HEADER_OFFSET")
    coff = _read_at(stream, pe_offset, 24)
    require(coff[:4] == b"PE\x00\x00", "PE_SIGNATURE")
    machine, count, _, _, _, optional_size, _ = struct.unpack_from(
        "<HHIIIHH", coff, 4)
    require(machine == MACHINE_AMD64 and 0 < count <= 96,
            "PE_MACHINE_OR_SECTIONS")
    require(112 <= optional_size <= 4096, "PE_OPTIONAL_SIZE")
    optional = _read_at(stream, pe_offset + 24, optional_size)
    require(struct.unpack_from("<H", optional, 0)[0] == PE32_PLUS,
            "PE_NOT_64_BIT")
    image_base = struct.unpack_from("<Q", optional, 24)[0]
    image_size = struct.unpack_from("<I", optional, 56)[0]
    require(image_base > 0 and 0 < image_size <= 2**32 - 1,
            "PE_IMAGE_ADDRESS")
    table_at = pe_offset + 24 + optional_size
    require(table_at + 40 * count <= file_size, "PE_SECTION_TABLE")
    sections = []
    for index in range(count):
        record = _read_at(stream, table_at + 40 * index, 40)
        name = record[:8].split(b"\x00", 1)[0].decode("ascii", "replace")
        virtual_size, va, raw_size, raw_off = struct.unpack_from(
            "<IIII", record, 8)
        characteristics = struct.unpack_from("<I", record, 36)[0]
        require(raw_off <= file_size and raw_size <= file_size - raw_off,
                "PE_SECTION_RAW_BOUNDS")
        sections.append({
            "name": name, "virtualSize": virtual_size,
            "rva": va, "rawSize": raw_size, "rawOffset": raw_off,
            "executable": bool(characteristics & 0x20000000),
        })
    return image_base, image_size, sections


def map_executable_rva(rva: int, sections: list, file_size: int,
                       excerpt_bytes: int = EXCERPT_SIZE):
    require(0 < rva < 2**32 and 1 <= excerpt_bytes <= MAX_EXCERPT_SIZE,
            "INVALID_RVA_OR_EXCERPT")
    matches = []
    for section in sections:
        start = section["rva"]
        end = start + max(section["virtualSize"], section["rawSize"])
        if start <= rva < end:
            require(section["executable"], "NONEXECUTABLE_METHOD_RVA")
            distance = rva - start
            require(distance < section["rawSize"] and
                    excerpt_bytes <= section["rawSize"] - distance,
                    "RVA_OUTSIDE_RAW_CODE")
            offset = section["rawOffset"] + distance
            require(offset + excerpt_bytes <= file_size, "RVA_EXCEEDS_FILE")
            matches.append((offset, section["name"]))
    require(len(matches) == 1, "RVA_UNMAPPED_OR_AMBIGUOUS")
    return matches[0]


def private_output_dir(path: Path):
    require(path.is_dir() and not path.is_symlink(),
            "EXISTING_PRIVATE_OUTPUT_DIR_REQUIRED")
    resolved = path.resolve()
    # Reject existing Git working trees, including a checkout's descendants.
    for ancestor in (resolved, *resolved.parents):
        require(not (ancestor / ".git").exists(),
                "PUBLIC_GIT_CHECKOUT_OUTPUT_FORBIDDEN")
    return resolved


def probe_dll(plan: dict, dll_path: Path, dll_version: str,
              expected_dll_sha256: str, output_dir: Path,
              disassembler: str | None = None, extract_only: bool = False,
              excerpt_bytes: int = EXCERPT_SIZE):
    require(dll_version == plan["dumpVersionClaim"], "CROSS_VERSION_RVA_FORBIDDEN")
    require(isinstance(excerpt_bytes, int) and
            1 <= excerpt_bytes <= MAX_EXCERPT_SIZE,
            "EXCERPT_SIZE_LIMIT")
    require(isinstance(expected_dll_sha256, str) and
            HEX.fullmatch(expected_dll_sha256) is not None,
            "INDEPENDENT_DLL_SHA_REQUIRED")
    sha = digest_file(dll_path, MAX_DLL_SIZE)
    require(sha == expected_dll_sha256, "DLL_SHA_MISMATCH")
    output_dir = private_output_dir(output_dir)
    disasm = None if extract_only else shutil.which(disassembler or "objdump")
    require(extract_only or disasm is not None, "OBJDUMP_NOT_INSTALLED")
    size = dll_path.stat().st_size
    rows = []
    with dll_path.open("rb") as binary:
        base, image_size, sections = parse_pe_headers(binary, size)
        for method in plan["methods"]:
            rva = method["rva"]
            require(rva < image_size, "RVA_OUTSIDE_IMAGE")
            offset, section = map_executable_rva(
                rva, sections, size, excerpt_bytes)
            raw = _read_at(binary, offset, excerpt_bytes)
            # Small method-prefix excerpts are NOT complete functions.
            name = method["name"].replace("<", "_").replace(">", "_")
            name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
            if extract_only:
                # Can run on stock Windows Python without GNU objdump.
                (output_dir / (name + ".prefix.bin")).write_bytes(raw)
            else:
                with tempfile.NamedTemporaryFile(
                    dir=output_dir, prefix=".db02-",
                    suffix=".bin", delete=False
                ) as temp:
                    temp.write(raw)
                    temp_path = Path(temp.name)
                try:
                    run = subprocess.run(
                        [disasm, "-D", "-b", "binary", "-m", "i386:x86-64",
                         "--adjust-vma=" + hex(base + rva), str(temp_path)],
                        capture_output=True, text=True, check=False, timeout=20)
                    require(run.returncode == 0, "OBJDUMP_FAILED")
                    require(len(run.stdout) < 256 * 1024, "DISASM_OUTPUT_LIMIT")
                    (output_dir / (name + ".asm.txt")).write_text(
                        "# LOCAL ONLY. A bounded method prefix, not a whole function.\n"
                        "# Source version is owner-asserted, not independently proved.\n"
                        + run.stdout, encoding="utf-8")
                finally:
                    temp_path.unlink(missing_ok=True)
            rows.append({
                "name": method["name"], "rva": hex(rva),
                "mappedFileOffset": hex(offset), "section": section,
                "excerptBytes": excerpt_bytes,
                "excerptSha256": hashlib.sha256(raw).hexdigest(),
                "functionBoundaryVerified": False,
            })
    report = {
        "contract": "wand.db02.private-native-meal-price-disassembly@1",
        "dumpVersionClaim": plan["dumpVersionClaim"],
        "dllVersionClaim": dll_version,
        "binaryVersionIndependentlyVerified": False,
        "sameBuildOwnerAsserted": True,
        "dllSha256VerifiedAgainstProvidedExpected": True,
        "dumpSha256": plan["dumpSha256"],
        "dllSha256": sha,
        "imageBase": hex(base),
        "methodPrefixes": rows,
        "completeMethodsExtracted": False,
        "disassemblyPerformed": not extract_only,
        "binaryPrefixesExtracted": extract_only,
        "actualPriceFormulaVerified": False,
        "roundingRuleVerified": False,
        "publicationAuthorized": False,
    }
    (output_dir / "native-meal-price-probe.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8")
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dump", type=Path, required=True)
    parser.add_argument("--dump-version", choices=("1.26.1", "1.26.2"),
                        required=True)
    parser.add_argument("--expected-dump-sha256")
    parser.add_argument("--gameassembly", type=Path)
    parser.add_argument("--gameassembly-version", choices=("1.26.1", "1.26.2"))
    parser.add_argument("--expected-gameassembly-sha256")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--objdump-path")
    parser.add_argument("--excerpt-bytes", type=int, default=EXCERPT_SIZE,
                        help="Per-method bounded prefix bytes (1..8192)")
    parser.add_argument("--extract-only", action="store_true",
                        help="Python-only prefix extraction (private binary outputs)")
    args = parser.parse_args(argv)
    try:
        plan = source_method_plan(
            args.dump, args.dump_version, args.expected_dump_sha256)
        if args.gameassembly is not None:
            require(args.gameassembly_version is not None and
                    args.expected_gameassembly_sha256 is not None and
                    args.output_dir is not None, "DLL_FLAGS_REQUIRED")
            report = probe_dll(
                plan, args.gameassembly, args.gameassembly_version,
                args.expected_gameassembly_sha256, args.output_dir,
                disassembler=args.objdump_path, extract_only=args.extract_only,
                excerpt_bytes=args.excerpt_bytes)
            # Never print native instructions or private filenames in stdout.
            print(json.dumps({
                "status": ("PRIVATE_PREFIX_BINARY_EXTRACT_ONLY" if args.extract_only
                           else "PRIVATE_PREFIX_DISASSEMBLY_ONLY"),
                "methodPrefixes": len(report["methodPrefixes"]),
                "actualPriceFormulaVerified": False,
                "publicationAuthorized": False,
            }, indent=2))
        else:
            require(args.gameassembly_version is None and
                    args.expected_gameassembly_sha256 is None and
                    args.output_dir is None and args.objdump_path is None and
                    not args.extract_only and
                    args.excerpt_bytes == EXCERPT_SIZE, "UNUSED_DLL_FLAGS")
            print(json.dumps({
                "status": "SHA_PINNED_METHOD_ADDRESSES_ONLY",
                **plan,
            }, indent=2, ensure_ascii=False))
    except (OSError, UnicodeError, ValueError,
            subprocess.TimeoutExpired) as exc:
        parser.exit(1, "DB02 native price probe stopped: " + str(exc) + "\n")


if __name__ == "__main__":
    main()
