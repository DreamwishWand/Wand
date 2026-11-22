# DB-04 — Steam v1.26.2 native source coverage: 63 AreaTypes (2026-11-22)

**Scope:** privately held, owner-only source-native, read-only, deliberately partial. This public document records derived cardinalities and validation constraints. **No original game files, extracted grid data, raw IDs/positions from owner saves, or proprietary binaries are in the repository.**

The 63-area private snapshot extends the previous original-source-verified Village04 / Expansion04 / Winnie subset with another 38 native AreaType links. All 38 links were read from original `Meta.DefaultVillageData.GridLayoutPaths` maps; these are not fabricated `protoDb.bin` world/area database records.

| Original source category | Referenced AreaTypes | Source default GridObjects | Unique referenced GridData paths |
| --- | ---: | ---: | ---: |
| Village04 | 8 | 4,494 | 10 |
| VillageExpansion01 | 12 | 2,217 | 36 |
| VillageExpansion02 | 10 | 1,019 | 31 |
| VillageExpansion03 | 13 | 1,351 | 29 |
| VillageExpansion04 (land) | 13 | 918 | 53 |
| VillageWinnieDLC | 4 | 459 | 12 |
| Expansion04 underwater: Pirate | 1 (61) | 78 | 10 |
| Expansion04 underwater: Candy | 1 (62) | 79 | 8 |
| Expansion04 underwater: Kingdom | 1 (63) | 61 | 5 |
| **Total AreaType links** | **63** | **10,676** | **across regions may overlap** |

The exact original Expansion04 parent has three `separatedAreasRaw` paths referencing the three independent underwater `DefaultVillageData` roots. This is a **different relationship** from a native AreaType pointing to a `GridCollection`; it is **not** a global world-coordinate transform. The browser reports these source-linked underwater roots separately, showing absent reference targets rather than merging or guessing missing sources.

## Snapshot validation

- **271** original Steam v1.26.2 source file SHA-256 records; original filename/path provenance retained in the *private* manifest
- **9** native DefaultVillageData roots, **63** native GridCollections; **72** layouts overall
- **193** distinct GridData records (189 original native packed grids, 4 original direct JSON floor-value grids)
- **10,676** unique original GridObject default anchors
- **2,503,234** read-only, grid-local terrain cells in verified source dimension ranges
- Original Grid.ID, GridData references, per-grid default object counts, source-relative XY and original object composite IDs checked for each linked collection
- Version pinned to the original Steam `v1.26.2` source build; ZIP CRC and SHA-256 output manifest checked
- The `areas.json` family remains restricted to **eight** original native records from prior `protoDb.bin` evidence; the 55 other source-linked AreaTypes must **not** be mislabeled as additional protobuf VillageAreaData rows

## Operational boundaries

The full ZIP is kept privately under **SRC-05 WORLD DATA** and imported through `/world/preview` in the browser. The page, Web Worker and catalog operate on the user's local file without network upload. Derived source-only AreaType, area-layout, native grid and anchor counts are **not a full-game completeness metric**.

`sourceScopeVerified=false`, `worldHierarchyComplete=false`, `placementRulesComplete=false`, `placementLegalityVerified=false` and all world-coordinate verification flags remain disabled. Source-derived 2D data **does not** prove global coordinates, collision or occupancy, item placement permission, live/modified player saves, DLC unlock status, runtime object state, or navigation. Other worlds/realms and arbitrary separate scenes remain out of scope.

## Verification entry point

`src/lib/world/preview-views.mjs` groups read-only source layouts by the exact path segments `SceneLayouts/<region>/...`. For the original three nested underwater roots only, the region includes `VillageExpansion04UnderwaterAreas/<subregion>`, retaining the source's distinction without declaring canonical world IDs. Synthetic tests cover 61/62/63 native AreaType links, explicit separate root references, missing-target fail-closed reporting and duplicate-link de-duplication.
