# DB-04 WORLD — evidence-checked native world database

This lane implements a **read-only, partial, game-native database**, not a save editor or a speculative map generator. It deliberately does **not** mark the entire world graph or placement rules as complete.

## Verified input formats

- Steam game source `ddv_Data/StreamingAssets/itemlist/Furniture.json` and `Building.json`: indexed protobuf records with exact integer item IDs, native names and `GridAreaData` (wire field 6).
- `GridAreaData` fields 1/2 contain native `SizeX`/`SizeY`; field 3 is exactly `SizeX * SizeY` little-endian 32-bit layer values; field 4 is `AcceptedFloorTypesFlag`. Those mappings were cross-checked with a game-native `StreamingAssets/Furniture/...json` definition and full-file cardinality checks.
- `itemlist/Scene.json`: indexed native Scene IDs/names; native scene-kind numeric value is kept without assigning an unsupported world/biome role.
- `protoDb.bin` entries `Worlds` (`Definitions.WorldData`), `DefaultVillages` (`Meta.DefaultVillageList`) and `Village04Layout1` (`Definitions.Scene.VillageAreaData`): game-defined world names, Scene IDs, explicit parent world references, default layout paths and VillageAreaType/ground/water NavMesh IDs. The six villages include five conditional layouts, but those layout paths are **not** native world IDs.
- `GridData/**/*.json`: despite the suffix these are **binary**. Verified IL2CPP `Definitions.Grid.GridData` fields 1/2 are SizeX/SizeY, field 3 is repeated native fixed32 FloorTypes, field 4 a fixed32 palette, and field 5 compacted index bytes. All raw palette values and Base64 packed bytes are preserved without guessing bit order, XY axis order or world coordinates.
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
