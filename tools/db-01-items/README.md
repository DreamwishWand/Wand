# DB-01 ITEMS — evidence-preserving shared catalog

This compiler consumes existing SRC-01 private extractions and the committed Switch 1.25.0 Collection reference. It does **not** extract images, change saves, invent taxonomy/relationships, or publish private data. Python 3.10+ standard library only.

## Inputs already available

- Existing Steam 1.26.2 `tools/src-01-items/steam1262.py` and `SRC-01 ITEMS/items.jsonl` (13,202 definitions across ActivityItem, Furniture, Clothing, Trimming) with source `manifest.json`.
- Existing Steam 1.26.2 `localize1262.py` (exact eight-locale LocDB joins). If the private `items-localized.jsonl` **and** `localization-manifest.json` have been generated, the compiler validates both and uses them automatically; otherwise names stay unresolved. It does not use old Switch names as current Steam names.
- Existing Switch 1.25.0 `static/ddv/collection/v1.25/index.json` plus 18 checksum-verified shards (12,552 records).
- Existing private `format-probe.json` (35 more itemlist files: 34 sample-probed definition containers, one verified empty `ItemCondition.json`). `extend1262.py` verifies original source hashes against this probe and decodes raw native definitions; field semantics beyond the specifically observed ID/key strings stay unclassified.

## Extended definitions (only if original Steam game files are available)

```powershell
py -3 tools/src-01-items/extend1262.py --game "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley" --probe "D:\WandData\SRC-01\Steam-v1.26.2\format-probe.json" --out "D:\WandData\SRC-01\Steam-v1.26.2-extended"
```

This reads the 34 SHA-pinned files, checks all frame IDs against their keys, and exact-joins `field 3` display-name keys only when corresponding category-specific LocDB entries exist. Some native types (missions, conditions, dialogue, etc.) are **not** asserted to be inventory items. Field-4 GUIDs for these types are explicitly labeled candidates; no guessed icon mapping is published.

## Build private normalized data

```powershell
py -3 tools/db-01-items/build.py --source "D:\WandData\SRC-01\Steam-v1.26.2" --reference "static\ddv\collection\v1.25" --extended "D:\WandData\SRC-01\Steam-v1.26.2-extended" --out "D:\WandData\DB-01\Steam-v1.26.2"
```

Omit `--extended` when its outputs are not yet available. The source folder must contain the native `manifest.json` and `items.jsonl`; it may also contain the localized outputs. The output must not overlap any source directory. Run from a repo checkout containing the reference shards. The pipeline validates source hashes, preserves every Item ID and original file/platform/version, and avoids work if the source fingerprints and output checksums have not changed. Use `--force` to deliberately rebuild.

Outputs in the **private** versioned directory:

- `items.jsonl`: current Steam native definitions, `catalogDomain: item` only for the four validated categories, `definition_unclassified` for other itemlist types. Always contains field-specific verification, explicit nulls for unknown values, and separate `historicalReference` when available.
- `reference-only.jsonl`: records present in the older Switch Collection but **not observed** in this partial Steam extraction; not claims of removal.
- `diff.json`: exact ID intersection, new-only IDs, old-not-observed IDs and changes in names only where both versions have actual names; `removedIds` and `meaningChangedIds` remain null.
- `unresolved.json`: missing language counts and unverified semantic fields.
- `manifest.json`: input fingerprints, output SHA-256 hashes, counts and private publication status (written last as a commit marker).

All eight languages are stored under `en`, `fr`, `it`, `de`, `es-ES`, `ja`, `zh-CN`, and `pt-BR`. No historical world/universe/expansion values are silently promoted to Steam 1.26.2 assertions. Item ID stability alone is not evidence of semantic identity.

`src/lib/items/records.mjs` provides a shared read contract for Collection, Decorate, Guide and Save Editor. It only returns official names whose exact localization join was verified, validates current source evidence, and returns verified icon GUIDs without the unclassified field-4 candidates.

## Validation

```powershell
py -3 -m unittest discover -s tools/db-01-items -p "test_*.py" -v
py -3 -m unittest discover -s tools/src-01-items -p "test_*.py" -v
node --test src/lib/items/records.test.mjs
```

**Data storage:** generated Steam/game-derived records, source probes, manifests, diff and unresolved belong in owner-private `SRC-01 ITEMS` Drive (or a private DB-01 versioned folder). Do not commit generated game data or raw assets to the public repository. The GitHub changes are parser/consumer/tests/documentation only. No website publication occurs automatically.