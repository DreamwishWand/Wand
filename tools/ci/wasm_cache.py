"""Exact-key reuse of public WASM packages. Unsupported inputs disable reuse."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tomllib

RECEIPT = ".wand-wasm-cache.json"
INCLUDE = re.compile(r'\binclude_(?:str|bytes)\s*!\s*\(\s*"([^"\\]+)"\s*,?\s*\)')
INCLUDE_CALL = re.compile(r'\binclude_(?:str|bytes)\s*!')
ENV = re.compile(r'\b(?:option_)?env\s*!\s*\(\s*"([^"\\]+)"')
ENV_CALL = re.compile(r'\b(?:option_)?env\s*!')
CACHE_VERSION = "wand-wasm-v1"

class Unsupported(ValueError):
    """A valid build may proceed, but its output cannot be reused safely."""

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def command(*args: str, cwd: Path | None = None) -> bytes:
    return subprocess.check_output(args, cwd=cwd)

def fingerprint(root: Path, crate: str, output: str, features: str,
                tracked: set[str], toolchain: dict[str, str]) -> str:
    root = root.resolve()
    inputs: set[Path] = set()
    visited: set[Path] = set()

    def path_in_repo(path: Path, *, must_track=True) -> Path:
        resolved = path.resolve()
        if not resolved.is_relative_to(root) or not resolved.is_file():
            raise Unsupported(f"External or missing input: {path.name}")
        if must_track and resolved.relative_to(root).as_posix() not in tracked:
            raise Unsupported(f"Untracked build input: {resolved.name}")
        return resolved

    def visit(directory: Path):
        directory = directory.resolve()
        if directory in visited:
            return
        if not directory.is_relative_to(root):
            raise Unsupported("External Cargo path dependency")
        visited.add(directory)
        manifest_path = path_in_repo(directory / "Cargo.toml")
        manifest = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
        package = manifest.get("package", {})
        if "workspace" in manifest or package.get("workspace") or (directory / "build.rs").exists():
            raise Unsupported("Workspace or custom build script")
        if package.get("build", False) not in (False, None):
            raise Unsupported("Custom Cargo build script")
        if manifest.get("patch") or manifest.get("replace"):
            raise Unsupported("Custom Cargo source replacement")
        prefix = directory.relative_to(root).as_posix() + "/"
        for name in sorted(tracked):
            if not name.startswith(prefix):
                continue
            path = path_in_repo(root / name)
            inputs.add(path)
            if path.suffix != ".rs":
                continue
            source = path.read_text(encoding="utf-8")
            matches = list(INCLUDE.finditer(source))
            if len(matches) != len(INCLUDE_CALL.findall(source)):
                raise Unsupported("Nonliteral Rust include")
            if re.search(r'\binclude\s*!|#\s*\[\s*path\s*=', source):
                raise Unsupported("Custom Rust source inclusion")
            for match in matches:
                inputs.add(path_in_repo(path.parent / match.group(1)))
            envs = ENV.findall(source)
            if len(envs) != len(ENV_CALL.findall(source)) or any(not key.startswith("CARGO_") for key in envs):
                raise Unsupported("Untracked compile-time environment")
        # Local path dependencies can themselves include other local crates.
        sections = [manifest, *manifest.get("target", {}).values()]
        for section in sections:
            for kind in ("dependencies", "dev-dependencies", "build-dependencies"):
                for dependency in section.get(kind, {}).values():
                    if isinstance(dependency, dict):
                        if dependency.get("workspace"):
                            raise Unsupported("Workspace-inherited dependency")
                        if "path" in dependency:
                            visit(directory / dependency["path"])

    if any((root / name).exists() for name in ("Cargo.toml", ".cargo/config", ".cargo/config.toml", "crates/.cargo/config", "crates/.cargo/config.toml")):
        raise Unsupported("Root Cargo workspace or configuration")
    visit(root / crate)
    # A generated lockfile is deliberately included: current crates need not
    # have committed Cargo.lock files, but the actual dependency resolution
    # must match the cached package and subsequent locked build.
    inputs.add(path_in_repo(root / crate / "Cargo.lock", must_track=False))
    for path in ("tools/ci/wasm_cache.py", ".github/actions/wand-wasm/action.yml",
                 "rust-toolchain", "rust-toolchain.toml"):
        if path in tracked:
            inputs.add(path_in_repo(root / path))
    for directory in visited:
        for name in (".cargo/config", ".cargo/config.toml"):
            if (directory / name).exists():
                raise Unsupported("Crate Cargo configuration")
    payload = {
        "version": CACHE_VERSION, "crate": crate, "output": output, "features": features,
        "toolchain": toolchain,
        "inputs": [(path.relative_to(root).as_posix(), digest(path.read_bytes()))
                   for path in sorted(inputs)],
    }
    return CACHE_VERSION + "-" + Path(crate).name + "-" + digest(json.dumps(payload, sort_keys=True).encode())

def package_files(output: Path) -> dict[str, str]:
    files = {}
    for path in sorted(output.rglob("*")):
        if path.is_symlink():
            raise ValueError("Symlink in WASM package")
        if path.is_file() and path.name != RECEIPT:
            files[path.relative_to(output).as_posix()] = digest(path.read_bytes())
    binaries = [name for name in files if name.endswith("_bg.wasm")]
    if len(binaries) != 1:
        raise ValueError("Expected exactly one generated WASM binary")
    binary = binaries[0]
    stem = binary.removesuffix("_bg.wasm")
    if (output / binary).read_bytes()[:4] != b"\0asm" or stem + ".js" not in files or stem + ".d.ts" not in files:
        raise ValueError("Incomplete WASM package")
    return files

def write_receipt(output: Path, key: str):
    files = package_files(output)
    (output / RECEIPT).write_text(json.dumps({"key": key, "files": files}, sort_keys=True) + "\n", encoding="utf-8")

def verify_receipt(output: Path, key: str) -> bool:
    try:
        receipt = json.loads((output / RECEIPT).read_text(encoding="utf-8"))
        return receipt == {"key": key, "files": package_files(output)}
    except (OSError, ValueError, KeyError):
        return False

def set_output(name: str, value: str):
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as stream:
        stream.write(f"{name}={value}\n")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("key", "record", "verify"))
    parser.add_argument("--crate", default="")
    parser.add_argument("--output", required=True)
    parser.add_argument("--features", default="")
    parser.add_argument("--key", default="")
    args = parser.parse_args()
    if args.mode == "record":
        write_receipt(Path(args.output), args.key)
    elif args.mode == "verify":
        set_output("verified", str(verify_receipt(Path(args.output), args.key)).lower())
    else:
        root = Path.cwd()
        tracked = {p.decode("utf-8", "surrogateescape") for p in command("git", "ls-files", "-z").split(b"\0") if p}
        try:
            cargo_home = Path(os.environ.get("CARGO_HOME", str(Path.home() / ".cargo")))
            if any((cargo_home / name).exists() for name in ("config", "config.toml")):
                raise Unsupported("Runner Cargo configuration")
            if any(os.environ.get(name) for name in ("RUSTC_WRAPPER", "RUSTC_WORKSPACE_WRAPPER", "RUSTFLAGS", "CARGO_ENCODED_RUSTFLAGS")):
                raise Unsupported("Custom Rust compiler flags")
            if any(name.startswith(("CARGO_PROFILE_", "CARGO_TARGET_", "CARGO_BUILD_")) for name in os.environ):
                raise Unsupported("Custom Cargo build configuration")
            toolchain = {name: command(*cmd).decode().strip() for name, cmd in {
                "rustc": ("rustc", "-Vv"), "cargo": ("cargo", "-V"), "wasm-pack": ("wasm-pack", "--version")
            }.items()}
            toolchain.update({name: os.environ.get(name, "") for name in ("RUNNER_OS", "RUNNER_ARCH", "ImageOS", "ImageVersion")})
            key = fingerprint(root, args.crate, args.output, args.features, tracked, toolchain)
            set_output("key", key)
            set_output("cacheable", "true")
            print(f"Exact WASM cache key: {key}")
        except (Unsupported, OSError, ValueError, subprocess.CalledProcessError) as exc:
            set_output("cacheable", "false")
            print(f"WASM cache disabled; build normally: {exc}")

if __name__ == "__main__":
    main()
