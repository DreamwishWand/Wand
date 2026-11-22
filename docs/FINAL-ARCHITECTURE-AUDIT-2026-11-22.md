# Dreamwish Wand — Final architecture compliance audit (2026-11-22)

## Agreed target

**Svelte + TypeScript UI; Rust/WASM domain/core and save processing;
dedicated Web Workers for heavy/large game-save work.** Local file handling
stays browser-only. TypeScript Worker transport is appropriate; new
long-term JavaScript game logic is not.

Audit snapshot: source files in `DreamwishWand/Wand` on 2026-11-22,
before the migration in PR #279.

## Implementation status

| Area | Verified implementation | Assessment |
| --- | --- | --- |
| UI | SvelteKit + Svelte, TypeScript scripts in routes | Matches |
| Collection query, search, progress | `crates/wand-collection-core` Rust/WASM | Rust core exists |
| Collection execution thread | `src/lib/collection/runtime.ts` imports and invokes `CollectionEngine` directly in route runtime | **Noncompliant: move WASM to Worker** |
| Encrypted P1G reading | `src/lib/collection/private-p1g-codec.js` used AES/ZIP JSON in production Workers | **Noncompliant: Rust Worker migration started** |
| Save amount editing | `crates/ddv-save-patch` and `ddv-p1g-codec`, `save-amount-preview.worker.mjs` | Partially matches; limited experimental path |
| Saved Collection/World projections | `saved-collection-presence.mjs`, `saved-collection-discovery.mjs`, `saved-list-positive-ownership.mjs`, grid JS | **Noncompliant** |
| World source algorithms | `src/lib/world/catalog.mjs` and `preview-views.mjs` | **Noncompliant** |
| Acquisition DB-02 | `src/lib/acquisition/planner.mjs` and JS native price/source algorithms | **Noncompliant** |
| Guide domain logic | Browser JS modules | Requires further algorithm-by-algorithm audit |
| CI | Rust builds existed, but no production Rust-only P1G path guard | Guard added in this PR |

**Overall: final architecture is NOT compliant.**
Successful WASM compilation alone does not prove actual user paths use it.

## First migration slice: PR #279

1. Extend the existing Rust `ddv-p1g-codec` with a bounded
   `WasmP1gProfileReader`: 1 MiB encrypted input chunks, native AES/ZIP/
   strict JSON validation, 1 MiB plaintext output chunks confined to
   the dedicated Worker, best-effort zeroization on close/drop.
2. Add `rust-p1g-profile-reader.ts`: a typed Worker-only transport bridge.
   No JS crypto/ZIP, no automatic legacy decoder fallback, no
   decrypted profile in Worker-to-page messages.
3. Explicitly inject the Rust reader into the production Collection
   and Save Diagnostics Workers. Direct Node unit-test callers retain
   the JS decoder temporarily for synthetic compatibility tests only.
4. Add `scripts/check-rust-save-reader.mjs` to CI and Pages builds to
   prevent regression to legacy JS crypto/ZIP in the production Worker.
5. Keep Playwright synthetic encrypted P1G tests and real compiled
   Rust/WASM execution; no promise of independent JS vs Rust parity once
   both production reads use Rust.

**Compatibility caveat:** The existing Rust codec handles the verified
single-profile ZIP layout using stored or raw-deflate contents.
The historical JS codec accepts some additional ZIP shapes. Retain it
as a test comparison until actual Steam and Switch owner-private saves
have been checked and required Rust ZIP variants implemented. Production
must fail closed instead of silently switching to the JS decoder.

## Remaining migration order

1. **Finish save reads:** verify real-local P1G compatibility, move
   CollectionSets, ListInventory, world-store/grid and diagnostic
   semantic projections to Rust; isolate JS codec under tests only.
2. **Collection off main thread:** a persistent Collection Web Worker
   owning `CollectionEngine` and catalog; typed asynchronous request/
   response, paging, IndexedDB and manual/save state preserved.
3. **World and DB-02:** migrate game-specific validation, recipe planner,
   price predicates and large world calculations into Rust crate APIs.
   TS remains UI/Worker transport and file reading.
4. **Complete Save Editor:** Rust owns all edit operations and byte
   preservation, explicit validated export and schema compatibility.
5. **Enforce final architecture:** CI verifies complete runtime import
   graph, actual WASM execution and representative native browser tests;
   new JS domain logic is disallowed.

## Exit criteria

- All production P1G crypto/ZIP and save projections are Rust-owned.
- Large Collection, World and Save computation executes in Workers,
  not on the UI main thread.
- Game-specific rules and edit transforms live in Rust.
- Svelte + TypeScript owns UI state, local persistence and messaging.
- Browser tests pass on synthetic and representative owner-private
  v1.26.2 saves. No game originals or user saves committed.
- Every affected workflow and Pages build passes.

This document **deliberately retains all known architecture violations**:
phase 1 must not be misreported as the complete migration.
