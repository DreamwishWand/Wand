#!/usr/bin/env python3
"""Compare native PromoArt catalog locations across Steam versions.

The catalog identifies artwork candidates, not Shop offers or membership.
Optional verification reuses the typed Unity resolver and existing image
manifests. No publication, no network, no game modification.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

from census_shop_sources import Census
from resolve_shop_catalog import FILES
from resolve_shop_objects import dependency_path, file_sha, resolve_objects, existing_artwork

GUID = re.compile(r"[0-9a-f]{32}")
CLASSES = {"UnityEngine.Sprite", "UnityEngine.Texture2D"}


def promo_location(row):
    # Match native asset/bundle names, not localization titles or offer IDs.
    values = [row.get("internalId", ""), *row.get("dependencies", [])]
    return any("promoart" in value.casefold() for value in values)


def catalog_index(rows):
    index = defaultdict(set)
    for row in rows:
        key = row.get("catalogKey")
        if not isinstance(key, str) or not GUID.fullmatch(key):
            continue
        if row.get("class") not in CLASSES or not promo_location(row):
            continue
        index[key].add((row["class"], row["internalId"],
                        tuple(sorted(set(row["dependencies"])))))
    return {g: [{"class": cls.split(".")[-1], "internalId": path,
                 "dependencies": list(deps)}
                for cls, path, deps in sorted(locations)]
            for g, locations in sorted(index.items())}


def read_catalog(root):
    c = Census()
    c.addressables(root, "catalog.json")
    return catalog_index(c.art), {name: file_sha(root / name) for name in FILES}


def bundle_fingerprints(root, index):
    """Hash each locally present dependency once; missing bytes stay unknown."""
    paths = {}
    for locations in index.values():
        for loc in locations:
            for dep in loc["dependencies"]:
                if dep not in paths:
                    path = dependency_path(root, dep)
                    paths[dep] = file_sha(path) if path and path.is_file() else None
    return paths


def compare(old, new, old_hashes=None, new_hashes=None):
    old_hashes = old_hashes or {}
    new_hashes = new_hashes or {}
    rows = {}
    for guid in sorted(old.keys() | new.keys()):
        before, after = old.get(guid), new.get(guid)
        changed = []
        missing = []
        if before is None:
            status = "added_promoart_guid"
        elif after is None:
            status = "removed_promoart_guid"
        elif before != after:
            status = "catalog_location_changed"
        else:
            deps = sorted({dep for loc in after for dep in loc["dependencies"]})
            for dep in deps:
                a, b = old_hashes.get(dep), new_hashes.get(dep)
                if a is None or b is None:
                    missing.append(dep)
                elif a != b:
                    changed.append(dep)
            status = ("dependency_bytes_changed" if changed else
                      "catalog_unchanged_bytes_unverified" if missing or not deps
                      else "catalog_and_dependency_bytes_unchanged")
        rows[guid] = {"status": status, "before": before, "after": after,
                      "changedDependencies": changed, "unverifiedDependencies": missing}
    return rows


def verification_targets(rows):
    # Removed assets are not expected to exist in the current version.
    # Unknown dependency bytes are NOT considered proof of unchanged artwork.
    return {g: r["after"] for g, r in rows.items()
            if r["after"] and r["status"] != "catalog_and_dependency_bytes_unchanged"}


def verify(root, rows, media_root=None):
    locs = verification_targets(rows)
    hits, images, missing, diagnostics, unsupported = resolve_objects(root, locs)
    matches = existing_artwork(media_root, images.values()) if media_root and images else {}
    result = {}
    for guid in sorted(locs):
        candidates = []
        for ident, row in sorted(hits.get(guid, {}).items()):
            value = dict(row)
            pixel = images.get(ident)
            if pixel:
                value.update(width=pixel[0], height=pixel[1], decodedRgbaSha256=pixel[2],
                             existingArtworkCandidates=matches.get(pixel, []))
            candidates.append(value)
        result[guid] = {"candidates": candidates,
                        "singleTypedObject": len(candidates) == 1,
                        "pixelDecoded": len(candidates) == 1 and
                        "decodedRgbaSha256" in candidates[0]}
    return {"guids": result, "missingBundles": missing,
            "locationsWithoutLocalDependencies": unsupported,
            "bundleDiagnostics": diagnostics}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--old-aa", type=Path, required=True)
    p.add_argument("--new-aa", type=Path, required=True)
    p.add_argument("--old-version", required=True)
    p.add_argument("--new-version", required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--hash-bundles", action="store_true",
                   help="Compare present native dependency bytes (may read large bundles)")
    p.add_argument("--verify-current", action="store_true",
                   help="Resolve changed/unverified candidates in current Unity containers")
    p.add_argument("--media-root", type=Path,
                   help="Optional existing private artwork root for pixel-exact reuse checks")
    a = p.parse_args()
    old, new = a.old_aa.resolve(strict=True), a.new_aa.resolve(strict=True)
    out = a.out.resolve()
    if (old == new or a.old_version == a.new_version or out.exists()
            or any((x / ".git").exists() for x in out.parents)
            or old in out.parents or new in out.parents):
        raise ValueError("Use distinct versions and a new private output outside the source catalogs and Git")
    if a.media_root and not a.verify_current:
        p.error("--media-root requires --verify-current")
    before, old_pins = read_catalog(old)
    after, new_pins = read_catalog(new)
    old_hashes = bundle_fingerprints(old, before) if a.hash_bundles else {}
    new_hashes = bundle_fingerprints(new, after) if a.hash_bundles else {}
    rows = compare(before, after, old_hashes, new_hashes)
    counts = defaultdict(int)
    for row in rows.values():
        counts[row["status"]] += 1
    report = {"schema": "wand.media.private-promoart-delta@1",
              "privateOnly": True, "publicationAuthorized": False,
              "offerMembershipVerified": False, "historicalCoverageComplete": False,
              "oldVersionLabel": a.old_version, "newVersionLabel": a.new_version,
              "oldCatalogSha256": old_pins, "newCatalogSha256": new_pins,
              "oldPromoArtGuids": len(before), "newPromoArtGuids": len(after),
              "counts": dict(sorted(counts.items())), "guidResults": rows,
              "currentVerification": verify(new, rows, a.media_root.resolve())
              if a.verify_current and a.media_root else
              verify(new, rows) if a.verify_current else None}
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("x", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps({"old": len(before), "new": len(after), "counts": report["counts"],
                      "output": str(out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
