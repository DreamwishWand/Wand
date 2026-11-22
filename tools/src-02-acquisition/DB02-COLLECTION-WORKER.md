# DB-02 × Collection: isolated one-shot saved-store inspection

A user-selected encrypted P1G file on `/collection` is decoded by
`src/lib/collection/saved-store.worker.ts`, not by the Svelte main thread.
The browser transfers the ciphertext ArrayBuffer to the Worker (rather than
cloning it), so the main thread no longer retains a copy created for parsing.
The Worker uses the Rust/WASM P1G reader for AES/ZIP/CRC/UTF-8 and
strict JSON validation, then invokes DB-05's `inspectDecodedSave` through
`inspectDecodedWorldStores`, and reduces the result with
`createSavedStorePreview` **before** posting anything to the UI.

The only successful Worker response contains a save schema integer and
bounded immutable-shaped merchandise Item-ID/reference counts; it cannot
carry the whole save, player fields, store quantities, timestamps, current
stock/price, original filenames, ZIP bytes, or personal profile objects.
The Worker wipes its transferred ciphertext and closes after one request;
the UI terminates it upon completion, error, cancellation or unmount. A file
read cancelled while the browser is still producing its ArrayBuffer also
wipes that temporary buffer once the pending read finishes. Browser-managed
strings and Crypto/internal allocations cannot be guaranteed to be zeroed,
which is why the short-lived Worker is used. Nothing is persisted or uploaded.

`attachHistoricalStoreLabels` independently checks the Worker aggregate
contract/counters, rejects malformed or forged item references and copies
only a fixed, narrow set of allowed metadata onto UI records. The public
Switch v1.25.0 names and historical images are **cross-version ID equality
hints only**; an owner-private Steam v1.26.2 source catalog is not bundled.
The UI never mutates Collection workspace status or enables save writing.
Images remain opt-in, OFF by default. This feature does **not** verify live
shop offers, stock, prices, ownership, purchases or save round-trip safety.

Validation:
- `node --test tests/collection-saved-store-worker.test.mjs` tests
  aggregate integrity, private-value non-forwarding and source guards.
- `tests/collection-p1g-local.test.mjs` runs a fresh *synthetic encrypted
  ZIP/P1G* through `inspectEncryptedSavedStore` to exercise the full codec
  and decoder chain. No private fixture appears in GitHub.
- Collection CI requires `npm test`, `npm run check`, `npm run build`.
- The existing private Steam 643 real-save evidence from PR #83/#88 is not
  re-uploaded or copied into this worker branch; browser end-to-end manual
  file-selection and performance remain separate verification steps.