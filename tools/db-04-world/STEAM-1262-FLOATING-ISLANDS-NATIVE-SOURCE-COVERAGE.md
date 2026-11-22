# DB-04 — Steam v1.26.2 original FloatingIslands source coverage (2026-11-22)

This document contains **derived counts and parser contracts only**. The original
game layout/GridData binaries, raw arrays, and full private World snapshot remain
in owner-private SRC-05 WORLD DATA. No player saves are involved.

## Examined source wrapper

All 15 original `SceneLayouts/FloatingIslands/FloatingIsland_*/...Layout.json`
sources use a context wrapper at protobuf root field `1`, with the exact
`CustomLocations.json` source reference in field `1.4`. Root field `2`
embeds the original `Meta.GridCollection` map, whose nested native GridData
references are at `2.1.2.2`.

The parser verifies that the wrapper's `CustomLocations.json` reference
matches its exact layout folder. Native grid map IDs and native Grid IDs must
match; the existing `Meta.Grids.GridObject` parser preserves grid-local X/Y,
orientation, state digest, and source provenance. It does **not** prove a
world-coordinate transform, fixed placement, collision, pathfinding or
edit legality.

The original Desert assets contain the path segment
`FloatingIlsnad_Desert` in GridData references (distinct from the
`FloatingIsland_Desert` layout folder). This is preserved as a **literal
source reference**, not silently renamed.

## Source-derived coverage

| Original Steam v1.26.2 source family | Examined |
| --- | ---: |
| Floating island layout wrappers | 15 |
| Native GridData references | 32 |
| Unique referenced GridData paths verified | 32 |
| Original native default-object anchors | 1,596 |
| Read-only source-correlated grid-local cells in these 32 grids | 492,264 |

Combined with the preceding 165-layout, 711-GridData private snapshot, the
source-only partial World snapshot contains:

| Combined source inventory | Count |
| --- | ---: |
| Layouts | 180 |
| GridData | 743 |
| Initial grid-local object anchors | 28,709 |
| Read-only source-correlated terrain cells | 5,196,146 |
| Original source SHA-256 registrations | 929 |
| Missing GridData paths referenced by these included layouts | 0 |

These are **not** a claim of full-game source coverage. Other original
`SceneLayouts` families, including `Houses` and `Rooms`, have not been
added to this private snapshot. A zero missing-reference count applies only to
the **180 source layouts included in this snapshot**.

All layout and grid provenance is versioned as Steam 1.26.2. The full private
snapshot is stored outside the public repository; only source-derived counts,
synthetic regression tests, and fail-closed parsing code belong on GitHub.
