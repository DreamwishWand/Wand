"""CI scope selection: uncertain/shared changes always run the full suite."""
from __future__ import annotations
import argparse
from fnmatch import fnmatchcase
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

SOURCE_PATTERNS = {
    "db01": ["tools/src-01-items/**","tools/db-01-items/**","src/lib/items/**",".github/workflows/db-01-items.yml","tests/db01*.mjs","tests/item*.mjs","data/ddv/items/**","static/ddv/game-db/**"],
    "db03": ["tools/src-03-guide/**",".github/workflows/db03-guide.yml","data/ddv/guide/**","static/guide/**","tests/guide*.mjs"],
    "acquisition": ["tools/src-02-acquisition/**","src/lib/acquisition/**","crates/wand-acquisition-core/**","tests/acquisition*.test.mjs",".github/workflows/acquisition.yml","data/ddv/acquisition/**","static/ddv/acquisition/**"],
    "db05": ["data/ddv/save/**","src/lib/save/**","crates/ddv-save-schema/**","crates/ddv-save-patch/**","crates/ddv-p1g-codec/**","src/lib/save/save-native-p1g-audit.mjs","browser/save-wasm-smoke.mjs","tools/db-05-save/**","tests/save-schema.test.mjs","tests/save-db00-join.test.mjs","tests/save-common-shape.test.mjs","tests/save-native-shape.test.mjs","tests/save-nested-shape.test.mjs","tests/save-unified-shape.test.mjs","tests/save-domain-shape.test.mjs","tests/save-references.test.mjs","tests/save-catalog-links.test.mjs","tests/save-guide-links.test.mjs","tests/save-achievement-links.test.mjs","tests/save-duty-progress-evidence.test.mjs","tests/save-duty-milestones.test.mjs","tests/save-clean-baseline.test.mjs","tests/save-clean-regression.test.mjs","tests/save-clean-regression-cli.test.mjs","tests/save-native-catalog-crosscheck-cli.test.mjs","tests/save-db04-grid-path-cli.test.mjs","tests/save-db04-observed-grid-completion-cli.test.mjs","tests/save-editor-readset.test.mjs","tests/save-editor-handoff.test.mjs","tests/save-duty-reward-db01.test.mjs","src/lib/save/duty-rewards.ts","tests/save-achievement-progress.test.mjs","tests/save-diagnostic-view.test.mjs","tests/save-p1g-worker-diagnostics.test.mjs","src/routes/save/diagnostics/**","src/routes/save/preview/**","src/lib/save/save-wasm-reference.mjs","tests/save-redacted-witness.test.mjs","tests/save-redacted-cli.test.mjs",".github/workflows/db05-save.yml","tests/save*.mjs","src/routes/save/**","crates/ddv-save-*/**"],
    "db04": ["tools/db-04-world/**","src/lib/world/**","crates/wand-world-core/**","src/routes/world/**","static/ddv/world/**","tests/world-public-terrain.test.mjs","tests/world.test.mjs","tests/world-local-snapshot.test.mjs","tests/world-preview-views.test.mjs","tests/world-native-version-gate.test.mjs","tests/world-native-anchor-domain.test.mjs","tests/world-native-source-anchor-index.test.mjs","tests/world-native-item-anchor-finder.test.mjs","tests/world-native-gridarea-evidence.test.mjs","tests/world-native-gridarea-base.test.mjs","tests/world-native-gridarea-oriented.test.mjs","tests/world-native-catalog-core.test.mjs","tests/world-native-gridarea-local-window.test.mjs","tests/world-native-oblique.test.mjs","tests/world-native-terrain-preview.test.mjs","tests/world-native-region-grid-atlas.test.mjs","tests/world-native-floor-match.test.mjs","tests/world-native-floor-rectangle-window.test.mjs","src/lib/world/media-map-calibration.ts","src/lib/world/source-placement-preview.ts","src/lib/world/source-object-map.ts","src/lib/world/saved-shape-map.ts","src/lib/world/saved-map-transform.ts","src/lib/world/saved-draft-overlap.ts","src/lib/world/SavedShapePlot.svelte","src/lib/world/source-map-layers.ts","tests/world-source-object-map.test.mjs","tests/world-source-placement-preview.test.mjs","src/lib/world/MediaMapGridOverlay.svelte","tests/world-media-map-calibration.test.mjs","tests/world-saved-source-candidates.test.mjs","src/lib/world/native-oblique.ts","tests/world-native-gridobject-item-area-link.test.mjs","tests/world-native-default-gridlayers-cell.test.mjs","tests/world-native-default-gridlayers-window.test.mjs","tests/world-native-default-candidate-probe.test.mjs","src/lib/world/native-default-candidate-probe.ts","src/lib/world/native-default-gridlayers-window.ts","src/lib/world/native-default-gridlayers-cell.ts","src/lib/world/native-gridobject-item-area-link.ts","tests/world-reference-graph.test.mjs","tests/world-item-geography.test.mjs","tests/world-native-item-scope.test.mjs","tests/world-native-realm-universe.test.mjs","tests/world-native-tag-taxonomy.test.mjs","tests/world-worldless-source-placements.test.mjs","tests/world-village-world-tag-overlap.test.mjs","tests/world-native-area-tag-overlap.test.mjs","tests/world-native-realm-subtree.test.mjs","tests/world-native-graph-browser.test.mjs","tests/world-native-grid-navigation.test.mjs",".github/workflows/db04-world.yml","tests/world*.mjs","browser/world-graph-smoke.mjs","data/ddv/world/**"],
    "r2": ["tools/src-04-r2/**",".github/workflows/src04-r2.yml","data/ddv/media/**"],
}

def source_checks(paths: list[str], *, full: bool = False) -> dict[str, bool]:
    # Unknown diff or explicit regression runs exercise all source contracts.
    all_sources = full or not paths or any(
        p.startswith("tools/ci/") or p.startswith(".github/workflows/") for p in paths
    )
    return {name: all_sources or any(fnmatchcase(path, pattern) for path in paths for pattern in patterns)
            for name, patterns in SOURCE_PATTERNS.items()}

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
    # Exercise changes to the publication code before they reach main.
    result["pages"] = args.full or not paths or any(
        p == ".github/workflows/publish.yml" or p == ".github/workflows/collection.yml"
        or p.startswith("tools/ci/") or p == "scripts/build-collection-images.py"
        for p in paths
    )
    result.update(source_checks(paths, full=args.full))
    print("CI scope:", result)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as stream:
            for key, value in result.items():
                stream.write(f"{key}={str(value).lower()}\n")

if __name__ == "__main__":
    main()
