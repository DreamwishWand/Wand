"""CI scope selection: uncertain/shared changes always run the full suite."""
from __future__ import annotations
import argparse
import os
import subprocess
from pathlib import Path

DOMAINS = ("collection", "memory", "explore", "guide", "save", "world")
ROUTES = {
    "src/routes/collection/": ("collection", "memory"),
    "src/routes/media/memory-preview/": ("memory", "collection"),
    "src/routes/decorate/explore/": ("explore",),
    "src/routes/guide/": ("guide",),
    "src/routes/save/": ("save", "collection", "world"),
    "src/routes/world/": ("world", "save"),
}
SMOKES = {
    "browser/collection-smoke.mjs": ("collection",),
    "browser/memory-puzzle-smoke.mjs": ("memory",),
    "browser/explore-viewport-smoke.mjs": ("explore",),
    "browser/guide-smoke.mjs": ("guide",),
    "browser/save-wasm-smoke.mjs": ("save",),
    "browser/world-graph-smoke.mjs": ("world",),
}
# These tools have dedicated PR workflows. Do not include DB materializers
# or shared build scripts here: those can change the published product.
OFFLINE = ("tools/src-04-r2/", "tools/src-03-guide/", "tools/src-01-items/")
DOCS = {"README.md", "AGENTS.md", "CONTRIBUTING.md", "CHANGELOG.md"}

def classify(paths: list[str], *, allow_offline: bool = True) -> dict[str, bool]:
    selected: set[str] = set()
    product = False
    if not paths:
        return {"product": True, **dict.fromkeys(DOMAINS, True)}
    for path in paths:
        if path in DOCS or (path.startswith("docs/") and path.endswith(".md")):
            continue
        if allow_offline and path.startswith(OFFLINE):
            continue
        product = True
        if path in SMOKES:
            selected.update(SMOKES[path])
            continue
        for prefix, domains in ROUTES.items():
            if path.startswith(prefix):
                selected.update(domains)
                break
        else:
            # Shared libraries, data, configuration, CI, unclassified tests,
            # new services, deletions and unknown paths: conservative fallback.
            selected.update(DOMAINS)
    return {"product": product, **{domain: domain in selected for domain in DOMAINS}}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--merge-group", action="store_true")
    args = parser.parse_args()
    paths = []
    if not args.full and args.base and args.head:
        try:
            raw = subprocess.check_output(["git", "diff", "--name-only", "-z", "--no-renames", args.base, args.head])
            paths = [p.decode("utf-8", "surrogateescape") for p in raw.split(b"\0") if p]
        except (OSError, subprocess.CalledProcessError):
            print("Unable to determine changed files; run full checks.")
    result = classify(paths, allow_offline=not args.merge_group)
    print("CI scope:", result)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as stream:
            for key, value in result.items():
                stream.write(f"{key}={str(value).lower()}\n")

if __name__ == "__main__":
    main()
