# DB-02 private browser ZIP: validated r5, private-only admission

**Current status (2026-11-21): Steam v1.26.2 r5 VERIFIED FOR OWNER-PRIVATE USE.**
The authentic Steam v1.26.2 `Condition.json` (571,341 bytes) was independently
SHA-verified to `9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c`
and used to rebuild r5. Its exact SRC-02 manifest SHA-256 is
`ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c`.
The owner-private browser ZIP `db02-private-src02-r5-condition-corrected.zip`
(271,320 bytes; Drive file ID `1gc76Y7OQYonTreOMWJLWyPFpf26vv009`)
is present under SRC-02 / Browser Private / Steam-v1.26.2-r5-current-condition-20261121.
Its independently recorded SHA-256 in `LATEST.json` is
`7914b88b4d7c546ee362a907d9a66691debcafc54caefb0815254edc10fa7fb8`.

The former r4 `Condition.json` came from Steam v1.26.1 and its manifest SHA
`323f666cd30ae1e784879d4664ca57a845559734d147193b7d7177fd59eb938d`
remains revoked. Node, DB-00 and browser admission all reject this stale
source. r5 is **partial, not publishable**, and proves neither live offers,
sale prices, game rights, player ownership nor runtime condition eligibility.

## Owner-private re-packaging (optional; only with the independently pinned r5)

```sh
python tools/src-02-acquisition/pack_private_browser.py \
  --dir /owner/private/SRC-02/Steam-v1.26.2-ACQ-r5-current-condition-20261121 \
  --src01-manifest /owner/private/SRC-01/manifest.json \
  --expected-manifest-sha256 ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c \
  --out /owner/private/SRC-02/r5-private-browser.zip
```

The packer invokes the authoritative Node `verify_bundle.mjs` and rejects
revoked r4, source mismatches, broken rows, symlinks, public Git destinations
and overwrite. It packages exactly 12 files (the manifest plus 11 SHA-ledgered
files). Never place private ZIPs or extracted rows in `static/`, public GitHub
or Pages. User-selected browser imports must remain local and explicitly
source-pinned.

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

// Owner-private r5 release, independently pinned against LATEST.json:
const source = await loadPrivateSrc02BrowserBundle(
  new Uint8Array(await localUserChosenFile.arrayBuffer()), {
    platform:'Steam',gameVersion:'1.26.2',
    manifestSha256: 'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c',
    src01ManifestSha256: '1ebf7a19792bb229ca7e0cec533b1471e4f2c0e695a9d413bbcf305022f6',
    currentConditionSha256:CURRENT_STEAM_1262_CONDITION_SHA256
  });
const nativeEvidence = source.getItem(31000001); // static paths only
```

**Never** infer game availability from an empty shop-offers set, assume
condition truth, infer player ownership, automatically import into Collection,
or infer price, stock, currency, rights, DLC or Writer authorization. Private
source rows must remain in a disposable local Worker and not be posted to a
public server. The concurrent Collection Rust/WASM migration is untouched.

CI uses synthetic source fixtures only. Separate owner-private r5 smoke and SHA-256 audits passed; old-r4 negative smoke verifies rejection. Neither owner-private game data nor the r5 ZIP may be published through GitHub or Pages.