# DB-02 — Steam v1.26.2 ingredient-dependent meal sell-price provenance

**Scope:** Cooking and meal instance state only. This is **not** the separate
static stall/shop purchase-price evidence from `SHOP-PRICE-OVERLAP.md`.

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
