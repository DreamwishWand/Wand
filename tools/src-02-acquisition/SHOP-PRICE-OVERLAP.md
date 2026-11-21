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

It fails closed on incorrect ZIP SHA-256, manifest hashes, member ledgers, changed source versions, slot/name mismatches or unexpected census changes and prints **aggregate-only** JSON. Synthetic CI negative tests do not ship private source rows. The offline Python audit verifies source cross-correspondence **independently of** the JS runtime; it does not by itself establish that the JS loader has executed successfully on raw proprietary files. A separate **true end-to-end JavaScript smoke runner** is now implemented in `smoke_private_stall_price_runtime.mjs`, also requiring only the two exact **local** ZIPs:

```sh
node tools/src-02-acquisition/smoke_private_stall_price_runtime.mjs \\
  --r5-zip /private/SRC-02/db02-private-src02-r5-condition-corrected.zip \\
  --price-zip /private/SRC-02/db02-steam-v1.26.2-private-protodb-shops-prices.zip
```

The runner checks the original ZIP SHA, safely reads the private price ZIP in memory, invokes the actual `loadPrivateStallPriceOverlap` API, and emits only aggregate counters; it does **not** publish data or write source extracts. **The real-data JS runtime runner's successful completion must be separately observed**; synthetic CI validates its fail-closed behavior but cannot access the owner's game-source ZIPs.

## End-to-end native-source JavaScript verification (2026-11-22)

The **actual JavaScript main-branch sources** were retrieved by GitHub file SHA and executed with the two **original SHA-verified private ZIPs** using Node 22.16.0, not mock data. The final runner produced `EXACT_PRIVATE_JS_SOURCE_SMOKE_PASS`, confirmed source manifest SHA-256 pins `ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c` and `641f1b5c5268f136de7bf345f372f06bde923ce0f1f24871225a97913091e975`, and exactly reproduced 65 stalls, 745 candidate occurrences, 683 configured price-row intersections, 62 without, plus the 29/18/3/15 source-database distribution.

The new `getSourceStallItemPriceReferences(stallId,itemId)` lookup returns original source price rows **only when the Item ID is in that stall's enumerated static candidate set**, along with source loot-table slot references, separately currency-matching and alternative purchase costs, and explicit `currentShopOfferVerified:false`, `shopSpecificDatabaseSelectionVerified:false`, `effectivePriceVerified:false`, `availabilityVerified:false`, `publishable:false`. An item missing from static candidate pools is **not** declared unsold or unavailable. Unknown stall IDs return `null`, invalid native IDs fail closed.

The updated real-data smoke rechecked **all 745 per-stall candidate lookups** and 65 out-of-catalog Item ID lookups. All returned expected source-only values and non-sale status. No private item rows, prices, or saves were sent to GitHub or published.

### Runtime price database selection is not proven

The owner-held IL2CPP `dump.cs` (Steam 1.26.1, SHA-256 `0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08`) declares `Definitions.Shops.Shop` with fields 1–9: Slots, Fatigue, RefreshCost, RefreshBaseIncrease, RefreshIncreasePercent, RefreshIncreaseCap, SupportsDailySellCap, IsDispenser and RestrictItemsToCurrentScene. It **does not have a serialized price database selector field**. Its `Definitions.Shops.ShopSlot` has Fatigue and CurrencyId; `Definitions.Shops.ItemPrices` independently has `Prices` and `SellPrices`. `ItemPriceDatabases.TryGetPrice(Item,Item,out int)` exists as a runtime method, but **dump.cs provides only its signature, not the implementation**. The version-matched 1.26.2 ProtoDB original was byte-verified against the 1.26.1 archive, but the IL2CPP method implementation is **not proven identical** to 1.26.2. A source currency match, even unique, is therefore **not proof of actual runtime price selection**, stock, sale eligibility, daily rotation or discount. Preserve the unknown fields until native runtime code or an independently observed transaction supplies the missing evidence.

## Private local verification

Use the real r5 ZIP and the owner-private ProtoDB price release stored in **SRC-02 Google Drive**; no re-extraction from local game files is required. Provide `Uint8Array` buffers for `acquisitionArchiveBytes`, `priceManifestBytes` and the price JSONL `priceFiles` dictionary. The runtime checks every source release pin and requires the exact observed aggregate counts above; altered versions fail closed instead of silently producing a mixed-version report.

The separate native `StallData` decoder in `stall-save.mjs` remains limited to observations of already-extracted submessages; its SlotId-to-static-slot-index mapping, save version and stock/price semantics **must not** be promoted by this join.
