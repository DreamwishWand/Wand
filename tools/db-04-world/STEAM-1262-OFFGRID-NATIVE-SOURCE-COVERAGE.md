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

## Further nested-source extension — 2026-11-22 (separate private ZIP)

The preceding **28-layout / 118-layout combined** counts describe the
first-level subset; they are retained as historical evidence. Independently
inspected additional original Steam v1.26.2 OffGrid scene layouts comprise
**47** further source files: Expansion01 (5), Expansion02 (14), Expansion03
(6), Expansion04 underwater (2), WinnieDLC (4) and
EventFloatingIslands (16, including Spring2026, Winter2025, Halloween2025 and
Parks). The independently source-hashed derived-only extension yields:

| Source-only family | New extension | Combined partial snapshot |
| --- | ---: | ---: |
| OffGridBuildings original scene layouts | 47 | 75 |
| All source layouts, including Village and Realm | 47 | 165 |
| Native OffGrid grid reference entries | 491 | 583 |
| Native GridObject initial anchors | 13,906 | 27,113 |
| Original source SHA-256 register entries | 47 | 535 |

One original event layout under
`EventFloatingIslands/Halloween2025/Island2026` has a **direct**
`Meta.GridCollection` with nine repeated native root-field-1 map entries,
not the `1=context, 2=embedded GridCollection` source envelope used by the
other 46 newly examined scenes. The reader must inspect this direct native
format *before* attempting `one(root, 1, 2)`; otherwise repeated map fields
incorrectly fail as duplicate context. Its nine native grids and 1,434
source-default anchors are retained as direct GridCollection provenance;
they are **not** automatically considered player placements.

**Partial grid-source coverage:** The 47-layout extension references 491
native Grid entries (351 distinct source GridData paths). Against the earlier
private 364-GridData set, **347 distinct referenced GridData source paths
remain unprovided**. The updated private derived-only ZIP retains the original
364 GridData records and reports these 347 as missing; it does not invent
terrain, silently reuse another GridData, or claim that the new scenes have
renderable read-only terrain or anchor windows. Unresolved source references
must be filled by exact original Steam files and individually checked before
being promoted to source-backed previews.

The new private ZIP is in the owner-controlled SRC-05 workflow. This public
document contains derived aggregate counts and parser evidence only; the
original bytes, source objects, positions, save data and derived snapshot
arrays must not be committed to public Git. As before, world-coordinate,
occupancy, collision, edit legality and full-game coverage stay **unverified**.

## Unsupported semantics

Player save coordinates, world-level transformations, scene transitions,
runtime movement or collision, placement permission, object occupancy,
active quest state, DLC access, terrain editing, and source-original
authentication in the browser. Hash-matched derived source records establish
only local snapshot consistency.
