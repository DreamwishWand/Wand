# DB-04 WORLD — evidence-checked native world database

This lane implements a **read-only, partial, game-native database**, not a save editor or a speculative map generator. It deliberately does **not** mark the entire world graph or placement rules as complete.

**Original native-code version boundary:** `getNativeFootprintLayerAt`,
`getNativeFootprintLayerWindow`, and `getNativeFootprintCardinalDimensions`
only report their original GridArea indexing and cardinal-size calculations
as verified for **Steam v1.26.1**, whose original IL2CPP code was examined.
For v1.26.2 or an unknown version they return explicit source-not-verified
statuses and never return synthesized native layer cells or cardinal sizes.
`getNativeFootprint` still exposes the original per-item raw layer array
without claiming that a later version's machine-code indexing is identical.
Even byte-identical v1.26.2 Furniture/Building source files do not prove
the native GridArea implementation is byte-identical across releases.

**Packed GridData uses a narrower read-only native-code boundary.**
The Steam **v1.26.1 and v1.26.2** original `GridData.get_Item` /
`GetNumberOfBitsPerPosition` normal read paths have been checked against
their pinned original IL2CPP metadata and native PE64 machine-code bodies.
The source-local X-major/MSB-first 1/2/4-bit decoder is supported for those
two Steam builds. The original v1.26.2 Meadow GridData bytes match the
corroborated v1.26.1 sample. This is a read-only grid-local terrain
**preview**, not a global world map or edit/placement validity proof.

Private Steam 1.26.2 extraction now records version-specific evidence,
raw Base64 payload, byte count, palette, dimensions and validated palette
index cell histogram. `verify_bundle.py` recomputes all this against the
snapshot's declared game version. A previously generated v1.26.2 ZIP that
explicitly retained `terrainDecoding.decoded=false` must be re-extracted
from original source to gain read-only terrain; it is never silently promoted
by the browser. For versions after 1.26.2, or an unverified non-Steam
platform, the browser returns
`native_terrain_packing_not_verified_for_game_version` rather than using
unproven native packing claims.

**Original direct-value JSON GridData (v1.26.2 Village04):** Unlike
the binary/protobuf `.json` files above, four original village ground
sources have a literal JSON object with exactly `SizeX`, `SizeY`, and
`FloorTypes`. They are the source-referenced `BlockSpawn` grids for
Forest, Savannah, Cliff, and Wetland. Their `FloorTypes` arrays are
original **uint32 mask values**, not indices into a palette, and their
positions use the same native grid-local `x*SizeY+y` convention. The
private extractor now records `nativeSourceFormat:
original_json_direct_floor_values` and keeps all original mask bits
including `BlockAutomaticSpawning` (262144). It does **not** rewrite masks,
infer which native mask permits placing an item, or compute pathfinding.
The verifier independently rechecks the array length, value bounds, source
version and read-only provenance. The browser shows direct-value tiles,
windows and mask-count summaries separately from packed palette-index
histograms, never fabricated palette membership.

The owner-private [SRC-05 World Data](https://drive.google.com/drive/folders/1P5VW5Yr9YqYNoZfv7yHRCwqZcZapi0-Q)
holds a Steam v1.26.2 **partial** Village04 ZIP with eight original
AreaType→GridCollection links, twelve source GridData records (four native
JSON direct, eight packed), 4,494 source default GridObject anchors
and 415,522 recorded grid-local terrain cells. This is a **subset** of
the original game, not a full world model. Raw game sources, editable player
save positions and decoded original native code are not published to GitHub.

The Python entrypoints `parse_grid_structure`, `grid_assets`,
`checked_grid`, and all four low-level terrain helpers
(`describe_native_packing`, `count_packed_palette_indices`, `floor_at`,
`decode_window`) require an **explicit** `source_game_version` argument.
The normal extractor obtains it from the installed game's `FullVersion.txt`;
the private snapshot verifier obtains it from the verified manifest. Both
private terrain audits independently use the verified snapshot version instead
of assuming the Steam 1.26.1 native decoder. This guards future callers
against accidental default-version promotion.

`getNativeDefaultLayoutObjectComputedStride` resolves the original
GridCollection's Grid factor directly. It does not sample the footprint's
object-local `(0,0)` cell: an oblique object may have no mapped layer there,
and the original nullable `GetStrideFor` calculation is independent of that
raw-layer preview.

## Source-only default object anchor windows

`getNativeDefaultLayoutAnchorWindow(catalog, layoutId, nativeGridId, rect)`
and `getNativeVillageAreaAnchorWindow(catalog, villageLayoutId,
nativeAreaTypeCode, nativeGridId, rect)` supply bounded, read-only
**original default GridObject X/Y anchor records** for World Editor and
Decorate. Both use exact original GridCollection / DefaultVillage layout
links and raw GridData SizeX/SizeY, without reading the compacted terrain
payload or asserting its X-major decoder. These raw source-record anchors remain useful independently of the terrain
decoder (including in older, explicitly unverified Steam 1.26.2 snapshots).

The new result status is
`source_native_default_layout_anchors_only` and includes
`terrainDecoded:false`, `worldCoordinatesVerified:false`,
`gridObjectAnchorConventionVerified:false`,
`fullFootprintOccupancyVerified:false`,
`currentSaveObjectVerified:false`, and
`placementLegalityVerified:false`. Objects whose **recorded anchor** is
outside a rectangle are omitted, but their footprints might overlap it.
Windows are bounded to 256×256 source grid-local coordinates, require the
source GridData dimensions and exactly linked Grid.ID, and reject partial
layout-object cardinality mismatches rather than suggesting a complete map.
The original `getNativeDefaultLayoutViewport` /
`getNativeVillageAreaViewport` APIs still require corroborated terrain
decoding and retain their existing contract.

**Large original layouts:** pass an optional `{offset, limit}` argument as the
last parameter to `getNativeDefaultLayoutAnchorWindow` or
`getNativeVillageAreaAnchorWindow`. `offset` is a zero-based ordinal among
anchors **inside the requested native grid-local rectangle**; `limit` is
1–512. Results report `matchingNativeDefaultAnchorCount` (all in-frame raw
anchor records), `viewAnchorCount` (just the returned page),
`totalNativeDefaultObjectAnchors` (all original objects in that native
Grid.ID), `hasNextPage`, and `nextOffset` or null. A paged result
does not assert anything about occupied cells, collision, placement or the
user's current save. Omitting the argument preserves the existing complete
window API and result shape. The catalog now indexes source GridObject
records once by exact layout and native Grid.ID, eliminating repeated
full-layout scans while navigating individual grids. Page order is the
verified source snapshot's fixed `layoutObjects.json` record order; retain
the same verified snapshot for every page to avoid missing/duplicated items.

**Spatial lookup:** the browser catalog privately indexes original GridObject
anchors into fixed 32×32 *native grid-local coordinate* buckets per source
layout and Grid.ID. Small editor viewports inspect only their intersecting
buckets, not all objects in a grid. Bounded pages and aggregate in-window
counts retain the original snapshot record order across buckets even when
native GridObject IDs are not monotonic. Negative and out-of-grid source
anchors are still included in full per-grid cardinality checks, but cannot
appear in a valid nonnegative viewport. These buckets summarize *recorded
X/Y source fields*, never game-verified occupied terrain cells, collisions or
save-game objects.

## Local Village / Area source preview

The developer-only `/world/preview/` page accepts a private, self-consistent
`package_snapshot.py` ZIP in a browser Worker. Alongside direct original
GridCollection layouts, its source selector now exposes each original
`nativeDefaultVillageData` **AreaType → GridLayoutPath** reference separately.
These are distinct views even when multiple village areas reference the same
GridCollection. The displayed native Grid.ID, GridData path, anchored object
records and bounded 64-object pages are still the original grid-local source
fields; no global world-coordinate transform is performed. A village-area
reference whose GridCollection is absent from the partial snapshot is visibly
marked unavailable rather than replaced with an invented layout.

`src/lib/world/preview-views.mjs` shares the exact selection and routing
logic with the Worker. Native village reads call the existing
`getNativeVillageAreaAnchorWindow` API, retaining their village layout ID,
AreaType code and native GridCollection path. The strict, read-only version gate now admits the original Steam v1.26.2
GridData decoder for verified new snapshots; GridArea/placement remains gated. No save file or
game binary is sent to a server or written by this preview.

## Original GridObject identity integrity

Each original GridObject is identified by the exact GridCollection layout
path, unsigned native Grid.ID and unsigned native GridObject.ID:
`<layoutId>#grid=<gridIdNative>#object=<gridObjectIdNative>`. Extraction
already checks the native protobuf map keys against the Grid/Graph object
IDs. The private snapshot verifier and browser catalog now independently
reject mismatched exported composite IDs, negative/out-of-range native IDs,
and SHA-consistent modifications. The verifier also checks each native
GridCollection entry's `defaultObjectCount` against its own original
GridObject records, rather than trusting only the layout-wide total.
These are source-record identity checks, not current-save identity matches
or placement/occupancy claims.

## Browser-local original World Source Preview

A read-only developer preview is available at `/world/preview/` on the
Wand Pages site. It accepts a **local private ZIP** generated by
`tools/db-04-world/package_snapshot.py` (the same format written by
`run.ps1`). The page **does not upload or persist** its source files.
A dedicated browser Worker decodes the ZIP, checks every manifest-registered
JSON member's SHA-256, creates the DB-04 catalog and returns only summary,
bounded viewport and 64-record page results to Svelte. Untrusted members,
path traversal, duplicate ZIP paths, missing source families, oversized
entries and bad hashes are rejected.

**Security/provenance boundary:** A SHA-256 register contained *inside the
same local ZIP* only proves self-consistency. It is not a signature and
cannot authenticate the original game files or their version. The browser
always reports `originalSourceAuthenticated:false` and never treats the
input as complete world coverage or permission to edit an item. Source
provenance remains the private Python verifier's responsibility.

Choose an original GridCollection and native Grid.ID, then inspect an
X/Y-local rectangle (up to 32×32). Its points count raw initial GridObject
anchor records, not occupied cells. The 64-item source list can be paged.
Only the Steam 1.26.1/1.26.2 native read-only terrain decoder can return
floor mask rows; uncorroborated future versions or older unresolved ZIPs
show anchor points
without terrain. This preview does not parse player saves or authorize
placements, rotations, collision decisions, exports or writer actions.

## Verified input formats

- Steam game source `ddv_Data/StreamingAssets/itemlist/Furniture.json` and `Building.json`: indexed protobuf records with exact integer item IDs, native names and `GridAreaData` (wire field 6).
- `GridAreaData` fields 1/2 contain native `SizeX`/`SizeY`; field 3 is exactly `SizeX * SizeY` little-endian 32-bit layer values; field 4 is `AcceptedFloorTypesFlag`; optional field 5 is `Nullable<int32> StrideOverride` (source wire path `6.5`). These mappings were cross-checked with the original native `StreamingAssets/Furniture/...json` definitions and full-file cardinality checks.
- `itemlist/Scene.json`: indexed native Scene IDs/names; native scene-kind numeric value is kept without assigning an unsupported world/biome role.
- `protoDb.bin` entries `Worlds` (`Definitions.WorldData`), `DefaultVillages` (`Meta.DefaultVillageList`) and `Village04Layout1` (`Definitions.Scene.VillageAreaData`): game-defined world names, Scene IDs, explicit parent world references, default layout paths and VillageAreaType/ground/water NavMesh IDs. The six villages include five conditional layouts, but those layout paths are **not** native world IDs.
- `GridData/**/*.json`: despite the suffix these are **binary**. Verified IL2CPP `Definitions.Grid.GridData` fields 1/2 are SizeX/SizeY, field 3 is repeated native fixed32 FloorTypes, field 4 a fixed32 palette, and field 5 compacted index bytes. All raw palette values and Base64 packed bytes are preserved. **1/2/4-bit packed grids can now be previewed** with original-GameAssembly-correlated X-major/MSB-first grid-local coordinates. The Steam 1.26.1 GridData getter and bit-width native instruction sequences were inspected after resolving their correct method tokens from global-metadata.dat v31. This proves neither global world coordinates nor placement legality. Palettes with more than 16 entries remain unsupported.
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

## Original IL2CPP v31 native method pointer resolution (no dump.cs needed)

The **preferred** native evidence path now derives methods from the installed
Steam game's own `ddv_Data/il2cpp_data/Metadata/global-metadata.dat` and
`GameAssembly.dll`, rather than trusting RVA comments from an independently
generated `dump.cs`.

The optional standalone audit is:

```bash
python tools/db-04-world/native_method_pointers.py \
  --dll "/private/Steam/GameAssembly.dll" \
  --metadata "/private/Steam/ddv_Data/il2cpp_data/Metadata/global-metadata.dat"
```

For IL2CPP metadata v31, the resolver identifies the exact
`Definitions.Grid.GridData` type and `Meta.Definitions.dll` source image,
then retrieves the method token/RID and reads its actual native pointer from
the corresponding PE `Il2CppCodeGenModule.methodPointers[RID-1]`. Each result
must point into executable original binary bytes and equal a function start
in the original PE64 `.pdata` table. The pointer table and both original
sources are SHA-256 identified.

**Steam v1.26.1 finding:** the version-labeled `dump.cs` RVAs for four key
GridData methods lag the native method-pointer table by 768 bytes
(`0x300`). This is a **source discrepancy**, not a general offset rule.
No `+0x300` compensation exists in the code. The resolver always reads the
actual pointer indexed by the original metadata method token.

The default `run.ps1` automatically uses this original metadata path,
captures bounded PE byte windows and (when optional Capstone 5.0.9 is
installed) disassembles them, **without requiring `dump.cs`**. If original
metadata is unavailable, the existing legacy matching-dump path retains its
strict RVA/unwind preflight. Unsupported future metadata formats fail closed
for native-code analysis; world-data source files are not reinterpreted
using guessed token layouts.

These checks establish a source-correlated **method pointer and entry RVA**.
They do not on their own prove the grid indexing, transform, occupancy or
placement permission algorithms, which require examining the corresponding
native function bodies independently.

## Mandatory native RVA corroboration against PE64 unwind starts

**A matching Steam version string does not prove that `dump.cs` RVAs
correspond to the original `GameAssembly.dll`.** The native PE64 AMD64
exception directory (`.pdata` / `RUNTIME_FUNCTION`) provides original
function unwind start/end ranges. The new `pe_unwind.py` independently
checks the source PE exception directory and every targeted IL2CPP method:

```bash
python tools/db-04-world/pe_unwind.py \
  --game-root "/private/Steam-game" \
  --dump-cs "/private/Il2CppDump/dump.cs" \
  --dump-game-version "1.26.1"
```

An RVA is accepted for a named native byte window **only if it equals the
start of one original PE64 unwind function**. An RVA inside another unwind
interval, missing from the exception table, or disagreeing with the source
DLL causes a clear failure. The summary contains only bounded RVA/method
diagnostics and SHA-256 provenance. `run.ps1` performs the same check as
a **pre-extraction preflight** when a `dump.cs` is provided; mismatched
native evidence never creates a new source snapshot. Direct
`native_pe_evidence.py` capture enforces the same gate rather than
bypassing it.

Each accepted private native method window is additionally bounded by
the original unwind end RVA, so the next native function is not read as
part of the purported GridData method. The source report records the
unwind table digest and per-window corroborated unwind range.

This is a **necessary entry-boundary check, not sufficient symbol proof**.
PE unwind metadata may not describe leaf methods with no unwind entry,
and exact start equality does not authenticate which managed method owns
that native address. Such cases remain unresolved; do not assign an
unverified `dump.cs` RVA, disassembly or reconstructed index/rotation
rule to the game.

## Native GameAssembly PE64 source evidence (private, version-gated)

The Windows one-shot `run.ps1` now optionally captures original local
`GameAssembly.dll` **PE32+ AMD64** identity, section mapping and SHA-256,
without uploading or packaging the full game binary. When `GameAssembly.dll`
is absent, the normal DB-04 world-data extraction continues without it.
Without an IL2CPP dump corresponding to the **same exact game version**, the
report contains *only* PE metadata: no guessed v1.26.1 method RVAs are
applied to Steam v1.26.2.

If the PC already has its own matching `dump.cs` from Il2CppDumper, a
single existing source-extraction invocation can additionally request
bounded original-machine-code byte windows for
`Definitions.Grid.GridData` and `GridAreaData`:

```powershell
& ".\tools\db-04-world\run.ps1" `
  -Il2CppDumpPath "D:\Private\DDV\v1.26.2\dump.cs" `
  -Il2CppDumpGameVersion "1.26.2"
```

The caller-provided dump version must equal the game's `FullVersion.txt`;
the dump file is source-identified by SHA-256, but the stated version cannot
be independently proven from a C# text dump alone. The PE parser verifies
`MZ`, `PE32+`, AMD64 machine type, executable section ranges and bounded
RVA→original-file-offset mapping. Every included byte window is individually
SHA-256-checked. The output is placed in the **private** ZIP at
`diagnostics/native-pe-evidence.json` and never committed to public Git.

**Important:** byte windows are evidence of a PE offset, **not** proof of a
function's entire implementation or its semantics. The tool deliberately
does not disassemble code or promote
`nativeCodeBodyVerified`, `nativeFloorIndexToXYVerified`,
`nativeFootprintRotationVerified` or `placementLegalityVerified` to true.
To establish those behaviors requires version-matched disassembly and
independent source comparison. This is a one-shot capture path, not a claim
that native reverse engineering is already finished.

## Private x86-64 disassembly from captured original PE windows

When `run.ps1` is supplied with a version-asserted, matching
`-Il2CppDumpPath`, it now attempts a **real x86-64 instruction decode**
of the source SHA-verified `GameAssembly.dll` byte windows captured by
`native_pe_evidence.py`. This uses optional, pinned
[Capstone 5.0.9](https://pypi.org/project/capstone/5.0.9/), never a custom
opcode guesser. The extra decode occurs in the **same extraction invocation**
when the Python environment already has that exact package. Otherwise the
verified DB-04 extraction proceeds normally, prints an explicit skip message,
and never claims that a disassembly occurred.

For an existing verified private snapshot that already contains
`native-pe-evidence.json`, the decoder can also be run independently:

```bash
python -m pip install -r tools/db-04-world/requirements-native-disassembly.txt
python tools/db-04-world/disassemble_native_pe.py --snapshot "/private/Steam-snapshot"
```

The command writes `native-disassembly.json` only into that private
snapshot and refuses a public Git worktree. The ordinary deterministic
`package_snapshot.py` then includes it as
`diagnostics/native-disassembly.json` alongside the original byte-window
evidence. Every emitted instruction has its RVA, on-disk file offset,
original instruction bytes, mnemonic and operands. The packager rechecks
the original PE report SHA binding and **every instruction's byte-for-byte
contiguity** against the source window. Control-flow classification
(call/jump/return) is only an instruction-group hint.

Important limitations: linear decoding of a bounded source window does
not discover a function's entry control-flow reachability, true end address,
calls outside the window, or which following bytes belong to another method.
For this reason `nativeFunctionBoundaryVerified`,
`nativeControlFlowVerified`, `nativeCodeBodyVerified`,
`nativeFloorIndexToXYVerified`, `nativeFootprintRotationVerified`,
and `placementLegalityVerified` stay **false**. Disassembly provides
material for further reverse engineering, not proof of the game's placement
rules. No DLL, dump.cs, private machine bytes or instruction listings are
committed to public Git.

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

The Python extractor also attaches non-destructive `terrainDecoding` metadata to private `grids.json`. `verify_bundle.py` independently recomputes this metadata from source-derived Base64 bytes.

The browser adapter now also validates **all** compacted palette indices
once per grid, including those outside the requested viewport, and recomputes
palette-index cell counts from source bytes before presenting
`getNativeTerrainDistribution()`. A forged histogram with the correct total
but wrong per-index counts is rejected. Packed Base64 size is checked *before*
decoding. This provides browser-side consistency checks even when a caller has
not used the private `verify_bundle.py` CLI; it is still not a cryptographic
source-authenticity check or native machine-code decoder verification.

 Original GridData.get_Item uses fixed-width 1, 2 or 4 bits, not a 3-bit encoding. Palette sizes 1–2 map to 1 bit, 3–4 to 2 bits, and 5–16 to 4 bits. Larger palettes remain explicitly unresolved rather than silently treating them as 4-bit data. The current private source snapshot metadata still records `nativeCodeBodyVerified: false` because it does not itself contain the original machine-code proof; the independently verified Steam 1.26.1 native method evidence is stored privately, not bundled as unverified universal game-version claims.

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
native 1-/2-/4-bit compacted grid and its grid-local default `GridObject.X/Y`
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

The evaluator now enforces a deterministic total footprint-layer scan budget
(default 2,000,000 raw native footprint layer slots across all four models, configurable
with `--max-cells`). Results disclose `candidateLayerSlotsBudgeted`,
`candidateLayerSlotBudget`, `truncatedByCellBudget`, `truncatedByMaxObjects`,
`unprocessedLayoutObjects`, and count objects excluded by an exhausted budget.
The budget charges **all original fixed32 cells**, including zero-valued
ones, before considering the projections; sparse large shapes therefore
cannot bypass the runtime guard. The private one-shot ZIP uses both the
existing 5,000-object cap and the
layer-slot budget to prevent unexpectedly expensive processing of large native
footprints. Its statistics are diagnostic, not a placement legality score.

## Native terrain cell counts and default-object origin audit

DB-04 now extracts `nativePaletteIndexCellCounts` for source-corroborated 1/2/4-bit
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

## Source-verified GridArea base layer access (read-only)

The **original** Steam v1.26.1 `global-metadata.dat` v31 method
`Definitions.Grid.GridArea.get_Item(int x, int y)` resolves via the native
method-pointer table to RVA `0x3923370` (token `0x0600343F`).
Its original PE64 machine code multiplies `x * SizeY` and adds `y` to
index `GridArea.area`. Thus **unrotated GridArea layer indexing is X-major**.
The corresponding original
`GridArea.GetHorizontalSizeForOrientation` (RVA `0x3923570`) and
`GetVerticalSizeForOrientation` (RVA `0x3923660`) also establish
cardinal base-dimension selection: 0/8 preserve `SizeX/SizeY`, while
4/12 swap them. These statements are limited to **unscaled base dimensions**
and the unrotated layer getter; no tessellation factor is applied.

The Python helpers `native_gridarea_layer_at`,
`native_gridarea_layer_window`, and
`native_gridarea_cardinal_dimensions` expose these source-supported facts.
The browser provides:

```js
const cell = getNativeFootprintLayerAt(catalog, itemId, 1, 0);
const unrotated = getNativeFootprintLayerWindow(
  catalog, itemId, {x: 0, y: 0, width: 3, height: 2});
const dimensions = getNativeFootprintCardinalDimensions(
  catalog, itemId, 4);
```

Layer values are **raw uint32 GridLayers flags**, not "occupied cells".
Coordinates are **local to the unrotated GridArea**, not the scene or
grid's `GridObject.X/Y` origin. Every new API reports
`nativeGetterIndexVerified: true` or
`nativeCardinalSizeVerified: true` only for the corresponding narrow
operation, while all anchor, rotated-cell mapping, occupancy predicate and
placement legality claims remain false. Existing snapshot fields
`cellIndexToXYVerified: false` are retained for legacy partial-source
provenance; the new APIs do not silently rewrite or upgrade the entire
original asset record.

The legacy four-model hypothesis audit remains available for reproducibility.
**Its Y-major branch is a counterfactual diagnostic control**, not an equally
supported alternative after this source-native getter confirmation. Neither
its anchor model nor its 90-degree projection formula has been validated
against the original game's rotated-area algorithm.

## Original GridArea 16-orientation integer vector rotation (Steam v1.26.1)

The Steam v1.26.1 **original** `GameAssembly.dll` and original IL2CPP
`global-metadata.dat` v31 now establish the implementation of
`Definitions.Grid.GridArea.GetRotated` and `GetUnRotated`. The PE64
method bodies are at RVA `0x3924D30` and `0x3924C10`; they call the
original `Cos`/`Sin` accessors at `0x3924B10`/`0x3924B90`.
The native static constructor initializes two **16-entry signed integer
lookup tables**, `_cos` and `_sin`, scaled by **100**. The source
metadata's two 64-byte static-array initializer fields have exact SHA-256
names `33E08F575894FB4DC07B1049D58D185ED5B751ABFA51420694C73EC2742B13DE`
and `5B6E0D7F418632DFDBED128C7F41C18AC7EEC9BA8785F67EAC3F3582CDA2B719`.
The original DLL and metadata hashes and all seven pinned function-body hashes
(including 16-way size selection) are independently checked by `gridarea_rotation.py` and **never
committed as original machine-code bytes**.

The native arithmetic is *integer* and truncates each signed product
toward zero **separately**, with 32-bit multiplication semantics:

```text
rotatedX = trunc32(x*cos[o]/100) - trunc32(y*sin[o]/100)
rotatedY = trunc32(x*sin[o]/100) + trunc32(y*cos[o]/100)
inverseX = trunc32(x*cos[o]/100) + trunc32(y*sin[o]/100)
inverseY = trunc32(y*cos[o]/100) - trunc32(x*sin[o]/100)
```

The implementation preserves signed-int32 multiplication overflow as the
original x86 `imul` does. `trunc32` here means signed truncation
toward zero **after the native signed 32-bit product**, not a floating
rotation or rounding. An oblique rotation followed by its inverse may
therefore lose coordinates.

Browser APIs are read-only, accept original-grid-local **vectors only**,
and are **strictly version-gated** to `catalog.manifest.gameVersion ===
'1.26.1'`:

```js
const p = getNativeGridAreaRotatedVector(catalog, 2, 3, 4);
const q = getNativeGridAreaUnrotatedVector(catalog, p.x, p.y, 4);
```

For other game versions they return
`status: native_rotation_not_verified_for_game_version` with **no
calculated coordinates**. The equivalent Python
`rotate_gridarea_vector(x, y, orientation, inverse=False)`
is explicitly Steam v1.26.1-specific. To check a private installation
against the original native signatures without distributing original
bytes:

```bash
python tools/db-04-world/gridarea_rotation.py \
  --metadata "/private/Steam/ddv_Data/il2cpp_data/Metadata/global-metadata.dat" \
  --dll "/private/Steam/GameAssembly.dll"
```

### Source-native 16-way unscaled bounding dimensions

The original `GridArea.GetSizeForOrientation` (RVA `0x3923750`,
301 source bytes) selects the cardinal width/height directly; for
orientations **1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15** it dispatches to
`MoreRotationSize` (RVA `0x3923880`, 282 source bytes), which computes:

```text
baseWidth  = trunc32((abs(cos[o])*SizeX + abs(sin[o])*SizeY) / 100)
baseHeight = trunc32((abs(cos[o])*SizeY + abs(sin[o])*SizeX) / 100)
```

Unlike vector rotation, **the sum precedes /100**. Cardinal 0/8
preserve width/height; 4/12 swap them. The *full* original function then
applies `gridTessellationFactor / area.TessellationFactor`, so the new
public function is explicitly the **1:1 ratio specialization**, not an
unqualified world-scale footprint bound.

The Python `gridarea_orientation_base_size(sizeX, sizeY, code)`
and the browser
`getNativeFootprintOrientationBaseDimensions(catalog, itemId, code)`
return the unscaled 16-way base dimensions. The browser rejects
unsupported versions with no dimensions, while the Python function is
scoped to Steam v1.26.1. Both report
`fullNativeTessellationScalingApplied: false`,
`rotatedGridAreaCellMappingVerified: false`, and
`placementLegalityVerified: false`.

**Critical separation:** This proves native **vector transformations and
unscaled bounding dimensions**,
not how an item's `GridAreaData.LayerValues` should be remapped to
rotated grid cells, how a `GridObject.X/Y` anchor is applied,
which layer flags mean physical occupancy, or whether an edit is legal.
Every related API reports
`rotatedGridAreaCellMappingVerified: false`,
`gridObjectAnchorVerified: false`,
`occupancyPredicateVerified: false`, and
`placementLegalityVerified: false`. Do **not** replace the unresolved
footprint placement system with these vector operations alone.

## Original GridArea cardinal oriented layer mapping (Steam v1.26.1)

The original **GridArea.TryGetGridLocalPosition** (token 0x0600344A,
RVA 0x3923BB0) converts an orientation-frame local position into the
original unrotated GridArea coordinates. The native function comprises
three contiguous PE64 unwind segments, starting at 0x3923BB0, 0x3923C12,
and 0x3923C87 and ending at 0x3923D79. The first 98-byte unwind entry
alone does **not** cover the native method. The private-source auditor
gridarea_cardinal_local.py verifies the original DLL digest, all three
source unwind segments and the whole contiguous 457-byte method span.

For equal original area and caller tessellation factors (**1:1 only**),
the original native cardinal cases map input (x,y) into source-local
(originalX,originalY):

| Orientation | Original X | Original Y |
|---|---|---|
| 0 | SizeX - 1 - x | SizeY - 1 - y |
| 4 | y | SizeY - 1 - x |
| 8 | x | y |
| 12 | SizeX - 1 - y | x |

The original GridArea.get_Item(x,y) uses X-major fixed32 layer indexing,
originalX * SizeY + originalY. **Orientation 8 is the identity** of the
original method and orientation 0 reverses both axes. Previous
hypothesis-based orientation-0 identity projections are not native proof.

Read-only browser APIs:
- getNativeFootprintCardinalOrientedLayerAt(catalog,itemId,x,y,orientationCode)
- getNativeFootprintCardinalOrientedWindow(catalog,itemId,orientationCode,{x,y,width,height})

The window returns a Y-major matrix of **original raw GridLayers flags**,
not inferred occupied cells. Only cardinal 0/4/8/12 are available. On
other source versions, noncardinal rotations, or invalid positions the
APIs fail closed without asserting native layer values. The corresponding
Python research functions are cardinal_local_position and
cardinal_layer_window. To rerun private source verification:

~~~bash
python tools/db-04-world/gridarea_cardinal_local.py --dll "/private/Steam/GameAssembly.dll"
~~~

The original function also scales coordinates by the caller and
GridArea tessellation factors when these differ. The current source
snapshot has not established each item's actual GridArea tessellation,
so this API deliberately specializes only the **1:1 case** and
reports that assumption. The returned nativeCardinalPositionTransformVerified
is conditional on this ratio and the verified Steam v1.26.1 code.

The twelve noncardinal branches delegated to
MoreRotationGetGridLocalPosition are now independently decoded in the
section below. **Still unresolved:** actual per-object tessellation,
GridObject anchor offsets, physical cell occupancy, collisions and
placement legality. Occupancy and placement verification flags remain
false, and none of these source cell mappings authorize editing.

## Source-native twelve oblique orientations: GridArea cell-centre lookup

The original **GridArea.MoreRotationGetGridLocalPosition**
(token 0x0600344B, PE64 RVA 0x3923D80–0x3923FDB)
has been inspected against Steam v1.26.1's original GameAssembly.dll.
Its entire 603-byte machine-code function has SHA-256
befff8088fb717e1cef8501fb9c66b956f4e54fff24e8067a325ed493477ad9b
and exactly matches its original PE64 unwind function interval.
This is the real implementation called for native orientation codes
**1/2/3/5/6/7/9/10/11/13/14/15**.

For equal input and source GridArea tessellation factors (**1:1**),
the method converts an oriented-grid cell (x,y) using:

~~~text
orientedW = trunc((abs(cos[o])*SizeX + abs(sin[o])*SizeY) / 100)
orientedH = trunc((abs(cos[o])*SizeY + abs(sin[o])*SizeX) / 100)
cx = int32(x*100 + 50 - orientedW*50)
cy = int32(y*100 + 50 - orientedH*50)
ux = int32(trunc(int32(cx*cos[o])/100) + trunc(int32(cy*sin[o])/100) + SizeX*50)
uy = int32(trunc(int32(cy*cos[o])/100) - trunc(int32(cx*sin[o])/100) + SizeY*50)
originalX = trunc(ux/100); originalY = trunc(uy/100)
~~~

The method rejects negative intermediate (ux,uy), and the enclosing
TryGetGridLocalPosition rejects source coordinates outside the ORIGINAL
SizeX by SizeY rectangle. Each multiplication follows the source 32-bit
signed IMUL rules; signed divisions truncate toward zero. The browser
returns **no layer value** when the source position is outside the native
area, not an automatically empty/unoccupied object cell.

New Python research module:
tools/db-04-world/gridarea_oblique_local.py

Its private CLI verifies original DLL SHA-256, the original PE64
unwind function range and the complete 603-byte body digest:

~~~bash
python tools/db-04-world/gridarea_oblique_local.py --dll "/private/Steam/GameAssembly.dll"
~~~

Browser read-only APIs:
- getNativeFootprintObliqueOrientedLayerAt(catalog,itemId,x,y,orientationCode)
- getNativeFootprintObliqueOrientedWindow(catalog,itemId,orientationCode,{x,y,width,height})
- getNativeFootprintOrientedLayerAt(catalog,itemId,x,y,orientationCode)
- getNativeFootprintOrientedWindow(catalog,itemId,orientationCode,{x,y,width,height})

The last two combine this method with the four previously
source-corroborated cardinal branches, covering **all 16
GridOrientation values** for Steam v1.26.1 at assumed 1:1 scaling.

The viewport contains original uint32 GridLayers flags in Y-major display
rows; *null* signifies that a displayed oblique cell has **no valid
source GridArea coordinate**. It does NOT mean the grid cell is walkable
or suitable for a new object. Oblique integer rotation can map multiple
output cells onto the SAME source cell, and should not be interpreted as
a one-to-one pixel/occupancy transformation.

**Limits:** Game version other than 1.26.1 returns no source-confirmed
oblique layers. Current DB-04 data does not prove per-item
GridArea.TessellationFactor relative to the caller. GridObject world
anchor offsets, layers interpreted as actual occupancy, collisions,
special object rules and legal placement are still **unverified**.
All edit/placement permissions remain unchanged and unresolved.

## Native nullable GridAreaData.StrideOverride — preserved without interpretation

The Steam 1.26.1 original IL2CPP class GridAreaData defines
StrideOverride as **Nullable<int32> protobuf field 5**. When the item
record carries a GridAreaData in its own field 6, the corresponding
source path is **6.5**. Its encoded value is a length-delimited
protobuf int32 wrapper whose scalar is field 1. The difference between
an ABSENT outer wrapper (null) and an explicitly PRESENT empty
wrapper (int32 zero) matters and is preserved.

A full private scan of the original Steam 1.26.1 ItemList sources found:
- Furniture: 252 explicit stride records among 6,746 GridAreaData records.
  Value counts: 1→104; 2→137; 3→5; 4→6.
- Building: 3 explicit stride records among 394 GridAreaData records
  (478 building records total); all three have value 2.

The extractor now retains strideOverride: null|int32,
strideOverrideSourceVerified and original nativeWireFields.strideOverride
when present. The verified private snapshot also checks these flags,
the source wire path and the exact signed int32 type. The browser
getNativeFootprint(...) exposes the same nullable raw value and source
field but reports strideOverridePlacementSemanticsVerified:false.

**Do not use this value as a collision radius, decoration placement
stride, occupancy predicate or editor move/add permission.** Those
native validation calls and how a GridArea's stride override is
consumed are not yet independently proven. The original bytes and
record identities remain private; only aggregate source counts are
documented. Older verified snapshots without this field are accepted
without fabricating a native value.

### Original native GetStrideFor arithmetic (source-only, no placement claim)

Beyond merely preserving the optional GridAreaData.StrideOverride field,
original Steam 1.26.1 function bodies confirm the read-only **integer
calculation** performed by GridArea.GetStrideFor:

- Instance method: token 0x0600344F, PE RVA 0x39241A0–0x3924200,
  96 original bytes, SHA-256
  7178291ab336a2e05631763003c7d1c016779ff6f69eb69697b4184b0e99abce
- Static nullable overload: token 0x06003450, PE RVA
  0x3924200–0x392426C, 108 original bytes, SHA-256
  8768912978fad51027cbe0938a5fa2570d855b046e3bb20acaa6197ecd9f651f

Both methods have exact original PE64 .pdata function start/end ranges.
The instance method forwards its GridArea.StrideOverride and the caller
grid factor to the static method. The static code tests nullable
HasValue; if absent, it returns **1**, regardless of the grid factor.
If present, it returns **signed int32 product
StrideOverride.Value * callerGridTessellationFactor** (native IMUL
overflow wraps).

This is now exposed through Python
source_gridarea_computed_stride(stride_override, grid_factor,
source_record_complete=True) and the read-only browser API:

~~~js
const s = getNativeFootprintComputedStride(
  catalog, itemId, callerGridFactor);
const linked = getNativeDefaultLayoutObjectComputedStride(
  catalog, originalLayoutObjectId);
~~~

The latter obtains a Grid factor from a UNIQUE source default
GridCollection/Grid ID (see preceding section) and records
callerGridFactorProvenanceVerified:true. It is not evidence of
the factor in a current save. Source code is version-pinned to Steam
1.26.1.

Legacy snapshots with no strideOverride property **cannot be treated
as a source-confirmed nullable null** and yield
legacy_snapshot_stride_source_unavailable instead of a numeric result.
The APIs distinguish nativeStrideCalculationVerified:true from
strideOverridePlacementSemanticsVerified:false. Knowing the number
returned by GetStrideFor does **not** establish the rules under which
the game checks an object position, flags actual occupied cells or
authorizes an edit. All related permission and anchor flags stay false.

## Original item GridArea tessellation path and explicit caller-grid factor

New Steam v1.26.1 original-source evidence resolves the difference between
the **item GridArea tessellation factor** and the separate **caller Grid
tessellation factor**. The original native method
GridAreaData.GetGridArea (metadata token 0x0600309F, original RVA
0x38FA210–0x38FA37A) on its lazy-create path invokes
GridArea.Create(sizeX,sizeY,layers,floorType,strideOverride,
tessellationFactor=1). This is established by the compiled call setup,
not by guessing from protobuf data. The 362-byte native method spans
three contiguous PE64 unwind records and hashes to
97e6863ce412541cebadbf72f384097962d7da7367fb3b2c8e42201a389c08b3.
Other GridArea construction routes and any pre-existing cached instances
may have different provenance; **one is not a universally fixed value for
every GridArea in the game**.

In original GridArea.TryGetGridLocalPosition (RVA
0x3923BB0–0x3923D79), a *different* caller grid factor causes
**nonnegative** input x and y coordinates to be independently divided by
callerGridTessellationFactor, truncated toward zero, and then multiplied
by the item's area factor. Only after this conversion does the original
function apply its 16-way cardinal/oblique position transform. The
result is bounded against the source GridArea SizeX and SizeY. Native
GridArea.GetSizeForOrientation similarly returns
trunc(originalUnscaledWidth * callerFactor / areaFactor), independently
for height. The source leaves GridArea.Transform are at 0x3923550 and
0x3923560 (no PE unwind entry is required for these tiny leaf functions).

The **item GridAreaData.GetGridArea factory path**, with its confirmed
area factor of 1, now supports a safe, explicit caller factor in Python
and browser; it does not assume a factor for another user's world:

~~~python
gridarea_scaled_source_cell(size_x, size_y, x, y, orientation, grid_factor)
gridarea_scaled_layer_window(size_x, size_y, layer_values,
                             orientation, grid_factor, x, y, width, height)
~~~

~~~js
const cell = getNativeFootprintTessellatedOrientedLayerAt(
  catalog, itemId, x, y, orientationCode, callerGridFactor);
const preview = getNativeFootprintTessellatedOrientedWindow(
  catalog, itemId, orientationCode, callerGridFactor,
  { x: 0, y: 0, width: 6, height: 4 });
~~~

For a native area of 3 × 2 with caller factor 2, orientation 8 has
a 6 × 4 grid input rectangle; each original cell is referenced by a
2 × 2 block. An oblique orientation can duplicate or omit source cells
in the underlying oriented matrix; any **null** output means no source
GridArea mapping, not open space for placement.

The source verifier is private-source-only:

~~~bash
python tools/db-04-world/gridarea_tessellation.py \
  --dll "/private/Steam/GameAssembly.dll"
~~~

It checks the original DLL SHA, the full native method hashes, and
all six relevant .pdata segments across the two large methods.

**Provenance boundary:** The caller grid factor is explicitly supplied.
This does **not** prove that it matches a particular default layout,
live save, or selected GridObject. Returned
callerGridFactorProvenanceVerified remains false. Likewise, the
fact that the original item GridArea factory passes 1 does not certify
other GridArea factories or unrelated caller paths. Browser decoding is
Steam v1.26.1 gated. Neither a raw mask nor repeated source cell
establishes the object anchor, physical occupancy, movement restrictions,
collisions, or legal editor placement. All these flags remain false.

### Binding an original default GridObject to its native Grid factor

The original SceneLayouts GridCollection records each Grid's
TessellationFactor (protobuf field 4), separately from its GridObject
map (field 5). DB-04 already extracts both the grid's native ID,
GridDataPath and factor into layouts.json, and the GridObject's
original ItemID, orientation and grid ID into layoutObjects.json.

The read-only World API now joins these records by their **exact original
layout ID and native grid ID**, requires **exactly one matching Grid
entry** and a valid positive factor (1..256), then computes the
object-local raw GridArea layer matrix using the original
GridAreaData.GetGridArea factory path and the source-native
TryGetGridLocalPosition conversion:

~~~js
const view = getNativeDefaultLayoutObjectLayerWindow(
  catalog, 'SceneLayouts/Village04/Main.json#grid=0#object=7',
  {x: 0, y: 0, width: 4, height: 6});
const cell = getNativeDefaultLayoutObjectLayerAt(
  catalog, 'SceneLayouts/Village04/Main.json#grid=0#object=7',
  3, 5);
~~~

When successfully joined, the result includes
callerGridFactorProvenanceVerified: true, source layout ID, native Grid
ID, GridDataPath, factor, original ItemID, and orientation. A missing,
duplicate or invalid Grid entry **cannot** silently fall back to 1.
Missing GridData in a *partial* source archive is reported as a
sourceGridDataLoaded boolean, without misrepresenting the source-proven
GridCollection factor itself.

This does **not** establish that an object's current game-save Grid,
TessellationFactor, or transform matches the **default** game source.
Nor does it prove that a particular item record used the native
GridAreaData.GetGridArea factory route rather than another constructor.
Returned currentSaveObjectVerified,
worldCoordinatesVerified, itemFactoryRoutePerRecordVerified,
gridObjectAnchorVerified, occupancyPredicateVerified and
placementLegalityVerified remain false. The API **does not add the
GridObject.X/Y anchor**, because the object's position/reference
convention has not been proven.

## Unverified cardinal footprint models — evidence-only diagnostic

The original game's `Definitions.Grid.GridAreaData` exposes `SizeX`,
`SizeY`, native fixed32 `LayerValues`, and `AcceptedFloorTypesFlag`.
`Meta.Grids.GridObject` supplies a grid-local anchor and a 16-entry
`GridOrientation` enum. **The native machine-code body establishes X-major indexing
of unrotated GridArea layers and cardinal width/height swaps. It has not
established which layer masks imply occupied cells, how rotated cell positions
are mapped, or where an item's anchor lies relative to them.**

To investigate without claiming placement permission, run:

```bash
python tools/db-04-world/audit_footprint_candidates.py --snapshot "/private/DB04-output" --max-objects 20000
```

The script first verifies the private DB-04 manifest. It retains four
historical geometric diagnostic models: native **X-major** and a now
source-contradicted **Y-major negative control**, crossed with unverified
**top-left vs center-floor** anchor interpretations.
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
