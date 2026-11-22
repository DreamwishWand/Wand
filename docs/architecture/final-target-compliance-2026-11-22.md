# Wand final architecture compliance audit — 2026-11-22

**Repository:** DreamwishWand/Wand
**Baseline:** main at f02e5b0 (before this audit branch)
**Decision:** NOT COMPLIANT YET. Migration begins in this change, not a clean-slate rewrite.

## Mandatory target

- Svelte: interactive UI and layout only
- TypeScript: typed UI state, Web Worker protocol, network-free file transfer,
  event dispatch, deterministic lightweight presentation and WASM glue
- Rust compiled to WASM, executed in a dedicated browser Web Worker:
  authoritative save codecs, validation, editing, format-specific parsing,
  large collections/joins, game rules and heavyweight calculations
- Local-only private saves; no network upload, no direct source overwrite.
- No extending the old JavaScript Save Writer or adding new parallel JS game engines.
- Native/game version labels must not become arbitrary incompatibility gates.
- A user can intentionally exceed ordinary game item/stack/unique-ownership limits,
  subject to actual storage representability and validated save structure.
- Python/Node CLIs for **offline data-source extraction and CI** are tools,
  not runtime architecture violations. Auto-generated WASM JS glue is necessary.

## Observed implementation, with grounded entrypoints

| Domain | Working parts already in target | Runtime debt to migrate |
| --- | --- | --- |
| Shell and pages | Svelte UI, typed route components | Some route-level game-specific joins and filtering are still in Svelte/JS |
| Collection | \`crates/wand-collection-core\` Rust/WASM runtime in \`src/lib/collection/runtime.ts\` | \`saved-store-worker-core.mjs\`, \`saved-collection-discovery.mjs\`, \`saved-list-positive-ownership.mjs\`, \`saved-grid-furniture-references.mjs\`, historical DB joins and legacy P1G parsing |
| Save Editor | \`crates/ddv-save-schema\`, \`ddv-save-patch\`, \`ddv-p1g-codec\`; Rust WASM amount-preview/export in Worker | \`src/lib/save/*.mjs\` reference, projection and diagnostics logic; supported Rust ZIP layouts incomplete; no multi-edit Rust session |
| Guide | Svelte routes | \`src/lib/guide/client.mjs\`, \`current-conditions.mjs\`, \`starpath-task-guidance.mjs\` and related game logic |
| Acquisition | Data-source work available | \`src/lib/acquisition/planner.mjs\`, \`index.mjs\`, \`private-dynamic-price-cache.mjs\`, \`native-meal-price-route.mjs\` and other runtime price/recipe logic |
| World | Svelte page and isolated Worker | \`src/lib/world/catalog.mjs\`, \`world-preview.worker.mjs\`, \`saved-world-db04-join.mjs\`, full grid and placement computation |
| DB sources | Structured snapshots from offline tools | Shared runtime decoding/filtering still partly JS; define type-safe Rust-owned DB runtime where heavy computations require it |

A count of .mjs files is **not** a compliance metric by itself: some are
small presentation adapters, data loaders and test CLIs. The problem is **which
production algorithms execute in JS**, not file extensions alone.

## Current implementation in this PR: first live migration

1. \`crates/ddv-p1g-codec::WasmLocalProfileReader\` validates and decodes
   plaintext .profile JSON and supported encrypted P1G inside the isolated Worker.
2. \`saved-store.worker.ts\` and \`saved-profile-native-reader.ts\` are typed
   orchestration, and the **active** Collection Save path invokes Rust/WASM
   before projecting limited data to the UI.
3. Support genuine Steam-style plaintext .profile alongside P1G, removing
   extension-based rejection and preserving existing save-to-manual precedence.
4. Save Diagnostics still uses the JS Codec as primary and Rust/WASM as a
   secondary audit. Migrating that primary path is **not complete**.
5. A bounded **temporary** legacy JS fallback is permitted **only when the
   Rust parser returns ZIP_UNSUPPORTED**. Integrity/JSON/key failures are never
   silently retried through JS. The fallback must be removed when Rust handles
   verified real ZIP variants.
6. Native return strings and all private projections remain Worker-local.
   Browser tests must confirm the actual Rust WASM binary is fetched and both
   plaintext and P1G yield equivalent Collection state.

## Remaining ordered migration work

### P0 — next (do not mark complete early)

- Port Collection's source-sensitive discovery, positive ownership, saved-grid
  references, and store projection to Rust/WASM, preserving strict Worker-to-UI
  redaction, explicit partial-state semantics, and intentional missing objects.
- Make Rust own all supported P1G ZIP formats (incl. real multi-entry variants),
  remove the temporary JavaScript crypto fallback, and test private fixtures
  locally without committing them.
- Consolidate Save Diagnostics and editor patch/export onto a typed, persistent
  Rust/WASM SaveSession in a Worker, with multi-edit, undo and independent reopen;
  restrict direct plaintext exports to explicit local owner actions.
- Extend native Save quantity editing beyond existing slots only after
  grounding inventory/unique-decoration representation. Gameplay item caps are
  intentionally bypassed; storage bounds and game reload remain checks.

### P1 — main service migrations

- Acquisition: Rust recipe/price/currency logic and item-source joins, TS loader
- Guide: Rust quest dependency/condition/search indices, TS data transport
- World: Rust grid placement/default-diff and world catalog computations,
  TS Worker UI protocol; prohibit large synchronous transforms on main thread
- Shared DB: Rust validated typed joins and stable versioned schemas, TS
  lightweight static-data loading and Svelte display

## Completion evidence required

An area is final-architecture compliant only when its real UI invokes its
Rust/WASM core via the intended Worker (not merely when a Rust crate compiles),
the old JavaScript logic is no longer called, and representative browser tests
exercise the same path. Do not treat a synthetic unit test as proof that the
game accepts an edited real save.

Keep PRs vertical and small; do not block unrelated streams or reintroduce
long QA approval gates. No Private repository required.
