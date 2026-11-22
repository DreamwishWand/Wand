# DB-02 ACQUISITION — source-pinned extraction

## Conditional ingredient default after native lookup failure (Steam 1.26.2)

Original native machine-code verification now connects both cooking ingredient
price helpers (recorded ingredients and recipe fallback) to
`ItemPriceDatabases.GetSoftCurrencySellPrice`, each with **default=1**.
The wrapper returns this default ONLY when the complete runtime
`TryGetSellPrice` fails, and the 8,549-row original dynamic source snapshot
would skip uncached formula evaluation *if unchanged at runtime*.

The **160/371 fixed cooking ingredients with no original source price row**
would conditionally receive that fallback only if the runtime class,
provider set, original row contents and dynamic cache all matched the source
snapshot. **None of these live conditions are proven.** Both the numeric
fallback and the 211 existing serialized amounts remain **NOT authorized
as effective runtime sell prices**. The typed source-only classifier and
authenticated private meal inspector explicitly return
`actualUnitSellPrice:null` and
`authorizedForDisplayAsSalePrice:false` for this hypothesis.
See [CONDITIONAL-INGREDIENT-NATIVE-FALLBACK.md](CONDITIONAL-INGREDIENT-NATIVE-FALLBACK.md)
and the read-only
[native chain audit](audit_native_ingredient_conditional_fallback_1262.py).

## Fixed cooking ingredient source price gaps (Steam 1.26.2)

Independent SHA-authenticated SRC-02 r5 cooking recipes (625 entries) and
original protoDb.bin price providers (11 entries) now establish that of
**371** distinct fixed cooking ingredients, **211** have an explicit
serialized soft-currency sell amount and the remaining **160 have NO
ItemPrices row** in any original provider (Crop **13**, Fish **8**,
Ingredient **139**). These are **not** the 474 cached records where the
Amount field is omitted. Missing an original source row does not establish
runtime lookup failure, unsellability or fallback-to-one pricing.

The authenticated local-only meal price inspector now exposes
getSourceIngredientPriceRowCoverage(itemId) and per-recorded-ingredient
sourceIngredientSerializedPriceRowCoverage; a global source-absence verdict
remains null unless the original dynamic cache was also supplied. See
[FIXED-INGREDIENT-PRICE-SOURCE-GAPS.md](FIXED-INGREDIENT-PRICE-SOURCE-GAPS.md)
and the read-only [source audit](audit_fixed_ingredient_price_source_gap_1262.py).

## Original 11-provider price source census (Steam v1.26.2)

The SHA-pinned original `protoDb.bin` contains **10 static + 1 dynamic**
`IItemPriceDatabase` source providers, totaling **9,537 distinct Item IDs**.
All 9,537 serialized ItemPrices records are globally disjoint by Item ID:
**zero cross-provider item conflicts** and **zero colliding sell
(Item ID, currency ID) keys** across 1,192 sell-cost records.
Consequently the unknown native provider registration order cannot change
ownership of an existing **serialized source row**. Runtime selection,
mutated dynamic caches, absent Amount fields (474) and effective prices
remain **unverified**. See
[PRICE-PROVIDER-SOURCE-UNIQUENESS.md](PRICE-PROVIDER-SOURCE-UNIQUENESS.md)
and the read-only
[audit script](audit_native_price_provider_registry_1262.py).

## Steam v1.26.2 original formula definition source identified

The original 32-record `itemlist/Formula.json` has now been SHA-256 authenticated
and joined to all 4 purchase / 1 sell formula references in the exact original
`protoDb.bin`. The sell-formula table's 7 explicit keyed amounts match all
7 amount-present dynamic sell-cache rows by Item ID and value. This is
**serialized source evidence only**, not a runtime sale quote or proof of
cooking-ingredient applicability. See [NATIVE-SELL-FORMULA-SOURCE.md](NATIVE-SELL-FORMULA-SOURCE.md)
and the read-only [audit script](audit_native_sell_formula_source.py).

Native **code**, not only metadata, now verifies the formula ObjectType resolver and exact runtime class gate: 7 cross-checked direct-call targets and 9 native instruction hashes against the original Steam 1.26.2 `GameAssembly.dll` and `dump.cs`. The source formula targets `ActivityItem/Consummable` while cooked `Meal`, `Crop`, `Fish` and `Ingredient` are distinct native subtypes. Runtime database registration/selection and effective prices remain **UNKNOWN**. See [`audit_native_sell_formula_type_dispatch_1262.py`](audit_native_sell_formula_type_dispatch_1262.py) and [NATIVE-SELL-FORMULA-SOURCE.md](NATIVE-SELL-FORMULA-SOURCE.md).

The SHA-pinned original Steam 1.26.2 sell formula ObjectType now cross-references original IL2CPP `ActivityItem/Consummable` metadata (`15`), distinct from the fixed cooking ingredient subtypes `Crop` (`2`), `Fish` (`10`) and `Ingredient` (`11`). The optional original `dump.cs` metadata audit is read-only, fail-closed and **does not resolve live runtime Type identity or a price**. See [NATIVE-SELL-FORMULA-SOURCE.md](NATIVE-SELL-FORMULA-SOURCE.md).

## Authenticated native sell formula references and selection gates (Steam/Switch v1.26.2)

The original Steam/Switch executable methods
`SellPriceFormulaItemData.GetSellPriceFormulaItemData`,
`IsFormulaValidForItem`, and `CalculateItemPrice` verify that native
sell-formula selection requires both the requested **currency** and
the item's resolved **runtime Type identity** to match. The first
eligible formula is considered. Formula equation output is converted
from a float to signed int32 with truncation toward zero on both
platforms, but the native equation inputs, actual selected formula
and resulting sale value remain **unknown**.

The independently SHA-authenticated original v1.26.2
`FormulaDynamicPriceDatabase` has **four source purchase-formula
Item references and one source sell-formula Item reference**.
`loadPrivateDynamicPriceCache` now retains these immutable
original reference IDs, rather than only their counts; the actual
formula definitions and applicability to any fixed cooking ingredient
are not in this source's dynamic cache entry.
`classifyConditionalNativeSellFormulaCandidates` is an independent
hypothetical currency/type gate with strict unknown-candidate
precedence, **not** a real price evaluator.
`loadPrivateMealPricingView` now exposes private source
formula references and unresolved sell formula candidate plans.

The offline audit checks **14 owner-qualified method RVAs per
platform** and **32 Steam + 29 Switch original instruction windows**.
No proprietary source data, formula IDs or price records are bundled
in the public repository. Original-private smoke covers 625 recipes,
618 meals and 371 fixed ingredients, without claiming that source
formula references establish the missing 160 effective sell prices.
See [MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md).

## Original static/dynamic sell provider failure distinctions (v1.26.2)

`native-serialized-sell-provider.mjs` now models the exact
Steam/Switch native provider-level `TryGetSellPrice` result
**conditional on a caller-supplied ItemPrices record**:
a matching `SellPrices` currency returns `true` and its int32
Amount; otherwise a nonnull static/dynamic provider returns `false`
with **out=1**, whereas a dynamic provider whose `CachedData=null`
returns `false` with **out=0**. Neither failure out-value
is a successful item sale price. Protobuf Amount field absence has
a numeric default 0 on matched records.

`DynamicItemPriceDatase.DataCached` is true for a nonnull
`CachedData` with positive ItemPrices count. The original,
SHA-authenticated **8,549-row** dynamic cache snapshot satisfies
this test as **serialized source evidence only**, not known live
cache state. The 371 unique fixed cooking ingredients have zero
observed overlap with that snapshot.

The authenticated private meal-price view now exposes per-ingredient
conditional static-provider simulations and a separate source
dynamic cache gate. **211/371** fixed cooking ingredients yield a
conditional successful static soft-sell definition; the remaining
**160** have no single source-configured static soft-sell amount.
Runtime provider selection, formula evaluation, complete meal price
and actual selling prices remain **unverified**. The strict
original-binary audit now checks **11 method RVAs per platform,
27 Steam + 24 Switch code windows**. Detailed context:
[MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md).

## Original native sell-price provider lookup (Steam/Switch 1.26.2)

`native-sell-provider-plan.mjs` exposes the executable-confirmed
**first-success** order in `ItemPriceDatabases.TryGetSellPrice`:
(1) an item-specific `IItemSellPriceCalculator` gated on
`CanCalculateForCurrency`; (2) the noncached native
`SellPriceFormulaItemData.GetItemSellPrice` path; then (3)
registered `IItemPriceDatabase` providers. The static and dynamic
price database types **implement** that native interface; the actual
runtime registry/iteration order is not proven. Native
`TryGetSellPrice` failure writes **out=0** and returns false; the
cooking caller's `GetSellPrice` uses its declared **default=1**
only then. Neither number is an independently observed Item sell price.

Source-authenticated meal inspection now includes a provider plan for
the meal item and each serialized ingredient. Steam v1.26.2 native
source census: **371** distinct fixed cooking ingredients (**140**
Crop + **72** Fish + **159** Ingredient); these three classes do not
implement `IItemSellPriceCalculator`, while `MealItemData`
does. **211** fixed ingredient IDs have one configured static soft
sell amount; **160** have none in the observed source snapshot,
which does **not** establish a runtime price or failure.
The source-authenticated smoke covers all **618** unique meal Item IDs.

The offline original-binary auditor pins **8 methods each platform**
and **37 machine-code windows** (20 Steam, 17 Switch) including this
three-stage provider routing. All original game binaries remain
private. See [MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md).

## Native recipe ingredient source routing (Steam/Switch v1.26.2)

`native-meal-price-route.mjs` and the existing private
`loadPrivateMealPricingView(...).inspect()` now distinguish two
**actual native cooking sell-price source paths**: nonempty serialized
`ItemState.MealData.IngredientsUsed` retains the precise ordered
Item IDs (including repeats), while missing or empty recorded
ingredients invoke `GetLowestPriceIngredients`. Both native paths
read ingredient soft-currency prices through
`GetSoftCurrencySellPrice(item, state:null, defaultPrice:1)`.
The default **1 applies ONLY when live lookup fails**, **not** merely
when a source ZIP has no SellPrices row. The cooking sell wrapper
uses a null base selector (**0**), null maximum selector
(**INT32_MAX**) and the native star-result sell percentage delegate.

Both original executable platforms are verified by the offline
SHA-256 / native code-window audit; the auditor now pins 14 Steam and
11 Switch windows (some existing aliases overlap). The original
618-meal private smoke explicitly tests ordered recorded ingredients
and an empty synthetic MealData fallback. This is source/route
evidence **only**: actual runtime price provider choice, fallback
recipe ingredients, percentage eligibility and final meal sell
price are still unknown. See
[MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md).

## Signed native ingredient total-value accumulator (arithmetic only)

`native-meal-total-value-stage.mjs` reproduces the next independently
confirmed Steam/Switch v1.26.2 native **arithmetic stage**: an optional
caller-supplied base value (normally zero), per-ingredient signed-32-bit
percentage/truncation or unadjusted contribution, signed-32-bit wrapping
addition and **one final signed minimum with a caller-supplied cap**
(default `2147483647`). The cross-platform original-binary auditor
now pins **16 exact machine-code windows** (9 Steam, 7 Switch), including
base/percentage initialization, conditional base, wrapping sum, final
clamp. Its caller values, native eligibility rules, price-source
routing and final cooked-meal selling price are **not verified**; the
module explicitly returns `nativeInstanceMealPrice:null`. The fixture
test verifies per-ingredient rounding differs from rounding only the sum.
See [MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md).

## Steam/Switch v1.26.2 native meal-price math — original binaries verified

`audit_native_meal_price_1262.py` uses **owner-uploaded originals** from
`Dreamwish Wand/v1.26.2`. Both Steam `GameAssembly.dll` (AMD64 PE32+)
and Switch `ExeFS/main` (compressed AArch64 NSO0), plus their respective
IL2CPP dumps and the Steam `FullVersion.txt`, are SHA-256 pinned.
Verification of **7 principal methods per platform**, their executable
RVA mappings and **8 exact native instruction windows** passes.
Both builds confirm a **signed 32-bit multiply, division by 100, and
truncation toward zero per adjusted ingredient contribution**, plus
default-price fallback and a call from `TotalIngredientsSellPrice` to
`TotalIngredientsValue`. No original executable or price catalog is
committed. The testable `nativeIngredientPercentComponent32` function
models **only this stage**, not a final cooked-meal sale value.
The Switch audit locally requires Python `lz4` to expand the text section.
See [MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md).

## Native cooking sell-price method analysis (offline only)

The initial SHA-pinned Steam `dump.cs` available in the v1.26.1
context identifies **13** class-qualified price-path methods. Its byte-identical
copy, **together with the actual `GameAssembly.dll` and FullVersion file**,
is now verified in the owner-uploaded Steam **v1.26.2** folder.
`native_meal_price_probe.py` builds a method/RVA plan and can extract
private code excerpts from the matching executable PE32+ section.
**RVA validity is independently verified against the original executable**;
a version label or metadata match alone does not prove executable identity.
`--extract-only` works with Python on Windows without additional disassembler
packages; GNU objdump can optionally render text instead. The CLI refuses
writing extracted machine code inside a Git checkout. No source original,
method body, or guessed sell-price formula is committed. See
[MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md).

SRC-02 uses the **existing** SRC-01 `steam1262.varint` and `steam1262.parse_category` decoders and the SRC-01 `itemId` records; it does not re-implement item definition parsing. Python 3.10+ standard library; Node 22+ for consumers. No writes to game files. Run from the Wand repository root:

```powershell
py -3 tools/src-02-acquisition/acquisition.py extract `
  --activity "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\ActivityData.json" `
  --activity-item "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\ActivityItem.json" `
  --loot "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\LootTable.json" `
  --building "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\Building.json" `
  --condition "C:\Program Files (x86)\Steam\steamapps\common\Disney Dreamlight Valley\ddv_Data\StreamingAssets\itemlist\Condition.json" `
  --items "D:\WandData\SRC-01\Steam-v1.26.2\items.jsonl" `
  --src01-manifest "D:\WandData\SRC-01\Steam-v1.26.2\manifest.json" `
  --out "D:\WandData\SRC-02\Steam-v1.26.2"
```

**Version contract and 2026-11-21 P0 source correction:** Exactly Steam v1.26.2 is supported. The current version's independently captured SRC-01 `format-probe.json` (SHA-256 `07fd8ebb1c528f852a0e00ce54cf4964f93931b9155bc9e2aab1bd857986d00a`) records `Condition.json` SHA-256 `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c` and size 571,341 bytes. The former hardcoded `f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150` is the *older Steam v1.26.1* original and is NOT valid as the current `Condition.json`. Extraction now fails closed on that stale file. The other four pinned source files were independently confirmed to match current v1.26.2 source SHA values. Do not reuse/approve previously generated 'v1.26.2' acquisition condition indexes until rebuilt and audited with the actual current Condition original. The real Steam v1.26.2 Condition.json original (571,341 bytes) has since been recovered and independently SHA-verified; an r5 private snapshot was rebuilt and fully verified. Earlier r4 indexes remain revoked. A later game version requires a separately verified source profile; a version flag alone is insufficient.

**Verified field mappings:** Steam IL2CPP `dump.cs` types `RecipeItemData`, `CraftingRecipeItemData`, `FishingDataItemData`, `MiningDataItemData`, `TimeBendingDataItemData`, `LootTableItemData`, `SubLootTable`, `ItemWithState`, `SeedItemData`, `StallBuildingItemData`, `UpgradeData`, `ItemAmount`, `ConditionItemData`, `ConditionsList`, `ConditionOneOf`, `ConditionCommon`, and `BoolOperator`. They provide numeric protobuf field contracts; source frames are identified by their `ID` field and the validated `2050000000 + key` / `2090000000 + key` / `20000000 + key` rules, and SRC-01 validates `30000000 + key` for seeds. `Formula.json` is an arithmetic formula database, not a cooking recipe file.

Outputs (private, upload to SRC-02 Drive):

- `recipes.jsonl`: cooking and crafting definitions, explicit ingredients or alternatives, exact Item IDs and known quantities, source definition IDs, condition digests, explicit appearance flags.
- `acquisitions.jsonl`: fishing/mining/timebending/growing result links and explicit loot-table candidate references. Loot candidates **do not prove** availability, probability or spawn context.
- `loot-tables.jsonl`: weighted subgroups and fixed candidate item IDs; dynamic filters remain unresolved.
- `stall-sources.jsonl`: verified `StallBuildingItemData` records linking stall Item IDs to ordered slot loot-table IDs and their static unlock / upgrade cost definitions. Native `ShopData` is a **string key**; its referenced shop configuration and current stock are not resolved. A cost with `amount: null` has no serialized amount and must **not** be displayed as a verified zero/free cost. `getPossibleStallsForItem` deduplicates stalls for display while `getPossibleStallSlotsForItem` preserves exact slot references. Both find only candidate sources through those linked loot tables; it does **not** prove the item is currently for sale.
- `shop-offers.jsonl`: currently empty **because authoritative shop offers are not verified**, not because no shop offers exist.
- `condition-gates.jsonl`: SHA-addressed `ConditionsList` trees actually referenced by the extracted cooking/crafting, fishing, timebending and loot definitions; preserves `and/or/not` operators, typed protobuf predicate tags, opaque leaf digests and exact source usage. No runtime evaluation or guessed availability.
- `condition-definitions.jsonl`: the subset of native `ConditionItemData` definitions reached from these gates through `ConditionCommon` references. Recursive resolution rejects missing or cyclic references. The 5,440-definition Steam v1.26.2 original Condition corpus is scanned for integrity but not copied here (DB-03 owns broader Guide condition data); r5 contains 220 source-relevant predicates and 13 linked condition definitions. Older r4 had only 5,439 condition source definitions and was revoked for wrong-version source.
- `related-items.jsonl`: reverse lookup by stable SRC-01 Item ID; `inSrc01=false` means absent from the *partial* SRC-01 extraction, not absent from the game.
- `manifest.json`, `report.json`, `unresolved.json`, optional `version-diff.json`. The manifest carries a SHA-256 for each emitted dataset, including stall sources and condition indexes. Seed and stall source data are SHA-pinned, not guessed from filename patterns alone.

Use `createAcquisitionDatabase` from `src/lib/acquisition/index.mjs` with verified data loaded from a private DB-00 data provider. The consumer accepts normalized rows and supports item-to-recipe, item-to-source, seed-to-crop, ingredient-to-recipe, loot, stall source, possible stall candidate queries, and `getRecipeCondition` / `getAcquisitionCondition` / `getConditionGate` / `getConditionDefinition` / `getLootGroupCondition`. Pass `stallSources` as the parsed `stall-sources.jsonl` rows alongside `lootTables`; the query API rejects missing slot-table references. **No proprietary records should be committed to the public repository.** In particular, do not expose files from the private Drive through Pages until licensed/publishing review approves distribution.

Version diff:

```powershell
py -3 tools/src-02-acquisition/acquisition.py diff --old "D:\WandData\SRC-02\old" --new "D:\WandData\SRC-02\new" --out "D:\WandData\SRC-02\diff.json"
```

For recipes, static stall configuration, prices, stock limits or conditional offers, diffs compare exact *verified* source rows. They never infer currently live inventory, events or server-controlled availability. An old pre-stall or pre-condition snapshot without the newly supported files compares against empty historical families; new snapshots require each emitted file. A missing dataset of any other family is an error. Duplicated record keys are rejected. Unverified terms and fields stay null or in `unresolved.json` rather than being backfilled from websites.

Tests:

```powershell
py -3 -m unittest discover -s tools/src-02-acquisition -p "test_*.py" -v
node --test tests/acquisition*.test.mjs
```

## Original FormulaDynamicPriceDatabase cached price source (private only)

`private-dynamic-price-cache.mjs` authenticates the exact Steam v1.26.2
`protoDb.bin` at full-file, dynamic-definition, and nested-cache SHA-256
levels and exposes **source-only** per-Item-ID cached-price row presence.
The verified cache has **8,549** rows: 8,068 purchase-only and 481
sell-only (7 with serialized amounts; 474 without). **None** of the 371
distinct fixed cooking ingredients has a matching cached purchase/sell
row; in particular, these cached rows do not resolve the 160 ingredients
without observed static soft-currency sell-price definitions.
The `loadPrivateMealPricingView` interface uses this evidence only when
the exact owner-private original `protoDbBytes` are supplied, and remains
explicitly unverified when absent. A cached row is NOT a proven runtime
offer, calculated sell value, or available price; missing cache rows are
NOT zero/unsellable. See
[MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md). The same private
three-source cooking smoke validates all source counts and overlap.

## Per-instance ingredient static sell-source coverage

The owner-private SHA-verified r5 cooking recipes have **371 distinct fixed
ingredient Item IDs**, of which **211** have a single original static
soft-currency `ItemPrices.SellPrices` amount and **160** do not.
`meal-ingredient-sell-evidence.mjs` and the authenticated private meal
pricing view now classify source-configured unit-sell evidence for each
recorded meal ingredient and quantity (purchase/sell values are never
interchanged). No source row absence implies free, unsellable or price zero.
The native `ItemPriceDatabases.GetSoftCurrencySellPrice` and
`MealItemData.TotalIngredientsSellPrice` executable bodies remain
unverified; **no final meal sell-price calculation is performed**.
The actual-private JavaScript smoke verifies all 371 Item IDs without
printing original price rows. See
[MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md).

## Original native cooking star settings (private, source-pinned)

`private-cooking-star-settings.mjs` authenticates the exact Steam v1.26.2
`protoDb.bin` and `Definitions.Activities.CookingData` wire bytes before
exposing the five native `RecipeStarResults` and their
`SellPriceIngredientPercentage` settings. The existing private
`loadPrivateMealPricingView` supports optional `protoDbBytes` input and only
returns verified star values when this third independently checked original is
provided. **No computed meal sell price, rounding rule or native method
implementation is implied.** See
[MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md) and private local smoke
`smoke_private_meal_state_runtime.mjs --r5-zip ... --price-zip ... --protodb ...`.

## Ingredient-dependent meal sell-price evidence (Steam v1.26.2)

See [MEAL-STATE-SELL-PRICE.md](MEAL-STATE-SELL-PRICE.md). Native `ItemState.MealData.IngredientsUsed` records per-instance ingredients and `MealItemData.GetSellPrice(ItemState,...)` / `TotalIngredientsSellPrice(...,ingredientsUsed)` are state-aware sell-price methods. The exact r5 source has **625 cooking recipes → 618 different Meal Item IDs**; `Cooking_Meal_PriceDatabase` has **312 configured purchase rows but zero static sell rows**. This is distinct from the multiple source price-database keys observed across stalls. `meal-price-evidence.mjs` now decodes and preserves ingredient composition in a read-only evidence API, never substitutes purchase prices for sell values and never guesses numeric meal sale prices. `smoke_private_meal_state_runtime.mjs` authenticates private source releases and verifies all 618 outputs using synthetic item states.

## Owner-private static price currency cross-check and exact-source smoke

The 2026-11-21 two-release source audit in [SHOP-PRICE-OVERLAP.md](SHOP-PRICE-OVERLAP.md) confirms **29 stalls with candidate items from one static price DB, 18 from two, 3 from three, 15 with none**, all 65 configured with native currency ID `80000000`. **683** price-defined per-stall candidate occurrences have one matching original **purchase** currency cost; **162** extra purchase-cost entries use other currencies. The corresponding local-only UI helper is `source-price-currency.mjs`, and the release-authenticated join uses it without inventing a selected per-shop price database or a current sale price. Reproduce using `audit_private_stall_price_overlap.py` with the two owner-private ZIPs. Never publish those ZIPs.

## Exact-source stall candidate ↔ configured price overlap (private only)

See [SHOP-PRICE-OVERLAP.md](SHOP-PRICE-OVERLAP.md) and `src/lib/acquisition/private-stall-price-overlap.mjs`. Authenticates **both** the real SRC-02 r5 ZIP and the independently pinned ProtoDB price release; joins matching native Stall ShopData keys and exact Item IDs without inventing the current shop, rotation or sale price. Verified source totals: 65 stalls, 50 with a static price definition for every enumerated candidate, 15 with none, 0 partial; 745 distinct candidate occurrences per stall (683 price-defined, 62 not), 606 distinct candidate Item IDs globally. All unlisted prices remain **unknown**, not zero/free; all returned results are nonpublishable and explicitly not a live-offer or stock check.

## Exact native ProtoDB shop and static price evidence (separate private release)

See [PROTO-DB-SHOP-PRICES.md](PROTO-DB-SHOP-PRICES.md). Steam 1.26.2 original ProtoDB source and the trusted r5 SRC-02 ZIP yield **44** typed shops (**218** slots), **10** static price databases (**988** item-price records, **1,348** configured purchase currency costs and **711** sell currency amounts), **1** unevaluated dynamic price source and **65/65** exact native shop-key/slot-count stall matches. Three amount fields are absent and remain `null`, not zero. Source-proven, owner-private manifest SHA-256: `641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975`.

Use `tools/src-02-acquisition/protodb_shop_prices.py` for private extraction and `src/lib/acquisition/private-shop-prices.mjs` to load the independently SHA-pinned private release in a local-only consumer. These are **source-configured base price definitions**, not validated live shop offers, current stock, effective transaction prices, entitlements or player progress. The r5 `shop-offers.jsonl` remains intentionally empty until a separately authenticated live offers source is available. Neither original game bytes nor private derived datasets may be placed in public GitHub/Pages.

## DB-00 private bundle verification and exact-origin join

Before using a SRC-02 snapshot with any Collection/Guide consumer, verify every
private output against the snapshot's SHA-256 file ledger and the original
SRC-01 manifest:

```sh
node tools/src-02-acquisition/verify_bundle.mjs verify \
  --dir /private/SRC-02/Steam-v1.26.2 \
  --src01-manifest /private/SRC-01/Steam-v1.26.2/manifest.json
```

The verifier is read-only and dependency-free. It rejects modified files,
symlinks, wrong versions, missing/extra manifest ledger entries, duplicated
record keys, broken recipe/stall/loot references, and inconsistent extraction
counts. A one-newline, zero-record `shop-offers.jsonl` is valid and **not** an
assertion of no offers. The optional SRC-01 manifest is independently byte-hashed
and checked against source Item ID count, target, and item data digest.

For a private Node runtime use `loadVerifiedAcquisitionBundle(directory,
{ src01ManifestPath, expectedManifestSha256 })` from `verify_bundle.mjs`. It returns the immutable parsed records
and marks the bundle `privateSource: true`. Do not import this Node-only file in
a browser route or copy the private JSONL into `static/` or Pages.

For cross-stream use the platform-independent `createAcquisitionCatalogJoin(db00Snapshot,
verifiedBundle)` in `src/lib/acquisition/db00-join.mjs`. This requires the
**same platform, gameVersion and SRC-01 manifest SHA-256** as the DB-00 snapshot's
target. It uses DB-00 `canonicalId` and `validateSnapshot`, retaining DB-00
partial coverage semantics. Its classification concerns catalog membership
**only**, not whether an item can currently be purchased or collected. All
returned join objects are marked `publishable: false`, with verified sale,
price, event eligibility, entitlement and ownership states set to false or
unknown. `getRecipe` and `getPossibleStallsForItem` are explicit
static-source links, not live retail offers.

Tests: `node --test tests/acquisition*.test.mjs`. Full private Steam v1.26.2
source bundle was independently verified without copying a single proprietary
row into the public repository.

## Trusted private runtime: pinned manifest and immutable data

The `manifest.json` SHA-256 inside SRC-02's `LATEST.json` must come from a
**separately trusted** release pointer. A self-consistent `manifest.json` plus
matching file hashes is *not*, by itself, external provenance: both could have
been rewritten. For the DB-00 integration, use the Node-only pinned entrypoint:

```js
import { loadPinnedAcquisitionCatalogJoin } from
  './tools/src-02-acquisition/verify_bundle.mjs';
const join = await loadPinnedAcquisitionCatalogJoin(db00Snapshot, {
  directory: '/private/SRC-02/r5',
  expectedManifestSha256: trustedLatest.currentSnapshotManifestSha256,
  src01ManifestPath: '/private/SRC-01/manifest.json',
});
// join.lookup(itemId) reports static candidates, not actual availability.
```

The loader checks the independent expected manifest digest **before parsing**,
verifies all dataset hashes and SRC-01 origin (when supplied), checks counts
and references, and deep-freezes all parsed private data. `createAcquisitionCatalogJoin`
rejects ordinary unverified or mutable bundles; this runtime guard alone is
not a cryptographic attestation. A verified flag supplied by a caller does not
replace the trusted external SHA-256 check. In the CLI, add
`--expected-manifest-sha256 HASH` to the `verify` command for pinned operation.
Without that option, the report states `internally_consistent_private` rather
than suggesting that the snapshot is externally authenticated. Do not import
this Node-only module or private game rows from public browser bundles.

## Native condition data is structural evidence, not a player-state evaluator

Steam v1.26.2 `Condition.json` has 5,440 records. Only the 13 `ConditionItemData` records reached through explicit `ConditionCommon` pointers from 220 content-addressed, acquisition-relevant `ConditionsList` payloads are materialized. These 220 gates occur at 404 concrete source positions, including recipes and loot subgroup restrictions. The boolean tree shape and oneof predicate type are **native evidence**; individual predicate parameters remain SHA-only unless a field mapping is verified. A gate's `availabilityEvaluated=false` is mandatory, and never means the gate is false. In particular, do not show locked/unlocked, scheduled sale, event reward or required DLC ownership without live state evidence.

The verified private bundle loader (`verify_bundle.mjs`) checks both condition indexes and all condition-digest references from recipes, fishing paths and loot groups. It fails closed for a missing `ConditionCommon` definition, cyclic references, malformed trees, mismatched counts, and unknown digests. The DB-00 join forwards those condition query APIs without converting them into entitlement or stock evidence. Check `manifest.json`'s `conditionSha256` and count ledger before consuming a new snapshot.

## Extended DB-01 source coverage audit (no item or reward inference)

DB-01's Steam v1.26.2 catalog extends the four-class SRC-01 extraction with
six additional **native definition classes**. Definitions in `Currency`,
`BoardGame`, `PhotoMode`, `Profession`, `Display` and `Environment` are recorded
as `definition_unclassified`, not presumed collectible items. Never rewrite
`related-items.jsonl`'s `inSrc01` flag just because a matching *definition* now
exists. Run this read-only source audit against the private inputs:

```sh
node tools/src-02-acquisition/audit_catalog.mjs audit \
  --src02-manifest /private/SRC-02/r3/manifest.json \
  --related /private/SRC-02/r3/related-items.jsonl \
  --db01-manifest /private/DB-01/13334/manifest.json \
  --db01-items /private/DB-01/13334/items.jsonl \
  --src01-manifest /private/SRC-01/manifest.json \
  --extended-manifest /private/SRC-01/extended/manifest.json \
  --guide-manifest /private/DB-03/manifest.json \
  --out /private/SRC-02/audits/db01-13334-audit.json
```

`audit_catalog.mjs` verifies the SHA-256 of the 13,334-row DB-01 JSONL and
SRC-02's related-item JSONL, all four linked manifests, native source category
hashes/counts, exact version and platform, per-row frame provenance, duplicate
IDs and supplied item membership. It refuses changed content, unsupported
`catalogDomain` promotion, symlink inputs and ambiguous source joins. Its
report schema is `wand.db02.db01-evidence@1`; it includes **only** the 70 IDs
outside the original SRC-01 set, with classifications
`native_definition_only_unclassified` or
`unresolved_in_partial_native_index`. Additional native definition matches do
not change the original SRC-02 extraction or certify acquisition eligibility.

The browser-safe `createAcquisitionCatalogEvidence(audit, {src02ManifestSha256,
db01ManifestSha256})` in `src/lib/acquisition/catalog-evidence.mjs` makes the
supplemental status queryable by ID. Both expected SHA values must come from a
separately trusted provider; calculating them from the unauthenticated audit
would not be a useful security check. An unlisted ID returns `null` rather than
implying absence. The audit and the DB-01 corpus remain **private**; do not add
raw item definitions to the public application.

DB-03 Guide's current Steam v1.26.1 manifest is *not* version-compatible with
DB-02 Steam v1.26.2. The optional `--guide-manifest` field records
`blocked_cross_version`. Even a matching version alone would not establish a
quest reward: mission selector candidates are objective inputs, not rewards,
and `rewardRelationVerified` is always false pending source-semantic evidence.

## Crafting / cooking material planning (browser-safe, private data only)

Import `planRecipeRequirements` from `src/lib/acquisition/planner.mjs` and pass
an already verified `createAcquisitionDatabase(...)` instance. This implements
source-backed batch multiplication, multi-step **crafting** dependencies,
integer-safe rounding of yields, reuse of intermediate surplus, and optional
caller-supplied (hypothetical) inventory deduction. It does not read or alter a
save. Results are derived from the game-version-pinned private SRC-02 recipe
records; public code contains no proprietary game definitions.

```js
import { createAcquisitionDatabase } from './src/lib/acquisition/index.mjs';
import { planRecipeRequirements } from './src/lib/acquisition/planner.mjs';
const db = createAcquisitionDatabase(verifiedPrivateBundle);
const plan = planRecipeRequirements(db, yourSourceRecipeId, {
  batches: 2,
  inventory: { [yourItemId]: 3 },
  recipeChoices: { [ambiguousResultItemId]: verifiedRecipeId }
});
// plan.requiredMaterials / plan.steps / plan.unresolvedSelectors / plan.blockers
```

If several recipes produce the same Item ID, automatic selection is prohibited:
`blockers` contains `recipe_choice_required` and the exact candidate recipe IDs.
Only one valid crafting recipe is expanded automatically; callers can opt out
with `expandSingleRecipe: false`. A recipe cycle, unknown yield, excessive
recursion depth, or unknown ingredient tag remains unresolved instead of
inventing a material. `anyTag` and `tagAlternatives` are never converted to
specific items without a separately verified tag-membership source. Cooking
recipes with `resultQuantity: null` are reported with `outputQuantity: null`,
not a guessed yield. The planner does not count a cooking recipe as an automatic
crafting path for another recipe.

`materialsFullySpecified: true` means the currently selected **static Item ID
quantities** are known, not that the ingredients can be obtained. All plans
explicitly set `recipeEligibilityEvaluated: false` and
`acquisitionAvailabilityVerified: false`. `possibleStalls` are static loot
candidate lists, not verified stock, prices or availability. Recipes with
condition digests remain unevaluated. Plans represent estimates, not proof of
inventory, DLC entitlement, quest progression, or current live shop offers.

Run `node --test tests/acquisition*.test.mjs` for the planner and source contract
regressions. The full 1,943-recipe Steam v1.26.2 corpus is exercised separately
from the owner's private Drive snapshot; it is not committed as a test fixture.


## Native cooking ingredient selectors (Steam v1.26.2 r5)

The original game uses **two distinct numerical selector families** in
`RecipeItemData.Types.Ingredient`: `Any` (field 2) stores a
`CookingIngredientType` Item ID (observed `20014xxxxx`); `TagsList` (field 4)
stores one or more `IHasTags.Tags` Item IDs (observed `20012xxxxx`).
`Tag.json` *translated display labels* are not required for exact ID membership. The later source-verified private Tag overlay (see TAG-EVIDENCE.md) decodes all 409 TagItemData records from the full 38,824-byte Steam v1.26.2 original and resolves 13 recipe-selector IDs and 21 ingredient-membership IDs. Native Name and DisplayName keys are **not localized strings**.

SRC-02 now scans the entire SHA-256-pinned Steam v1.26.2
`itemlist/ActivityItem.json` (4,050 native definitions), but promotes only
cooking-capable ID families with matching IL2CPP 1.26.1 protobuf field
contracts: `CropItemData` (native IDs `302xxxxx`, type field 11, tags field 30),
`FishItemData` (`310xxxxx`, type field 10, tags field 14), and
`IngredientItemData` (`311xxxxx`, type field 8, tags field 13).
The field and ID-family combination is *observed source evidence*, not a
serialized subtype discriminator. All 469 observations are retained in
`ingredient-selector-membership.jsonl` with exact source definition IDs,
field numbers, type IDs and tag IDs. No item descriptions, guessed category
labels or Tag.json records are fabricated.

The 625 cooking definitions contain 238 selector-ID uses across 181 recipes,
covering 13 distinct selector IDs. All 13 have at least one typed candidate
among these three observed native families. Membership is **partial**: it is
not proof every possible valid ingredient is enumerated, that an item is
available in this player's game, or that the recipe can currently be cooked.
Do not treat a zero-result selector from this partial index as impossibility.

Use `db.getIngredientSelectorCandidates(selectorId)` for an explicit candidate
list, and `db.getIngredientSelectorMembership(itemId)` to inspect the native
source evidence. Both return source-backed static relationships, never
availability. Pass the *verified* bundle with `ingredientMembership` to
`createAcquisitionDatabase` (r3 and prior pre-membership snapshots remain
valid but provide no candidates).

For material estimates, `planRecipeRequirements(db, recipeId, {
ingredientChoices: { '2050000009:0': 31000000 } })` selects one candidate for
one **zero-based** ingredient slot of the exact native recipe ID. The planner
only consumes a selected item after verifying source membership. Otherwise it
preserves a candidate list in `unresolvedSelectors` without choosing a
substitute itself. `tagAlternatives` are a union of verified candidate sets;
explicit `itemAlternatives` (if encountered in future versions) use only the
source-listed IDs. Total quantities, hypothetical inventory and nested
crafting are computed exactly as before. All reports retain
`recipeEligibilityEvaluated=false` and `acquisitionAvailabilityVerified=false`.

The output manifest includes `ingredient-selector-membership.jsonl`'s SHA-256,
the native ActivityItem source digest, 469 typed rows, 13 selector IDs,
238 uses and the verified 4,050 source-definition count. The private bundle
loader cross-checks those counts and native row contracts; tampering or a
missing required r5 dataset fails closed. The new version diff only asserts
*observed source-row changes*, not actual release availability.

## Multi-goal material basket (DB-02; no new game data)

`planRecipeBasket(db, goals, options)` in `src/lib/acquisition/planner.mjs`
combines up to 200 *explicit source recipe* goals into one conservative materials
simulation. Each goal is `{ recipeId, batches?: number }`; a recipe ID identifies
an actual `cooking` or `crafting` source recipe, not a user-visible item name.
Identical recipe IDs are summed (up to one million executions per recipe), then
sorted by native recipe ID. Ordering does not depend on request order. All goals
share a single caller-supplied hypothetical inventory, intermediate-material
surplus pool, and `recipeChoices` / `ingredientChoices` decision set.

```js
import { planRecipeBasket } from './src/lib/acquisition/planner.mjs';
const plan = planRecipeBasket(verifiedPrivateAcquisitionDatabase, [
  { recipeId: firstVerifiedRecipeId, batches: 2 },
  { recipeId: secondVerifiedRecipeId }
], {
  inventory: { [verifiedMaterialItemId]: 5 },
  recipeChoices: { [ambiguousOutputItemId]: selectedNativeRecipeId },
  ingredientChoices: { [`${firstVerifiedRecipeId}:0`]: selectedNativeIngredientId }
});
// plan.goals, plan.requiredMaterials, plan.steps, plan.unresolvedSelectors
```

The result has schema `wand.db02.material-basket@1`, normalized goal records
(including nullable source-defined output quantities), item-sorted required
material totals with static acquisition candidates, actual planned crafting
steps, unresolved selectors, blockers, remaining hypothetical inventory and
remaining intermediate surplus. **It is not a player progress report.** A
crafting recipe that is locked or requires DLC may still appear in static
simulation; live offers, prices, ownership and eligibility are never inferred
(`recipeEligibilityEvaluated=false`, `acquisitionAvailabilityVerified=false`).

No recipes or raw game files are published by this API. Consumers must first
call `loadVerifiedAcquisitionBundle` for the private SRC-02 data and then
`createAcquisitionDatabase`. The legacy single-recipe
`planRecipeRequirements` API now shares the same basket engine while retaining
its `wand.db02.material-plan@1` response contract. Tests cover shared demand,
stock, surplus, cross-goal alternatives, duplicated recipes, unknown cooking
yields, malformed inputs and single-recipe compatibility. The Steam v1.26.2
private corpus smoke test covers all 1,943 source recipes in 98 non-publishing
baskets (20 recipes per basket; last basket smaller).


## Item ID / desired-quantity basket for Collection & Guide consumers

The existing `planRecipeBasket` accepts explicit recipe executions and is most
appropriate when a user opens a particular crafting recipe. Collection and
Guide instead often know only a **native Item ID and requested quantity**.
Use `planItemBasket` or `planItemRequirements` from
`src/lib/acquisition/planner.mjs` with a verified private SRC-02 database:

```js
import {planItemBasket} from './src/lib/acquisition/planner.mjs';
const report = planItemBasket(verifiedPrivateAcquisitionDatabase, [
  {itemId: sourceBackedItemIdA, quantity: 3},
  {itemId: sourceBackedItemIdB, quantity: 2}
], {inventory: {[ownedItemId]: 1},
    recipeChoices: {[ambiguousOutputItemId]: selectedCraftingRecipeId}});
// report.goals, requiredMaterials, steps, blockers and unresolvedSelectors
```

`planItemBasket()` normalizes and sorts at most 200 goals by Item ID and
combines duplicate quantities (1–1,000,000 per target). It draws from one
caller-provided *hypothetical* inventory and the same craft-surplus pool as
`planRecipeBasket()`. Only **crafting** recipes with a source-verified positive
`resultQuantity` are used to turn an Item quantity into recipe batches.
Multiple crafting recipes require explicit `recipeChoices`, unless inventory
already satisfies the demand. Products without a verified crafting source remain
as plain quantities in `requiredMaterials`, with source-backed acquisition
candidates attached where available; this never means the Item cannot exist.

**Cooking yields are unverified:** an Item target whose only recorded creation
path is cooking emits a `cooking_yield_unverified` blocker and a leaf demand,
not a guessed `quantity` of cooking batches. If the user explicitly wants to
cook, switch to the source-recipe-based `planRecipeBasket()` and pass batches;
its cooked output count remains `null`. If the hypothetical inventory already
covers the entire meal Item demand, no cooking blocker is needed.

The basket output schema is `wand.db02.item-basket@1`; for a single target,
`planItemRequirements()` returns `wand.db02.item-plan@1` with `targetItemId`
and `targetQuantity`. Both preserve the existing negative verification claims:
`recipeEligibilityEvaluated=false`, `acquisitionAvailabilityVerified=false`.
Unverified server offers, prices, player inventory, DLC entitlements, or event
availability are not inferred. All Item/recipe records remain in private Drive.

## Static stall catalogue, not shop inventory (SRC-02)

The native `StallBuildingItemData` fields `ShopData=9`, repeated
`SlotLootTableItemID=10`, `UnlockWith=11`, `UnlockAtLevel=12`, repeated
`UnlockCost=13`, and repeated `UpgradeInfo=16` are present in the owner-held
Steam v1.26.1 IL2CPP symbols and extracted from the SHA-verified Steam v1.26.2
`Building.json` into 65 `stall-sources.jsonl` records. Their 335 ordered slots
refer to source-backed loot tables. **Neither these item candidates nor the
unlock/upgrade costs are live shop offers or sale prices.** The `ShopData` key
is a grouping key, not proof of a stable set of current merchandise. Slot
conditions, dynamic filters and player unlock progress are unverified.

The read-only, browser-safe `createAcquisitionDatabase(verifiedBundle)` now
exposes `getStallStaticCatalog(stallId)`, `getStallsByShopDataKey(shopDataKey)`
and `listStallStaticCatalogs()`. The same methods are available on the pinned
DB-00 join. All derived results, candidate arrays and building-cost rows are
immutable. Each stall returns sorted distinct *explicit* candidate Item IDs,
but preserves repeated source slot references and condition/dynamic flags.
For every slot, `enumeratedCandidatesExhaustive=false`, `currentSlotStock=null`
and `currentSalePrice=null` until verified runtime ShopData is available. A
missing `ItemAmount.Amount` is `null`, **never a zero-cost unlock or upgrade**.
`buildingCosts.costsAreBuildingNotSalePrices=true` prevents accidental rendering
as retail prices. `publishable=false`: private game-source rows remain private.

Use a separately trusted manifest pin when loading the bundle; do not present
candidate completeness, shop stock or current pricing in Guide or Collection.

## Read-only saved stall ShopData evidence (DB-02 / DB-05 bridge)

`src/lib/acquisition/stall-save.mjs` exports
`decodeStallDataEvidence(bytes)` and `inspectSavedStallShop(db, stallId, bytes)`.
The **input is an already extracted native `Definitions.Activities.StallData`
protobuf submessage**, not a full save. DB-02 cannot decrypt, locate, decode,
serialize, edit or re-encode the original Steam or Switch save. A separately
validated DB-05/SRC-06 Codec must identify a stall and extract its exact
submessage before calling this read-only utility. The native field map comes
from the owner-held **Steam v1.26.1 IL2CPP** dump; the format's compatibility
with Steam v1.26.2 or another build has **not yet been established by a genuine
save fixture**. The current integration is therefore a source-typed candidate
with synthetic tests, not a production-ready reader for arbitrary saves.

Named native field contracts:

- `Definitions.Activities.StallData.ShopData = 2` (length-delimited)
- `Definitions.Activities.ShopData.LastRefresh = 1` (Timestamp),
  `NumRefresh = 2` (int32), `Slots = 3` (repeated ShopSlot), `Seed = 4` (int32)
- `Definitions.Activities.ShopSlot.SlotId = 1` (int32), `Item = 2`
  (`ItemAmount`), `MaxAmount = 3` (int32), `Regen = 4` (Duration)
- `ItemAmount.Id = 1`, `ItemAmount.Amount = 2`; native `Infinite = -1`

**Do not confuse** this `ShopData` with the separate
`Meta.PlayerBoutique.ShopData`, whose field 2 is a list of Item IDs, or with
`Definitions.Store.StoreData`, a global clothing/furniture store configuration.
The saved `ShopData` contract does **not contain a product sale price**. Serialized
`ItemAmount.Amount` and `ShopSlot.MaxAmount` are preserved with their exact
field provenance but **not asserted as live stock**, and a timestamp is not
proof that the shop is currently open, stocked or refreshed. The RNG seed is
intentionally not exposed. Missing fields remain `null`; `-1` retains the
native infinity sentinel without claiming unlimited current supply.

Example (only after an independent Codec has validated the original save):

```js
import { inspectSavedStallShop } from './src/lib/acquisition/stall-save.mjs';
const report = inspectSavedStallShop(verifiedPrivateDb02Database,
  verifiedNativeStallId, independentlyExtractedStallDataBytes);
// report.slots[].itemId / serializedItemAmount / staticCandidateListed
// report.liveInventoryVerified === false
// report.salePricesVerified === false
// report.saveCodecVerified === false
// report.writable === false; report.publishable === false
```

A static candidate match means only that this saved Item ID appears in the
corresponding static slot's enumerated candidate set; it does **not** prove
slot-ID-to-static-slot mapping or sale availability. A non-match is inconclusive
because the static selection includes dynamic filters, conditional eligibility
and potentially different game versions. Every returned object is immutable;
input bytes are never retained or written. Malformed/truncated protobuf fields,
noncanonical/overflowing varints, duplicate known scalars or slot IDs, and
oversized submessages fail closed. Synthetic tests:
`node --test tests/acquisition-stall-save.test.mjs`. Genuine save evidence,
Codec/Writer proof, platform version compatibility and future sale-pricing
sources are **not** part of this change.
**P0 provenance correction (2026-11-21):** The previously reported 5,439
`Condition.json` records and their 220 gates / 13 linked definitions were
extracted under a source SHA later identified as Steam 1.26.1, even though the
pipeline labeled the output Steam 1.26.2. Those condition-derived counts are
**not accepted as current 1.26.2 evidence**. They are historical observations
pending a full re-extraction from the independently pinned 1.26.2 original
(`9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`). Do not join the older condition bundle into DB-01 1.26.2.


### P0 admission gate for Steam 1.26.2 condition source

`loadVerifiedAcquisitionBundle()` and the DB-00 acquisition adapter now
refuse a purported v1.26.2 bundle if `source.conditionSha256` differs from
the independent SRC-01 1.26.2 probe SHA-256 `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`.
The archived Steam 1.26.1 file SHA `f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150` is explicitly
not current. This gate rejects even fully internally hashed old bundles and
old manifests with caller-supplied SHA. Historical data must be treated as
**not verified for 1.26.2** until the genuine updated Condition original is
obtained and the source extraction is rerun. This P0 blocker was resolved by the independently verified current original and source-rebuilt private r5; the historical r4 remains revoked.


## 2026-11-21 source closure — private r5 and current native tags

- **Current r5**: Steam v1.26.2 Condition.json 571,341 bytes, independently SHA-verified as `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`. SHA-pinned re-extraction: **5,440** source Condition definitions, **220** condition gates, **13** linked condition definitions. r5 manifest SHA-256 `ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c`. Node verifier, full acquisition relation checks and local browser loader PASS. The old r4 SHA `323f666c...` is revoked. The owner-private Drive `LATEST.json` now points to r5; no private source rows are committed to GitHub.
- **Supplemental current Tag evidence**: entire original `Tag.json` SHA `bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4`; **409** native tags and **32** distinct recipe/ingredient-referenced Tag IDs (13 recipe selectors, 21 membership tags, with 2 overlapping). Private evidence manifest SHA `26eb6d5e84683aae8e26b8720fd98fa7d0b5a3e607650b380c97e4f7de519ba6`. The typed, immutable reader is `src/lib/acquisition/native-tag-evidence.mjs`; the source and report remain private. These are raw IDs/Name/DisplayName localization keys **not verified translated text**.
- No new live shop price, player eligibility, inventory, rights, save-writing, or public dataset is authorized. The r5 source snapshot remains partial, separate from the supplemental Tag evidence.


### 2026-11-21 exact eight-language Tag translations

A supplemental, owner-private `wand.db02.native-tag-locales@1` release now
joins the **full, exact Steam v1.26.2** localization originals (`LocDB_en-US`,
`fr`, `it`, `de`, `es`, `ja`, `zh-CN`, `pt-BR`) to all **409** source TagItemData
DisplayName keys via the byte-exact `Tag.locbin` members. Every full ZIP
SHA-256 matches the independently captured Steam v1.26.2 source probe;
**3,272/3,272** Tag localized names are source-exact with no unmatched keys.
This is not global item-name coverage and does not grant eligibility or
availability claims. Private release manifest SHA-256:
`f6f990d77f30c1d34e2b902cac5c78e6953f07509a5332e33e115397a9d582e0`.
Use `loadVerifiedNativeTagLocales()` with verified native Tag evidence and an
independently pinned locale release SHA. See `TAG-LOCALES.md`. No raw ZIP,
localized strings or game binaries are included in public source or Pages.

### Exact-localized private recipe selector presentation (r5)

`createPrivateRecipeSelectorView(acquisition, tagLocales, locale)` in
`src/lib/acquisition/private-recipe-selectors.mjs` joins the separately
SHA-verified **r5 private browser bundle** and **eight-language Tag release**
without copying source originals into the app. It requires the exact r5
manifest (`ec1efd589...`), parent Tag evidence (`26eb6d5e...`) and
Tag localization (`f6f990d7...`) release pins. All other versions,
unverified loaders, or public/mutable objects are rejected.

```js
import {createPrivateRecipeSelectorView} from
  '$lib/acquisition/private-recipe-selectors.mjs';

// acquisition: result of loadPrivateSrc02BrowserBundle() for owner-private r5
// tagLocales: result of loadVerifiedNativeTagLocales() with independent SHA pin
const view = createPrivateRecipeSelectorView(acquisition, tagLocales, 'ja');
const choiceRows = view.getRecipeIngredientChoices(recipeId);
// choiceRows can be null: partial-index miss, NEVER proof of game absence.
```

Recipe ingredient positions and quantities are retained. Selectors keep distinct
`native_tag` (20012...) and `cooking_ingredient_type` (20014...) kinds.
**Both families have exact source-localized Tag names** when marked as recipe
selectors in the Tag evidence: real owner-private smoke checked all **13/13**
unique recipe selectors (2 item tags, 11 cooking types) in all eight languages,
**104/104** selector/locale mappings. The 238 recipe selector references are
never treated as already chosen ingredients. Candidate Item IDs come only from
the source-backed three-class cooking index or explicit recipe Item IDs, not
from translation names. Unknown names remain null, never AI-translated.

This view is **read-only, private-only, unpublishable**. It never asserts
live shop stock, rights, unlock status, recipe eligibility, quantity in a
player's save or authorized Writer operations. The synthetic regression suite
is `tests/acquisition-private-recipe-selectors.test.mjs`.
