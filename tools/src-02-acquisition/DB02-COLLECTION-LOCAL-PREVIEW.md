# DB-02 × Collection — local-only P1G saved-store preview

`src/lib/collection/SavedStorePreview.svelte` is an **optional read-only** UI
on `/collection`. The browser decodes a user-selected packaged P1G profile in
memory, calls DB-05 `inspectDecodedSave` via the DB-02 `inspectDecodedWorldStores`
bridge, and aggregates only Item ID/reference counts. It does not upload, encode,
write, save to browser storage, import into a Collection workspace, or mark an
item as owned/unlocked. The file input is cleared after inspection; the copied
encrypted buffer is zeroed. JavaScript cannot guarantee immediate wiping of all
immutable strings and browser-managed memory; no decoded JSON is intentionally
persisted.

The P1G reader is a narrow **read-only port** of the owner's pre-existing public
`DreamwishWand/web/src/lib/ddv/core/save/p1g-packaged-profile-codec.js`
(baseline `a1c4b8ddf2de45c2c5c575a73460c847e0ac8c52`), retaining AES/ZIP,
checksum, size and safe-JSON validation; its public encode method is removed.
The copied safe JSON scanner preserves duplicate-key/unsafe-number rejection.
This port is **not** an attested new-version codec or proof of a lossless
round-trip. Explicitly test new real file formats independently before admitting
new versions. No game originals or personal saves are shipped with the site.

The existing published Collection runtime is **Nintendo Switch v1.25.0**.
The historical image assets include Steam v1.25.3 material. Those are not the
verified private **Steam v1.26.2 SRC-01/DB-02** catalog. Accordingly labels and
images are used only as historical **ID-equality hints** and never shown as
validated game-version-matched fields. Images are **opt-in and disabled by
default** to avoid passive public asset requests derived from a private saved
item list. A valid ID match is not evidence of ownership, purchased items,
current stock, item sale prices, remaining restock time, full catalog coverage,
or shop entitlement.

The private DB-02 `inspectSavedWorldStoreCollection()` API remains available for
independently PINNED DB-00 and Steam v1.26.2 source/catalog builds. It is NOT
silently substituted by the public Switch 1.25.0 runtime.

Verification: `node --test tests/collection-saved-store-preview.test.mjs tests/collection-p1g-local.test.mjs` and normal Collection checks including `npm run check` and `npm run build`. Tests are wholly synthetic; never commit real save values.