# DB-02 — Steam v1.26.2 ProtoDatabase load/export call graph

## What the original executable actually proves

The owner-private original Steam 1.26.2 `GameAssembly.dll` and
`dump.cs` contain two **different** ProtoDatabase flows:

| Call path in original native code | Direct transition | Interpretation |
| --- | --- | --- |
| `ProtoDatabase.Init` and `ReInit` | each has a call to `ProtoDatabase.ctor` | Construction path exists; no live invocation is asserted |
| `ProtoDatabase.ctor` | tail-jumps to `Refresh` | Constructor refresh path |
| `ProtoDatabase.Refresh` | calls `LoadBinary` | Source load/refresh path |
| `ProtoDatabase.LoadBinary` | calls `FindType` | Materializes declared source type metadata |
| `ProtoDatabase.ExportForBuild` | calls `SaveBinary` | Separate build/export path |
| `ProtoDatabase.SaveBinary` | reads `ProtoDesc.Message`, type-checks its object, then conditionally invokes an interface method | **The exact interface identity has not been authenticated** |
| `DynamicItemPriceDatase.OnBinarize` | tail-jumps to `CacheData` | Original dynamic price cache rebuild mechanism |
| `ItemPriceDatabases.TryGetSellPrice` | calls `ProtoDatabase.Enumerate<object>` | Provider enumeration path; concrete live population/order unknown |

These paths were checked using **10 original SHA-256-pinned native
instruction windows** (including the conditional `SaveBinary` gate)
and **10 verified rel32 call or jump targets**, plus owner-qualified
method signatures in the original `dump.cs`. The executable's
`il2cpp` section was also searched for *all byte-level E8 and E9
transfers* to five key native entry points.

### The direct-reference census is NOT an interface call census

In the original `il2cpp` section:

- **0** direct E8/E9 transfers target
  `DynamicItemPriceDatase.OnBinarize` (RVA `0x383A390`).
- **1** direct transfer targets `DynamicItemPriceDatase.CacheData`,
  the tail jump from `OnBinarize`.
- **1** direct transfer targets `ProtoDatabase.LoadBinary`,
  its call from `Refresh`.
- **1** direct transfer targets `ProtoDatabase.Refresh`,
  its tail jump from the constructor.
- **1** direct transfer targets `ProtoDatabase.SaveBinary`,
  its call from `ExportForBuild`.

**Zero direct call sites does not prove the hook is never invoked.**
An interface method can be dispatched indirectly without an E8/E9
instruction naming the concrete method address. The original metadata
does declare `IProtobufOnBinarize`, and `DynamicItemPriceDatase`
implements it. The native `SaveBinary` conditional interface dispatch
is consistent with an optional protobuf hook, but its concrete type
identity has **not** been separately resolved against the original
metadata. Therefore this work does not claim that `SaveBinary`
necessarily invokes this specific `OnBinarize` method, or that
`LoadBinary` invokes it.

## Consequence for ingredient prices

The original `protoDb.bin` has 11 serialized provider definitions with
9,537 distinct ItemPrices rows, of which 8,549 are within the
dynamic provider cache. Those are **serialized source properties**, not
an authenticated live `ProtoDatabase` instance.

The native selling-price route queries the ProtoDatabase enumerator.
The exact live registered set, enumeration order, any mutating cache
rebuild or reload, and item-specific price outcomes have **not** been
observed. The 160 fixed cooking ingredients with no source price row
therefore remain **UNKNOWN** rather than being assigned the
conditional fallback of 1.

## Added read-only audit and API

`tools/src-02-acquisition/audit_native_protodb_load_export_1262.py`
verifies exact SHA-256 fingerprints of the three original inputs,
owner-qualified method declarations, direct targets, short instruction
windows and executable-section-wide direct-target counts. Only
aggregate evidence and explicit unknown flags are output.

~~~powershell
py -3 tools/src-02-acquisition/audit_native_protodb_load_export_1262.py --protodb "D:\Private\Steam-v1.26.2\protoDb.bin" --dump "D:\Private\Steam-v1.26.2\dump.cs" --assembly "D:\Private\Steam-v1.26.2\GameAssembly.dll"
~~~

The existing `classifyNativeDynamicCacheLifecycle` API now includes
`originalNativeProtoDatabaseRefreshCallsLoadBinary`,
`originalNativeExportForBuildCallsSaveBinary`,
`originalNativeSaveBinaryHasConditionalInterfaceSlotDispatch`,
`originalNativeDirectTransfersToOnBinarize`, and other
original-native-code evidence. Every actual runtime invocation,
cache row count, registry selection and effective sell price remains
**null or false/UNVERIFIED**.

The Python/Node regressions use synthetic fixtures and contain no
private game bytes, original item IDs, prices or player saves.
