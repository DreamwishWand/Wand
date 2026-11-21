#!/usr/bin/env python3
"""Pack a verified PRIVATE DB-04 Steam snapshot into a reproducible ZIP.

Only manifest-registered output JSON, manifest.json and three generated private
diagnostics are included. Original game binaries, player saves and images
are never bundled. A ZIP is not a claim of complete game source coverage.
"""
import argparse
import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

from audit_layout_terrain import audit_snapshot
from audit_footprint_candidates import audit_footprint_candidates
from verify_bundle import read_json, validate_snapshot

MAX_MEMBERS = 100
FIXED_DATE = (1980, 1, 1, 0, 0, 0)


def _content(payload):
    return (json.dumps(payload, sort_keys=True, ensure_ascii=False,
                       indent=2) + "\n").encode("utf-8")


def _zip_entry(name):
    entry = zipfile.ZipInfo(name, FIXED_DATE)
    entry.compress_type = zipfile.ZIP_DEFLATED
    entry.external_attr = 0o600 << 16
    entry.create_system = 3
    return entry


def _sha256_file(path):
    h = hashlib.sha256()
    with path.open("rb") as src:
        for block in iter(lambda: src.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _is_git_tree(path):
    return any((parent / ".git").exists()
               for parent in (path, *path.parents))


def package_snapshot(snapshot: Path, output_zip: Path) -> dict:
    root = Path(snapshot).resolve(strict=True)
    output = Path(output_zip).resolve()
    if not root.is_dir():
        raise ValueError("private snapshot must be a directory")
    if (root == output or root in output.parents or
            output.exists() or output.suffix.lower() != ".zip"):
        raise ValueError("ZIP must not overwrite or reside within source snapshot")
    if _is_git_tree(root) or _is_git_tree(output.parent):
        raise ValueError("private world data cannot be packaged in a Git worktree")
    output.parent.mkdir(parents=True, exist_ok=True)

    verification = validate_snapshot(root)
    diagnostics = audit_snapshot(root, max_samples=50)
    hypothesis_diagnostics = audit_footprint_candidates(
        root, max_objects=5000, max_examples=20)
    manifest = read_json(root / "manifest.json")
    output_hashes = manifest["outputSha256"]
    names = ["manifest.json", *sorted(output_hashes)]
    if len(names) > MAX_MEMBERS or len(set(names)) != len(names):
        raise ValueError("invalid count of private manifest files")
    for name in names:
        if not name.endswith(".json") or "/" in name or "\\" in name or name.startswith("."):
            raise ValueError("unsafe manifest ZIP member name")
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("unsafe/missing output JSON for private ZIP")

    out_fd, tmp_name = tempfile.mkstemp(
        prefix=".db04-snapshot-", suffix=".tmp", dir=output.parent)
    os.close(out_fd)
    tmp = Path(tmp_name)
    try:
        with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED,
                             compresslevel=8, allowZip64=True) as archive:
            for name in names:
                # Stream file bytes; avoid allocating large JSON assets or
                # retaining game-derived records in this process's heap.
                with (root / name).open("rb") as source, archive.open(
                        _zip_entry(name), mode="w", force_zip64=True) as target:
                    shutil.copyfileobj(source, target, 1024 * 1024)
            archive.writestr(
                _zip_entry("diagnostics/verification.json"),
                _content(verification), compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=8)
            archive.writestr(
                _zip_entry("diagnostics/layout-terrain-audit.json"),
                _content(diagnostics), compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=8)
            archive.writestr(
                _zip_entry("diagnostics/footprint-hypotheses.json"),
                _content(hypothesis_diagnostics),
                compress_type=zipfile.ZIP_DEFLATED, compresslevel=8)
        with zipfile.ZipFile(tmp, "r") as archive:
            expected = set(names + ["diagnostics/verification.json",
                                     "diagnostics/layout-terrain-audit.json",
                                     "diagnostics/footprint-hypotheses.json"])
            if set(archive.namelist()) != expected:
                raise ValueError("private snapshot ZIP member verification failed")
            for name, expected_hash in output_hashes.items():
                h = hashlib.sha256()
                with archive.open(name) as source:
                    for block in iter(lambda: source.read(1024 * 1024), b""):
                        h.update(block)
                if h.hexdigest() != expected_hash:
                    raise ValueError(f"packaged output content mismatch: {name}")
            damaged = archive.testzip()
            if damaged is not None:
                raise ValueError(f"private snapshot ZIP CRC mismatch: {damaged}")
        if output.exists():
            raise ValueError("destination ZIP created concurrently")
        os.replace(tmp, output)
    finally:
        if tmp.exists():
            tmp.unlink()
    return {
        "status": "verified_private_partial_snapshot_package",
        "zipPath": str(output),
        "zipSha256": _sha256_file(output),
        "zipBytes": output.stat().st_size,
        "gameVersion": verification["gameVersion"],
        "snapshotSourceScopeComplete": verification["sourceScopeVerified"],
        "outputFileCount": len(names),
        "auditDefaultObjectCount": diagnostics["defaultObjectCount"],
        "footprintHypothesisObjectCount": hypothesis_diagnostics[
            "layoutObjectsConsidered"],
        "footprintHypothesesUnverified": True,
        "placementLegalityVerified": False,
        "includesOriginalGameBinaries": False,
        "includesPlayerSaves": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--zip", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(package_snapshot(args.snapshot, args.zip),
                         sort_keys=True, ensure_ascii=False, indent=2))
    except (OSError, ValueError, TypeError, UnicodeError, KeyError,
            json.JSONDecodeError, zipfile.BadZipFile) as error:
        parser.exit(1, f"DB-04 private snapshot packaging failed: {error}\n")


if __name__ == "__main__":
    main()
