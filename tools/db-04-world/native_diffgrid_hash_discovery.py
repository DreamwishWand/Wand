"""Offline private native metadata inventory for DiffGrid hash research.

This does NOT calculate any default Grid hash, modify a Save, or certify a
native method's semantics. It enumerates exact IL2CPP v31 method tokens from
the user's original Steam metadata. Optionally resolve ONE explicitly
selected candidate token against the exact original GameAssembly.dll and
PE unwind table, using the existing strict pointer resolver.

Never commit program output, private metadata, assembly or a private Save.
"""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

from native_method_pointers import (
    Metadata31, _mapped_source, METADATA_MAX, resolve_native_grid_methods,
    METHOD_SIZE, TYPE_SIZE, IMAGE_SIZE,
)

MAX_CANDIDATES = 256
VERSION_RE = re.compile(r"(?<![0-9])(?:[0-9]{1,3}\.){2}[0-9]{1,4}(?![0-9])")
TOKEN_RE = re.compile(r"0x06[0-9a-fA-F]{6}\Z")


def require(condition, code):
    if not condition:
        raise ValueError("DB04_NATIVE_DIFF_HASH_AUDIT:" + code)


def discover_native_diffgrid_hash_methods(metadata_path, version_file):
    """Inventory *source declarations*, not method implementations.

    Look for hash-named methods on Grid-related original classes and methods
    whose names themselves contain both 'grid' and 'hash'. Do not assume
    'GetHashCode' means the serialized DefaultGridHashCode field.
    """
    metadata_path = _mapped_source(metadata_path, METADATA_MAX)
    version_file = Path(version_file)
    require(version_file.is_file() and not version_file.is_symlink() and
            version_file.stat().st_size <= 4096,
            "MISSING_OR_UNSAFE_SOURCE_VERSION")
    raw_version = version_file.read_text(encoding="utf-8-sig")
    versions = set(VERSION_RE.findall(raw_version))
    require(len(versions) == 1, "AMBIGUOUS_GAME_VERSION")
    raw = metadata_path.read_bytes()
    meta = Metadata31(raw)
    matches = []
    for type_index in range(meta.types_len):
        off = meta.types + type_index * TYPE_SIZE
        name_idx, namespace_idx = struct.unpack_from("<II", raw, off)
        class_name = meta.text(name_idx)
        namespace = meta.text(namespace_idx)
        class_grid_related = "grid" in (namespace + "." + class_name).lower()
        start = struct.unpack_from("<I", raw, off + 36)[0]
        number = struct.unpack_from("<H", raw, off + 64)[0]
        require(start <= meta.methods_len and
                number <= meta.methods_len - start,
                "INVALID_METADATA_METHOD_RANGE")
        if not class_grid_related and "hash" not in class_name.lower():
            # Non-grid types can still have an explicit GetGridHash method.
            # Keep those only if the *method* identifies both concepts.
            pass
        for pos in range(start, start + number):
            method = meta.methods + pos * METHOD_SIZE
            method_idx, declaring = struct.unpack_from("<II", raw, method)
            require(declaring == type_index, "DECLARING_TYPE_MISMATCH")
            method_name = meta.text(method_idx)
            low = method_name.lower()
            if not ((class_grid_related and "hash" in low) or
                    ("grid" in low and "hash" in low)):
                continue
            param_count = struct.unpack_from("<H", raw, method + 34)[0]
            token = struct.unpack_from("<I", raw, method + 24)[0]
            require(token >> 24 == 6 and 0 < (token & 0xffffff) and
                    param_count <= 64,
                    "INVALID_HASH_CANDIDATE_TOKEN")
            modules = []
            for i in range(meta.images_len):
                image = meta.images + i * IMAGE_SIZE
                module_idx, _, t_start, t_count = struct.unpack_from(
                    "<IIII", raw, image)
                if t_start <= type_index < t_start + t_count:
                    modules.append(meta.text(module_idx))
            require(len(modules) == 1, "AMBIGUOUS_DECLARING_NATIVE_MODULE")
            matches.append({
                "namespace": namespace, "className": class_name,
                "methodName": method_name, "parameterCount": param_count,
                "token": f"0x{token:08x}", "moduleName": modules[0],
                "typeDefinitionIndex": type_index,
                "originalNativeBodyCorrelated": False,
                "methodHashSemanticsVerified": False
            })
            require(len(matches) <= MAX_CANDIDATES, "TOO_MANY_CANDIDATES")
    matches.sort(key=lambda x: (x["namespace"], x["className"],
                                x["methodName"], x["parameterCount"], x["token"]))
    return {
        "schema": "wand.db04.native-diff-hash-method-discovery@1",
        "status": "original_metadata_v31_method_names_only",
        "sourceGameVersion": versions.pop(),
        "metadataVersion": 31,
        "originalMetadataSha256": hashlib.sha256(raw).hexdigest(),
        "candidateMethodCount": len(matches),
        "candidates": matches,
        "nativeDefaultGridHashCodeComputed": False,
        "nativeDefaultGridDataHashCodeComputed": False,
        "diffGridIdentityVerified": False,
        "saveEditingAuthorized": False,
        "originalMethodAlgorithmVerified": False
    }


def resolve_selected_hash_method(discovery, metadata_path, dll_path, token):
    """Resolve exactly one discovered token to original source PE code.

    The resulting RVA and pointer-table digest are evidence of SOURCE
    token-to-PE linkage, not the output/meaning of a native hash function.
    """
    require(isinstance(token, str) and TOKEN_RE.fullmatch(token),
            "INVALID_CANDIDATE_TOKEN")
    selected = [x for x in discovery["candidates"]
                if x["token"].lower() == token.lower()]
    require(len(selected) == 1, "UNKNOWN_OR_AMBIGUOUS_CANDIDATE_TOKEN")
    item = selected[0]
    resolved = resolve_native_grid_methods(
        dll_path, metadata_path,
        namespace=item["namespace"], type_name=item["className"],
        requested_methods=[(item["methodName"], item["parameterCount"])])
    require(len(resolved["methods"]) == 1 and
            resolved["methods"][0]["token"] == int(token, 16) and
            resolved["moduleName"] == item["moduleName"] and
            resolved["originalMetadataSha256"] ==
            discovery["originalMetadataSha256"],
            "CORROBORATED_TOKEN_OR_MODULE_MISMATCH")
    method = resolved["methods"][0]
    return {
        "schema": "wand.db04.native-diff-hash-candidate-pointer@1",
        "status": "original_metadata_token_pe_unwind_start_correlated",
        "sourceGameVersion": discovery["sourceGameVersion"],
        "originalMetadataSha256": resolved["originalMetadataSha256"],
        "originalDllSha256": resolved["originalDllSha256"],
        "moduleMethodPointerTableSha256":
            resolved["moduleMethodPointerTableSha256"],
        "peUnwindTableSha256": resolved["peUnwindTableSha256"],
        "candidate": {**item,
                      "rva": method["rva"],
                      "peUnwindFunctionEndRva": method["peUnwindFunctionEndRva"],
                      "originalNativeBodyCorrelated": True,
                      "methodHashSemanticsVerified": False},
        "nativeDefaultGridHashCodeComputed": False,
        "nativeDefaultGridDataHashCodeComputed": False,
        "diffGridIdentityVerified": False,
        "saveEditingAuthorized": False,
        "originalMethodAlgorithmVerified": False
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--version", type=Path, required=True)
    parser.add_argument("--dll", type=Path)
    parser.add_argument("--candidate-token")
    args = parser.parse_args(argv)
    try:
        require((args.dll is None) == (args.candidate_token is None),
                "DLL_AND_EXACT_CANDIDATE_TOKEN_REQUIRED_TOGETHER")
        discovery = discover_native_diffgrid_hash_methods(
            args.metadata, args.version)
        report = (resolve_selected_hash_method(
            discovery, args.metadata, args.dll, args.candidate_token)
            if args.dll is not None else discovery)
        print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    except (ValueError, OSError, UnicodeError, struct.error) as error:
        parser.exit(1, f"DB-04 private hash method discovery failed: {error}\n")


if __name__ == "__main__":
    main()
