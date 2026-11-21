# DB-02 × DB-05 × DB-01: private saved-store Collection preview

`src/lib/acquisition/world-store-collection.mjs` provides
`inspectSavedWorldStoreCollection(join, decodedSave)` for an **already decoded**
private ProfileSave and a **validated DB-00 + SHA-pinned SRC-02** acquisition
join. It is a private, read-only **saved merchandise display index** for
Collection/Guide consumers, **not a player's Collection ownership ledger**.

## Provenance and invocation

The previous `world-store-save.mjs` parser supplies saved slot Item IDs and
store/display positions. The new bridge deduplicates identical IDs, counts
saved **display references**, and uses the existing `join.lookup(itemId)`
from `createAcquisitionCatalogJoin` for an **exact numeric** DB-01 item
catalog lookup. `catalog_item_candidate`, `unresolved_in_partial_catalog`
and `not_in_exact_catalog` retain the DB-00 catalog coverage semantics;
absence from a partial catalog is never proof that the game lacks the item.

The trusted manifest SHA-256 MUST be independently obtained from an
owner-controlled source (not computed from the untrusted bundle). Example,
using Node in a private process only:

```js
import {loadPinnedAcquisitionCatalogJoin} from './tools/src-02-acquisition/verify_bundle.mjs';
import {inspectSavedWorldStoreCollection} from './src/lib/acquisition/world-store-collection.mjs';

const join = await loadPinnedAcquisitionCatalogJoin(db00Snapshot, {
  directory: privateSrc02Directory,
  src01ManifestPath: privateSrc01ManifestPath,
  expectedManifestSha256: independentlyTrustedSrc02ManifestSha256
});
// decodedSave must come from a separately reviewed private Save Codec.
const savedDisplays = inspectSavedWorldStoreCollection(join, decodedSave);
```

**Never** bundle private SRC-02 JSONL, player profiles, private DB-01 catalog,
name records or results into GitHub, Pages, public `static/`, shared analytics
or server logs. Do not export per-player item IDs in public telemetry.

## Output contract

`wand.db02.saved-store-collection@1` returns immutable item rows sorted by
numeric Item ID. Each row has `itemId`, `savedDisplayReferenceCount`, and
explicit `savedDisplayReferences` positions (`storeIndex`,`displayIndex`,
`slotIndex`). `nameStatus`, `names`, `category` and `nativeCategory` come
**only** from the DB-00 catalog. For unverified names, `names` is empty;
no string guessing or use of internal item keys. `DisplayItemID` refers to
**the display definition, not merchandise**. `CurrencyId` is **not a price**.

The output deliberately omits saved amount and `IsAvailable` values; the
existing `inspectDecodedWorldStores` returns those with provenance caveats.
The number of saved display references is **not item ownership, collected
quantity, purchase count, current store stock, or unlocked state**. Every
output explicitly denies live offers, retail price certainty, player
Collection ownership, Save Writer authorization and public redistribution.

The DB-01 / SRC-02 versions matching one another do **not** prove that the
source version of the saved profile matches. Save Build/Schema 643 is **not**
a game version assertion. A `not_observed` World.Stores field is distinct
from an observed empty array.

## One private fixture, 2026-11-21

An owner-provided encrypted Steam profile was inspected read-only, entirely
in memory, with strict UTF-8, duplicate-key and ZIP checks. All non-null
stored merchandise IDs in that **one private saved-profile snapshot** matched
native SRC-01 Steam v1.26.2 item definitions. Exact private item IDs, quantities,
per-player store counts, and complete decoded records are **not** in GitHub.
Private aggregate counts, source digests and limitations stay in owner-private
Drive. No game-version equivalence, current price, inventory, actual purchase
availability, entitlement or Collection ownership was established.

Test with `node --test tests/acquisition-world-store-collection.test.mjs` and
full acquisition CI. Real-data acceptance covers **one** local profile,
not every platform, player, save build or subsequent shop rotation.