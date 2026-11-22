# DB-02 — Steam v1.26.2 ingredient-dependent meal sell-price provenance

**Scope:** Cooking and meal instance state only. This is **not** the separate
static stall/shop purchase-price evidence from `SHOP-PRICE-OVERLAP.md`.

## Native method-body analysis: reproducible, fail-closed tooling

The original-byte material currently available for this work consists of
Steam v1.26.2 native configuration (`protoDb.bin`) and owner-private data
extracts plus a **Steam v1.26.1** IL2CPP `dump.cs` (89,453,137 bytes; SHA-256
`0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08`).
The dump is **method/field metadata, not a C++ implementation or executable
assembly**. It must **not** be used as an RVA map for the Steam v1.26.2
`GameAssembly.dll`. No version-matched DLL was available to this run.

The source-controlled `native_meal_price_probe.py` now extracts and checks
**13 fully qualified price-path targets** from the pinned v1.26.1 metadata:

- `ItemPriceDatabases`: `GetSoftCurrencySellPrice`,
  `GetSellPrice`, `TryGetSellPrice`, `GetDefaultSellPrice`.
- `MealItemData`: `GetLowestPriceIngredients`,
  `TotalIngredientsValue`, `TotalIngredientsSellPrice`, `GetSellPrice`,
  the `TotalIngredientsValue` lambda and `GetSellPrice` tuple helper.
- `MealItemData.<>c`: lambdas for minimum-price ingredients,
  total ingredient selling, and `GetSellPrice`.

For the **known 1.26.1** dump, all original class-qualified RVAs are
independently pinned in the public **code**, but the underlying source and
all executable original bytes stay owner-private. Running the plan requires
no `GameAssembly.dll`:

```sh
python tools/src-02-acquisition/native_meal_price_probe.py \
  --dump "/owner-private/Steam-v1.26.1/dump.cs" --dump-version 1.26.1
```

For **1.26.2**, the separate native `dump.cs` and `GameAssembly.dll`
**must both come from the same 1.26.2 build** and have separately recorded
original SHA-256 fingerprints. The owner supplies them as local files, e.g.:

```sh
python tools/src-02-acquisition/native_meal_price_probe.py \
  --dump "/private/Steam-v1.26.2/dump.cs" \
  --dump-version 1.26.2 \
  --expected-dump-sha256 <verified-64-hex-dump-sha> \
  --gameassembly "/private/Steam-v1.26.2/GameAssembly.dll" \
  --gameassembly-version 1.26.2 \
  --expected-gameassembly-sha256 <verified-64-hex-dll-sha> \
  --output-dir "/private/native-price-probe" \
  --extract-only
```

`--extract-only` uses Python standard library only, including on Windows;
it emits 13 native method-prefix excerpts (**256 bytes by default**;
use `--excerpt-bytes 4096` for larger bounded 4-KiB samples, up to 8192)
and a JSON report
**only into the existing owner-private output directory**. Without
`--extract-only`, GNU `objdump` must be on PATH (or passed with
`--objdump-path`), and it emits assembly-text prefixes instead. The source
reader maps method RVAs via executable **PE32+ section headers**, rather
than assuming IL2CPP `Offset` equals a valid raw file offset.

Both modes refuse mismatched declared build versions, invalid SHA-256
fingerprints, non-executable/out-of-range/ambiguous PE mappings, and
output paths within Git working trees. Neither executes the game DLL,
uploads files, determines method boundaries, reconstructs complete
functions, claims an authenticated binary build version from SHA alone,
nor claims a numerical sell-price formula or rounding rule. A caller's
version labels remain **externally asserted** until independently validated.

Synthetic-only CI checks the metadata parser, exact-version rejection,
PE header/section RVA mapping and the end-to-end Python-only private
excerpt extraction path. In a separate owner-private run, the exact
SHA-pinned v1.26.1 `dump.cs` successfully yielded **13/13 original
method RVA/offset/signature records**. That is an executable-analysis
**plan**, not evidence that the formula has been implemented.

## Game-native evidence

The owner-held Steam IL2CPP `dump.cs` (SHA-256
`0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08`)
declares all of the following, independent of assumptions from the shop table:

| Native class/member | Meaning |
|---|---|
| `Definitions.Items.ItemState.MealData`, field **1** | Serialized per-instance meal state |
| `Definitions.Items.MealData.IngredientsUsed`, repeated int32 field **1** | Ingredient Item IDs actually recorded for that meal instance |
| `Definitions.Items.MealItemData.GetSellPrice(ItemState,Item)` | Sell-price calculation accepts item-specific state |
| `MealItemData.TotalIngredientsSellPrice(RecipeItemData,IEnumerable<ValueTuple<Item,int>>)` | Sell-price-specific ingredient calculation |
| `MealItemData.GetLowestPriceIngredients(RecipeItemData)` | Separate fallback-ingredient method |
| `Definitions.Activities.CookingData.Types.RecipeStarResult.SellPriceIngredientPercentage`, field **4** | Star-result-dependent sell-price ingredient percentage |
| `Definitions.Shops.ItemPriceDatabases.GetSellPrice(Item,ItemState,Item,int)` | General sell-price entry point accepts ItemState |

The owner has separately confirmed in-game that meal prices change with
ingredients. The native signatures and fields explain why **Item ID alone
cannot determine the sell value**. The IL2CPP dump gives signatures/field
maps but **not method bodies**. Therefore the exact rounding rules, default
ingredients, bonus handling and output numeric amount remain unverified. Do
not invent a formula or silently calculate using a fixed static price.

## Exact private source census

The byte-authenticated Steam v1.26.2 SRC-02 **r5** release has **625 native
cooking recipe definitions** producing **618 distinct meal Item IDs** in the
`303xxxxx` family (some results have multiple recipe definitions).
The separately byte-authenticated original `protoDb.bin` static
`Cooking_Meal_PriceDatabase` contains **312 purchase-price rows**, all for
those observed meal Item IDs, but **zero static sell-price rows**. The other
**306** cooking-result Item IDs have no row in this particular static
purchase database; this does **not** prove their actual purchase or sale
availability.

These are distinct concepts:

- The `Cooking_Meal_PriceDatabase.ItemPrices.Prices` entries are **source
  configured purchase amounts**, not the sell value of a cooked instance.
- `ItemPrices.SellPrices` is empty for the 312 meal purchase entries,
  which **does not imply a zero/free/unsellable meal**.
- `FormulaDynamicPriceDatabase.CachedData` is a separate cached formula
  database; examining the native cache showed 8,549 rows with **no**
  `303xxxxx` meal Item ID. The cache is not an alternate source of cooked
  meal instance sale prices.
- A meal inventory instance's `ItemState.MealData.IngredientsUsed` must
  remain associated with that instance when displaying price evidence.
  Different ingredient multisets may yield different prices for the same
  result Item ID. Duplicate ingredients are counted, not collapsed.

## Implemented, read-only APIs

`src/lib/acquisition/meal-price-evidence.mjs`

- `decodeMealItemStateEvidence(bytes)`: strict bounded native `ItemState`
  protobuf submessage decoder. Supports packed or unpacked repeated ingredient
  IDs, rejects mixed oneof states, duplicate meal states, truncated/overflow
  varints, invalid Item IDs and excessive ingredient counts. Never decodes a
  whole save, never reserializes it, and never mutates it.
- `loadPrivateMealPricingView({acquisitionArchiveBytes,
  priceManifestBytes,priceFiles})`: verifies both **independently pinned**
  original-private releases, including the corrected current-game
  `Condition.json`, **before** returning an immutable private view.
- `view.inspect(mealItemId,itemStateBytes)`: retains recorded ingredient
  IDs and quantities, links static cooking recipe IDs and (where present)
  original **purchase-only** price rows, and reports
  `sellPrice:null`, `sellPriceComputed:false`,
  `nativeImplementationBodyVerified:false`, `publishable:false`.
- `compareMealIngredientStates(left,right)`: compares two instances of
  the **same meal Item ID** by material+quantity multisets. It says whether
  the prices **may** differ; it does not assert or calculate an amount.

All inputs are **local only**. No public site upload, user-save writer,
payment-price assertion or game-original publication is authorized.


## Ingredient unit sell-price SOURCE coverage (original Steam v1.26.2)

Native `MealItemData.GetSellPrice(ItemState,...)` and
`TotalIngredientsSellPrice(RecipeItemData, ingredientsUsed)` consume the
instance material list. To prepare for eventual verified formula integration,
the read-only `src/lib/acquisition/meal-ingredient-sell-evidence.mjs`
classifies `ItemPriceDatabase.ItemPrices.SellPrices` definitions **per
recorded ingredient Item ID and quantity**, filtering soft currency ID
`80000000`. The source rows come through the already SHA-pinned private
`loadPrivateShopPriceView` in `loadPrivateMealPricingView`; the pure
classifier itself returns `inputSourceAuthenticated:false`, so its standalone
results cannot masquerade as an authenticated original.

The exact owner-private SRC-02 r5 cooking definitions contain **371 distinct
fixed ingredient Item IDs** across 625 cooking recipes. A crossjoin with the
exact private static ProtoDB price release yields **211** IDs with one
serialized soft-currency `SellPrices` cost each and **160** IDs with no
observed static soft-currency sell definition. All 211 stored options have a
present serialized amount and currency `80000000`. The **160 missing** do
not prove a zero price or that those ingredients cannot be sold. Runtime
price lookup may use dynamic databases or default price rules; the known
`ItemPriceDatabases.GetSoftCurrencySellPrice(Item,ItemState,int)` signature
is not its implementation.

The new `view.inspect(mealId, itemStateBytes).sourceIngredientStaticSellEvidence`
provides original static `SellPrices` candidate definitions and quantities,
while `ingredientStaticPriceDatabaseOriginalVerified:true` confirms the
enclosing privately authenticated loader. Any source missing an amount field
returns `null` (NOT zero). Multiple native definitions are preserved as
ambiguous (NOT arbitrarily selected). `actualNativeIngredientPricesVerified`
and `mealSellPriceComputed` always remain false. **This implementation
does not sum prices, apply the star percentages, or claim a computed
meal transaction value.**

The owner-private JS smoke verifies all **371** fixed ingredient Item IDs
against the actual independently authenticated source through the real API,
counting **211** configured unit-soft-sell definitions and **160**
not present in observed static price rows; it prints only aggregate counts.
No licensed original price rows or user saves are published.

## Independently authenticated native star-price settings (Steam v1.26.2)

The exact original `ddv_Data/StreamingAssets/protoDb.bin` (1,335,720 bytes, independent SHA-256
`dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623`)
contains top-level entry `Cooking` (#6, zero-based) with native envelope
`Definitions.Activities.CookingData`, exact body SHA-256
`c7f88137699c319dbdcbf3d8a006b0db50399d48683143b5e75ac908365bc1c2`.
The native `RecipeStarResults` field #5 contains **exactly five source-configured star tiers**.

The read-only `src/lib/acquisition/private-cooking-star-settings.mjs` loader authenticates
**both** original SHA-256 fingerprints before decoding the five original rows.
It preserves the `Star`, `MinDiscoveredInfoPercentage`, `MaxDiscoveredInfoPercentage`,
`SellPriceIngredientPercentage` and **separate**
`ManaRecoveredIngredientPercentage` fields. Missing serialized percentage values remain
`null` with an explicit presence flag, not fabricated zeros. Game configuration row
content is returned **only when original private bytes are supplied at runtime**;
the public repository contains neither the original binary nor the row catalog.

`loadPrivateMealPricingView` supports an optional `protoDbBytes` argument.
Only when the exact original file is provided does the view set
`nativeStarSettingsVerified:true` and expose `getSourceStarResult(star)`.
Without that file, `nativeStarSettingsVerified:false` and the star query returns `null`;
it does not fill in guessed percentages. **These are star-configuration source values,
not a proven mathematical formula for the final cooked meal price.** Rounding, defaults,
fallback ingredient selection and total value operations still require native IL2CPP
method-body evidence.

Actual local original-byte validation (Node 22.16.0) of the three original
source releases, including a full 618-meal JS inspection, returned
`EXACT_PRIVATE_MEAL_STATE_JS_PASS` and `authenticatedNativeStarResults:5`.
The exact GitHub source blobs were checked against local runtime files.
Reproduce locally, without adding original source files to the public checkout:

```sh
node tools/src-02-acquisition/smoke_private_meal_state_runtime.mjs \
  --r5-zip /private/SRC-02/db02-private-src02-r5-condition-corrected.zip \
  --price-zip /private/SRC-02/db02-steam-v1.26.2-private-protodb-shops-prices.zip \
  --protodb /private/game-source/Steam/v1.26.2/ddv_Data/StreamingAssets/protoDb.bin
```

## Actual exact-source runtime smoke

Use the two owner-private releases. Example:

```sh
node tools/src-02-acquisition/smoke_private_meal_state_runtime.mjs \
  --r5-zip /private/SRC-02/db02-private-src02-r5-condition-corrected.zip \
  --price-zip /private/SRC-02/db02-steam-v1.26.2-private-protodb-shops-prices.zip
```

The runtime authenticates both ZIPs and invokes the actual JS view against
**all 618 original cooking-result meal IDs**, using **synthetic** meal
ingredients to avoid reading real player saves. It verifies 312 have original
configured purchase rows and 306 do not, none are misclassified as static
sale prices, and two synthetic meal-instance ingredient multisets remain
different. Output contains aggregate counts only.

CI uses synthetic wire fixtures, negative pin checks, and the usual
SRC-02 + Collection suites. An actual player save and price formula
implementation are separate future integrations.
