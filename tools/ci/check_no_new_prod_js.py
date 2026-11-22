#!/usr/bin/env python3
"""PR guard: prevent new or growing handwritten production JavaScript in src/.

Existing JavaScript is migration-only. This is deliberately a narrow, cheap
structural check, not a claim that byte size proves semantic correctness.
"""

from __future__ import annotations

import argparse
from pathlib import PurePosixPath
import re
import subprocess
import sys

JS_EXTENSIONS = frozenset({".js", ".mjs", ".cjs", ".jsx"})
TEST_FILE_RE = re.compile(r"(?:^|/)[^/]+\.(?:test|spec)\.(?:js|mjs|cjs|jsx)$")
GENERATED_WASM_RE = re.compile(
    r"^src/(?:[^/]+/)*wasm/(?:[^/]+-)?pkg/[^/]+(?:_bg)?\.js$"
)


def git(*args: str) -> bytes:
    completed = subprocess.run(
        ["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False
    )
    if completed.returncode:
        raise RuntimeError(
            f"git {' '.join(args[:3])} failed: "
            + completed.stderr.decode("utf-8", errors="replace").strip()
        )
    return completed.stdout


def production_js(path: str) -> bool:
    if not path.startswith("src/") or PurePosixPath(path).suffix not in JS_EXTENSIONS:
        return False
    parts = PurePosixPath(path).parts
    if any(part in {"__tests__", "tests", "test", "__fixtures__"} for part in parts):
        return False
    if TEST_FILE_RE.search(path):
        return False
    if GENERATED_WASM_RE.fullmatch(path):
        return False
    return True


def changed_files(base: str, head: str) -> list[str]:
    # -z handles whitespace and unusual filenames without shell tokenization.
    raw = git("diff", "--name-only", "-z", "--diff-filter=ACMR", base, head, "--", "src/")
    return [p.decode("utf-8", "surrogateescape") for p in raw.split(b"\0") if p]


def existed_at(rev: str, path: str) -> bool:
    result = subprocess.run(
        ["git", "cat-file", "-e", f"{rev}:{path}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def blob_size(rev: str, path: str) -> int:
    return int(git("cat-file", "-s", f"{rev}:{path}").decode("ascii").strip())


def check(base: str, head: str) -> list[str]:
    ancestor = git("merge-base", base, head).decode("ascii").strip()
    failures = []
    for path in changed_files(ancestor, head):
        if not production_js(path):
            continue
        if not existed_at(ancestor, path):
            failures.append(f"NEW production JavaScript: {path}")
            continue
        # This is a net-growth heuristic; non-growing edits may still need
        # code review to enforce the no-new-JS-features project policy.
        before, after = blob_size(ancestor, path), blob_size(head, path)
        if after > before:
            failures.append(
                f"GROWING legacy JavaScript: {path} (+{after - before} bytes)"
            )
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, help="Pull request base commit SHA")
    parser.add_argument("--head", required=True, help="Pull request head commit SHA")
    args = parser.parse_args()
    try:
        failures = check(args.base, args.head)
    except (RuntimeError, ValueError) as exc:
        print(f"Architecture guard could not run: {exc}", file=sys.stderr)
        return 2
    if failures:
        print("Architecture guard FAILED: production JavaScript must not expand.")
        for item in failures:
            print(f"  - {item}")
        print("Implement new logic in TypeScript or Rust/WASM instead.")
        print("Allowed: tests, build config outside src/, generated WASM bindings, and shrinking legacy JS.")
        return 1
    print("Architecture guard PASS: no new or growing handwritten production JavaScript in src/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
