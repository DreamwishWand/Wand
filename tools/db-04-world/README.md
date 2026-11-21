# DB-04 WORLD — evidence-checked native world database

This lane implements a **read-only, partial, game-native database**, not a save editor or a speculative map generator. It deliberately does **not** mark the entire world graph or placement rules as complete.

## Verified input formats

- Steam game source `ddv_Data/StreamingAssets/itemlist/Furniture.json` and `Building.json`: indexed protobuf records with exact integer item IDs, native names and `GridAreaData` (wire field 6).
- `GridAreaData` fields 1/2 contain native `SizeX`/`SizeY`; field 3 is exactly `SizeX * SizeY` little-endian 32-bit layer values; field 4 is `AcceptedFloorTypesFlag`. Those mappings were cross-checked with a game-native `StreamingAssets/Furniture/...json` definition and full-file cardinality checks.
- `itemlist/Scene.json`: indexed native Scene IDs/names; native scene-kind numeric value is kept without assigning an unsupported world/biome role.
- `protoDb.bin` entries `Worlds` (`Definitions.WorldData`), `DefaultVillages` (`Meta.DefaultVillageList`) and `Village04Layout1` (`Definitions.Scene.VillageAreaData`): game-defined world names, Scene IDs, explicit parent world references, default layout paths and VillageAreaType/ground/water NavMesh IDs. The six villages include five conditional layouts, but those layout paths are **not** native world IDs.
- `GridData/**/*.json`: despite the suffix these are **binary**. Verified IL2CPP `Definitions.Grid.GridData` fields 1/2 are SizeX/SizeY, field 3 is repeated native fixed32 FloorTypes, field 4 a fixed32 palette, and field 5 compacted index bytes. All raw palette values and Base64 packed bytes are preserved without guessing bit order, XY axis order or world coordinates.
- `Definitions.Grid.GridLayers` and `Definitions.Grid.GridFloorType` enums have verified bit names (e.g. 68 = Low|Blocking, 3072 = Floor|Wall). The meaning of those masks does **not** itself establish a full placement/collision algorithm.
- `SceneLayouts/**/*.json`: many are binary protobuf. The tool records literal `GridData/` and `SceneLayouts/` paths only when those strings occur in protobuf fields, with field-path provenance. Filename similarity is **not** used to invent relations.
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
| `layouts.json` | explicit scene-layout to grid source-path references |
| `worlds.json` | 18 native realm world entries and six provenance-labeled village-layout keys (from accessible 1.26.1 source) |
| `areas.json` | native area-type codes and parent scene, grounded by VillageAreaData |
| `diff.json` | added, removed and field-changed records across two snapshots |
| `unresolved.json` | remaining semantics, missing footprints, unresolved references and data conflicts |
| `report.json` | observed extraction totals; no completion claim |

The browser adapter at `src/lib/world/catalog.mjs` supports indexed lookups by native ID and conservative negative edit restriction checks. It **never** returns a positive placement-validity decision based on raw flags. Rendering an authoritative 2D terrain/occupied-cell map still requires separately verified compacted-index bit order, XY axis/origin, fixed objects and adjacency/rotation rules. Known enum names alone do not grant placement validity.

A **source-subset preview** is stored privately in [SRC-05: Steam 1.26.1 native partial preview](https://drive.google.com/file/d/1SMKmvtyCV04lzxngg_3MHIEgYCx8zkrp/view). It contains all three available itemlist source originals plus three sample grid files, two sample layouts and the actual protoDb world registry. Its grids/layouts are **not exhaustive**. The complete game-root extraction is a separate run of `world.py` and is not implied by this preview.

Ownership boundaries: DB-05 supplies per-save placed objects and coordinates; SRC-04 MEDIA supplies large-scale images and 3D asset conversion; SRC-01 ITEMS owns the general item taxonomy, names and localization.

## Tests

```bash
python -m unittest discover -s tools/db-04-world -p 'test_*.py' -v
node --test tests/world.test.mjs
```

The tests synthesize native wire records. No commercial game data is committed as fixtures.
