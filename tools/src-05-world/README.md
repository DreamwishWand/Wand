# SRC-05 WORLD DATA

Windows-compatible, standard-library-only, read-only inventory and conservative extraction of Disney Dreamlight Valley world and placement data. No game files are modified; source and output directories must differ. No editor, placement authorization, or save mutation is implemented.

## Windows commands

```powershell
cd C:\path\to\Wand
py -3 tools\src-05-world\world_data.py inspect --input "D:\DDV\Extracted" --output "D:\WandWorldOutput"
py -3 tools\src-05-world\world_data.py build --input "D:\DDV\Extracted" --output "D:\WandWorldOutput" --platform "Steam" --game-version "1.26.1" --limit 200
py -3 tools\src-05-world\world_data.py build --input "D:\DDV\Extracted" --output "D:\WandWorldOutput" --platform "Steam" --game-version "1.26.1" --start 200 --limit 200
py -3 tools\src-05-world\world_data.py build --input "D:\DDV\Extracted" --output "D:\WandWorldOutput" --platform "Steam" --game-version "1.26.1"
py -3 -m unittest discover -s tools\src-05-world -p "test_*.py" -v
```

The version and platform flags above are **examples**, not automatic detections; replace them with verified values or omit them. Input should be a directory of exported JSON/JSONL game data; point `inspect` at a raw Steam installation first to determine whether only Unity binary assets are present. `.assets`, Unity bundles, and IL2CPP binaries are inventoried but **not decoded**. If only binary assets are present, extract their structured data with a suitable game asset tool and inspect the resulting directory. An empty `placements.json` is **not** proof that no game placement definitions exist.

## Commands and outputs

`inspect`: list source types and sample JSON candidates in `source-inventory.json`. No JSON parsing.

`build`: parse candidate JSON/JSONL files; produce `worlds.json`, `placements.json`, `id-map.json`, `manifest.json`, `unresolved.json`, `diff.json` and `report.md`. A file's hash, relative path, and exact JSON pointer form its evidence record. Fields are retained only when observed, and edit authorization is **always** `UNVERIFIED`. No inferred footprint, safe position, or automatic item/placement ID equivalence is asserted. Geometry dimensions refer to their source definitions, not necessarily save-grid coordinates. All game-version and runtime constraints require independent validation.

By default the candidate file set uses path keywords such as `GridData`, `Furniture`, `Building`, `Road` and `Fence`. Files with unrelated names containing actual world data may be missed; the inventory shows candidate coverage. `--start N --limit M` processes a bounded slice; `.cache` enables later runs and incremental resumption. `--shards 4 --shard 0` through `3` divides a selection into disjoint slices. `--rehash` forces selected files to be reread. `--previous PATH` compares current output with a previous output folder. A `PARTIAL_JSON_SCAN` status means the cached corpus is incomplete. Raw binary counts always remain a separate limitation even when all JSON has been processed.

Scope: only the `tools/src-05-world/` directory is maintained by this stream. Keep raw game assets out of Git. Do not treat older v1.25 Switch-derived static artifacts as proof for newer Steam builds. Existing legacy assets can serve as references if their provenance and schema are preserved separately.
