# DB-02 — original Steam 1.26.2 fixed cooking ingredient price-source gaps

## Exact source finding: all 160 missing ingredients have NO ItemPrices row

The read-only SHA-authenticated source join compares:

- SRC-02 ACQUISITION r5 manifest.json (SHA-256 ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c) and its 1,943 recipes.jsonl definitions (SHA-256 bd6237fb42629fb268a0fc6e5819670ac58ee417262bd93c0b120f0bbc8da818); **625 cooking** and **1,318 crafting** recipes;
- exact Steam 1.26.2 protoDb.bin (SHA-256 dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623), with **10 static + 1 dynamic cached** price database definitions and **9,537 distinct ItemPrices item IDs**.

Only explicit fixed *kind:item* cooking ingredients are included. Alternatives, tags and other selectors are NOT incorrectly expanded to fixed ingredient instances.

| Original ActivityItem subtype | Fixed cooking ingredients | Explicit serialized soft-sell Amount | Entire price row absent in all 11 providers |
| --- | ---: | ---: | ---: |
| Crop (302) | 140 | 127 | **13** |
| Fish (310) | 72 | 64 | **8** |
| Ingredient (311) | 159 | 20 | **139** |
| **Total** | **371** | **211** | **160** |

All **160** absent fixed-ingredient IDs lack an entire ItemPrices source row across **all eleven** providers, including the original dynamic cache. The 160 cases are NOT omitted CurrencyCost.Amount fields, buy-only source rows, or sell-cost rows for another currency. The separate **474** omitted Amount fields belong to other item IDs.

**No live price is established.** The native ItemPriceDatabases.GetSoftCurrencySellPrice method can invoke item calculators, an uncached formula or registered price providers before its caller-supplied fallback default. A missing original *serialized* row is not a confirmed runtime lookup failure, evidence that the ingredient cannot be sold, or proof that its price is 0 or 1. The 211 explicit serialized amounts also remain conditional source values, NOT observed in-game sale quotes.

The authenticated source sell formula targets ActivityItem/Consummable; the fixed cooking ingredients belong to separately declared Crop/Fish/Ingredient types. This type distinction is not a license to guess their prices.

## Implemented private-source API

The pure classifier at src/lib/acquisition/ingredient-source-row-coverage.mjs distinguishes:

- static_source_row_present
- dynamic_source_row_present
- no_serialized_source_price_row
- dynamic_source_not_supplied

The independently SHA-pinned *private* meal view now provides:

- view.getSourceIngredientPriceRowCoverage(itemId)
- view.inspect(mealItemId, itemStateBytes).sourceIngredientSerializedPriceRowCoverage

The full row-absence claim is returned only when the caller loaded BOTH the authenticated static price release and the exact original dynamic protoDb cache. Without dynamic source bytes, the absence verdict remains **null**. This API does not calculate or write game sell prices. The standalone pure classifier cannot independently authenticate caller-supplied rows.

## Read-only original audit

The Python script audit_fixed_ingredient_price_source_gap_1262.py authenticates the complete source digests, joins every fixed cooking ingredient to the 11 exact original price providers, asserts the aggregate breakdown and prints no original IDs or price amounts.

~~~powershell
py -3 tools/src-02-acquisition/audit_fixed_ingredient_price_source_gap_1262.py ^
  --manifest "D:\Private\SRC-02-r5\manifest.json" ^
  --recipes "D:\Private\SRC-02-r5\recipes.jsonl" ^
  --protodb "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\protoDb.bin"
~~~

Run this as a single line on PowerShell or use its backtick line continuations; ^ is the CMD continuation character.

Synthetic Python and Node tests run in the SRC-02 Acquisition CI workflow. No proprietary source dataset, individual item IDs, actual price records, original game bytes or player saves are publicly committed.

## Remaining

Runtime registered price provider set/order, mutations to the in-memory dynamic cache, recipe matching and price percentage calculation require separate investigation before any real **per-instance** meal sell price can be certified.
