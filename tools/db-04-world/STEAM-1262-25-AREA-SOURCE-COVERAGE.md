# DB-04 — Steam v1.26.2 source-backed Village04 + Expansion04 + Winnie DLC subset (2026-11-22)

**Status:** owner-private, locally importable read-only World snapshot produced from original Steam 1.26.2 game files. **Not game-wide complete; no editing or placement permission.**

## Source-verified scope

| Source region | Native DefaultVillageData AreaType links | Referenced GridCollections | Original default GridObject anchors | Distinct referenced GridData paths |
| --- | ---: | ---: | ---: | ---: |
| Village04 | 8 | 8 | 4,494 | 10 |
| VillageExpansion04 | 13 | 13 | 918 | 53 |
| VillageWinnieDLC | 4 | 4 | 459 | 12 |
| **Total** | **25** | **25** | **5,871** | **75** |

The package also retains two previously sourced standalone GridData records; **77 distinct GridData records** overall (73 native compacted palettes, four original JSON direct floor-value arrays). Their combined declared grid-local dimensions yield **1,016,109 source-backed read-only terrain cells**. The source snapshot contains **28 layouts** (25 GridCollections + 3 DefaultVillageData roots), **111 original source file SHA-256 records**, and 11 SHA-256 verified output JSON members.

The native area labels and exact AreaType links come from each original `Meta.DefaultVillageData.GridLayoutPaths` entry, not guessed geography. The 17 added Expansion04/Winnie AreaType references are **not** invented `protoDb.bin` VillageAreaData records: `areas.json` still has eight original Village04 entries. Region source names are derived exclusively from `SceneLayouts/<region>/...`.

Each new GridCollection retains its original native Grid.ID, GridData path, per-grid default object count and original GridObject (x,y) anchor records. Read-only compacted terrain decoding remains restricted to original native-tested Steam v1.26.1/1.26.2. All source-world data and ZIPs are private and **not committed here**.

## Explicitly not covered

The Expansion04 root contains three separate original underwater scene-layout references. They were **not** added to the 25 AreaType ground GridCollections, and cannot be treated as global transforms or complete underwater geometry. Other DDV worlds, DLC areas, user saves, live placements, coordinate transforms, object footprints/occupancy, collision, spawn eligibility and edit permissions are not complete or verified. `sourceScopeVerified`, `placementRulesComplete`, `worldHierarchyComplete`, world-coordinate and placement flags remain `false`.

## Browser behavior

`/world/preview` accepts the private ZIP **on device only**, and uses the original `SceneLayouts/` path as a region selector. It calculates a per-region reference coverage summary at runtime from the authenticated-by-manifest catalog: original AreaType links, known/missing linked layouts, distinct referenced GridData files and **unique** default anchors. These counts are **source-subset visibility checks**, not proof that the owner's ZIP came from authentic original source, or proof of complete world coverage. Missing references remain visible and do not silently promote to source-derived objects.

The owner's SRC-05 World Data folder holds the source-checked Steam v1.26.2 private package; it is not distributed via this public repository.
