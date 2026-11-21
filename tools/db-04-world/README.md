# DB-04 WORLD — evidence-checked native world database

This lane implements a **read-only, partial, game-native database**, not a save editor or a speculative map generator. It deliberately does **not** mark the entire world graph or placement rules as complete.

## Verified input formats

- Steam game source `ddv_Data/StreamingAssets/itemlist/Furniture.json` and `Building.json`: indexed protobuf records with exact integer item IDs, native names and `GridAreaData` (wire field 6).
- `GridAreaData` fields 1/2 contain native `SizeX`/`SizeY`; field 3 is exactly `SizeX * SizeY` little-endian 32-bit layer values; field 4 is `AcceptedFloorTypesFlag`. Those mappings were cross-checked with a game-native `StreamingAssets/Furniture/...json` definition and full-file cardinality checks.
- `itemlist/Scene.json`: indexed native Scene IDs/names; native scene-kind numeric value is kept without assigning an unsupported world/biome role.
- `GridData/**/*.json`: despite the suffix, these are often **binary** data. The extractor records wire fields and hashes but does not claim that binary payloads are traversability masks.
- `SceneLayouts/**/*.json`: many are binary protobuf. The tool records literal `GridData/` and `SceneLayouts/` paths only when those strings occur in protobuf fields, with field-path provenance. Filename similarity is **not** used to invent relations.
- `Furniture/**/*.json`: supplementary JSON overrides. Mismatching item ID/name pairs are retained in `unresolved.json`, never silently joined.

Observed on available Steam-derived native input: 6,746 furniture entries with valid GridAreaData; 478 buildings (394 carry GridAreaData and 84 do not); 194 scenes. These counts do not establish full coverage of every DLC, adventure pack, biome or save-specific world.

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
| `scenes.json` | scene IDs and native labels; unknown hierarchy stays null |
| `grids.json` | binary grid source IDs, native field profiles and opaque-payload hashes |
| `layouts.json` | explicit scene-layout to grid source-path references |
| `worlds.json` | empty until world/biome parentage is independently verified |
| `diff.json` | added, removed and field-changed records across two snapshots |
| `unresolved.json` | remaining semantics, missing footprints, unresolved references and data conflicts |
| `report.json` | observed extraction totals; no completion claim |

The browser adapter at `src/lib/world/catalog.mjs` supports indexed lookups by native ID and conservative negative edit restriction checks. It **never** returns a positive placement-validity decision based on raw flags. Rendering a 2D terrain occupancy map requires separately verified grid origin, axis/ordering, mask meanings, fixed objects, and adjacency/rotation rules.

Ownership boundaries: DB-05 supplies per-save placed objects and coordinates; SRC-04 MEDIA supplies large-scale images and 3D asset conversion; SRC-01 ITEMS owns the general item taxonomy, names and localization.

## Tests

```bash
python -m unittest discover -s tools/db-04-world -p 'test_*.py' -v
node --test tests/world.test.mjs
```

The tests synthesize native wire records. No commercial game data is committed as fixtures.
