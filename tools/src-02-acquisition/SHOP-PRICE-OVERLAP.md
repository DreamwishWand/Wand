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

## Private local verification

Use the real r5 ZIP and the owner-private ProtoDB price release stored in **SRC-02 Google Drive**; no re-extraction from local game files is required. Provide `Uint8Array` buffers for `acquisitionArchiveBytes`, `priceManifestBytes` and the price JSONL `priceFiles` dictionary. The runtime checks every source release pin and requires the exact observed aggregate counts above; altered versions fail closed instead of silently producing a mixed-version report.

The separate native `StallData` decoder in `stall-save.mjs` remains limited to observations of already-extracted submessages; its SlotId-to-static-slot-index mapping, save version and stock/price semantics **must not** be promoted by this join.
