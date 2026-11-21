# DB-04 WORLD — evidence-checked native world database

This lane implements a **read-only, partial, game-native database**, not a save editor or a speculative map generator. It deliberately does **not** mark the entire world graph or placement rules as complete.

## Verified input formats

- Steam game source `ddv_Data/StreamingAssets/itemlist/Furniture.json` and `Building.json`: indexed protobuf records with exact integer item IDs, native names and `GridAreaData` (wire field 6).
- `GridAreaData` fields 1/2 contain native `SizeX`/`SizeY`; field 3 is exactly `SizeX * SizeY` little-endian 32-bit layer values; field 4 is `AcceptedFloorTypesFlag`. Those mappings were cross-checked with a game-native `StreamingAssets/Furniture/...json` definition and full-file cardinality checks.
- `itemlist/Scene.json`: indexed native Scene IDs/names; native scene-kind numeric value is kept without assigning an unsupported world/biome role.
- `protoDb.bin` entries `Worlds` (`Definitions.WorldData`), `DefaultVillages` (`Meta.DefaultVillageList`) and `Village04Layout1` (`Definitions.Scene.VillageAreaData`): game-defined world names, Scene IDs, explicit parent world references, default layout paths and VillageAreaType/ground/water NavMesh IDs. The six villages include five conditional layouts, but those layout paths are **not** native world IDs.
- `GridData/**/*.json`: despite the suffix these are **binary**. Verified IL2CPP `Definitions.Grid.GridData` fields 1/2 are SizeX/SizeY, field 3 is repeated native fixed32 FloorTypes, field 4 a fixed32 palette, and field 5 compacted index bytes. All raw palette values and Base64 packed bytes are preserved. **1/2-bit packed grids can now be previewed** with empirically corroborated X-major/MSB-first grid-local coordinates. The native decoder machine-code body is **not** verified, and neither global world coordinates nor placement legality can be inferred. 3-bit+ packing remains unresolved.
- `Definitions.Grid.GridLayers` and `Definitions.Grid.GridFloorType` enums have verified bit names (e.g. 68 = Low|Blocking, 3072 = Floor|Wall). The meaning of those masks does **not** itself establish a full placement/collision algorithm.
- `SceneLayouts/**/*.json`: `Meta.GridCollection` is decoded using its native Grid map, GridDataPath, TessellationFactor and Grid.Objects map. Each original default-layout object keeps its **native** `GridObject.ID`, `ItemID`, `X`, `Y`, and `GridOrientation` (0–15), plus only a hash/size of its optional state. These are **grid-local starting positions**, **not** world-space coordinates or user save data. An initial object is **not automatically permanent/immovable**.
- `Meta.DefaultVillageData` scene layouts also expose `GridLayoutPaths`, an explicit native map from `VillageAreaType` to separate `SceneLayouts/` files. For unrecognized protobuf layouts, the extractor retains literal source-path evidence without inventing links.
- `Furniture/**/*.json`: supplementary JSON overrides. Mismatching item ID/name pairs are retained in `unresolved.json`, never silently joined.

Observed on accessible Steam 1.26.1 archive originals: 6,746 furniture entries with GridAreaData, 478 buildings (394 have GridAreaData and 84 do not), 194 scenes, 18 native realm-world entries, six default/conditional village-layout references, and eight defined area records for Village04. Additional future enum members do **not** prove corresponding areas exist in every current save. Steam 1.26.2 original-world archive completeness is not established. Source provenance for IL2CPP enum fields: `dump.cs` SHA-256 `0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08`.

## Run (one read-only extraction)

From a local repository checkout, Python 3.10+:

```powershell
py -3 tools/db-04-world/world.py --game "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley" --out "$env:USERPROFILE\Desktop\DreamwishWand\SRC-05 WORLD DATA\v1.26.2"
```

To compare the **next** game version, supply `--previous "PATH_TO_PREVIOUS_DB04_OUTPUT"` and use a new output directory. The extractor does not modify the input game files. Output and input must not overlap; output inside a Git worktree is rejected.

Source of truth: `FullVersion.txt` must contain exactly one parsable version. File provenance uses relative game paths, SHA-256 and byte counts. The version is evidence from that file, not proof of storefront update availability. No game binaries or derived asset records are committed to public Git.

## One-shot Steam local source acquisition (Windows)

For a complete installed Steam source folder, use **one** PC invocation to
extract, validate, audit, and package all DB-04 material:

```powershell
& ".\tools\db-04-world\run.ps1" -GameRoot "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley"
```

Optional: `-OutputRoot "D:\Private\Wand\DB04"` and
`-PreviousSnapshot "D:\Private\Wand\DB04\Steam-YYYYMMDD-HHMMSS"`.
The previous snapshot must itself pass integrity verification. The game is
read-only, all outputs are created under the private output root, and neither
user saves nor source assets are copied into public Git. Failed extraction
remains under a timestamped `.partial-Steam-...` folder rather than
masquerading as verified evidence.

Successful runs produce a timestamped verified directory and one private ZIP
containing only the manifest-registered JSON families plus
`diagnostics/verification.json` and
`diagnostics/layout-terrain-audit.json`. Packaging independently checks
SHA-256, source references, record counts and compressed terrain evidence.
The archive uses stable ZIP metadata and reproducible file ordering, rejects
overwriting an existing destination, and is intended for private
[SRC-05 WORLD DATA](https://drive.google.com/drive/folders/1P5VW5Yr9YqYNoZfv7yHRCwqZcZapi0-Q).

Packaging can also be run separately on an existing verified snapshot:

```bash
python tools/db-04-world/package_snapshot.py --snapshot "/private/snapshot" --zip "/private/snapshot.zip"
```

The package is explicitly partial unless verified complete source coverage
has been established. A successful command is not proof of gameplay collision
or placeability and does not certify the machine-code decoder.

## Generated private files

Upload these together to the private [SRC-05 WORLD DATA folder](https://drive.google.com/drive/folders/1P5VW5Yr9YqYNoZfv7yHRCwqZcZapi0-Q):

| File | Meaning |
| --- | --- |
| `manifest.json` | source checksums, version, output checksums, incomplete-coverage gates |
| `objects.json` | native furniture/building Item IDs, validated footprints and raw flags |
| `scenes.json` | scene IDs, native labels and only verified WorldData world links |
| `grids.json` | native grid dimensions, floor-type palette, packed bytes and unresolved indexing |
| `layouts.json` | native GridCollection/GridData references, tessellation, default object counts, and native DefaultVillageData area→layout references |
| `layoutObjects.json` | initial GridObject positions (grid-local integer X/Y, native orientation and Item ID), not player-save placements |
| `worlds.json` | 18 native realm world entries and six provenance-labeled village-layout keys (from accessible 1.26.1 source) |
| `areas.json` | native area-type codes and parent scene, grounded by VillageAreaData |
| `diff.json` | added, removed and field-changed records across two snapshots |
| `unresolved.json` | remaining semantics, missing footprints, unresolved references and data conflicts |
| `report.json` | observed extraction totals; no completion claim |

The browser adapter at `src/lib/world/catalog.mjs` supports indexed native IDs, original default-layout object positions, village area layout links, and conservative negative edit restriction checks. It **never** returns a positive placement-validity decision based on raw flags. Rendering an authoritative 2D terrain/occupied-cell map still requires separately verified compacted-index bit order, XY axis/origin, fixed objects and adjacency/rotation rules. Known enum names alone do not grant placement validity.

A **source-subset preview** is stored privately in [SRC-05: Steam 1.26.1 native partial preview](https://drive.google.com/file/d/1SMKmvtyCV04lzxngg_3MHIEgYCx8zkrp/view). A [newer verified default-layout snapshot](https://drive.google.com/file/d/1h3qjbjkC5BEd0J8l4TLueewScKsHLvYj/view) includes `layoutObjects.json` with 902 actual default Meadow objects and eight native area-layout links. Both contain only three original itemlists and three grid samples with two scene-layout files and protoDb; **neither is exhaustive**. The complete game-root extraction is a separate run of `world.py` and is not implied by these previews.

Ownership boundaries: DB-05 supplies per-save placed objects and coordinates; SRC-04 MEDIA supplies large-scale images and 3D asset conversion; SRC-01 ITEMS owns the general item taxonomy, names and localization.

## Original native-layout evidence (Steam 1.26.1 subset)

Validated original `SceneLayouts/Village04/DefaultVillageLayout01-MeadowGrids.json` against IL2CPP `Meta.Grids.Grid` and `GridObject`: one native grid references `GridData/Villages/Village04-MeadowLevel-GridData.json` and contains exactly **902** distinct GridObject IDs with exact matching protobuf map keys. Each object's Item ID and grid-local X/Y/orientation are native fields; sampled coordinates range X=1–194 and Y=0–90, all within the native grid's 196×100 dimensions. The original `DefaultVillageLayout01.json` explicitly maps eight area-type codes (0–7) to separate default grid layout paths. Not all 902 objects are guaranteed to be unmovable, and no placement legality is inferred.

The full source ingestion will write `layoutObjects.json` and include it in the checksum manifest and version-to-version diff. A legacy previous snapshot that lacks `layoutObjects.json` yields an explicit incomplete-diff status for this family rather than inventing added/deleted objects.

## Read-only 2D native terrain preview (Steam v1.26.1 source evidence)

The original `Room12x16-GridData.json` (SHA-256 `c5ce1b0084087479292d2092e10b8963194ead168531c5c221893ab53a0b26e6`) is **192/192** correct under X-major / MSB-first 2-bit packing: a single-cell outer `Floor|Wall` border and a 10×14 interior `Floor`. The alternative axis/bit-order combinations match only 152/192 cells. The original `Village04-MeadowLevel-GridData.json` and 902 initial `GridObject` records independently support this candidate: **742/743** relevant Furniture/Building object origins match the native `AcceptedFloorTypesFlag`, and the only mismatch is a 11×11 default rock at the grid boundary. This checks terrain decoding consistency, **not** object collision or placeability.

With the extracted JSON files in the **private** `SRC-05` snapshot, reproduce all four candidate scores:

```bash
python tools/db-04-world/terrain_evidence.py --snapshot "/path/to/private/DB04-output"
```

The CLI verifies the manifest and pins the original Steam 1.26.1 Room, Meadow and MeadowGrids source SHA-256 values before publishing its statistical result. Private original assets and native JSON records are not committed to public Git.

The browser adapter supports `getNativeTerrainTile(catalog, gridId, x, y)` and `getNativeTerrainWindow(catalog, gridId, { x, y, width, height })` (each dimension at most 256). The returned `rows` are Y-major for display, **but bytes use X-major layout**. It explicitly returns `status: source_corroborated_grid_local_preview`, `nativeCodeBodyVerified: false`, `worldCoordinatesVerified: false`, and `placementLegalityVerified: false`. Unsupported palettes or missing source data return an unresolved result, never a guessed value.

The Python extractor also attaches non-destructive `terrainDecoding` metadata to private `grids.json`. `verify_bundle.py` independently recomputes this metadata from source-derived Base64 bytes. For native `GridData` values not yet independently validated (such as 3-bit+ palette formats), decoding remains disabled.

## Source-linked default-village 2D viewports (read-only)

World Editor, Decorate and Presets can now request a **native grid-local**
source-backed composition directly from private DB-04 JSON:

```js
const preview = getNativeVillageAreaViewport(
  catalog, "SceneLayouts/Village04/DefaultVillageLayout01.json",
  nativeAreaTypeCode, nativeGridId,
  { x: 0, y: 0, width: 64, height: 64 }
);
```

The adapter explicitly walks `Meta.DefaultVillageData.GridLayoutPaths`
(area code → original GridCollection path), then
`Meta.GridCollection.Grids[nativeGridId].GridDataPath`, then the original
native 1-/2-bit compacted grid and its grid-local default `GridObject.X/Y`
anchors. To view a GridCollection directly, call
`getNativeDefaultLayoutViewport(catalog, gridCollectionPath, nativeGridId, rect)`.
Rectangles are limited by the existing 256×256-cell API.

Successful results contain `terrainRows` (display Y-major),
`defaultObjectAnchors` (original native IDs, Item IDs and 16-step orientation),
the source GridData path, total native anchor count, and the number of **anchors
inside** the visible window. They are *not* save-state positions, world-space
geometry, occupied-cell masks or permission to place/remove objects. An object
whose anchor is outside the viewport could still occupy visible cells; do not
treat missing anchor markers as free space. Native 16-way orientation enum
names are metadata, not proven footprint transformations.

Missing area mappings, layout files, grid sources and incomplete default
object collections return explicit statuses instead of fabricating terrain.
The input remains the exact private source archive; public Git contains only
the decoder, adapter and synthetic regression tests.

The existing one-shot private `package_snapshot.py` additionally generates
`diagnostics/footprint-hypotheses.json` inside its verified private ZIP.
This is automatic when running `run.ps1` against the installed Steam game;
no second PC extraction is required. The comparison is capped at 5,000 native
default objects and records whether the sample was truncated. The generated
scorecard remains explicitly unverified and is not published to Git.

The scorecard also distinguishes **informativeness** from a high percentage of
terrain matches: `crossHypothesisDiscrimination` counts original layout
objects for which the four candidate geometries actually differ, or whose
candidate out-of-grid / native-floor-mask outcomes differ. A symmetric or
single-cell footprint may fit all four models identically; those records
provide *no discriminating evidence* and must not be used to promote an
orientation or anchor convention.

The evaluator now enforces a deterministic total candidate-cell budget
(default 2,000,000 projected source cells across all four models, configurable
with `--max-cells`). Results disclose `candidateCellsEvaluated`,
`candidateCellBudget`, `truncatedByCellBudget`, `truncatedByMaxObjects`,
`unprocessedLayoutObjects`, and count objects excluded by an exhausted budget.
The private one-shot ZIP uses both the existing 5,000-object cap and the
cell budget to prevent unexpectedly expensive processing of large native
footprints. Its statistics are diagnostic, not a placement legality score.

## Native terrain cell counts and default-object origin audit

DB-04 now extracts `nativePaletteIndexCellCounts` for source-corroborated 1/2-bit
compacted grids. Each integer counts exact native **palette indices**, keeping
duplicate palette values distinct. Counting runs on packed source bytes without
allocating a full decoded 2D grid. The counts sum to `SizeX × SizeY` and are
independently recomputed during `verify_bundle.py`, not merely trusted because
the JSON file has a matching hash. Unrecognized GridData structures preserve
`parseError`, do **not** quietly claim a decoded grid, and are counted in
`report.json` as `nativeGridDecodeFailures`.

World Editor/Decorate consumers can call
`getNativeTerrainDistribution(catalog, gridId)` for a read-only legend with
`paletteIndex`, `nativeValue`, `symbols`, and `cellCount`. The result has
`worldCoordinatesVerified: false`, `nativeCodeBodyVerified: false`, and
`placementLegalityVerified: false`. Legacy snapshots missing a histogram
return `histogram_not_extracted`; unsupported formats return
`unresolved_native_packing`.

To audit **original default layout anchors** against their own GridData:

```bash
python tools/db-04-world/audit_layout_terrain.py --snapshot "/path/to/private/DB04-output"
```

This verifies the private bundle's hashes first; cross-references layout
GridObject IDs to source GridCollection GridDataPath, reports anchors within
native grid bounds, and counts raw floor-flag/AcceptedFloorTypesFlag
intersections at each grid-local *anchor*. It separately accounts for missing
GridData, unresolved packing, unknown item masks and apparent mismatches.
**These counts are diagnostic, not proof of placeability.** Full occupied
footprints, 16-way rotation geometry, permanent objects, water access, and
path/fence collision are not inferred. Outputs may contain original-game
positions and therefore remain in private SRC-05, not the public repository.

## Unverified cardinal footprint models — evidence-only diagnostic

The original game's `Definitions.Grid.GridAreaData` exposes `SizeX`,
`SizeY`, native fixed32 `LayerValues`, and `AcceptedFloorTypesFlag`.
`Meta.Grids.GridObject` supplies a grid-local anchor and a 16-entry
`GridOrientation` enum. **The native machine-code body has not established
how layer values map to (x,y), which layer masks imply occupied cells, how
rotations transform that footprint, or where anchors lie relative to it.**

To investigate without claiming placement permission, run:

```bash
python tools/db-04-world/audit_footprint_candidates.py --snapshot "/private/DB04-output" --max-objects 20000
```

The script first verifies the private DB-04 manifest. It then compares four
explicit geometric hypotheses: raw fixed32 **X-major vs Y-major** index order,
crossed with an anchor interpreted as **top-left vs center-floor**.
Only orientation codes **0/4/8/12** use basic 90-degree *hypothetical*
geometry; the other twelve codes are explicitly excluded as unresolved.
A nonzero original raw layer mask is counted as a **candidate cell**, not
verified physical occupancy. The audit reports bounded source-backed samples,
candidate cells inside/outside original GridData, and terrain-floor mask
intersections. These comparisons are **not** game placement/collision proof:
even a perfect terrain agreement cannot verify the occupied-cell predicate,
an object's anchor or move/remove eligibility.

For interactive World Editor research,
`getNativeFootprintCandidateCells(catalog, itemId, {x,y},
{cellOrder,anchorModel,orientationCode})` exposes the identical
hypothesis-labelled cell projection in JavaScript. Both implementations
explicitly return `rotationTransformVerified: false`,
`occupancyPredicateVerified: false`,
`cellIndexToXYVerified: false`, and
`placementLegalityVerified: false`. Non-cardinal transforms do not invent
cells, and `assessPlacement()` never uses these hypothetical offsets for an
affirmative placement result.

## Snapshot integrity / game-update deltas

Validate **private** output before consumers ingest it:

```bash
python tools/db-04-world/verify_bundle.py --snapshot "/path/to/Steam-1.26.1-extracted"
```

The validator checks every manifest SHA-256, protobuf-derived footprint dimensions, encoded terrain byte hashes and the GridCollection→Grid→GridObject cardinality and ID references. Missing external layout or grid files in a **partial** archive are warnings, never fabricated records. Passing integrity verification **does not** certify placement legality or complete source coverage.

Use `--previous` with a preceding verified snapshot to generate `diff.json`. Changes to shared IDs are listed by field; potential additions and removals are labelled `candidateAdded`/`candidateRemoved`, not authoritative `added`/`removed`, because full game-source coverage is not yet independently established for both inputs. A prior snapshot with mismatched source hash fails rather than generating potentially misleading updates.

## Tests

```bash
python -m unittest discover -s tools/db-04-world -p 'test_*.py' -v
node --test tests/world.test.mjs
```

The tests synthesize native wire records. No commercial game data is committed as fixtures.
