# DB-02 private browser ZIP: fail-closed admission, not a data release

**Current status (2026-11-21): BLOCKED / NO APPROVED STEAM v1.26.2 ZIP.**
The formerly named `Steam-v1.26.2-ACQ-r4-ingredients-20261121` contains
`source.conditionSha256 = f9716fd7...` from an original Steam **v1.26.1**
`Condition.json`. The independently recorded **v1.26.2** original has SHA-256
`9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`.
Even an internally consistent SHA-256 chain and the old r4 manifest pin
`323f666cd30ae1e784879d4664ca57a845559734d147193b7d7177fd59eb938d`
**cannot authorize stale condition definitions, gates, acquisition eligibility,
or a current-version DB-01 join**. Main's authoritative Node verifier and
DB-00 join already reject r4. This new browser loader implements the same
source-identity gate; the stale private test ZIP was removed from Drive.
No current-version `Condition.json` bytes have been source-authenticated in
this stream. Do not claim current v1.26.2 acquisition source completion.

## Pending owner-private packaging (AFTER source P0 is resolved)

From a freshly re-extracted and independently audited exact-version source:

```sh
python tools/src-02-acquisition/pack_private_browser.py \
  --dir /owner/private/SRC-02/NEW_ACCEPTED_SNAPSHOT \
  --src01-manifest /owner/private/SRC-01/manifest.json \
  --expected-manifest-sha256 NEW_INDEPENDENTLY_TRUSTED_SHA256 \
  --out /owner/private/SRC-02/new-accepted-private-browser.zip
```

The packer calls the authoritative Node `verify_bundle.mjs` first; it rejects
old r4, invalid source versions, bad SHA, broken rows, symlinked direct inputs,
public Git destinations and overwrite. Only after validation does it pack
exactly 12 files (`manifest.json` and 11 hashed data files). Nothing is placed
in public Pages, GitHub, or app static assets. The current owner-private r4
ZIP is **not** a distributable release and must not be reused.

## Browser-side contract

`src/lib/acquisition/private-browser-bundle.mjs` parses a **locally selected**
ZIP (no network, telemetry, storage or save writes). It requires an independently
reviewed `trusted` object with the new accepted manifest SHA-256, exact SRC-01
manifest SHA, Steam target and `currentConditionSha256` equal to the known
v1.26.2 original fingerprint; it does not read its trust anchor from the ZIP.
The manifest itself must also contain that condition hash.

The ZIP reader checks member names, entry count, compressed/uncompressed
bounds, local/central ZIP metadata, CRC32 and SHA-256 of every file. It also
compares dataset count and cross-record validity and constructs an immutable
query index. The loader rejects old r4 with
`PRIVATE_SRC02_STALE_OR_UNVERIFIED_CONDITION_SOURCE` even if the caller supplies
the old r4 SHA-256 as a supposedly trusted hash.

```js
import {loadPrivateSrc02BrowserBundle,CURRENT_STEAM_1262_CONDITION_SHA256}
  from '$lib/acquisition/private-browser-bundle.mjs';

// AFTER the owner has re-extracted and audited current original source:
const source = await loadPrivateSrc02BrowserBundle(
  new Uint8Array(await localUserChosenFile.arrayBuffer()), {
    platform:'Steam',gameVersion:'1.26.2',
    manifestSha256: independentlyReviewedNewManifestSha,
    src01ManifestSha256: independentlyReviewedSrc01ManifestSha,
    currentConditionSha256:CURRENT_STEAM_1262_CONDITION_SHA256
  });
const nativeEvidence = source.getItem(31000001); // static paths only
```

**Never** infer game availability from an empty shop-offers set, assume
condition truth, infer player ownership, automatically import into Collection,
or infer price, stock, currency, rights, DLC or Writer authorization. Private
source rows must remain in a disposable local Worker and not be posted to a
public server. The concurrent Collection Rust/WASM migration is untouched.

CI uses synthetic source fixtures only. Real old-r4 negative smoke verifies
rejection; the rejected ZIP itself is not committed, published or retained as
an active Drive deliverable.