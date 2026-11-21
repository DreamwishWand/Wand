# DB-02 ↔ DB-05: saved World.Stores (read-only candidate evidence)

`src/lib/acquisition/world-store-save.mjs` connects **already decoded** private save
structure with the DB-02 static acquisition catalogue. It does not open, decrypt,
serialize, encode, export, or modify a save file. The input must be supplied from
an independently validated private Codec; `inspectDecodedSave` from DB-05 checks
only the required decoded root structure, **not** Codec authenticity or round-trip
correctness.

## Grounded native field map

The owner's Steam v1.26.1 `Il2CppDump/dump.cs` declares:

| Native type | Protobuf field | Meaning retained |
| --- | --- | --- |
| `ProfileWorld` | `Stores = 15` | Repeated `StoreInfo` |
| `StoreInfo` | `BuildingItemID = 1` | Saved building ID |
| `StoreInfo` | `Displays = 2` | Repeated `StoreDisplay` |
| `StoreInfo.Types.StoreDisplay` | `DisplayItemID = 1` | **Display definition ID, not merchandise** |
| `StoreInfo.Types.StoreDisplay` | `DisplayInfo = 2` | Nested `DisplayInfo` |
| `DisplayInfo` | `Slots = 1` | Repeated `DisplaySlot` |
| `DisplaySlot` | `Item = 1` | `ItemAmount` |
| `DisplaySlot` | `IsAvailable = 2` | Saved boolean; **not** confirmed live availability |
| `DisplaySlot` | `CurrencyId = 3` | Currency ID; **not** product price |
| `ItemAmount` | `Id = 1`, `Amount = 2` | Item ID and serialized quantity; `-1` is a native infinite sentinel |

DB-05's native observed field registry independently lists `/World/Stores` and
`/World/Stores[]/{BuildingItemID,Displays,LastRefresh,WeightedItems,CurrentSequenceIndexPerUpgrade}`.
`ProfileWorld.Stalls = 44` / `StallInfos` is **not** the same structure. DB-02's earlier
`Definitions.Activities.StallData.ShopData` decoder is also **not** `StoreInfo`.
Do not combine them just because a numeric building ID matches.

The nested `DisplaySlot` source fields are IL2CPP class evidence; the current
`data/ddv/save/native1261-deep-fields.v1.json` does not independently attest
those nested paths as observed in the three private saved-shape fixtures.
The recorded native field map is **v1.26.1**; compatibility with v1.26.2 saves
must be established against real data separately.

## Use

```js
import { inspectDecodedWorldStores } from './src/lib/acquisition/world-store-save.mjs';
// `db` is a private, manifest-verified DB-02 runtime with `getStallStaticCatalog`.
// `decoded` came from a separately validated private save Codec.
const evidence = inspectDecodedWorldStores(db, decoded);
if (evidence.status === 'observed_decoded_structure') {
  // The entries are saved-structure observations, not confirmed offers.
  const savedItems = evidence.stores.flatMap(s => s.slots);
}
```

The bridge returns **new, recursively immutable metadata** and never includes
`World`, full save contents, timestamps, `WeightedItems`, or source JSON objects.
Store/display ordering and saved Item ID, amount, `IsAvailable`, `CurrencyId`
are preserved with strict number/shape bounds. A missing `World.Stores` yields
`not_observed` rather than an assertion that no stores exist.

An exact positive `BuildingItemID` numeric match can be recorded against the
static `StallBuildingItemData` catalog, but it is **not** proof that a `StoreInfo`
represents that stall or that display slots map to the candidate loot pools.
Every record explicitly leaves `staticStallIdentityVerified`,
`staticSlotMappingVerified`, `liveAvailabilityVerified`, `priceVerified`,
`stockVerified`, `nativeBuildCompatibilityVerified`, and
`strictCodecVerified` false. No sell price field is present in the mapped
`DisplaySlot`. No eligibility, price, current stock, refresh schedule, or
ownership claim is derived. `publishable` and `saveWriterAuthorized` are false.

**Validation:** `node --test tests/acquisition-world-stores.test.mjs`, plus the
normal `node --test tests/acquisition*.test.mjs` CI suite. All tests are synthetic;
no actual private save content or proprietary itemlist rows belong in GitHub.