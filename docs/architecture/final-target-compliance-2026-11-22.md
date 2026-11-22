# Dreamwish Wand — final architecture compliance audit (2026-11-22)

## Verdict

NOT FULLY COMPLIANT. The required runtime is Svelte presentation, TypeScript UI and Worker transport, and authoritative Rust/WASM game logic executed in isolated Web Workers. Owner Save processing must remain local-only. Offline data extraction tools, tests and wasm-pack generated JS glue are not runtime violations.

## Grounded runtime audit

| Service | Compliant implementation | Remaining runtime migration |
| --- | --- | --- |
| Collection | Svelte UI and Rust/WASM collection core; typed Rust-first encrypted P1G Worker from PR #282 | JavaScript saved Collection discovery, positive ownership, grid furniture and store projections; legacy P1G decoder remains solely as unsupported-ZIP fallback |
| Save Editor | Rust/WASM schema, exact Amount patch, ZIP codec and TS Worker from PR #282 | Save Diagnostics, registries and readset logic still partly JS; no persistent Rust multi-edit SaveSession or actual game reload verification |
| Guide | Svelte presentation | Guide and Star Path game-specific logic still in src/lib/guide/*.mjs |
| Acquisition | Offline source data extraction and browser UI | Recipe, ingredient, shop and currency/price game-specific logic still in src/lib/acquisition/*.mjs |
| World | Svelte UI with Worker | Catalog, grid/placement and source joins still largely in src/lib/world/*.mjs |
| Shared DB | Versioned data snapshots | Heavy runtime joining and game rules are not yet unified as Rust/WASM-owned operations |

## Immediate migration in this PR (on top of already merged PR #282)

- Reuse PR #282's production Rust-first P1G decoder and typed Collection Worker; do not duplicate or revert it.
- Add WasmPlainProfileReader to existing Rust P1G crate: strict plaintext UTF-8 JSON .profile validation with chunked transport and buffer zeroization.
- Add typed Worker-only plaintext adapter, routing Collection imports by inspected bytes rather than .profile filename.
- Preserve current redacted Collection state projections and read precedence while migrating decoding to Rust/WASM.
- Extend synthetic Chromium end-to-end Collection checks to compare identical imported state from plaintext JSON and encrypted P1G.
- Never expand handwritten JavaScript game logic; follow the repository's architecture guard.

## Incomplete: ordered migration work

1. P0 Collection: migrate saved discovery, positive ownership and grid/store reference projections to Rust/WASM, retain the redacted TS Worker reply.
2. P0 Rust ZIP: support verified non-single-entry P1G layouts; remove narrowly scoped legacy JS decoder fallback without breaking compatible real saves.
3. P0 Save: consolidate codecs, diagnostics and editing in persistent typed Rust/WASM SaveSession with multi-edit and revision/undo; independently verify edited real save import and game reload.
4. P1 Acquisition: migrate runtime recipe/price/currency logic to Rust/WASM.
5. P1 Guide: migrate quest/dependency/search and Star Path calculations to Rust/WASM.
6. P1 World: migrate terrain/grid/object placement and catalog matching to Rust/WASM.
7. P1 Shared DB: typed and versioned Rust-owned heavy joins reused across services.

## Contract safety rules

- Editing is local-only with user-initiated export; never automatically overwrite an original Save or upload one.
- User-intended quantities can exceed ordinary game stack and one-only decoration limits. Validate structural and numeric safety, not gameplay maxima.
- Incomplete/modified saves with missing quest objects are not inherently corrupt.
- The exit criterion is a real UI path executing the Rust/WASM implementation in an isolated Worker and no longer executing old handwritten JavaScript domain algorithms. A Rust unit test or successful build alone is insufficient.
- No real save originals, raw player data, decoded private profiles or edited copies belong in the repository.
