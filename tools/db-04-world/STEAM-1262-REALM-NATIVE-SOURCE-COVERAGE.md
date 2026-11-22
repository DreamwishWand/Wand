# DB-04 — Steam v1.26.2 original Realm source coverage (2026-11-22)

This is **derived aggregate evidence only**. Original proprietary Steam files, copied per-cell floors, exact default object placement datasets, native binaries and private saves are **not committed**. The source-pinned private ZIP is stored in the owner's **SRC-05 WORLD DATA** folder.

## Original source format

All **18** distinct source Realm layouts across **14** Realm region folders contain a native `GridCollection` embedded under the **outer protobuf field 2**. The outer field 1 contains a context message with an explicit `CustomLocations.json` path at field `1.3`. Each nested GridData reference is at `2.1.2.2` from the top-level source. These are not village `DefaultVillageData.GridLayoutPaths` references, not additional AreaType codes, and not proof of a complete game world or save-game layout.

The current source-backed reader keeps `layoutKind = nativeGridCollection` for the nested **collection** only, and records `embeddedGridCollectionWireField = 2`, its original source path and custom-location reference. The preview groups by original `SceneLayouts/Realms/<realm>/...` prefixes and counts them separately from Village AreaTypes. It never infers global coordinate transforms.

| Realm folder | Native layouts | Grid reference entries | Source default object anchors |
| --- | ---: | ---: | ---: |
| Aladdin | 1 | 14 | 199 |
| AliceInWonderland | 2 | 9 | 57 |
| BeautyBeast | 1 | 20 | 95 |
| Frozen | 1 | 1 | 218 |
| Hercules | 1 | 11 | 118 |
| InsideOut | 3 | 6 | 85 |
| LadyAndTheTramp | 2 | 2 | 72 |
| LionKing | 1 | 3 | 62 |
| Moana | 1 | 2 | 38 |
| MonsterInc | 1 | 13 | 46 |
| Mulan | 1 | 6 | 115 |
| Ratatouille | 1 | 3 | 11 |
| ToyStory | 1 | 1 | 54 |
| WallE | 1 | 1 | 34 |
| **Total** | **18** | **92** | **1,204** |

The 92 native Grid reference entries reduce to **86 unique GridData source paths**, including explicitly source-referenced furniture and room sub-grids. **53** are original direct-JSON FloorTypes records; **33** are native compacted binary palette records, including a 4-bit/9-value example. All 86 source bytes were located and hashed. One GridData was already included in the previously verified 63-area snapshot and was retained without duplication.

## Extended private snapshot (Steam v1.26.2)

| Record family | Previously verified | 14-Realm extension | Current source-limited total |
| --- | ---: | ---: | ---: |
| Native Village AreaType references | 63 | 0 | 63 |
| Layouts | 72 | 18 | 90 |
| Unique GridData entries | 193 | 85 new | 278 |
| Source default GridObject anchors | 10,676 | 1,204 | 11,880 |
| Read-only decoded grid-local terrain cells | 2,503,234 | 576,467 new | 3,079,701 |
| Original SHA-256 source records | 271 | 103 new | 374 |

All 18 Realm layout binaries, each nested map Grid.ID, per-grid native default object identity, GridData path, native floor dimensions, packed-palette indices and direct JSON FloorTypes were independently parsed. The extended ZIP's entire output SHA-256 manifest, duplicate keys, source references and all decoded terrain-grid dimensions were checked. **Self-consistent ZIP hashes are not proof that the ZIP was produced from an authenticated installation.**

## Not verified or supported

World coordinates, per-scene transforms, owner-save state, active Realm quests, unlocks, live occupancy, collision, placement permission, rotation/edit restrictions, native runtime execution and completeness for every independent scene. The source-limited private ZIP keeps the existing verification flags false; no save editing is authorized by this analysis.

Synthetic Python tests cover nested GridCollection traversal and reject malformed native identities. Synthetic JavaScript tests cover Realm region grouping, references and missing-grid reporting. Original source arrays remain private.
