# DB-01 ITEMS — evidence-preserving shared catalog

This compiler consumes existing SRC-01 private extractions and the committed Switch 1.25.0 Collection reference. It does **not** extract images, change saves, invent taxonomy/relationships, or publish private data. Python 3.10+ standard library only.

## Inputs already available

- Existing Steam 1.26.2 `tools/src-01-items/steam1262.py` and `SRC-01 ITEMS/items.jsonl` (13,202 definitions across ActivityItem, Furniture, Clothing, Trimming) with source `manifest.json`.
- Existing Steam 1.26.2 `localize1262.py` (exact eight-locale LocDB joins). If the private `items-localized.jsonl` **and** `localization-manifest.json` have been generated, the compiler validates both and uses them automatically; otherwise names stay unresolved. It does not use old Switch names as current Steam names.
- Existing Switch 1.25.0 `static/ddv/collection/v1.25/index.json` plus 18 checksum-verified shards (12,552 records).
- Existing private `format-probe.json` (35 more itemlist files: 34 sample-probed definition containers, one verified empty `ItemCondition.json`). `extend1262.py` verifies original source hashes against this probe and decodes raw native definitions; field semantics beyond the specifically observed ID/key strings stay unclassified.

## Recover fully embedded source files before requesting PC work

The private `format-probe.json` already embeds the entire original bytes for six small
Steam 1.26.2 itemlist source files (BoardGame, Currency, Display, Environment,
PhotoMode, Profession). Unlike the larger 28 nonempty files, these can be
SHA-256-verified and decoded without asking the owner to run another Windows command.
`ItemCondition.json` is additionally verified empty. Run:

```powershell
py -3 tools/src-01-items/probe_complete.py --probe "D:\WandData\SRC-01\Steam-v1.26.2\format-probe.json" --out "D:\WandData\SRC-01\Steam-v1.26.2-probe-complete"
```

The generated `definitions.jsonl`, `manifest.json`, `report.json`, and `unresolved.json`
are private, source-derived data. In addition to 132 verified native definitions,
fully embedded eight-locale LocDB members for `BoardGame.locbin` and `PhotoMode.locbin`
are independently checked against ZIP-member CRC-32 and joined to the exact
localization keys: 66 definitions have eight matching localized names (528
locale values). The native field-3 key includes a `Category.` prefix, whereas
`Category.locbin` stores keys without that prefix. The extended original-file
parser uses this verified exact category-local lookup too. `manifest.json` uses `wand.src01.extended@1`,
marks remaining 28 source types explicitly unresolved and records full SHA-256
checks for all recovered files. This is a **partial extended** dataset:
66 definitions have exact matches across all eight locale files embedded in the
probe; other names remain null until the actual LocDB archives are available.
Field-4 GUIDs are only candidates. Pass the folder to `--extended` in the DB-01 builder.
After the original full itemlists become available, replace the partial extended
folder with output of `extend1262.py` (do not merge duplicate IDs).

The DB-01 builder rejects unlocalized source rows with claimed official names,
requires exact per-locale LocDB archive/member provenance for populated names,
and checks extended source/category hashes and counts. Input manifest hashes
are part of the incremental build key, so changes to name provenance invalidate
previous cached outputs even if item contents are unchanged.

## Source-prefix observations from the 28 incomplete itemlist files

Even though the 28 larger itemlists cannot be fully verified without the original
Steam files, `format-probe.json` contains the first 8,192 bytes from each. The
separate `probe_prefix.py` utility recovers **only the complete frames within
those captured prefixes**, checking the first three keys, IDs and frame lengths
against the original probe. It drops the incomplete trailing frame instead of
attempting recovery. It does not claim to verify the SHA-256 of an inaccessible
full source file, and **must not be provided to `build.py --extended`**.

```powershell
py -3 tools/src-01-items/probe_prefix.py --probe "D:\WandData\SRC-01\Steam-v1.26.2\format-probe.json" --out "D:\WandData\SRC-01\Steam-v1.26.2-prefix-evidence"
```

The 2026-11-21 Steam 1.26.2 probe yielded 1,482 observed definitions across
28 partial source files (none overlaps the 13,334 fully verified records).
Eight-locale joins are possible for some complete embedded LocDB members:
103 prefix-only definitions have exact non-placeholder names in all eight
locales. Names carrying `{Placeholder}`, `{LegacyPlaceholder}` or
`{DoNotTranslate}` markers are kept in `locdbNonDisplayValues` rather than
promoted to renderable `names`. The prefix report explicitly counts the 13
non-display source values per locale. Partial category coverage and
full-file SHA-256 verification remain unresolved. These are **diagnostic
source observations**, not extra canonical or collectible items.

The manifest uses the **different** schema `wand.src01.prefix-evidence@1`,
`mergeIntoCanonicalPermitted: false`, records a separate SHA-256 for each
captured prefix, and marks the full-file SHA as a claim not independently
verified. When the actual full Steam sources are available, `extend1262.py`
should replace (not append) these prefix observations with whole-file evidence.

## Diagnostic LocDB prefix joins for the four complete native itemlists

The same private `format-probe.json` includes incomplete first-8,192-byte
`ActivityItem.locbin`, `Furniture.locbin`, `Clothing.locbin`, and `Trimming.locbin`
archives in all 8 supported locales. `probe_locprefix.py` parses complete
localization entries from those captured prefixes and joins **only exact**
`rawNameField + "_DisplayName"` keys to the 13,202 native entries whose IDs
and full source-file hashes are validated with the existing DB-01 loader.

```powershell
py -3 tools/src-01-items/probe_locprefix.py --probe "D:\WandData\SRC-01\Steam-v1.26.2\format-probe.json" --native "D:\WandData\SRC-01\Steam-v1.26.2" --out "D:\WandData\SRC-01\Steam-v1.26.2-locale-prefix"
```

The 2026-11-21 input yields **429** source-key match observations, including
**427** records with at least one non-control-marker display-name candidate,
**226** matching all eight prefix captures, and two marker-only records.
These are not official validated current names until the full source LocDB
members/archives can be checked. The separate output
`observed-locale-prefix-names.jsonl` and manifest
`wand.src01.locale-prefix-evidence@1` record full native input hashes,
per-member *prefix* hashes, exact match counts, full-member CRC verification
state, and `mergeIntoCanonicalPermitted: false`. Never overwrite
`items-localized.jsonl` or the canonical DB-01 `names` with these samples.
`{DoNotTranslate}`, `{Placeholder}`, and `{LegacyPlaceholder}` markers are
preserved as non-display observations, not silently shown as UI labels.

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

## Owner-private runtime API and DB-00 handoff

`src/lib/items/catalog.mjs` provides a shared, read-only catalog for Collection,
Guide, Decorate and Save Editor. It accepts **only** the DB-01 compiler's
`wand.db01.items@1` manifest or the separately designated owner-private
`wand.db01.partial-manifest@2` (13,334 currently observed full-source definitions).
Neither format authorizes site publication. It rejects the two diagnostic
`wand.src01.*-evidence@1` prefix schemas entirely.

```js
import { openPrivateItemCatalog } from './src/lib/items/catalog.mjs';
import { createDb01Db00Patch } from './src/lib/items/db00-join.mjs';

// Both inputs are owner-local/private. No fetch or website upload is performed.
const catalog = await openPrivateItemCatalog(manifest, new Uint8Array(itemsJsonl));
const item = catalog.getDisplayItem(30000031, 'ja');
// item.displayName is null until current Steam LocDB is verified for that ID.
const matches = catalog.search('30000031', { locale: 'ja' });

// Only for a matching owner-private Steam DB-00 target whose sourceSha256
// equals catalog.source.sourceManifestSha256 and whose buildId is null.
const handoff = createDb01Db00Patch(catalog, verifiedSteamTarget);
// Pass handoff.patch to DB-00 applyPatch; do not switch the public pointer.
```

The catalog SHA-256-verifies the entire JSONL before decoding, checks all
per-row source and locale-verification states, validates category/domain totals,
and freezes cloned records. `createPrivateItemCatalog(manifest, parsedRows)` is
available for trusted pre-parsed inputs but **cannot** feed the DB-00 bridge
because the raw bytes have not been hash checked.

Names are only rendered when their locale is marked `exact_locdb_join`, with
fallback permitted only when explicitly requested. Other strings and raw
internal identifiers are never presented as official display names. Icon GUIDs
are exposed only for the four validated native types; other native definition
families are kept separate from the `item` domain. The existing Switch 1.25.0
Collection taxonomy, worlds, universes, and old names stay in
`historicalReference` and are never silently inserted into current Steam fields.

`src/lib/items/db00-join.mjs` produces an explicitly private, source-matched
DB-00 candidate patch containing the four validated native categories only.
Other definitions, item ownership, DLC eligibility, placement geometry, save
writing, and publication remain unresolved. The patch contains a **private**
source ledger entry and must not enable public site data. This adapter does
not touch the existing Collection runtime, DB-00 active pointer or GitHub Pages
assets. It intentionally fails closed if the target source/version/build ID
is unverified.

Tests: `node --test src/lib/items/*.test.mjs` (including end-to-end DB-00 patch
application and corrupted-JSONL SHA refusal).

## One-shot Windows full-source extraction (when local game files are available)

The optional `tools/db-01-items/run-all.ps1` orchestrator executes all four
already-tested CLI stages in sequence: four native itemlists, exact eight-locale
LocDB joins, all other SHA-pinned itemlists, and the DB-01 compiler with the
existing Switch 1.25.0 Collection reference. It is designed to replace several
separate manual Windows runs with a **single local command**. It needs the
owner's original Steam v1.26.2 game folder and existing private
`format-probe.json`, and fails closed on version/hash mismatch. It cannot
complete when the installed game has been updated to another version.

```powershell
& 'tools\db-01-items\run-all.ps1' -Probe 'D:\WandData\SRC-01\Steam-v1.26.2\format-probe.json' -Out 'D:\WandData\DB-01\steam-1.26.2'
```

`-Game` defaults to the standard Steam installation directory and may be
overridden. The script refuses output paths nested in (or containing) the
public repository, game installation or probe folder, checks child-process exit
codes, disables Python bytecode creation in the repository, and confirms the
final DB-01 private-only manifest. It does not upload files, edit saves,
commit data or change GitHub Pages. This is a **prepared command**, not a claim
that the original full 28 files or eight entire localization archives have
already been processed in ChatGPT.

## SHA-identical archived-source recovery → normalized 33,627 definitions

See [`RECOVERED-PARTIAL.md`](RECOVERED-PARTIAL.md) for the private **38/39 source**
recovery build, 33,627 verified definition IDs (13,202 native item types +
20,425 unclassified definitions), all-eight-locale verification for 241 rows,
and exact-coverage comparison with the earlier 13,334-row partial baseline.
Neither old Switch taxonomy nor prior-version whole LocDB ZIPs are promoted.


## Owner-private historical locale candidate overlay (not verified current names)

The existing archived Steam v1.26.1 ZIP originals and Steam v1.26.2
format-probe member size/CRC32/first-8KiB metadata agree for **15 categories ×
8 locales = 120 member pairs**. They do **not** prove full current member
SHA-256 equality. `build_correlated_names.py` independently validates all
original archive checksums and the exact 33,627-item private DB-01 source hash,
then produces **12,883 records with eight-language historical candidates**, of
which 3,657 official current locale values independently match and none differ.

The output has separate schema `wand.db01.historical-locale-correlations@1`
and `mergeIntoCanonicalPermitted:false`, and remains private. The consumer
`src/lib/items/historical-candidates.mjs` requires a hash-verified source
catalog, checks the overlay hash and Item ID/key alignment, prefers source-
verified current names, and only permits historical values when the caller
explicitly sets `allowHistorical:true`. Do not import these into official
current `names` or publish them. See
[`HISTORICAL-LOCALE-CORRELATIONS.md`](HISTORICAL-LOCALE-CORRELATIONS.md).