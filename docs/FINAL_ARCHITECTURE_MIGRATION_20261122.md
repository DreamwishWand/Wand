# Dreamwish Wand — final runtime architecture audit and migration

Verified against `DreamwishWand/Wand` source on 2026-11-22.

## Approved product runtime contract

- **Svelte 5 / SvelteKit 2 + TypeScript:** UI, application state,
  typed API and typed Worker messaging.
- **Rust compiled to WebAssembly:** Save decode, schema/index, ChangeSet /
  transactional edits, validations, encode, and user-initiated export.
- **Module Web Worker:** isolation of save bytes and expensive operations;
  the Svelte page must not own decrypted save contents.
- **GitHub Pages:** static distribution, local-only save processing.
- Python and Node programs under `tools/` and `scripts/` can analyze game
  originals, generate databases and test algorithms offline. They must not
  become the product Save Editor engine or a JS Writer fallback.

## Verified production code paths

| Product lane | Existing source | Status |
| --- | --- | --- |
| Frontend | `package.json`, `src/routes/*.svelte`, TypeScript | Uses approved SvelteKit/TS |
| Collection | `crates/wand-collection-core` + `src/lib/collection/runtime.ts` | Rust/WASM present; page-side orchestration and Worker isolation need review |
| Save quantity draft | `crates/ddv-p1g-codec`, `src/lib/save/save-amount-preview.worker.ts` | Migrated to typed TS Worker using Rust/WASM only; PR #282 |
| Read-only P1G inspection | `src/lib/collection/private-p1g-codec.js`, `saved-store-worker-core.mjs` | **Legacy handwritten JavaScript P1G reader still executes** |
| Save diagnostics | `save-diagnostics-worker-core.mjs`, `save-native-p1g-audit.mjs` | JS Codec is primary for some paths; Rust P1G audit provides partial independent validation |
| World preview Worker | `src/lib/world/world-preview.worker.ts` | Typed TS Worker in PR #285 |
| World catalog | `src/lib/world/catalog.mjs`, `preview-views.mjs`, `local-snapshot.mjs` | **Legacy JavaScript product adapters still execute** |
| Offline DB extraction | `tools/db-04-world/world.py` and other source extractors | Not product runtime; offline scripting is permitted |

## Incomplete migration work (do not mark complete)

1. **P1G read path:** Extend the existing Rust P1G Codec to the supported
   Steam/Switch envelope varieties with independently demonstrated parity.
   Replace JS P1G decryption/ZIP/JSON parsing in the Collection and Save
   diagnostics Workers with the Rust/WASM reader. Fail closed for unsupported
   envelopes; do not silently accept or substitute guessed source records.
   User-initiated save editing/export remains Rust-only.
2. **SaveSession / Editor:** unify Rust decode, edit, validation,
   re-encode, reopen, export behind a typed Worker request/reply boundary,
   single session, revision checks and copy semantics. No second JS Writer.
3. **Collection:** preserve the current Rust collection engine while
   reviewing direct main-thread WASM use and transfer/lifecycle costs.
   Large save operations and sensitive data must stay in Worker.
4. **World runtime:** migrate handwritten JS catalog, ZIP reader and preview
   helpers to TypeScript for UI/projection and Rust/WASM for source-heavy
   decoding as warranted. Keep the exact original game evidence boundary;
   native source-local coordinates are not placement authorization.
5. **Enforcement:** existing `.github/workflows/architecture.yml` and
   `tools/ci/check_no_new_prod_js.py` reject new or growing handwritten
   production JavaScript. Keep this single fast guard; avoid duplicate CI.

The presence of a Rust crate or WASM parity test alone is insufficient to
classify a product service as migrated. Verify the **actual runtime call path**
and real-safe / synthetic acceptance before changing the status.

This report records implementation status, not release authorization. It
does not include any private game or save data.
