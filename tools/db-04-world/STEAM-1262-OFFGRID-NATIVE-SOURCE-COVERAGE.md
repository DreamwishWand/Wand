# DB-04 — Steam v1.26.2 original OffGridBuildings source coverage (2026-11-22)

**This public document contains derived evidence only.** Proprietary game files,
copied original placement arrays, raw native binaries, and private saves must
remain outside the public GitHub repository.

## Native source contract

The examined Steam v1.26.2 OffGridBuildings original default layouts have
an outer context message under protobuf root field `1`. Their explicit
`SceneLayouts/OffGridBuildings/.../CustomLocations.json` reference is at
`1.2`, **not** the Realm wrapper's `1.3`. Root field `2` embeds a
native `Meta.GridCollection`; the original nested grid path is at
`2.1.2.2`. Native grid IDs and `GridObject` records must match their map
keys. Non-grid context submessages are retained as opaque evidence, not
interpreted as placements or world transforms.

The source-only parser marks these as an embedded
`layoutKind = nativeGridCollection` and records the custom-location path and
source provenance explicitly. It does **not** create additional Village
AreaTypes or merge independent scene-local coordinates. The preview displays
`OffGridBuildings/<original source folder>` and treats nested Expansion/DLC
scenes independently.

## Source inventory, initial root-level subset

**28** original default layouts from OffGridBuildings first-level scene
folders and the root template were inspected independently. They contain:

| Native source family | Exact number |
| --- | ---: |
| Original off-grid layouts inspected | 28 |
| Native Grid reference entries | 92 |
| Unique explicitly referenced GridData source paths | 86 |
| Source default object anchors | 1,327 |
| Referring GridData entries found in preceding 14-Realm snapshot | 0 |

The sample includes SkullRock, SkullRockCaptainCabin, Castle, CastleDock,
CastleSecretRoom, DarkCastle, DarkForest, DarkSavannah, DarkUrban, Dreamscape,
DreamscapeMeadow, DreamscapeSavannah, DreamscapeWetland, PocahontasIsland,
PlateauMine, SandCavern, ScroogeStoreHeist, ScroogeStoreBoogieBash,
MonstersIncKidRoom01/02/03 and more. The reference set includes nested
`GridData/OffGridBuildings`, separate `GridData/Furniture`, and
`GridData/Rooms` entries.

## Extended private source snapshot

The private read-only snapshot extends the preceding 63-area/14-Realm build
with all 28 off-grid original layouts, **86** new unique original GridData,
**1,327** native default placement anchors and **404,271** read-only decoded
grid-local source cells. Its combined contents are:

| Source-only family | Combined count |
| --- | ---: |
| Village AreaType references | 63 |
| All source layouts | 118 |
| All native GridData | 364 |
| Initial native GridObject anchors | 13,207 |
| Read-only decoded grid-local terrain cells | 3,483,972 |
| Original SHA-256 source register entries | 488 |

All source files remain private. The combined snapshot's manifest SHA-256
entries, per-grid local dimensions and original map identities were checked.
The original source files are not included in the GitHub repository. The
snapshot is self-consistent but is **not** original-source authenticated
within the user's browser.

**Coverage limits:** Additional source folders under
`SceneLayouts/OffGridBuildings/Expansion01..04`, `WinnieDLC`,
`EventFloatingIslands` and other nested scenes exist and are **not
included in the 28-layout count**. The number of scene-layout files found in
this subset is not a statement of entire-game completeness. All 86 explicitly referenced native GridData sources have now been located,
read, hashed, parsed and read-only decoded (including Furniture and Rooms
sub-grids). Only the referenced 28-layout subset is covered; this is **not**
a claim that all game source scenes have been enumerated.

## Unsupported semantics

Player save coordinates, world-level transformations, scene transitions,
runtime movement or collision, placement permission, object occupancy,
active quest state, DLC access, terrain editing, and source-original
authentication in the browser. Hash-matched derived source records establish
only local snapshot consistency.
