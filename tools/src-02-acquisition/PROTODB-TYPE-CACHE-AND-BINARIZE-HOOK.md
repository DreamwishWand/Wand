# DB-02 — ProtoDatabase type cache and binarize hook (Steam 1.26.2)

## Native control flow from SHA-pinned originals

The read-only original-source audit verifies owner-private `GameAssembly.dll`,
`dump.cs`, and `protoDb.bin`. It checks nine short instruction-window
SHA-256 digests, six direct call targets, the `isEditor` branch, and the
declared interface implementers.

**Refresh is mode-sensitive.** `ProtoDatabase` declares `isEditor` at
offset `0x48` and `cachedSearches: Dictionary<Type, Array>` at `0x50`.
Original native `Refresh` checks `isEditor`. For **false**, it branches
to `LoadBinary`. For **true**, it accesses `cachedSearches` and calls
the dictionary clear helper; that helper resets dictionary count and
free-list metadata. This does NOT reveal the actual flag in a live game.

**Price provider discovery is type-memoized.** Original
`ProtoDatabase.Enumerate<object>` reads the `cachedSearches` dictionary,
tries the existing Type key, and memoizes a collection on a cache miss.
`ProtoDatabase.TrySet` also accesses the same field. A later provider
lookup may reuse a previously computed collection rather than scan the
original eleven serialized definitions. The live enumeration membership,
order, cache contents and invalidation timeline remain unobserved.

**Binarize hook implementations.** The SHA-pinned original IL2CPP
metadata declares exactly three `IProtobufOnBinarize` implementers:

| Class | Explicit method |
| --- | --- |
| `DynamicItemPriceDatase` | `OnBinarize()` |
| `GridData` | `OnBinarize()` |
| `AudioGridData` | `OnBinarize()` |

The interface declares one method at slot zero. Original
`ProtoDatabase.SaveBinary` performs a conditional cast and uses a
slot-zero generic interface invocation. This call shape is
*consistent with* `IProtobufOnBinarize.OnBinarize`. However the exact
runtime interface TypeInfo pointer used at this call site has NOT been
authenticated as `IProtobufOnBinarize`; other interfaces have
slot-zero methods. Thus no particular concrete `OnBinarize` invocation
can yet be claimed from that call, and no actual cache rebuild has been
observed in gameplay.

## Consequence for unpriced cooking ingredients

The 160 fixed cooking ingredients absent from all original price
providers remain **UNKNOWN**, not an effective sale price of 1.
Even with a pinned 8,549-row original cache, the live provider
enumeration can be memoized and the dynamic provider's row content
could be mutated. Runtime editor-mode flag, cache entries, registered
provider set/order, rebuild occurrence and item sell prices are
explicitly unverified.

## Read-only audit and API

~~~powershell
py -3 tools/src-02-acquisition/audit_native_protodb_type_cache_and_hook_1262.py --protodb "D:\Private\Steam-v1.26.2\protoDb.bin" --dump "D:\Private\Steam-v1.26.2\dump.cs" --assembly "D:\Private\Steam-v1.26.2\GameAssembly.dll"
~~~

The new source-only evidence fields are exposed through
`classifyNativeDynamicCacheLifecycle` and the original-source-authenticated
private meal pricing view. All actual runtime fields and effective prices
remain `null`. Synthetic Python/Node regressions run in SRC-02 CI.
No original game bytes, prices, individual source Item IDs or saves are
included in public source control.
