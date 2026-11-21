# DB-01 → DB-02 acquisition static-reference join (final TypeScript)

`src/lib/items/db02-join.ts` is a read-only adapter, **not** a new database,
parser, or JavaScript runtime. It consumes the existing `Db01CatalogClient`
and the existing `createAcquisitionDatabase()` API after the DB-02 producer's
`verify_bundle.mjs` has checked the private files. It never republishes the
private sources or combines a different game's versions.

## Source-admission boundary

`createDb01Db02Join(db01, db02, rawSrc02ManifestBytes, trustedPins)` requires:

1. The private DB-01 TypeScript v2 client and the **same Steam game version**
   in `wand.src02@1` and the DB-02 consumer.
2. The current DB-02 manifest's exact **raw-byte SHA-256** equal to an
   independently trusted owner/source-ledger digest (`trustedPins.manifestSha256`).
   This digest MUST NOT be calculated from the untrusted manifest on arrival.
3. The DB-02 source's `src01ManifestSha256` to match the DB-01 source's
   `nativeSourceManifestSha256`. These represent the original four-class SRC-01
   manifest, **not** the entire 33,627-definition DB-01 JSONL digest.
4. The `Condition.json` source to match the **independent Steam 1.26.2
   format-probe** original hash `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`.
   Reject earlier `f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150`
   (Steam 1.26.1) even if the previous extractor mislabelled it `1.26.2`.
5. The DB-02 manifest must contain SHA-256 ledger entries for its recipe,
   acquisition, loot, linked-Item-ID, condition-gate and condition-definition
   datasets. The caller must also separately verify those bytes with DB-02's
   existing bundle verifier. The join does not re-implement that verifier.

No current Steam 1.26.2 `Condition.json` bytes have been obtained in DB-01.
Therefore **no previously derived DB-02 1.26.2 condition bundle should be
admitted for use yet**. The TypeScript bridge can ship with this gate without
activating unsafe data. Future game versions require a separately reviewed
source profile, not an arbitrary `gameVersion` string.

## Example, private-only

```ts
import { createDb01CatalogClient } from '$lib/items/index.ts';
import { createDb01Db02Join } from '$lib/items/db02-join.ts';
import { createAcquisitionDatabase } from '$lib/acquisition/index.mjs';

// Inputs are obtained only after trusted owner-side source- and file-SHA checks.
const db01 = createDb01CatalogClient(verifiedDb01ShardsManifest, privateBytesLoader);
const db02 = createAcquisitionDatabase(verifiedDb02Data);
const join = await createDb01Db02Join(db01, db02,
  sourceVerifiedRawSrc02ManifestBytes, {
    manifestSha256: independentlyPinnedSrc02ManifestSha256,
    currentConditionSha256: independentlyVerifiedCurrentConditionSourceSha256,
  });
const result = await join.getItem(30000031);
// result.definition: exact partial DB-01 Item ID match, or null
// result.staticAcquisition: DB-02 source-configured static candidates, or null
// result.liveAvailabilityVerified === false
// result.unlockOrEntitlementVerified === false
// result.saveWritingAuthorized === false
// result.publicationAuthorized === false
```

`getItem(id)` makes at most one lazy DB-01 ID-bucket fetch. If the ID is absent
from the incomplete DB-01 catalog, the result reports
`not_in_partial_db01_catalog` rather than making a claim that the item does not
exist. If DB-02 has no verified static relation, it does not imply no recipe,
no shop offer, or no possible acquisition route.

**Not connected here:** DB-03 Guide and DB-04 World currently have separately
verified Steam 1.26.1 sources; automatic joins to DB-01 Steam 1.26.2 would be
cross-version. DB-05 Save carries candidates/legacy structure information, not
current save-writer authority. Those streams need their own same-version
source evidence before a production join can be enabled.