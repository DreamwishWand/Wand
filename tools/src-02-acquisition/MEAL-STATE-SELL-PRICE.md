# DB-02 — Steam v1.26.2 ingredient-dependent meal sell-price provenance

**Scope:** Cooking and meal instance state only. This is **not** the separate
static stall/shop purchase-price evidence from `SHOP-PRICE-OVERLAP.md`.

## Native TryGetSellPrice provider precedence — Steam + Switch 1.26.2

The **complete original Steam and Switch executable bodies** of
`ItemPriceDatabases.TryGetSellPrice` (Steam RVA `0x383B5D0`,
Switch RVA `0x417F160`) and their independently corresponding
IL2CPP method/type metadata establish a conditional **first-success**
lookup route:

1. Obtain `IItemData` for the Item ID via
   `ItemDatabase.GetItemData`. Where the data implements
   `IItemSellPriceCalculator`, first check
   `CanCalculateForCurrency(currency)`; if accepted, call the native
   `GetSellPrice(ItemState,Item)` and return its `CurrencyCost`.
   **The caller's specific ItemState is preserved on this path.**
2. Otherwise (including a calculator declining that currency), test
   the state of the dynamic price database's cache. When its native
   `DataCached` check is **false**, attempt the formula path via
   `SellPriceFormulaItemData.GetItemSellPrice(IItemData,ItemState,Item)`.
   If an actual currency-price object is returned, use it.
   A populated native cache changes the route: it **does not** mean
   that a source-cached row independently proves a sell-price amount.
3. When no earlier provider returns a price, enumerate the registered
   native `IItemPriceDatabase` providers, invoking each provider's
   `TryGetSellPrice(Item,Item,out int)` until one succeeds.
   Both `ItemPriceDatabase` and the original, intentionally misspelled
   `DynamicItemPriceDatase` **implement this interface in metadata**.
   Their exact *runtime registration and iteration order* are still
   unknown and are **not** inferred from the metadata.
4. With **no successful provider**, native `TryGetSellPrice` returns
   **false** and writes **0** to the out parameter. The outer
   `GetSellPrice`/cooking soft-currency helper then uses its own
   **caller-supplied** fallback, whose declared/default cooking value
   is **1**. Neither the zero failure out-parameter nor the fallback 1
   is an observed effective sell value for a particular Item ID.

**Known original metadata distinctions.** `MealItemData` (**Item ID
family 303**) implements `IItemSellPriceCalculator`. The three
classes containing every fixed cooking ingredient in the source-corrected
Steam 1.26.2 recipe archive — `CropItemData` (family 302),
`FishItemData` (family 310), `IngredientItemData` (family 311) —
do **not** implement that interface. Exact original source census:
**371** unique fixed ingredients = **140** crops + **72** fish +
**159** ingredient items; **0** fixed ingredients are instances of
the directly calculating interface under these three classes.
Other Item ID families remain **unknown**, not falsely classified as
unusable or zero priced. **211/371** have exactly one observed,
source-configured static soft-sell amount; **160/371** do not have one.
Both groups still require the native provider's **runtime** selection
before producing a final numerical price.

**Implementation.** `native-sell-provider-plan.mjs` contains a
typed, immutable, source-agnostic three-stage *route plan*, not a live
numeric solver. `loadPrivateMealPricingView(...).inspect()` includes
the item's native calculator metadata and one source provider plan for
each recorded ingredient, and the verified private view supplies
`getNativeSellPriceProviderPlan(itemId)`. Out-parameter 0, default
argument 1, cached-formula branching, unknown runtime registry and
unresolved prices are kept separate; `actualUnitSellPrice:null`.

The original-binary auditor now SHA-256 verifies **8 qualified
methods per platform**, including `TryGetSellPrice`, plus **20
Steam / 17 Switch byte-exact machine-code windows** (37 definitions
total). The 12 new windows independently pin the calculator currency
gate, successful direct return, dynamic-cache gate, formula provider
call, registered database dispatch, and the final failure path.
The 625-recipe/618-meal/371-fixed-ingredient owner-private smoke
and synthetic tests pass. **No original game data, disassembly or
private player saves are in the repository.**

**Still unknown:** exactly which runtime database instance answers
each Item ID; dynamic formula evaluation; the native recipe-match
eligibility set; live data-dependent fallback ingredient selection;
and the complete real cooked-meal sale-price output.

## Native ingredient source selection and actual lookup failure default (v1.26.2)

**Steam x86-64 and Switch AArch64 executable bodies**, not only IL2CPP
signatures, now confirm the following `MealItemData.GetSellPrice` routing:

1. If the serialized `ItemState` is a Meal state **and** the
   `MealData.IngredientsUsed` list is **nonempty**, the executable converts
   the **recorded Item ID sequence** to individual price tuples, including
   repeated Item IDs.
2. If the state is absent, is not a meal state, or has **no recorded
   ingredients**, the executable falls back to
   `MealItemData.GetLowestPriceIngredients(recipeItemData)`. That method
   constructs a recipe-dependent selector. It is **not** permission to
   assign any user-chosen fixed recipe or static ingredient list as the
   real lowest-price result.
3. Both the lowest-price selector's per-item lambda and the recorded
   ingredient tuple helper use the same **soft-currency lookup**:
   `ItemPriceDatabases.GetSoftCurrencySellPrice(itemId, state:null,
   defaultPrice:1)`. **1 is only the result when the native runtime price
   lookup fails.** It is *not* evidence that an ingredient missing a
   serialized SellPrices field, or absent from the dynamic-price cache, is
   worth 1. The actual native `TryGetSellPrice` path may consult multiple
   registered price providers; those live selections are still unknown.
4. `TotalIngredientsSellPrice` passes a **null base selector** and a
   **null maximum selector** into `TotalIngredientsValue`. Thus this
   particular sell-price path uses a base of **0** and the default signed
   cap **2,147,483,647**, unlike general TotalIngredientsValue callers
   that may supply other delegates. It passes a nonnull star-result
   percentage selector
   `RecipeStarResult.SellPriceIngredientPercentage`. Ingredient
   *eligibility* for that bonus is not yet fully resolved.

| Pinned native step | Steam AMD64 RVA | Switch AArch64 RVA |
|---|---:|---:|
| Recorded/nonrecorded branch, `MealItemData.GetSellPrice` | `0x3E1EDBE` | `0x4A3F92C` |
| Lowest-price Item lookup lambda | `0x3E1FFC3` | `0x4A410D0` |
| Recorded Item price tuple helper | `0x3E1FE25` | `0x4A40E44` |
| Null base / null cap sell-wrapper call | `0x3E1E856` | `0x4A3F784` |
| `RecipeStarResult` sell percentage property selector | `0x3B3E0C0` | `0x4A41130` |

The original full SHA-pinned native executable auditor now independently
checks **14 Steam and 11 Switch code windows** (25 window definitions,
including the previously recorded Switch sell-wrapper alias), as well as
7 principal class-qualified method RVAs on each platform and the full
Steam DLL / Switch NSO hashes. No original executable bytes or private
raw metadata are stored in Git.

`native-meal-price-route.mjs` exposes the exact
`recorded_ingredients_used` versus
`recipe_lowest_price_ingredients` branch, preserves the original
ordered ingredient IDs including duplicates, records the **conditional**
native fallback value of 1 and sell-wrapper base/cap, and explicitly
returns `actualMealSellPrice:null`. The current
`loadPrivateMealPricingView(...).inspect()` now includes the pure
`nativeIngredientPriceRoute` evidence for each decoded
`ItemState`, distinct from the separate, SHA-authenticated **static
source** price candidates, native dynamic-price-cache membership, and
actual runtime price outcome. The private smoke verifies these
boundaries for **all 618 distinct meals**, and an empty synthetic
MealData fallback, against the independently SHA-verified 625 cooking
source definitions. **No player save is modified**.

**Remaining:** Determine which runtime price providers supply actual
ingredient prices and how recipe-ingredient matching chooses which of
them receive the percentage adjustment. The lowest-price fallback's
actual chosen IDs/price values cannot yet be derived from the
static metadata alone. Numerical final meal sell values remain withheld.

## Source-authenticated native FormulaDynamicPriceDatabase cache (Steam v1.26.2)

The exact owner-private Steam `protoDb.bin` has one dynamic price source entry
`FormulaDynamicPriceDatabase` at zero-based source index **274**, native
class `Definitions.Shops.DynamicItemPriceDatase`. This is the *configuration
and serialized cached price records*, **not** the implementation of runtime
`ItemPriceDatabases.GetSoftCurrencySellPrice`.

The local-only `private-dynamic-price-cache.mjs` module independently
authenticates three SHA-256 fingerprints, before allowing any original row
presence check: full `protoDb.bin` (1,335,720 bytes;
`dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623`),
dynamic native body (`2fb01bfd8bddb0efce6a58bcaba57338566bf63fdadaf52cda0989955af48858`),
and its cached `ItemPriceDatabase` wire body
(`6b97ccead7d8a134d7f2e0e58c82c47416126efa3fceefaefcec09d2fa15bd2e`).
The source contains **four** purchase-formula references and **one**
sell-formula reference. Their runtime math has **not** been executed.

| Authenticated native cache observation | Rows |
|---|---:|
| Total serialized cached ItemPriceDatabase rows | 8,549 |
| Cached purchase-only definitions | 8,068 |
| Cached sell-only definitions | 481 |
| Combined purchase/sell cache rows | 0 |
| Cached sell-cost rows with serialized amount | 7 |
| Cached sell-cost rows with omitted amount | 474 |

All **481 cached sell rows** are in the `315` Item ID family and use
serialized soft currency `80000000`. The **474 omitted amounts** are not
equivalent to 0. The original cache **has no matching purchase OR sell rows
for any of the 371 fixed Item IDs appearing in the 625 cooking recipes**.
In particular, it does not fill the **160 fixed cooking ingredient IDs
without a static soft-currency sell definition** from the separate 10
original static-price databases.

`loadPrivateMealPricingView(...)` now reads this authenticated cache
**only when exact original `protoDbBytes` are supplied**; the same input
also activates the separately verified five cooking star tiers. The
`view.nativeDynamicCacheVerified` flag distinguishes not loaded from a
verified empty result. `view.getSourceCachedDynamicPriceRow(itemId)`
returns a source-only presence record or `null` when no original cache
was provided. `view.inspect(...).sourceIngredientDynamicCacheEvidence`
reports this status for each actual serialized ingredient Item ID, retaining
`effectiveSellPriceVerified:false`, `runtimeFormulaEvaluated:false`,
`sellPrice:null`. No original cache catalog or private game source bytes
are bundled or published.

**Limits:** A cached-source absence does not mean that the engine has no
runtime dynamic price. The source does not reveal formula application,
fallback price selection, current market values, or rounding. None of
these numbers are suitable for computing a cooked-meal sale price.

Exact-private local verification (the original 3 independently SHA-pinned
source sets) passes `EXACT_PRIVATE_MEAL_STATE_JS_PASS`: **618 meal IDs**,
**371 fixed ingredient IDs**, **8,549 original dynamic cache rows**, **0
fixed ingredient intersections** for *both* cached purchase/sell rows, and
**5 independently SHA-authenticated cooking star tiers**. The synthetic
`tests/acquisition-private-dynamic-price-cache.test.mjs` checks malformed
protobuf rows, wrong currency, omitted-vs-zero amount, fake originals and
unverified-source behavior.

## Native TotalIngredientsValue accumulator and cap (Steam/Switch 1.26.2)

After the previous per-ingredient percentage analysis, the verified original
**Steam AMD64 PE** and independently decompressed **Switch AArch64 NSO0**
code also confirms the **surrounding arithmetic stage**:

1. Initialize a signed 32-bit running total to **0**. When the optional
   base-value callback exists, its return value replaces that initial 0.
   The runtime conditions and resulting actual value are not yet resolved.
2. Use a default percentage of **100** unless the corresponding native
   percentage-selection callback supplies an alternate value. For each
   enumerated ingredient, the original code either retains the signed
   component value or applies a signed 32-bit multiply by that percentage
   followed by integer division by 100 with **truncation toward zero**.
   The match/eligibility query is an **in-memory recipe-associated lookup**
   whose exact source criteria still need confirmation.
3. Add **each ingredient contribution** to the running total with native
   signed **32-bit wrapping addition**. The original machine instructions
   are Steam `add r12d, edi` and Switch `add w24, w19, w24`.
4. **After** iteration and enumerator cleanup, return the signed lesser
   of running total and a selected upper bound. The bound defaults to
   **2,147,483,647** if no upper-bound callback is present. Steam uses
   `cmp` + `cmovg`; Switch uses `cmp` + `csel ... lt`.
   This is **not** a per-ingredient clamp.

The source-controlled `audit_native_meal_price_1262.py` pins four
additional byte-exact method regions on **each** platform:
`base_and_default_setup`, `conditional_base_callback`,
`signed32_component_accumulation`, and `signed32_final_upper_bound`.
The private-original audit now checks **9 Steam and 7 Switch machine-code
windows** (16 total), on top of the 7 owner-class-qualified method RVAs
for each platform and the complete NSO decompressed-code hash.

The new pure `nativeIngredientTotalValueStage` at
`src/lib/acquisition/native-meal-total-value-stage.mjs` accepts a
**caller-supplied** `baseValue`, `upperBound`, and a list of
`{value, percentage, eligibleForAdjustment}` entries; it combines the
separately verified percentage component using per-component truncation,
wraps the accumulator to a signed 32-bit integer and clamps once at the
end. This is a **synthetic arithmetic harness only**, with no source
claim for its caller-supplied numbers, eligibility flags, cap, or base.
It returns `nativeInstanceMealPrice:null` and
`completeMealSellPriceFormulaVerified:false` by contract.

The unresolved parts remain **how runtime ingredient sale prices are
selected**, what qualifies each recipe ingredient for percentage
adjustment, when the optional base/limit delegates are supplied, and
which recorded-versus-fallback composition is actually used.
No cooked meal sale price is claimed from this stage.

## Original Steam AND Switch v1.26.2 native executable evidence (new)

The user-uploaded Dreamwish Wand Drive folder
`v1.26.2/Steam` contains a real **176,820,736-byte** Steam
`GameAssembly.dll`, `Il2CppDump/dump.cs` and an independent
`FullVersion.txt` whose original value is
`releases_1.26ex-v1.26.2-6-g77de7caf1acf-incremental-22`.
The uploaded Steam dump has the same SHA-256 as the metadata previously
available from a 1.26.1 context; this means the *textual metadata is byte
identical*, **not** that the new Steam DLL lacks executable differences.
The DLL was independently SHA-256 verified and method RVAs checked against
the actual **executable PE32+ `il2cpp` section**.

The same `v1.26.2/Switch` folder contains **99,771,988-byte**
`ExeFS/main` (native AArch64 `NSO0`) and the independent
`Il2CppDump/dump.cs`. Its NSO build ID is
`bb9556d4bb715252a1f4fd16b29fece0`. The compressed executable
text was decoded using LZ4, and the entire decompressed 162,397,712-byte
code section was independently SHA-256 verified. The Switch version 1.26.2
label is evidenced by the user-supplied folder; the NSO build ID is an
independent binary identity, **not** by itself a textual game-version proof.

| Target native method | Steam AMD64 RVA | Switch AArch64 RVA |
|---|---:|---:|
| `ItemPriceDatabases.GetSoftCurrencySellPrice` | `0x383B420` | `0x417EF70` |
| `ItemPriceDatabases.GetSellPrice` | `0x383B530` | `0x417F0C0` |
| `ItemPriceDatabases.GetDefaultSellPrice` | `0x383BA40` | `0x417FA60` |
| `MealItemData.GetLowestPriceIngredients` | `0x3E1DA20` | `0x4A3E3E0` |
| `MealItemData.TotalIngredientsValue` | `0x3E1E0F0` | `0x4A3EC50` |
| `MealItemData.TotalIngredientsSellPrice` | `0x3E1E710` | `0x4A3F640` |
| `MealItemData.GetSellPrice` | `0x3E1ECC0` | `0x4A3F880` |

**Binary-confirmed behavior in both 1.26.2 builds:**

- In `TotalIngredientsValue`, an ingredient's signed 32-bit integer
  component is multiplied by the configured percentage using **signed
  32-bit multiplication semantics**, followed by **division by 100 and
  truncation toward zero**. Steam uses `IMUL` plus reciprocal-multiply
  and signed correction; Switch uses `MUL W`, `SMULL` and a signed
  shift/correction sequence. Applying one percentage to a pre-summed
  value is not automatically equivalent to per-component truncation.
- The adjustment is conditional upon a matching entry found in the
  recipe-associated ingredient collection. The native code also includes
  an unadjusted contribution branch and an upper-bound comparison. The
  exact runtime eligibility set and full base/maximum semantics are **not
  yet** fully reconstructed.
- `TotalIngredientsSellPrice` delegates to
  `TotalIngredientsValue`, providing the relevant cooking price selector.
  Steam contains a direct `CALL` and Switch a `B` to the respective
  `TotalIngredientsValue` entry.
- `GetSoftCurrencySellPrice` uses the caller-supplied default when its
  price lookup does not succeed. The default passed by each higher-level
  call site still requires inspection.
- Switch's `MealItemData.GetSellPrice` explicitly branches between the
  serialized per-instance `MealData.IngredientsUsed` path and fallback
  `GetLowestPriceIngredients`, then calls
  `TotalIngredientsSellPrice`. This confirms why different source
  ingredients for the same meal cannot be treated as one fixed item price.

**Implementation and reproducibility:** The new
`tools/src-02-acquisition/audit_native_meal_price_1262.py` verifies all
five original SHA-pinned files (Steam version/dump/DLL and Switch dump/main),
all 14 class-qualified method RVA mappings, five Steam and three Switch
exact **machine-code instruction-window SHA-256 fingerprints**, the PE32+
executable section and the decompressed NSO code SHA and build ID. Only
method names, RVAs, hashes and the narrow results above are stored in Git.
Run against owner-private paths:

```sh
python tools/src-02-acquisition/audit_native_meal_price_1262.py \
  --steam-version-file "/private/v1.26.2/Steam/FullVersion.txt" \
  --steam-dump "/private/v1.26.2/Steam/Il2CppDump/dump.cs" \
  --steam-gameassembly "/private/v1.26.2/Steam/GameAssembly.dll" \
  --switch-dump "/private/v1.26.2/Switch/Il2CppDump/dump.cs" \
  --switch-main "/private/v1.26.2/Switch/ExeFS/main"
```

Switch native text decoding requires the local `lz4` Python package.
The exact uploaded originals were verified locally with result
`ORIGINAL_STEAM_SWITCH_NATIVE_METHOD_EVIDENCE_PASS`: **7/7 Steam methods,
7/7 Switch methods, 5/5 Steam code windows and 3/3 Switch code windows**.

`src/lib/acquisition/native-meal-percent-component.mjs` implements
**only** this verified signed-int32, truncate-toward-zero arithmetic stage
from caller-supplied numeric inputs and a caller-supplied eligibility flag.
It does **not** compute an actual meal's price, authenticate input item
values, infer eligibility, choose a live price database, assign defaults,
or establish the complete base/cap/fallback formula. The native audit,
the six standalone Python synthetic tests and six Node arithmetic tests
prevent guessing these missing paths as proven.

**Next verification:** Trace the native recipe ingredient-matching/
consumption algorithm, exact `GetLowestPriceIngredients` fallback and
`ItemPriceDatabases.TryGetSellPrice` runtime selection, then build real
game-price examples with independently verified ingredient costs. Until
those are confirmed, `loadPrivateMealPricingView` deliberately keeps
`sellPrice:null`.

## Native method-body analysis: reproducible, fail-closed tooling

The initial 89,453,137-byte IL2CPP `dump.cs` (SHA-256
`0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08`)
was first available in a Steam v1.26.1 context. Its **byte-identical**
copy is now confirmed in the user-uploaded Steam v1.26.2 folder,
**alongside** the exact executable DLL and v1.26.2 FullVersion file.
The dump contains *metadata*, not executable bodies; the new cross-platform
native audit separately authenticates the real v1.26.2 binary and verifies
that each mapped RVA corresponds to the expected executable code.

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

For **1.26.2**, the owner has now supplied both original `dump.cs` and
`GameAssembly.dll` in the same versioned folder with recorded SHA-256
fingerprints. This older general-purpose excerpt tool remains usable
for deeper local disassembly, e.g.:

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
nor claims a complete numerical sell-price formula. The separately verified
cross-platform instruction audit above establishes the **per-component**
integer truncation stage, not the entire runtime pricing path. A caller's
version labels alone remain untrusted without independent code checks.

Synthetic-only CI checks the metadata parser, exact-version rejection,
PE header/section RVA mapping and the end-to-end Python-only private
excerpt extraction path. The SHA-pinned dump successfully yielded
**13/13** original method RVA/offset/signature records. The newer
cross-platform auditor above verifies **7/7** principal methods against
real Steam and Switch 1.26.2 binary code, including percentage truncation.
The full pricing algorithm is not yet implemented.

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
