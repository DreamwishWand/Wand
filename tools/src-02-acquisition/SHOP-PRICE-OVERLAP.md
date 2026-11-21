# DB-02 — source-pinned static stall ↔ item-price overlap

This module is an **owner-private read-only offline analysis**, not a shop offer API.
It combines independently authenticated Steam v1.26.2 originals:
- SRC-02 r5 private acquisition archive, exact manifest SHA-256 `ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c` (proper current `Condition.json`; r4 revoked).
- ProtoDB shop/price release, exact manifest SHA-256 `641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975`.

Use `loadPrivateStallPriceOverlap` from `src/lib/acquisition/private-stall-price-overlap.mjs`. The function accepts the **local** r5 ZIP bytes plus the four exact price-release JSONL members and manifest bytes (from the separately private release). It verifies source hashes, original manifests and member contents before linking, and makes **no network requests**. Neither ZIP nor game originals should be added to the public repository or Pages.

The relevant source classes in the Steam IL2CPP metadata:
- `Definitions.Items.StallBuildingItemData.ShopData` is a **string configuration key**; `SlotLootTableItemID` is its repeated static candidate-pool reference.
- `Definitions.Shops.Shop` and `Definitions.Shops.ShopSlot` describe **static** configuration (configured slots and currency).
- `Definitions.Activities.ShopData` and `Definitions.Activities.ShopSlot` (inside `StallData`) instead describe **serialized player stall state**, including `SlotId`, `ItemAmount`, `MaxAmount`, and regeneration metadata. They are **not** interchangeable native types.
- `Definitions.Shops.ItemPrices` records price database-scoped `Prices` (buy) separately from `SellPrices` (sell). `ItemPriceDatabases.TryGetPrice` is a runtime method; these source signatures alone do **not** prove which database a particular shop uses.

## Verified exact-release overlap (Steam v1.26.2)

| Source-only category | Count |
|---|---:|
| r5 authenticated stalls | 65 |
| Stalls where every *enumerated* candidate Item ID has an original static price row | 50 |
| Stalls with no enumerated candidate Item IDs in static price rows | 15 |
| Stalls with a partial intersection | 0 |
| Sum of distinct candidates **per stall** | 745 |
| Per-stall candidate occurrences with static price records | 683 |
| Per-stall candidate occurrences without static price records | 62 |
| Distinct candidate Item IDs across all stalls | 606 |
| Static price rows from 10 original price databases | 988 |
| Duplicate price rows for the same Item ID across those databases | 0 |

The **50/15 separation** is observed in the authenticated inputs. It is **not** proof that 15 stalls sell nothing, nor proof that the 50 have stock. Candidate pools may include conditions or runtime selection rules and are not necessarily exhaustive. A static price assigned to an Item ID proves a **source-configured amount in that database only**, not the effective cost, discount, stock, merchant, or player eligibility.

The join computes deterministic per-stall `coverage`, `candidates`, and per-slot candidate references, plus an Item-ID query for price database-scoped original buy/sell amounts and possible stall candidate locations. It deliberately returns `shopDatabaseSelectionVerified:false`, `currentOffersVerified:false`, `effectivePricesVerified:false`, `stockVerified:false`, `saveWriterAuthorized:false`, `publishable:false`.

A candidate Item ID absent from the price tables is classified `not_listed_in_observed_static_price_databases`, **not** `free`, `not sold`, or `unobtainable`. Missing serialized price amounts remain `null`.


## Native currency and multiple price-database evidence (2026-11-21)

An independent local **original-bytes** audit of the exact owner-private SRC-02 r5 ZIP and the exact ProtoDB static-price ZIP (SHA-256 `347ac135fdc07f57c82f556506fcaf3eb21710062a9c6c5d1b32654fde3b1853`) confirmed the previous 65/50/15 and 745/683/62 coverage. Additionally:

| Native static evidence | Exact count |
|---|---:|
| Stalls with candidate Item IDs from exactly **one** price database | 29 |
| Stalls with candidate Item IDs from exactly **two** price databases | 18 |
| Stalls with candidate Item IDs from exactly **three** price databases | 3 |
| Stalls with **no** price database overlap in the enumerated candidates | 15 |
| Distinct source-configured ShopSlot currency IDs across these 65 stalls | 1 (`80000000`) |
| Price-defined candidate occurrences with an original **purchase-cost** in that shop currency | 683 |
| Additional **other-currency** purchase-cost definitions across those same occurrences | 162 |

This is **strong evidence against** hardcoding one static price database per shop. For some stalls, candidates belong to two or three original price databases. The byte-proven `ShopSlot.CurrencyId` provides a **currency constraint**, not the full runtime price-database selection algorithm. Match `ItemPrices.Prices` (buy) by currency, never `SellPrices` (sell); retain the source `databaseKey` on every result. No candidate is declared currently on sale or purchasable.

`src/lib/acquisition/source-price-currency.mjs` is a pure classifier for configured native purchase-currency matches: it preserves multiple database contexts, explicit zero versus an omitted protobuf amount, and nonmatching alternative currencies. Its standalone output explicitly says `inputSourceAuthenticated:false`; only an upstream hash-verified release loader can establish authentic original evidence. `private-stall-price-overlap.mjs` integrates it inside the independently pinned two-release verification path. **Neither** module evaluates runtime price formulas, stock, discounts, quest unlocks, save timestamps or user entitlements.

Reproduce the independent **private source audit** without rebuilding game files (only exact local release ZIPs, no network):

```sh
python tools/src-02-acquisition/audit_private_stall_price_overlap.py \
  --r5-zip /private/SRC-02/db02-private-src02-r5-condition-corrected.zip \
  --price-zip /private/SRC-02/db02-steam-v1.26.2-private-protodb-shops-prices.zip
```

It fails closed on incorrect ZIP SHA-256, manifest hashes, member ledgers, changed source versions, slot/name mismatches or unexpected census changes and prints **aggregate-only** JSON. Synthetic CI negative tests do not ship private source rows. The offline Python audit verifies source cross-correspondence **independently of** the JS runtime; it does not by itself establish that the JS loader has executed successfully on raw proprietary files. An exact private JS runtime smoke is still a separate validation item.

## Private local verification

Use the real r5 ZIP and the owner-private ProtoDB price release stored in **SRC-02 Google Drive**; no re-extraction from local game files is required. Provide `Uint8Array` buffers for `acquisitionArchiveBytes`, `priceManifestBytes` and the price JSONL `priceFiles` dictionary. The runtime checks every source release pin and requires the exact observed aggregate counts above; altered versions fail closed instead of silently producing a mixed-version report.

The separate native `StallData` decoder in `stall-save.mjs` remains limited to observations of already-extracted submessages; its SlotId-to-static-slot-index mapping, save version and stock/price semantics **must not** be promoted by this join.
