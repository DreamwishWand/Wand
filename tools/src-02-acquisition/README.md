# SRC-02 ACQUISITION — local source inspection and extraction

This standalone Windows/Python 3.10+ tool reads owned DDV game files or already extracted files **without changing them**. It makes no network requests, modifies no saves/entitlements, and never guesses acquisition IDs or availability. No pip dependencies are required.

## Start with inspection

From the repository root in PowerShell:

```powershell
py -3 tools/src-02-acquisition/acquisition.py inspect --input "D:\DDV\game-source" --out "D:\DDV\src02-output" --limit 30
```

Or use:

```powershell
& .\tools\src-02-acquisition\run.ps1 -Mode inspect -InputRoot "D:\DDV\game-source" -OutputRoot "D:\DDV\src02-output" -Limit 30
```

`inspection.json` lists relative paths, byte lengths, SHA-256, top-level JSON keys where available, and filename/content keyword hints. Binary/Unity/IL2CPP/Protobuf material is deliberately reported as unknown unless separately decoded. Keyword matches are **candidates only**, never item/acquisition evidence. Inspection is read-only. For large raw assets, this first pass still inventories them without attempting to load them into memory.

## After inspecting real native definitions

Write a local rules JSON file from **observed fields**; `rules.example.json` is synthetic documentation, **not a claim** about actual DDV file names, schemas, field numbers, or native IDs. JSON, JSONL/NDJSON, CSV, and TSV are supported. The tool intentionally does not attempt to silently parse binary protobuf/Unity assets as JSON. Convert those separately using a documented schema/decoder and preserve original native IDs.

```powershell
py -3 tools/src-02-acquisition/acquisition.py extract --input "D:\DDV\decoded" --out "D:\DDV\src02-output" --rules "D:\DDV\observed-rules.json" --catalog "static\ddv\collection\v1.25" --limit 5
```

Remove `--limit` for the full run; run exactly the same command again to resume from per-file cache. `--fresh` disables reuse. Files are processed independently, with cached output keyed to source SHA-256 and rules SHA-256. If a source file or rule set changes, the affected file is recomputed. Every run rebuilds consolidated outputs from **only the files selected in that run**, so omitted files are not accidentally treated as current evidence. `--max-bytes` (default 64 MiB for JSON documents), `--max-records` (default 100,000 per file), and `--limit` bound work. Large structured files should be exported into smaller JSONL shards (or multiple JSON files) first. Do not use a destination directory inside the original game folder.

## Rule model

Each rule requires `id`, `glob`, `records`, `entity_type`, and `id`. The `glob` selects source files; `records` and `id` are explicit dotted JSON selectors supporting `[*]`, e.g. `Offers[*]`, `Rewards[*].ItemID`, or `$`. A source record yields an entity with its type, **unmodified native ID**, optional `method`, explicitly selected `fields` (including price/currency/conditions/time windows), and source SHA-256/path/record pointer. Its `links` point to other native IDs. No joins are made by translated names.

Links require `target_type`, `relation`, and `id`; optional `records` selects nested link records. `fields` on a link can extract quantities or other local metadata. `Item`, `Quest`, `Event`, `StarPath`, `Bundle`, `Offer`, `Reward`, `Store`, `Recipe`, `Exchange`, `Campaign`, and `Currency` are supported entity types. Defined methods include PremiumShop, Bundle, Offer, ScroogeStore, OrderCatalog, StarPath, FriendshipQuest, StoryQuest, Event, Crafting, Exchange, TwitchDrops, CampaignCode, and Other.

A link from Offer → Reward and another from Reward → Item yields source-grounded *both* Reward → Item and Offer → Reward → Item routes. Multiple independent sources can yield multiple paths to the same item. Graph traversal avoids cycles and stops at six edges; deeper chains are explicitly flagged. Unresolved referenced entities, duplicate definitions/relations, invalid IDs, unknown IDs relative to the **older** Collection catalog, and source errors are reported separately.

## Outputs

| File | Purpose |
| --- | --- |
| `manifest.json` | Input source label, relative paths, source hashes, matched rules, processed/cached status |
| `entities.json` | Entities with explicit field projections and record provenance |
| `relations.json` | Typed edges and source proof; target IDs are native, never translated-name joins |
| `acquisitions.json` | Item ID → many possible acquisition paths, including each upstream ID and proof |
| `validation.json` | Warnings, unresolved edges, reference-catalog misses, and category coverage |
| `inspection.json` | Independent initial source discovery (from `inspect`) |
| `.src02-cache/` | Resumable per-file extracted results, private to the local output root |

**A missing ID in the v1.25.0 Collection reference does not prove it is invalid in a newer game build.** An unresolved quest/reward/etc. means its definition has not yet been imported, not that the game's reference is corrupt. `current_sale` and `historical_sale` remain `UNKNOWN` for every static file-derived route: availability now, prior live sales, Twitch Drops, and redemption codes cannot be established solely from local packaged definitions. Dates and flags, when mapped, are retained as raw evidence only. `source_label` is operator-provided metadata, not independent build verification.

If a file is unreadable or exceeds limits, it is not silently marked analyzed. `extract` returns exit code 2 and records `SOURCE_UNREADABLE_OR_UNSUPPORTED` in the validation report. Incomplete `--limit` runs are flagged `partial_input`.

## Local synthetic tests

```powershell
py -3 -m unittest discover -s tools/src-02-acquisition -p "test_*.py" -v
```

All fixtures are generated in a temporary directory. No game data and no binaries are committed to this tool folder. Once inspected native schemas are known, replace the example rule selectors with source-verified ones and cross-check a small batch before scaling up.