# DB-02 — Steam v1.26.2 native price provider source uniqueness

## Exact source result

The original Steam 1.26.2 `ddv_Data/StreamingAssets/protoDb.bin`
(1,335,720 bytes, SHA-256
`dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623`)
contains exactly **11** source objects implementing one of the two original
native `IItemPriceDatabase` types: **10** static `ItemPriceDatabase`
and **1** `DynamicItemPriceDatase`. The dynamic provider's nested cached
database is a **serialized snapshot**, not proof that a live game session
will use the identical cache.

The SHA-pinned source census establishes:

| Source property | Count |
|---|---:|
| All original `protoDb.bin` database records | 2,246 |
| Native price provider definitions | 11 |
| Static provider ItemPrices rows | 988 |
| Dynamic provider cached ItemPrices rows | 8,549 |
| **Total distinct Item IDs in all 11 price providers** | **9,537** |
| Buy-price ItemPrices rows | 9,056 |
| Sell-price ItemPrices rows | 1,149 |
| Sell-price (Item ID, currency ID) cost records | 1,192 |
| Serialized sell-cost records with an explicit Amount field | 718 |
| Serialized sell-cost records without an Amount field | 474 |
| Item IDs present in two or more price providers | **0** |
| Identical (Item ID, currency ID) sell keys across providers | **0** |

### Consequence

Although native `ItemPriceDatabases.TryGetSellPrice` iterates
`ProtoDatabase.Enumerate<IItemPriceDatabase>()`, *the original 11
serialized providers have disjoint Item ID sets*. Therefore the order in
which those 11 providers are queried cannot change the identity of the
provider *owning a serialized ItemPrices row*, nor create two
conflicting serialized sell records for the same Item ID and currency.

This removes **source-level provider precedence** as a blocker for
interpreting these exact 9,537 serialized rows. It does **not** prove the
native registry population/iteration order, that all 11 source objects
are registered, that the cached dynamic rows remain unchanged at runtime,
that a provider succeeds, or a numeric in-game sell price.

In the original source array the dynamic record is serialized earlier
than the ten static ones. That original message ordinal is **not** a
runtime provider priority, and no runtime order has been assumed.

In particular, the **474 absent Amount fields** are missing serialized
fields, not independently observed live selling prices. They must not
be promoted to confirmed sale amounts by the editor. The preceding
native meal/item-specific calculator and uncached formula stages also
remain separate from these serialized provider rows.

## Reproducible read-only audit

The new audit script `audit_native_price_provider_registry_1262.py`
authenticates the entire original `protoDb.bin` SHA, checks all **2,246**
source frames and exactly the **11 expected provider definitions**, parses
every original cached/static ItemPrices row, rejects any duplicate Item ID
across providers, and checks all aggregate values. Its optional native
binary verification additionally checks the complete authentic
Steam 1.26.2 `GameAssembly.dll` SHA (176,820,736 bytes,
`a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653`),
three instruction-window digests, and three direct native call edges:

- `ItemPriceDatabases.TryGetSellPrice` → `ProtoDatabase.Enumerate<T>`
- The native provider enumerator → `ProtoDatabase.TryGet<T>`
- Native `ProtoDatabase.LoadBinary` → the type lookup method

All checks are **read-only**, and reports contain only aggregate metrics
and explicit UNKNOWN/runtime-unverified markers. Source Item IDs, price
values, original native instructions, game files and player saves are
never written to the public repository.

Example command with private local original files:

```powershell
py -3 tools/src-02-acquisition/audit_native_price_provider_registry_1262.py `
  --protodb "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\protoDb.bin" `
  --assembly "D:\Private\Steam-v1.26.2\GameAssembly.dll"
```

The `--assembly` argument is optional: if absent, native code verification
is explicitly reported as **not performed**; the complete serialized
source overlap audit still runs and fails closed on the original SHA.

## Next question

Determine actual runtime provider registry initialization and mutated
dynamic-cache state, and complete meal/ingredient-specific price
provenance. No assumption of "zero", "one", or a calculated formula
result is used as a substitute for a confirmed live price.
