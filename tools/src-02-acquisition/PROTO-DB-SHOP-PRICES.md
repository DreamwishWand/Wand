# DB-02 — verified private static ProtoDB shops & item price evidence

Source: **Steam v1.26.2**, original `ddv_Data/StreamingAssets/protoDb.bin`. Owner-private original SHA-256: `dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623` (1,335,720 bytes). Its full byte identity with the Steam v1.26.1 original was separately established by DB-03's target-version source bridge. **Condition.json was changed and is not reused**. Native protobuf field IDs are independently checked against the owner-held IL2CPP dump (Steam 1.26.1):
- `Definitions.Shops.Shop`: slots=1, fatigue=2, refreshCost=3, refresh base increase=4, percent=5, cap=6, daily sell cap=7, dispenser=8, current scene restriction=9.
- `Definitions.Shops.ShopSlot`: fatigue=2, currencyId=4. A slot currency is **not** a proof of what item is currently stocked.
- `Definitions.Shops.ItemPriceDatabase`: repeated `ItemPrices`=1; `ItemPrices`: item ID=1, **purchase** `Prices`=2, **sell** `SellPrices`=3.
- `CurrencyCost`: currency ID=1, amount=2. An omitted amount is `null`, **never** a confirmed free or zero price.
- `Definitions.Shops.DynamicItemPriceDatase`: price-formula refs=1, sell-formula refs=2, cached data=3. This source is fingerprinted but **not evaluated**.

Read-only extractor: `tools/src-02-acquisition/protodb_shop_prices.py`. Inputs are checked against **independently trusted** source and SRC-02 r5 release bytes, not only self-provided hashes. The existing exact r5 private browser ZIP is independently SHA-pinned as `7914b88b4d7c546ee362a907d9a66691debcafc54caefb0815254edc10fa7fb8`; its manifest is `ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c` and `stall-sources.jsonl` is `153d524f607e14c3395af525d974ed60f0320d4991738b37ed020378123c2b66`.

## Actual private source extraction (2026-11-21)

| Source definition | Verified count |
|---|---:|
| Total ProtoDB original entries | 2,246 |
| `Definitions.Shops.Shop` | **44** |
| Typed shop slot definitions | **218** |
| `ItemPriceDatabase` | **10** |
| Price-bearing item records | **988** (database-scoped occurrences) |
| Source-configured purchase currency/amount entries | **1,348** |
| Source-configured sell currency/amount entries | **711** |
| Price entries with omitted serialized amount | **3** |
| Dynamic formula price databases | **1** (unevaluated) |
| SRC-02 r5 stall references with exact shop key AND slot-count match | **65/65** |
| Distinct referenced native shop keys from those stalls | **41** |

An exact stall `ShopData` string key plus exact slot count confirms the **configuration reference**, not a mapping of a particular loot candidate to a final purchased item, price or quantity. Some of the 44 shops are not referenced by the current 65 r5 stalls. A single Item ID can have different price definitions in different price databases; do not flatten to one global price or pick a price database for a specific shop without a verified native selection rule.

**No currently live shop offers, stock, purchase eligibility, sale/discount prices or completed transactions are proven.** `shop-offers.jsonl` from r5 remains intentionally empty. The private report's `verifiedCurrentShopOffers:0` counts evidence obtained; it does not assert the game has zero offers.

## Reproducible private extraction

```sh
python tools/src-02-acquisition/protodb_shop_prices.py \
  --protodb /private/game-source/Steam/v1.26.2/ddv_Data/StreamingAssets/protoDb.bin \
  --r5-private-zip /private/SRC-02/db02-private-src02-r5-condition-corrected.zip \
  --out /private/SRC-02/Steam-v1.26.2-ProtoDB-shop-price-evidence
```

Generated owner-private files: `shop-definitions.jsonl`, `static-item-prices.jsonl`, `stall-shop-joins.jsonl`, `dynamic-price-source.jsonl`, `manifest.json` with SHA-256 of each output. The source-pinned local private extraction produced manifest SHA-256 **`641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975`**. These outputs and original game files **must not** be committed to public GitHub or Pages.

Tests (synthetic fixtures only, no original data): `python -m unittest discover -s tools/src-02-acquisition -p 'test_protodb_shop_prices.py' -v`. Original source validation is a separate owner-private smoke process.

## Integration boundaries

These new files are a **separate versioned owner-private supplement**, not an update to existing r5 files, no silent promotion of live offers. They allow DB-02/Collection/Guide to show e.g. `source_configured_buy_price` or `source_configured_sell_value` only with an explicit price-database context and currency. Missing amount stays unknown. Live offer verification remains a separate step requiring authoritative shop runtime source and relevant player/game conditions.
