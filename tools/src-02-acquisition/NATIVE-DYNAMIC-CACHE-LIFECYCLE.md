# DB-02 — Native dynamic price-cache rebuild and source snapshot lifetime

## Steam v1.26.2 original executable: a distinct cache-replacement path

The original Steam v1.26.2 GameAssembly.dll and dump.cs are independently
SHA-256 authenticated. Disassembly of the exact native methods verifies:

1. DynamicItemPriceDatase implements IProtobufOnBinarize.
2. Its OnBinarize implementation (RVA 0x383A390) **unconditionally tail-jumps**
   to DynamicItemPriceDatase.CacheData (RVA 0x38398F0).
3. CacheData constructs a **fresh** ItemPriceDatabase using its constructor
   (RVA 0x3835F40), then assigns the object to the CachedData field.
   In the source metadata, cachedData_ is stored at field offset 0x28.
4. The cache rebuild code also calls the native
   SellPriceFormulaItemData.IsFormulaValidForItem (RVA 0x4021150),
   followed along the eligible formula path by
   SellPriceFormulaItemData.CalculateItemPrice (RVA 0x4020120).
   **These are calls, not actual observed formula results.**
5. ProtoDatabase.LoadBinary has a separately identifiable native
   deserialization path, including a FindType call. This does NOT prove
   that OnBinarize runs on load, and does NOT establish live cache lifespan.

The new read-only auditor pins **7 class-qualified original method signatures
and RVAs**, **8 exact native instruction-window SHA digests**, and **5**
native relative control transfers (including the OnBinarize tail jump).
It also re-authenticates the complete original protoDb.bin, which contains
**11** source price databases, a source dynamic price cache with **8,549**
ItemPrices rows and exactly **4 purchase + 1 sell** referenced formulas.

**Important distinction:** The owner-private original serialized cache
contains 8,549 ItemPrices rows. Those rows satisfy the game's DataCached
positive-count property **for that source snapshot**. They are not
necessarily immutable after CacheData or some other runtime mutation.
Conversely, finding an OnBinarize -> CacheData path does **not** prove
that either method executes during normal gameplay, that cache rows
change, or that any of the 160 missing fixed cooking ingredient IDs gains
a runtime price.

## Failure mode of a premature fallback-one conclusion

The previously verified 160 fixed ingredients without an original static
or dynamic cached price row can be associated with an original
*conditional* default-one price lookup route only if the relevant live
registered provider data and cache state match that original snapshot.

If CacheData ever rebuilds the dynamic price database, cached rows may
differ. Even if the rebuilt cache remains **nonempty** and the game's
DataCached gate stays true, the set of Item IDs inside it may have
changed. An empty rebuilt cache instead satisfies DataCached=false,
making the native uncached formula stage eligible for consideration.

None of those alternative outcomes is established as having happened
in a real game session. In all cases, the Wand consumer API keeps the
actual ingredient selling price as **null/unknown**, not 1.

## Source-only API

The pure typed classifier at
src/lib/acquisition/native-dynamic-cache-lifecycle.mjs can be passed
an original serialized source cache gate and, optionally, an
*explicitly hypothetical* row count after CacheData.

It reports:

- originalSourceSerializedCacheRows / originalSourceDataCachedByNativeRule:
  values from the caller-supplied source snapshot only;
- nativeOnBinarizeDirectlyDelegatesToCacheData,
  nativeCacheDataAllocatesFreshItemPriceDatabase,
  nativeCacheDataReplacesCachedDataField: original machine-code mechanism;
- hypotheticalNativeDataCachedAfterRebuild and
  hypotheticalUncachedSellFormulaPathEligibleAfterRebuild: source-independent
  **what-if** branches, not measured runtime values;
- nativeRuntimeCacheDataInvoked, nativeRuntimeCacheRowCount,
  nativeRuntimeCacheMatchesOriginalSnapshot,
  nativeRuntimeSelectedPriceProvider and actualIngredientOrMealSellPrice:
  **null** until independent runtime evidence exists.

The source-authenticated private meal pricing view also now exposes
sourceNativeDynamicCacheLifecyclePlan and
getHypotheticalNativeDynamicCacheRebuildPlan(rowCount).
An inspected meal includes sourceNativeDynamicCacheLifecyclePlan.
The pure classifier does not authenticate supplied bytes itself.
All hypothetical fields are forbidden as user-facing actual prices.

## Exact-original read-only audit

The original local files are required; the public repository does NOT
contain the game binary, IL2CPP dump or proprietary price rows.

~~~powershell
py -3 tools/src-02-acquisition/audit_native_dynamic_cache_rebuild_1262.py --protodb "D:\Private\Steam-v1.26.2\ddv_Data\StreamingAssets\protoDb.bin" --dump "D:\Private\Steam-v1.26.2\dump.cs" --assembly "D:\Private\Steam-v1.26.2\GameAssembly.dll"
~~~

The script emits only aggregate statistics, original method and machine
code validation counts and explicit unverified runtime flags. Synthetic
Python and Node regression tests run in the SRC-02 Acquisition CI workflow.

**Still unresolved:** whether/when OnBinarize is invoked in gameplay,
whether there are other cache mutators, the exact registered provider set
at runtime, effective ingredient prices and actual cooked-meal prices.
