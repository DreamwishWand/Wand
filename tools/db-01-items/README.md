# DB-01 ITEMS — final implementation contract

**Status:** production-architecture code; source datasets remain owner-private. No
unverified labels, inferred rights, shop/availability claims or writer permissions.

- **Extraction/evidence:** Python (offline, on verified Steam originals), no rewrite planned.
- **Operational catalog:** versioned, normalized, read-only SQLite; source SHA-256 and
  original-version provenance are retained, and historic names cannot enter exact names.
- **Runtime API:** **TypeScript**, `src/lib/items/index.ts` and `db00-join.ts`.
  It fetches only an ID bucket, category or locale index from a private asset source,
  SHA-256-verifies every requested file, and never loads the entire 38.7MB JSONL.
- **UI:** Svelte 5 + TypeScript (already chosen in the application).
- **Save binary processing:** Rust/WASM (separate Save Editor ownership).
- No JavaScript DB-01 runtime to port later; all active DB-01 consumer code is TS.

## Owner-private build, from repository root

First generate the verified private source JSONL using the source/version-specific
SRC-01 readers (`steam1262.py`, `localize1262.py`, `recover_unchanged1262.py`
when source-hash matches) and `build_recovered_partial.py` or the more general
`build.py`. The previously recovered, **historical partial** v1.26.2 stage had 33,627
definitions and 38/39 originals. The current owner-private, independently
audited v1.26.2 release supersedes it with **39,067** definitions and 39/39
itemlist original files verified; keep old references only for provenance.

From its private output:

```powershell
py -3 tools/db-01-items/sqlite_store.py `
  --catalog 'D:\WandData\DB-01\Steam-v1.26.2-recovered-33627' `
  --history 'D:\WandData\DB-01\Steam-v1.26.2-historical-locale-candidates' `
  --out 'D:\WandData\DB-01\steam-1.26.2.sqlite'

py -3 tools/db-01-items/export_shards.py `
  --sqlite 'D:\WandData\DB-01\steam-1.26.2.sqlite' `
  --out 'D:\WandData\DB-01\steam-1.26.2-shards' `
  --include-historical
```

`--history` and `--include-historical` are optional. Historical candidates remain
explicit and are never returned unless a caller sets `allowHistorical:true`.
The one-shot `tools/db-01-items/run-all.ps1` also creates private SQLite and
non-historical read-shards after the complete source extraction passes all gates.
On later versions, the same SQLite+TypeScript layer consumes independently
verified **`wand.db01.items@1`** output without hardcoded 1.26.2 checks.

```ts
import { createDb01CatalogClient } from '$lib/items/index.ts';
import { createDb01Db00Patch } from '$lib/items/db00-join.ts';

// Private-origin/local File loader; caller is responsible for access controls.
const client = createDb01CatalogClient(privateManifest, async (relativePath) =>
  new Uint8Array(await privateFileProvider(relativePath)));
const item = await client.getItem(30000031);   // one SHA-checked ID bucket
const matches = await client.getItems([30000031, 30000032, 30000031]);
// Bounded 4096-ID request, up to eight concurrent unique ID buckets;
// returns ordered (Db01Item | null)[] for Save, Guide and Collection joins.
const items = await client.getCategory('Furniture'); // one category shard
const labels = await client.searchExactNames('Belle', 'en'); // one locale index
const official = await client.getName(10000001, 'ja'); // null if unverified
const maybeOld = await client.getName(10000001, 'ja', {allowHistorical:true});
```

Never place generated `*.sqlite`, shard folders, source JSONL, localization ZIPs
or game-derived indexes in GitHub or `static/` without explicit rights approval.
The files are local/private by default; neither the CLI nor the TS API publishes.

## Verification and legacy evidence

```bash
python -m unittest discover -s tools/db-01-items -p 'test_*.py' -v
node --experimental-strip-types --test src/lib/items/*.test.mjs
npm run check
```

Older `.mjs` DB-01 runtime modules were removed in the TS cutover. Their source
is preserved in Git history, **not** maintained as a parallel implementation.
Original-source instructions and evidence limits remain documented in:

- [`RECOVERED-PARTIAL.md`](RECOVERED-PARTIAL.md) — 33,627 source-verified IDs,
  13,202 four-category items and 20,425 unclassified definitions.
- [`HISTORICAL-LOCALE-CORRELATIONS.md`](HISTORICAL-LOCALE-CORRELATIONS.md) —
  12,883 eight-language historical candidates; 120 CRC/prefix matches do not
  establish current-version whole-member SHA equality.
- [`VERSION-DIFF.md`](VERSION-DIFF.md) — honest coverage-aware source version
  comparison, including no invented game removals.
- [`../src-01-items/RECOVER-UNCHANGED-1262.md`](../src-01-items/RECOVER-UNCHANGED-1262.md)
  — exact 38/39 SHA-identical originals from the prior Steam archive.

**Current source status:** v1.26.2 `Condition.json` and all eight matching
LocDB ZIPs have been acquired, SHA-256 checked and incorporated into the audited
private catalog. Item type, source subtype and partial source Collection
classification overlays are available (details below). DLC entitlement, actual
world acquisition and runtime Collection visibility are separate unverified
concerns, not inferred from those sources.

## Full-original-source coverage: Steam 1.26.2 acceptance

The current owner-private Steam 1.26.2 source-backed candidate has completed
**39/39 original itemlist files**, including the changed `Condition.json`;
eight target-version LocDB archives were separately SHA-256 checked.
The independent `audit_shards.py` passed on the complete read model:

- 39,067 source definitions (5,440 newly included Condition definitions);
- 13,202 confirmed native *item-category* definitions; the remaining 25,865
  native definitions have unclassified gameplay semantics;
- 111,088 exact current names (13,886 for each of eight locales);
- 302/302 private shards, 39,067 unique native-category keys, SQLite structural,
  source-to-record, current-name index and canonical-byte checks PASS;
- no historical candidates, no inferred ownership, DLC rights or publishing.

Canonical manifests now preserve `fullCorpusParsed=true` **only** when they
also carry explicit verified/total original-file coverage, a source-scan SHA
and complete per-file SHA-256/byte ledgers covering every original itemlist
family (including empty files). Every SQLite source record must agree with
its declared original-category SHA; missing or conflicting evidence fails
closed before an operational SQLite database is accepted.

This metadata gate is NOT an independent signature or proof that an arbitrary
caller-supplied source manifest is trustworthy. The private release still needs
trusted source archive byte verification, an independently pinned source SHA,
and the full SQLite-to-shard audit. The `sourceCoverageComplete` audit field
means **the itemlist source universe declared by the trusted current scan**,
not every DDV asset or proven gameplay/entitlement semantics.

The fully audited private SQLite/catalog/shards remain exclusively in the
owner's SRC-01 Google Drive folder, never public GitHub or Pages. The public
repository contains only reusable scripts and synthetic test fixtures.

## Runtime manifest ledger integrity (without original-game upload dependency)

The TypeScript client validates the SHA-256/size/count ledger before any private
asset is fetched. In particular, the sum of all 256 ID bucket counts and the
sum of native-category counts must both equal `definitions`; the four verified
item-native categories must equal `currentNativeItemDefinitions`. Per-locale
entry counts cannot exceed definitions; optional historical entry counts
cannot exceed eight candidates per definition. A fully parsed corpus cannot
declare missing verified sources. These are **metadata consistency checks**,
not evidence of complete v1.26.2 original-game upload.

After validation, the client freezes an independent in-memory copy of its
manifest and all file SHA/size/count entries. A caller mutating its original
manifest during later asynchronous reads cannot retarget hash verification.
A separately trusted manifest provenance/SHA and the complete independent
`audit_shards.py` release audit are still required: consistent but forged
source metadata cannot be authenticated by runtime self-consistency alone.

## Steam v1.26.2 source-exact item classification (original Tag ID metadata)

`extract_classification.py` is the source-verified offline **Python** producer
for a separate **private** lazy-read overlay. It uses the existing audited
39,067-definition SQLite v2 as the identity authority, verifies its pinned
SHA-256, and rejects every original itemlist that differs from that SQLite's
exact source hash. It decodes original `Tag.json` identifiers (409 source
definitions), the exact original Tag IDs referenced in supported wire fields,
the unmodified native key and any uninterpreted numeric subtype codes.

The type-safe **TypeScript** consumer is
`src/lib/items/classification.ts`; it loads only an item-ID bucket, pins each
file to the manifest's SHA-256, and compares native category, Item ID, native
key and source SHA against the existing `Db01CatalogClient`. Its
`getItem(id)` / `getItems(ids)` calls preserve all source-exact Tag references
and multiple Disney-universe/source-world-context tags.

The initial current-source verified private output identifies **14,973**
definitions containing **67,377** original Tag-ID references. Source
association coverage by group: clothing slot 2,062; furniture kind 6,248;
Disney-universe 1,997; world-context 11,275; colors 7,663; furniture style
4,778; clothing style 1,872; ingredient kind 469; meal kind 618. These counts
overlap. All 39,067 source definitions, including those without a proven Tag
association, are queryable. An unknown field remains unknown.

To reproduce **from owner-private originals**, supply the audited complete
SQLite and the game `itemlist` directory. Never put any of these output
files in the public repo:

```sh
python tools/db-01-items/extract_classification.py \
  --sqlite /owner/private/complete-1262.sqlite \
  --original-dir /owner/private/steam-1262/itemlist \
  --expected-sqlite-sha256 <independently pinned actual SQLite SHA256> \
  --out /owner/private/db01-1262-source-tags
```

Source Tag hashes must match the exact current SQLite ledger. If a reduced
synthetic SQLite lacks a `Tag` category, additionally supply an independently
trusted `--expected-tag-sha256`; this is not needed for the complete original
Steam 1.26.2 release. The output is 256 private SHA-checked on-demand JSON
shards and a versioned manifest; the old catalog, icon GUIDs and eight exact
current-version names are unchanged. The private original Tag overlay is
stored alongside the audited DB-01 release in the owner's SRC-01 Drive folder.

### Shared Item-ID classification read API (TS, private source overlays)

`src/lib/items/shared-view.ts` provides
`createDb01SharedItemClient({catalog,itemTypes,tags,directMenus,
universePredicates,specialPredicates,activityCrafting})`, the single DB-01
query entrypoint for Collection, Guide, Save Editor, Decorate and Presets.
Existing source clients and their immutable SHA-verified private shards are
reused; this is a read composition layer, **not another game-data database**.
`catalog` is required and all other source clients are opt-in.

```ts
const shared = createDb01SharedItemClient({
  catalog, itemTypes, tags, directMenus,
  universePredicates, specialPredicates, activityCrafting,
});
const item = await shared.getItem(itemId);
const many = await shared.getItems(itemIds); // maximum 4096 per call
const coverage = shared.getCoverage();
```

An item result preserves original 8-language names, icon GUID and native
identity, the current IL2CPP exact item class/subtype when connected,
original Tag facets, directly listed CollectionSet associations,
and all source-predicate matches from the 262 current selectors. **Static
candidate matches and explicit negative Crafting source filters remain
separate**: `item.collection.candidates` contains retained positive source
matches; `item.collection.suppressed` retains the matched original predicate
alongside the same-set/group Crafting exclusion. Direct listings remain in
`item.collection.direct`, rather than being silently converted into
runtime visibility. Multiple relationships per Item ID are preserved.

Critical contract: every connected overlay must match the catalog's game
version, source Items SHA and definition count. Available private SQLite and
current IL2CPP SHA pins must also agree across overlays. Mismatch fails
before any private shard read. Missing optional overlays yield
`null`/`craftingExclusions:'unavailable'` rather than falsely claiming
no tags, no classifications or no exclusions.

No Source-Tag/Collection rule authorizes a value for the **actual game-screen
category/subcategory, real obtainable world, DLC entitlement, player runtime
Collection state or private-data publication**: those fields remain `null`.
The `getCoverage()` counts original-source evidence, not gameplay UI
verification. UI streams must explicitly load this owner-private release
and independently confirm game-screen/runtime membership before activating
visible category filters. No public Pages asset or raw game file is added.

### Final 40 Steam Collection Activity/Crafting source predicates (current originals)

The verified Steam 1.26.2 `CollectionSet` contains **12** `CollectionActivity`
conditions and **28** `CollectionCrafting` conditions. The new offline
`resolve_collection_remaining.py` checks the current
`CollectionSet.json`, `Tag.json`, `ActivityItem.json`,
`ActivityData.json`, SHA-256-pinned full private 39,067-definition SQLite,
and independently pinned **matching-version IL2CPP field declarations**.

For Activity, it resolves original `CropItemData.Tags` gameplay tags,
`MealItemData.MealType`, `IngredientItemData.CookingIngredientType`,
and verified `ActivityItemType` values for Fish, Flower, Mineral and
CraftingMaterial. For Crafting, it traces current
`CraftingRecipeItemData.RecipeType` through
`CraftingRecipeItemData.Types.ResultInstance.ItemID` to the exact
current canonical result item. **19 of the 28 original Crafting selectors
are `Ignore=true`**; these are recorded only as negative exclusions.
Same CollectionSet/group negatives are applied to this producer's positive
candidates and supplied to DB-00 to suppress the corresponding
Furniture/Clothing source-universe predicate matches.

Independent full-original audit of the current private release:

- **40 / 40** remaining selectors have source-exact interpretation.
- **2,050** current Item IDs have positive predicate candidate links
  (**2,073** positive links); **88** IDs have original negative recipe
  evidence (**358** negative links). The union is **2,052** Item IDs,
  preserving overlap. **32** same-group positive matches were suppressed
  by negative recipe evidence.
- Combining negative recipe evidence with the earlier Furniture/Clothing
  **6,087** source predicates removes **35** same-group links, leaving
  **6,052** Furniture/Clothing *source-predicate candidates*. The earlier
  count remains the unfiltered original-universe source overlay.
- All **257 private assets** match their manifest SHA-256, the complete
  current SQLite identities and the original source-file hashes.
- Together, the three source predicate readers parse **262/262 original
  dynamic selectors** (124 Furniture/Clothing, 98
  Character/Memory/Figurine/Pet/Sidekick, 40 Activity/Crafting).

```sh
python tools/db-01-items/resolve_collection_remaining.py \
  --sqlite /owner/private/complete-1262.sqlite \
  --original-dir /owner/private/steam-1262/itemlist \
  --il2cpp-dump /owner/private/steam-1262/Il2CppDump/dump.cs \
  --expected-sqlite-sha256 <trusted SQLite SHA256> \
  --expected-il2cpp-sha256 <trusted original dump SHA256> \
  --out /owner/private/db01-1262-activity-crafting
```

The read-only TypeScript `src/lib/items/collection-remaining.ts` returns
`getItem(id)`, `getItems(ids)` and `getSelectors()`, preserving
`positive` candidate links and `negative` exclusion links **separately**.
The opt-in private DB-00 bridge combines same-set/group negative Crafting
filters with the existing source-universe candidate records; it does not
turn unknown UI category/subcategory, DLC ownership or obtainable-world
fields into asserted values.

**Boundary:** 262/262 represents decoded, current-original selector
*static source conditions*. It is NOT a guarantee of complete actual game
Collection menu membership: the runtime's visibility, collection state,
progress/unlock and other transient rules still require separate validation.
The source-original datasets and generated overlay remain owner-private,
never part of a public Pages deployment.

### Current Steam Collection character/memory/figurine/pet/sidekick predicates

`resolve_collection_special.py` independently pins the owner-private current
v1.26.2 SQLite and matching IL2CPP `dump.cs` SHA-256, checks current
`CollectionSet`, `Tag`, `Character`, `MemoryShard`, `BoardGame`
and `Companion` complete original byte identities against every SQLite row,
and matches these source-exact selector/field paths:

- **35** CharacterUniverse selectors → `CharacterItemData.Tags`;
- **43** MemoryShard selectors → `UniverseTagItemID` or
  `MemoryShardTagItemID`, including **one negated selector** applied as a
  group-level exclusion, never as a positive membership;
- **16** BoardGameFigurine universe selectors → `FigurineItemData.Tags`;
- **2** Pet.IsNotable selectors → the source enum `CompanionItemType.Pet=0`
  and the source `PetItemData.IsNotable` boolean;
- **2** SidekickUniverse selectors → Character.Tags together with
  `CharacterItemData.IsSidekick`.

For Steam v1.26.2 this verifies **98** original selector conditions and
**890 distinct original Item IDs** (**892** positive Item-ID/selector links),
after **3** current source negative/ignore exclusions. These are **static
source-predicate candidates**, not proof of runtime Collection membership,
unlocked items, game UI display, DLC rights or obtainable worlds.

The previous Furniture/Clothing overlay resolves **124** *other* selectors,
making **222 / 262** source selector conditions interpretable through the two
disjoint current-original producers. **40** still require work: 12 activity
selectors and 28 crafting selectors. This is **not** 222/262 actual gameplay
Collection UI verification; runtime filtering remains separate.

```sh
python tools/db-01-items/resolve_collection_special.py \
  --sqlite /owner/private/complete-1262.sqlite \
  --original-dir /owner/private/steam-1262/itemlist \
  --il2cpp-dump /owner/private/steam-1262/Il2CppDump/dump.cs \
  --expected-sqlite-sha256 <independently pinned SHA256> \
  --expected-il2cpp-sha256 <independently pinned SHA256> \
  --out /owner/private/db01-special-collection
```

The read-only `src/lib/items/collection-special.ts` exports a SHA-verified,
bounded on-demand TypeScript client with `getItem(id)`, `getItems(ids)` and
`getSelectors()`. This overlay covers non-inventory native classes.
**Do not force these records into DB-00's four-class inventory Item patch**;
the original Item ID and class remain accessible to Collection/Guide/Save
consumers directly. The 257 SHA-pinned private files plus private audit are
stored in the owner's SRC-01 ITEMS Drive folder. Neither private game-derived
datasets nor the raw IL2CPP dump are included in public GitHub.

### Current Steam 1.26.2 Furniture/Clothing dynamic universe predicates

`resolve_collection_universes.py` now reads the independently SHA-pinned
39,067-definition SQLite, same-version `Il2CppDump/dump.cs` and **original
full byte-identical files** `CollectionSet.json`, `Tag.json`,
`Set.json`, `Furniture.json` and `Clothing.json`. The source IL2CPP
field declarations are checked before applying this precise join:

`CollectionItemType.Furniture/Clothing.Universe` → original Tag ID →
original Set.Tags → Furniture/Clothing.SetItemID → original Item ID.

On the complete current Steam v1.26.2 source:

- 262 dynamic CollectionItemType selectors exist.
- **124 selectors (63 furniture and 61 clothing) have directly traceable
  original Disney-universe Set/Tag conditions.**
- The full original Set link and tag comparison matches 4,224 furniture
  and 2,040 clothing definitions before explicit per-group exclusions.
- 177 original ignore-list matches are excluded, leaving **4,083 furniture
  + 2,004 clothing = 6,087 source-predicate candidates**.
- **138 other selectors remain unresolved** by this producer.
- 39,067 source definitions are still preserved unchanged, and the prior
  168 direct-listed Item IDs are kept separate rather than overwritten.

Each candidate is tied to the current CollectionSet ID/group, source Set
ID, original Disney-universe Tag ID and exact native category, plus source
SHA-256 hashes. Its evidence marker is
`source_item_set_disney_universe_tag_equals_collection_filter`.
This is **proof of a static source predicate match, not proof that the
game runtime considers the item collected, unlocked, visible, owned, or
available in a particular world**. The runtime's extra checks and remaining
selector families still need their own verification.

```sh
python tools/db-01-items/resolve_collection_universes.py \
  --sqlite /owner/private/complete-1262.sqlite \
  --original-dir /owner/private/steam-1262/itemlist \
  --il2cpp-dump /owner/private/steam-1262/Il2CppDump/dump.cs \
  --expected-sqlite-sha256 <trusted actual SHA-256> \
  --expected-il2cpp-sha256 <trusted actual SHA-256> \
  --out /owner/private/db01-1262-collection-universe
```

This generates 256 private SHA-checked ID buckets and a selectors index.
The TypeScript `src/lib/items/collection-universe.ts` supports
`getItem(id)`, `getItems(ids)` and `getSelectors()` without loading
all current game data. The optional DB-00 bridge stores provenance under
`attributes.gameOriginalCollectionUniversePredicateMatches` without
filling unknown UI `category/subcategory`, `worlds` or `contentIds`.
The original-source release is kept private in the owner's SRC-01 ITEMS
Drive workspace, not inside public GitHub or Pages.

### Current Steam CollectionSet menu associations (source-exact direct lists)

`extract_collection_menu.py` now reads original Steam v1.26.2
`CollectionSet.json` alongside the independently SHA-pinned current
`Il2CppDump/dump.cs` `Definitions.Items.CollectionSubMenu` enum, joining
against the 39,067 verified IDs of the existing owner-private DB-01 SQLite.
No old Switch category is copied into current data.

The complete current source has **305 original CollectionSet definitions**.
**168 distinct current Item IDs** are explicitly listed in *non-ignored*
`CollectionGroup.CollectionsByItem` lists, with matching original canonical
Item IDs. Some native classes beyond the four player-inventory categories
are listed; all are queryable through the new client. The remaining dynamic
`CollectionsByType` selectors are **not** evaluated by this first direct-list
layer. Original `Ignore` item lists are excluded from the direct assignments
and counted independently.

The resulting private manifest includes verified source digests, current
version, per-submenu counts, explicit-link coverage, and the exact number of
unevaluated dynamic predicates. Source-linked metadata includes original
`CollectionSubMenu` code/name, collection set Item ID/native key,
localization key and group index. It does **not** claim that an item is
currently visible or unlocked in a player's Collection screen.

```sh
python tools/db-01-items/extract_collection_menu.py \
  --sqlite /owner/private/complete-1262.sqlite \
  --collectionset /owner/private/steam-1262/itemlist/CollectionSet.json \
  --il2cpp-dump /owner/private/steam-1262/Il2CppDump/dump.cs \
  --expected-sqlite-sha256 <independently pinned SQLite SHA256> \
  --expected-il2cpp-sha256 <independently pinned current IL2CPP SHA256> \
  --out /owner/private/db01-1262-collection-menus
```

The TypeScript `src/lib/items/collection-menu.ts` provides
`getMenus()`, `getDirectListings(itemId)`, and bounded
`getDirectListingsBatch(ids)`. The optional private DB-00 bridge preserves
these source associations under
`attributes.gameOriginalCollectionDirectListings` and their
separate source SHA references. It **does not** fill `category`,
`subcategory`, content entitlements or world availability from dynamic
filter guesses. Full game-screen taxonomy remains to be reconstructed by
evaluating the source's `CollectionsByType` conditions.

### Steam v1.26.2 IL2CPP ItemType and source-exact subtypes

The SHA-verified original `Il2CppDump/dump.cs` defines the authoritative
`Definitions.Items.ItemType` and native per-class subtype enums.
`extract_item_types.py` independently pins BOTH the private SQLite
SHA-256 and the current game's full IL2CPP dump SHA-256, parses the
`Definitions.Items` enum namespace, and fails closed if ANY of the
39,067 original source definitions disagrees with the official ItemType
code inferred from its original numeric ID.

**Observed Steam 1.26.2 coverage (all source-verified records):**

- **39,067 / 39,067** Item IDs agree with the source `ItemType` enum.
- **28,520** have an exact source subtype name from the matching native enum;
  **10,547** have a source ItemType but no evidenced subtype label.
- For source-proved ID associations only, the native top-level ItemType code
  is the 10,000,000-place prefix; the 100,000-place remainder holds a
  subtype code when a corresponding original enum is present. Unknown
  future IDs, Collection-menu category and DLC are NOT inferred.
- `ActivityItemType` includes `Crop`, `Meal`, `Fish`, `Seed` and
  `Ingredient`; `FurnitureItemType` includes `Landscaping`,
  `Fence`, `Door`, etc.; `ClothingItemType` includes `CloTopOuter`,
  `CloBottomInner` and many more. Original enum names are preserved
  verbatim instead of guessing user-visible game labels.
- The existing raw wire field-7/8 subtype **candidate** in the separate
  Tag overlay remains uninterpreted; it is NOT treated as the original
  Item ID's encoded subtype.

Use the offline producer with an **independently trusted** Steam 1.26.2
IL2CPP dump; the original bytes and generated metadata stay owner-private:

```sh
python tools/db-01-items/extract_item_types.py \
  --sqlite /owner/private/complete-1262.sqlite \
  --il2cpp-dump /owner/private/steam-1262/Il2CppDump/dump.cs \
  --expected-sqlite-sha256 <trusted SQLite SHA256> \
  --expected-dump-sha256 <trusted IL2CPP dump SHA256> \
  --out /owner/private/db01-steam-1262-item-types
```

The TypeScript `src/lib/items/item-types.ts` reads only the requested
SHA-checked Item-ID buckets, verifies the same-version canonical
`Db01CatalogClient` source identity, and exposes `getItem(id)`,
`getItems(ids)`, and exact or explicitly unknown subtype names. In the
optional private DB-00 join, these are returned through
`attributes.sourceItemType` and `attributes.sourceSubtype`; they are
not promoted to unverified `category` or `subcategory` user-menu
fields. The owner-private original-type overlay has 256 audited shards
alongside the original DB-01 release in SRC-01 Drive.

### Item ID numeric-range audit (original-class identity only)

The offline `audit_id_ranges.py` examines **every source-verified Item ID** in
one SHA-pinned private SQLite release. For Steam v1.26.2, the 10,000,000-ID
prefix grouping is a perfect partition of the 39,067 observed definitions
across 38 nonempty **source-native classes**, with **zero collisions**.
This *does not* identify game-screen categories, subtypes, universes or DLC;
and **unknown future Item IDs cannot be classified** using the historical
partition without a fresh, complete original-source check.

```sh
python tools/db-01-items/audit_id_ranges.py \
  --sqlite /owner/private/complete-1262.sqlite \
  --expected-sqlite-sha256 <independently pinned SQLite SHA256> \
  --divisor 10000000 \
  --out /owner/private/db01-id-range-audit.json
```

The report records per-prefix native classes and observed ID ranges;
ambiguous prefixes are reported as collisions, not assigned a guessed class.

### Legacy Switch v1.25.0 taxonomy comparison (candidate-only)

The optional `correlate_switch_classification.py` joins the already
SHA-verified Switch v1.25.0 Collection index/shards to the current Steam
v1.26.2 SQLite and the complete current original-Tag overlay. It validates
each input hash, only correlates existing Item IDs, and separately reports
exact current name matches, source Tag universe overlap and source world-
context tag overlap. All old categories, universe/world candidates and
expansions retain explicit **historical-only** labels; zero inferred
promotions into current UI taxonomy, actual obtainability or DLC entitlement.

```sh
python tools/db-01-items/correlate_switch_classification.py \
  --sqlite /owner/private/complete-1262.sqlite \
  --overlay /owner/private/db01-1262-source-tags \
  --switch-reference static/ddv/collection/v1.25 \
  --expected-sqlite-sha256 <independently pinned actual SQLite SHA256> \
  --out /owner/private/db01-switch125-classification-candidates
```

The report separates confirmed cross-source agreements from unverified old
metadata. Different versions and game platforms cannot be equated merely
because an Item ID collides. The resulting private candidate file is *never*
automatically applied to DB-00 or a current version of Collection.

### Cross-service source-tag completeness check (2026-11-22)

Current-version Collection scope evidence in the same owner-private
SRC-01 Drive folder was independently generated from `ActivityItem`,
`Clothing`, `Furniture`, `Trimming`, `Set` and `Tag` source files.
Comparing its **13,202 native item IDs** against the complete DB-01
Tag overlay exposed 112 missing furniture world-context links and 31 missing
original Disney-universe links. Original Furniture wire field **7** stores a
packed Tag-ID list for these items (distinct from the scalar subtype candidate
in other furniture definitions). `TAG_FIELDS['Furniture']` now includes 7.

After regenerating all 39,067 owner-private definitions with this field:
- Original Tag references increase from 67,089 to **67,377**.
- Definitions with a source Tag association increase from 14,861 to **14,973**.
- Direct world-tag disagreements: **0 / 13,202**.
- Direct universe-tag disagreements: **0 / 13,202**.

The private source-to-source comparison report retains independent
manifest and SHA-256 pins for both data producers. The newer Tag overlay
is an immutable, owner-private **v2 data release** that retains the same
versioned TypeScript schema; the older release is retained for rollback.
This is proof of matching original direct Tag references, NOT evidence
of where an item can be acquired, or user DLC entitlement. Set-derived
Disney-universe names remain **candidates** (not direct tags).

**Evidence boundaries:** `nativeCategory` is a source definition class, not
necessarily the Collection screen menu; a Tag group is a source-record
association, not a proved parent/child menu or universally applicable
ItemType enum. `wireSubtypeCode` is numeric and explicitly uninterpreted.
An original `IsEternityIsle` tag indicates a *world-context tag*, not a proof
that an item is obtainable there; a Disney universe tag does **not** assert a
DLC entitlement or shop availability. No source Tag inference populates
DB-00's `worlds`/`contentIds`, and unknown UI category/subcategory remain
`null`. In the opt-in DB-00 join, original tags/facets and subtype codes are
passed in `attributes`, with multiple verified Disney universe links retained.
DB-02 owns acquisitions, DB-03 season data and DB-04 world hierarchy.

## Multi-version update pipeline and SHA-exact original-file reuse

**New version-independent operational entrypoint:** `release_pipeline.py` accepts
an independently verified, owner-private DB-01 normalized `manifest.json` +
`items.jsonl` catalog. It derives the Steam game version from the verified source
manifest (or checks an explicitly provided expected version) and writes an
immutable source-SHA-keyed SQLite v2 / TypeScript-shard / full-audit release
under `<private-out>/steam-<version>/db01-<fingerprint>/`.

```powershell
./tools/db-01-items/run-all.ps1 -Catalog "D:\WandData\DB-01\v1.27.0-catalog" `
  -ExpectedVersion "1.27.0" -Out "D:\WandData\DB-01\releases"

# Optional: historical candidates stay separate and explicitly opt-in.
./tools/db-01-items/run-all.ps1 -Catalog "D:\WandData\DB-01\v1.27.0-catalog" `
  -History "D:\WandData\DB-01\v1.27.0-history" -Out "D:\WandData\DB-01\releases"
```

When the next game's SRC-01 reader has produced a verified native output,
the normalization step no longer requires old Switch Collection files:

```powershell
python tools/db-01-items/build.py `
  --source "D:\WandData\SRC-01\Steam-v1.27.0-native" `
  --out "D:\WandData\DB-01\v1.27.0-catalog"
# Then use -Catalog as shown above. --extended is optional when independently
# verified additional native definitions are available.
```

With no `--reference`, the normalized catalog has `referenceIndex:null`,
`historicalReference:null` and no old-collection classification metadata.
The optional legacy `--reference` remains supported only for evidence
continuity, never as evidence that a 1.25 name, DLC or ownership is current.

The runner now has two explicit parameter sets: the default **Catalog** mode is
version-neutral and does **not** load old v1.25 Collection references or
run Steam 1.26.2 extractors; **LegacySteam1262** mode (`-Probe ... -Game ...`)
preserves the existing SHA-pinned raw 1.26.2 extraction, with no attempt to
retarget its fixed assumptions to a future game build. New original versions
must first be extracted using independently validated SRC-01 readers to produce
the normalized input catalog. This release stage does **not** magically decode
new unknown original game formats.

The runner verifies source `items.jsonl` SHA-256 and checks an optional
independently trusted `--expected-manifest-sha256` and
`--expected-source-items-sha256`. The fingerprint includes the full source
manifest, row data, historical source digest and history inclusion mode. A
repeat on identical inputs reuses the **same** SQLite and shard files while
re-auditing all assets; changed bytes or game versions create a new immutable
release rather than overwriting a previous one. A corrupt or substituted
existing output fails closed instead of being silently reused.

**Original-file reuse before normalization** is handled by
`reuse_source_files.py`, consuming the existing
`tools/src-00-source/source_scan.py` `source-manifest.json`. This utility
checks the **complete SHA-256 of the prior original bytes** against the exact
target scan digest before copying into a new private workspace. It filters to
`ddv_Data/StreamingAssets/itemlist/` and `Localization/` by default,
rejects symlinks and traversal, and leaves mismatched/unavailable sources in
`needs_current_source` (not absent from the game or Drive).

```powershell
python tools/db-01-items/reuse_source_files.py `
  --target-scan "D:\WandData\Steam-v1.27.0\source-manifest.json" `
  --prior-game "D:\WandData\Steam-v1.26.2-originals" `
  --out "D:\WandData\DB-01\source-reuse"
```

For independently pinned target-scan bytes, additionally pass
`--expected-scan-sha256`. A SRC-00 scan created with `--rehash` is preferred
to one that reused filesystem metadata as a hash cache. The target scan's
file SHA is a *claim* until independently anchored to trusted original bytes;
this tool never treats a previous-version name, CRC, timestamp or folder match
as proof of identical current content. It does not modify the installed game.

**End-to-end CI:** `test_release_pipeline.py` and
`test_reuse_source_files.py` run complete synthetic SQLite → 256 ID shards
→ locale/category/history shards → independent release audit, CLI replay,
multiple versions, SHA-based reuse, symlink/traversal/corruption rejection and
preexisting-cache validation. They never include copyrighted game bytes.

## Production release-integrity gate

`tools/db-01-items/audit_shards.py` is the independent **private pre-release
verification gate** for the final SQLite + TypeScript implementation. It
reconstructs every ID, category, locale and optional historical shard from
SQLite and checks byte-for-byte content, separate file SHA-256, counts,
source-version and original JSONL provenance. It rejects stale, missing,
extra, or conflicting assets, reports SHA-bound PASS evidence in a local
private file, and never publishes game-derived assets.

`run-all.ps1` now invokes this gate automatically after SQLite/shard creation
and fails the one-shot pipeline if a previous report is stale. The auditor
also supports a separately trusted SQLite SHA-256 pin. See
[`AUDIT-RELEASE.md`](AUDIT-RELEASE.md) for CLI, requirements and boundaries.


## Source-native identity for cross-service joins (SQLite/TypeScript v2)

Every original source definition has a verified `nativeNameField` (wire field 2).
The SQLite store records it as a unique composite identity
`(native_category, native_key)`; the same TypeScript client exposes
`getByNativeKey(category, nativeKey)`. This exact source identity is useful for
DB-02 Acquisition, DB-03 Guide, DB-04 World and DB-05 Save, but is **not**
evidence of a relationship, collectibility, ownership, DLC entitlement, or a
current localized name.

The final SQLite and private read-shards schemas are now
`wand.db01.sqlite@2` and `wand.db01.private-shards@2`. Rebuild older v1
private assets from the trusted source catalog before use; v1 assets are not
silently accepted as v2 and no parallel runtime API is maintained. The
release audit enforces source-record identity, original category, and
unique native key across the entire version.

## P0 DB-02 cross-version Condition source gate (2026-11-21)

The independent Steam v1.26.2 SRC-01 format probe (SHA-256
`07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a`)
records `Condition.json` SHA-256 `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`. Earlier SRC-02 code
mistakenly pinned the archived Steam v1.26.1 SHA-256 `f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150` as
current. The SRC-02 extractor now rejects that old source. Any previously
published/privately exported acquisition-condition references based on the
older source must be treated as **not verified for v1.26.2** and cannot be
joined to DB-01's current catalog. Current `Condition.json` remains missing;
this change is a source-integrity repair, not condition data completion.


## DB-01 → DB-02 private static source join

The final TypeScript runtime now provides `src/lib/items/db02-join.ts`.
It accepts only the existing DB-01 v2 private catalog plus an independently
trusted, byte-SHA-checked DB-02 manifest and a separately verified same-version
`Condition.json` source SHA. The required Steam 1.26.2 Condition SHA from
`format-probe.json` is
`9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`;
the older 1.26.1 source SHA is forbidden. The join leaves availability,
ownership, DLC entitlement, save writing and publication all **false**.

Until genuine current Steam 1.26.2 Condition bytes are obtained, DB-02 cannot
be fully re-extracted and this bridge must not be activated against previously
mislabeled condition outputs. See [`DB02-JOIN.md`](DB02-JOIN.md).


## Source-exact DB-04 Furniture / Building overlay (private)

[DB04-NATIVE-EVIDENCE.md](DB04-NATIVE-EVIDENCE.md) describes the permanent
Python offline corroborator and typed TypeScript runtime bridge. Two complete
original itemlist files, Furniture.json and Building.json, are byte-identical
between the independently checked Steam v1.26.1 world snapshot and the Steam
v1.26.2 SQLite source. Only those two definition families are eligible:
7,224 exact ID/native-name joins, 6,746 restored Furniture localization
**keys** (not translated names), 7,140 original-footprint dimensions, 84
Building footprints absent. The owner-private overlay has 256 SHA-verified
on-demand files and is separate from the canonical SQLite and 557 item shards;
no source recompilation, competing runtime, world-coordinate inference,
placement permission, ownership, or public publishing is authorized.


## DB-01 ↔ DB-03 original-Mission-source static item references

[`DB03-QUEST-ITEM-REFERENCES.md`](DB03-QUEST-ITEM-REFERENCES.md) documents
the offline, source-SHA-verified private join to DB-03 Guide. The same original
`Mission.json` bytes are SHA-256-identical for source Steam v1.26.1 and
DB-01 target Steam v1.26.2. A permanent Python verifier checks all the
source pins, all **6,414** source-configured quest item references and **3,287**
distinct referenced Item IDs, including **509** occurrences absent from DB-03's
older partial SRC-01 item index. The output is a separate, owner-private
256-bucket lookup. The typed `src/lib/items/db03-evidence.ts` reads one
source-pinned bucket per Item ID and never promotes alternatives, additional
loot, static handoffs or cleanup references to guaranteed rewards/requirements.
No SQLite migration, second runtime, licensed text publication, inferred
player state, or placement/save permissions.
