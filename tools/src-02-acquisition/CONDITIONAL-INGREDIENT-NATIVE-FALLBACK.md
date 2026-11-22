# DB-02 — Steam v1.26.2 conditional ingredient price fallback

## Exact code result versus actual live value

The original SHA-256-pinned Steam v1.26.2 `GameAssembly.dll`
(176,820,736 bytes, SHA-256
`a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653`)
confirms the following **native instruction path**:

1. Both the *recorded meal ingredients* and the *recipe lowest-price ingredient*
   callback call `ItemPriceDatabases.GetSoftCurrencySellPrice` with
   `ItemState=null` and **default argument 1**.
2. That wrapper calls `TryGetSellPrice`, tests its **boolean** return value,
   and returns **the provided default** only when the complete lookup fails.
   When lookup succeeds, it returns the successful provider's out parameter
   instead. The failure out parameter is NOT used as the price.
3. The native TryGetSellPrice checks a per-item custom calculator first. For
   the fixed `CropItemData`, `FishItemData` and `IngredientItemData` classes,
   the authenticated original metadata does not declare that interface.
4. The dynamic formula route executes only if the native dynamic source
   `DataCached` property reports **false**. When the in-memory dynamic cache
   remains nonempty, that route is skipped; registered static/dynamic price
   databases are then checked.
5. Finally TryGetSellPrice writes out=0 and returns **false** when no provider
   supplied a successful result.

This code path is verified by SHA-256 authentication of **nine bounded native
instruction regions**, **five direct calls** and **one relative tail jump**
against the exact owner-private original executable; the no-success wrapper
and gate instructions are checked independently. No original machine-code
bytes or source-specific price records are committed.

### The 160 ingredients: a *conditional* outcome, not confirmed prices

The independent original Steam v1.26.2 SRC-02 r5 + protoDb audit proves that
**160/371 fixed cooking ingredient Item IDs** are missing across **all 11**
serialized price providers. The source dynamic cache has **8,549** ItemPrices
entries, so **that serialized source snapshot** meets the native
`DataCached=true` criterion.

**If** the live runtime uses the same item class and database registry as the
original metadata, the registered providers use the exact original source
rows, and the dynamic cache remains in the original positive-cache state,
the native route has no matching source price rows for those 160 Item IDs.
Under those conditions, the wrapper would return its **fallback 1** for their
ingredient-value lookup.

This is a *counterfactual code-path projection*, **not an observed runtime
value**. No actual runtime registry, class instance, cache mutation, sell
calculation, external modifiers, or missing-item lookup has been traced.
Therefore those 160 materials **must remain unpriced / UNKNOWN** in Wand;
the conditional 1 is NOT authorized as an item selling price, UI price,
save-editing price, or recipe calculation input.

Similarly, the **211** fixed ingredients with explicit serialized selling
amounts have not been proven to receive those specific amounts in a live
game. Native cooked-meal percentages, selector eligibility and instance
state remain separate unresolved aspects.

## Tools and API

Read-only audit:

```powershell
py -3 tools/src-02-acquisition/audit_native_ingredient_conditional_fallback_1262.py `
  --manifest "D:\Private\SRC-02-r5\manifest.json" `
  --recipes "D:\Private\SRC-02-r5\recipes.jsonl" `
  --protodb "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\protoDb.bin" `
  --assembly "D:\Private\Steam-v1.26.2\GameAssembly.dll"
```

The script authenticates the full original sources, checks all 625 recipes
and 11 provider definitions, and verifies exact native fallback instructions;
it reports only aggregate, non-reconstructive evidence and explicitly leaves
`actualIngredientSellPrice:null`.

Typed, pure **source-snapshot** classifier:
`src/lib/acquisition/conditional-ingredient-sell-fallback.mjs`

- `conditionalOriginalSourcePathSupportsDefaultOne`: structural
  source-only hypothesis for a fixed material with no original ItemPrices row.
- `nativeConditionalFallbackValueOnlyIfAssumptionsHold`: `1`
  **only if all unverified runtime assumptions were satisfied**; otherwise
  `null`.
- `unverifiedLiveRuntimeAssumptions`: explicit prerequisites.
- `actualUnitSellPrice:null`, `authorizedForDisplayAsSalePrice:false`,
  `publishable:false`, `writable:false`: unconditionally enforced.

In the private, original-source-authenticated
`loadPrivateMealPricingView` interface, use
`getSourceIngredientConditionalNativeFallback(itemId)` or inspect a meal's
`sourceIngredientConditionalNativeFallbackEvidence`. Without a complete
original dynamic-cache source snapshot, the classifier **never** infers a
possible default-one path from an absent static row.

Synthetic Python and Node regression tests confirm the first-success
boundary, incomplete-source behavior and immutable non-price semantics.
