#!/usr/bin/env python3
"""DB-04 exact source-identity graph diff; never infer deletion from partial data.

Works only on the owner-private output of reference_graph.py.
Unmatched prior records are oldOnlyUnverified, not deleted. A changed
native world/area/grid ID link is evidence of a difference in compared
snapshots, NOT proof that placement or acquisition semantics changed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

SCHEMA = "wand.db04.reference-graph-diff@1"
SOURCE_SCHEMA = "wand.db04.native-reference-graph@1"
MAX_GRAPH = 128 * 1024 * 1024
FAMILIES = {
    "worlds": ("worldId",),
    "scenes": ("nativeSceneId",),
    "areas": ("areaRefId",),
    "layouts": ("layoutId",),
    "gridData": ("gridDataPath",),
    "gridRefs": ("gridRefId",),
    "initialItemRefs": ("itemId", "gridRefId"),
    "worldCoverage": ("worldId",),
}


def require(test, code):
    if not test:
        raise ValueError("DB04_REFERENCE_DIFF_" + code)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":")) + "\n").encode("utf-8")


def read_private_graph(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and
            0 < path.stat().st_size <= MAX_GRAPH, "INVALID_PRIVATE_GRAPH")
    raw = path.read_bytes()
    graph = json.loads(raw.decode("utf-8"))
    require(isinstance(graph, dict) and graph.get("schema") == SOURCE_SCHEMA and
            graph.get("privateOnly") is True and
            graph.get("publicationAuthorized") is False and
            graph.get("status") == "private_partial_exact_source_relations",
            "NOT_PRIVATE_SOURCE_GRAPH")
    target = graph.get("target")
    require(isinstance(target, dict) and
            target.get("platform") == "Steam" and
            isinstance(target.get("gameVersion"), str) and
            isinstance(target.get("nativeWorldManifestSha256"), str) and
            len(target["nativeWorldManifestSha256"]) == 64,
            "INVALID_TARGET")
    for family in FAMILIES:
        require(isinstance(graph.get(family), list),
                "MISSING_FAMILY_" + family)
    return graph, hashlib.sha256(raw).hexdigest()


def indexed(rows, fields):
    found = {}
    for row in rows:
        require(isinstance(row, dict), "INVALID_RELATION_ROW")
        key = tuple(row.get(field) for field in fields)
        require(None not in key and key not in found, "DUPLICATE_RELATION_ID")
        found[key] = row
    return found


def compare(previous, current, previous_sha, current_sha):
    require(previous["schema"] == current["schema"] == SOURCE_SCHEMA and
            previous.get("privateOnly") is current.get("privateOnly") is True and
            previous.get("publicationAuthorized") is
            current.get("publicationAuthorized") is False and
            previous.get("status") == current.get("status") ==
            "private_partial_exact_source_relations",
            "UNVERIFIED_SOURCE_KIND")
    old_target, new_target = previous["target"], current["target"]
    require(old_target["platform"] == new_target["platform"] == "Steam",
            "INCOMPATIBLE_PLATFORMS")
    changes = {}
    for family, fields in FAMILIES.items():
        before = indexed(previous[family], fields)
        after = indexed(current[family], fields)
        old_keys, new_keys = set(before), set(after)
        shared = old_keys & new_keys
        def identity(k):
            return {field: k[i] for i, field in enumerate(fields)}
        changed = [
            {"identity": identity(key),
             "changedFields": sorted(
                 k for k in set(before[key]) | set(after[key])
                 if before[key].get(k) != after[key].get(k))}
            for key in sorted(shared) if before[key] != after[key]
        ]
        changes[family] = {
            "candidateAdded": [identity(k) for k in sorted(new_keys-old_keys)],
            "oldOnlyUnverified": [identity(k) for k in sorted(old_keys-new_keys)],
            "changedWithinSharedIds": changed,
            "unchangedWithinSharedIds": len(shared) - len(changed),
            "previousCount": len(before), "currentCount": len(after),
            "authoritativeAdded": [],
            "authoritativeRemoved": [],
        }
    return {
        "schema": SCHEMA,
        "status": "partial_source_snapshot_comparison",
        "privateOnly": True, "publicationAuthorized": False,
        "previous": {**old_target, "graphSha256": previous_sha},
        "current": {**new_target, "graphSha256": current_sha},
        "sameGameVersion": old_target["gameVersion"] == new_target["gameVersion"],
        "sourceCoverageComparableForRemoval": False,
        "nativePlacementLegalityCompared": False,
        "itemOriginOrAcquisitionCompared": False,
        "itemPlayerSavePlacementCompared": False,
        "families": changes,
        "note": "Candidate additions and old-only records cannot establish full-game additions or removals while source coverage is incomplete.",
    }


def main(argv=None):
    cli = argparse.ArgumentParser(description="Compare two PRIVATE DB-04 world reference graphs")
    cli.add_argument("--previous", required=True, type=Path)
    cli.add_argument("--current", required=True, type=Path)
    cli.add_argument("--out", required=True, type=Path)
    args = cli.parse_args(argv)
    output = args.out.resolve()
    repo = Path(__file__).resolve().parents[2]
    require(not output.exists() and not output.is_relative_to(repo) and
            output != args.previous.resolve() and
            output != args.current.resolve(), "UNSAFE_OUTPUT")
    old, old_sha = read_private_graph(args.previous)
    new, new_sha = read_private_graph(args.current)
    result = compare(old, new, old_sha, new_sha)
    output.parent.mkdir(parents=True, exist_ok=True)
    raw = encode(result)
    output.write_bytes(raw)
    print(json.dumps({"schema": SCHEMA,
                      "outputSha256": hashlib.sha256(raw).hexdigest(),
                      "previousVersion": result["previous"]["gameVersion"],
                      "currentVersion": result["current"]["gameVersion"],
                      "removalsVerified": False,
                      "candidateCounts": {
                          family: {
                              "currentOnly": len(data["candidateAdded"]),
                              "oldOnlyUnverified": len(data["oldOnlyUnverified"]),
                              "changedSharedIds": len(data["changedWithinSharedIds"]),
                          } for family, data in result["families"].items()
                      }}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
