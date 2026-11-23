#!/usr/bin/env python3
"""Resolve selected original IL2CPP method pointers from Steam's OWN sources.

Steam v1.26.1: global-metadata.dat v31 type/method/image definitions are
cross-linked to native PE32+ CodeGenModule -> methodPointers[token RID - 1],
and each resolved RVA is checked against the original AMD64 .pdata start.
Never apply an arbitrary offset to a dump.cs RVA; never publish game binaries.
"""
import argparse
import hashlib
import json
import mmap
import struct
from pathlib import Path

from pe_unwind import read_pe_runtime_functions

METADATA_VERSION = 31
METADATA_MAX = 256 * 1024 * 1024
DLL_MAX = 1024 * 1024 * 1024
TYPE_SIZE = 88
METHOD_SIZE = 36
IMAGE_SIZE = 40
TARGETS = (
    ("Definitions.Grid", "GridData", "get_Item", 2),
    ("Definitions.Grid", "GridData", "set_Item", 3),
    ("Definitions.Grid", "GridData",
     "Definitions.Util.IProtobufOnBinarize.OnBinarize", 0),
    ("Definitions.Grid", "GridData", "GetNumberOfBitsPerPosition", 0),
)


def _digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _mapped_source(path, maximum):
    file = Path(path)
    if file.is_symlink() or not file.is_file() or not 256 <= file.stat().st_size <= maximum:
        raise ValueError("missing/unsafe original native source")
    return file


class Metadata31:
    def __init__(self, raw):
        if len(raw) < 256 or struct.unpack_from("<II", raw, 0) != (
                0xfab11baf, METADATA_VERSION):
            raise ValueError("unsupported original IL2CPP metadata version")
        self.raw = raw
        self.strings, self.strings_len = self._table(6, 1)
        self.methods, self.methods_len = self._table(12, METHOD_SIZE)
        self.types, self.types_len = self._table(40, TYPE_SIZE)
        self.images, self.images_len = self._table(42, IMAGE_SIZE)

    def _table(self, pair, stride):
        offset, length = struct.unpack_from("<II", self.raw, pair * 4)
        if (not offset or not length or length % stride or
                offset > len(self.raw) or length > len(self.raw) - offset):
            raise ValueError("original IL2CPP metadata table outside file")
        return offset, length // stride

    def text(self, name_idx):
        if type(name_idx) is not int or name_idx >= self.strings_len:
            raise ValueError("invalid original metadata string index")
        absolute = self.strings + name_idx
        end = self.raw.find(b"\x00", absolute, self.strings + self.strings_len)
        if end < 0:
            raise ValueError("unbounded original metadata string")
        return self.raw[absolute:end].decode("utf-8", "strict")

    def type_methods(self, namespace, name, param_counts):
        matches = []
        for index in range(self.types_len):
            row = self.types + index * TYPE_SIZE
            name_idx, namespace_idx = struct.unpack_from("<II", self.raw, row)
            # Avoid expensive string decoding for every unrelated native type.
            if self.text(name_idx) != name:
                continue
            if self.text(namespace_idx) != namespace:
                continue
            matches.append(index)
        if len(matches) != 1:
            raise ValueError("missing/ambiguous original IL2CPP type")
        type_index = matches[0]
        type_offset = self.types + type_index * TYPE_SIZE
        method_start = struct.unpack_from("<I", self.raw, type_offset + 36)[0]
        # Version-31 TypeDefinition offset +64 low 16 bits is method_count.
        method_count = struct.unpack_from("<H", self.raw, type_offset + 64)[0]
        if method_count < len(param_counts) or method_start + method_count > self.methods_len:
            raise ValueError("invalid original native type/method cardinality")
        found = {}
        for index in range(method_start, method_start + method_count):
            row = self.methods + index * METHOD_SIZE
            name_idx, declared_type = struct.unpack_from("<II", self.raw, row)
            if declared_type != type_index:
                raise ValueError("original method declaring type mismatch")
            method_name = self.text(name_idx)
            param_count = struct.unpack_from("<H", self.raw, row + 34)[0]
            key = (method_name, param_count)
            if key not in param_counts:
                continue
            token = struct.unpack_from("<I", self.raw, row + 24)[0]
            if (token >> 24 != 6 or token & 0xffffff == 0 or key in found):
                raise ValueError("invalid/duplicate original method definition token")
            found[key] = {"symbol": f"{namespace}.{name}.{method_name}",
                          "parameterCount": param_count, "token": token,
                          "tokenRid": token & 0xffffff,
                          "typeDefinitionIndex": type_index}
        if set(found) != set(param_counts):
            raise ValueError("original native methods missing/overloaded ambiguously")
        candidates = []
        for i in range(self.images_len):
            row = self.images + i * IMAGE_SIZE
            image_name_idx, _, type_start, type_count = struct.unpack_from(
                "<IIII", self.raw, row)
            if type_start <= type_index < type_start + type_count:
                candidates.append(self.text(image_name_idx))
        if len(candidates) != 1:
            raise ValueError("original native type not in exactly one module")
        return candidates[0], [found[key] for key in param_counts]


class PE64Image:
    def __init__(self, binary):
        self.binary = binary
        if binary[:2] != b"MZ":
            raise ValueError("expected original native Windows PE")
        pe_offset = struct.unpack_from("<I", binary, 0x3c)[0]
        if pe_offset < 64 or pe_offset > len(binary) - 256 or (
                binary[pe_offset:pe_offset + 4] != b"PE\x00\x00"):
            raise ValueError("invalid original PE signature")
        machine, sections, _, _, _, opt_size, _ = struct.unpack_from(
            "<HHIIIHH", binary, pe_offset + 4)
        if machine != 0x8664 or not 1 <= sections <= 96 or not 112 <= opt_size <= 4096:
            raise ValueError("expected original PE32+ x64")
        opt = pe_offset + 24
        if struct.unpack_from("<H", binary, opt)[0] != 0x20b:
            raise ValueError("original binary is not PE32+")
        self.image_base = struct.unpack_from("<Q", binary, opt + 24)[0]
        self.sections = []
        # VirtualSize can exceed SizeOfRawData (.data BSS). Keep this
        # additional map for source-reference classification without changing
        # the strict file-backed RVA mapping used for executable methods.
        self.virtual_sections = []
        table = opt + opt_size
        if table + sections * 40 > len(binary):
            raise ValueError("truncated original PE64 section table")
        for i in range(sections):
            row = table + i * 40
            virtual_size, va, raw_size, offset = struct.unpack_from(
                "<IIII", binary, row + 8)
            flags = struct.unpack_from("<I", binary, row + 36)[0]
            if raw_size > len(binary) - offset:
                raise ValueError("original PE section out of source bounds")
            self.sections.append((offset, min(virtual_size, raw_size), va, flags))
            self.virtual_sections.append((va, virtual_size, raw_size,
                                          offset, flags))

    def file_to_va(self, offset, size=1):
        for raw, length, rva, _ in self.sections:
            if raw <= offset and size <= length - (offset - raw):
                return self.image_base + rva + offset - raw
        raise ValueError("native offset outside mapped source PE sections")

    def va_to_file(self, address, size=1, executable=False):
        rva = address - self.image_base
        matches = [
            raw + (rva - va) for raw, length, va, flags in self.sections
            if va <= rva and size <= length - (rva - va) and
            (not executable or (flags & 0x20000000))
        ]
        if len(matches) != 1:
            raise ValueError("native method pointer not in unique source PE section")
        return matches[0]


def resolve_native_grid_methods(game_assembly, metadata_path, *,
                                namespace="Definitions.Grid",
                                type_name="GridData",
                                requested_methods=None):
    """Resolve only exact metadata-selected signatures via ORIGINAL PE pointers.

    The default four GridData methods and their existing behavior are
    preserved. An explicit hash candidate may be selected by discovery
    using (namespace,type,method,param_count) but the returned pointer is
    NOT evidence for either DiffGrid hash algorithm or its return value.
    """
    if requested_methods is None:
        if namespace != "Definitions.Grid" or type_name != "GridData":
            raise ValueError("custom native type needs exact requested methods")
        names = [(n, p) for ns, typ, n, p in TARGETS
                 if ns == namespace and typ == type_name]
    else:
        if (not isinstance(namespace, str) or not namespace or
                not isinstance(type_name, str) or not type_name or
                not isinstance(requested_methods, (list, tuple)) or
                not 1 <= len(requested_methods) <= 16 or
                any(not isinstance(x, tuple) or len(x) != 2 or
                    not isinstance(x[0], str) or not x[0] or
                    len(x[0]) > 256 or type(x[1]) is not int or
                    not 0 <= x[1] <= 64 for x in requested_methods) or
                len(set(requested_methods)) != len(requested_methods)):
            raise ValueError("invalid explicit original native method signatures")
        names = list(requested_methods)
    dll = _mapped_source(game_assembly, DLL_MAX)
    metadata_path = _mapped_source(metadata_path, METADATA_MAX)
    metadata = Metadata31(metadata_path.read_bytes())
    module, methods = metadata.type_methods(namespace, type_name, names)
    runtime, start_rvas, pdata_sha = read_pe_runtime_functions(dll)
    # The native method pointer table must be found in the source binary
    # through the original metadata IMAGE name, not by a hard-coded RVA.
    with dll.open("rb") as source, mmap.mmap(
            source.fileno(), 0, access=mmap.ACCESS_READ) as binary:
        pe = PE64Image(binary)
        cursor = 0
        module_names = []
        while True:
            position = binary.find(module.encode("utf-8") + b"\x00", cursor)
            if position < 0:
                break
            module_names.append(pe.file_to_va(position, len(module) + 1))
            cursor = position + 1
            if len(module_names) > 16:
                raise ValueError("ambiguous duplicate native code module names")
        if not module_names:
            raise ValueError("native PE missing original IL2CPP code module")
        required_count = max(method["tokenRid"] for method in methods)
        candidates = []
        for name_address in module_names:
            pointer_bytes = struct.pack("<Q", name_address)
            cursor = 0
            while True:
                position = binary.find(pointer_bytes, cursor)
                if position < 0:
                    break
                cursor = position + 1
                try:
                    pe.file_to_va(position, 24)
                    _, count, method_array = struct.unpack_from("<QQQ", binary,
                                                                 position)
                    if count < required_count or count > 2_000_000:
                        continue
                    offset = pe.va_to_file(method_array, required_count * 8)
                    # Runtime pointers for every requested token must map
                    # to executable code and match the original PE .pdata.
                    pointers = []
                    for record in methods:
                        address = struct.unpack_from(
                            "<Q", binary, offset + (record["tokenRid"] - 1) * 8)[0]
                        pe.va_to_file(address, 1, executable=True)
                        rva = address - pe.image_base
                        from bisect import bisect_left
                        ix = bisect_left(start_rvas, rva)
                        if ix == len(start_rvas) or start_rvas[ix] != rva:
                            raise ValueError("native token pointer not at PE unwind function start")
                        pointers.append((rva, runtime[ix][1]))
                    candidates.append((position, count, method_array, pointers))
                except (ValueError, struct.error):
                    continue
                if len(candidates) > 1:
                    raise ValueError("ambiguous original IL2CPP native module pointer table")
        if len(candidates) != 1:
            raise ValueError("source-correlated native method pointer table unavailable")
        _, count, array_ptr, ptrs = candidates[0]
        resolved = []
        for record, (rva, end) in zip(methods, ptrs):
            resolved.append({**record, "rva": rva, "peUnwindFunctionEndRva": end,
                             "nativeMethodIdentityVerified": False,
                             "nativeCodeBodyVerified": False})
        pointer_offset = pe.va_to_file(array_ptr, count * 8)
        table_digest = hashlib.sha256(binary[
            pointer_offset:pointer_offset + count * 8]).hexdigest()
    return {
        "schema": "wand.db04.native-source-method-pointers@1",
        "status": "original_metadata_v31_token_pointer_corroboration",
        "metadataVersion": METADATA_VERSION,
        "originalMetadataSha256": _digest(metadata_path),
        "originalDllSha256": _digest(dll),
        "moduleName": module,
        "moduleMethodPointerCount": count,
        "moduleMethodPointerTableSha256": table_digest,
        "peUnwindTableSha256": pdata_sha,
        "peUnwindRecordCount": len(runtime),
        "methods": resolved,
        "nativeMethodIdentityVerified": False,
        "nativeCodeBodyVerified": False,
        "placementLegalityVerified": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dll", required=True, type=Path)
    parser.add_argument("--metadata", required=True, type=Path)
    args = parser.parse_args()
    try:
        report = resolve_native_grid_methods(args.dll, args.metadata)
        print(json.dumps(report, sort_keys=True, indent=2))
    except (ValueError, TypeError, OSError, UnicodeError, struct.error) as error:
        parser.exit(1, f"DB-04 original IL2CPP source method resolver failed: {error}\n")


if __name__ == "__main__":
    main()
