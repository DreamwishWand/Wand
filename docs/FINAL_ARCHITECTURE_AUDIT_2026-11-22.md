# Dreamwish Wand — final-architecture compliance (2026-11-22)

**Contract:** SvelteKit/Svelte 5 for interface; TypeScript for Web Worker messaging, browser IO, UI state and transport; Rust/WASM for Collection state/search and Save parsing/editing/reconstruction and computationally heavy product logic. Build-generated wasm-bindgen JS and development ETL scripts are permitted. Supabase is the intended canonical backend for community features; local personal saves are not uploaded.

## Application audit of main 7efc381

- Collection: src/lib/collection/runtime.ts invokes Rust CollectionEngine (search, facets, state, workspaces) from Svelte. However, local P1G loading and save-state projections have remained in handwritten JS. This PR migrates the primary P1G read to Rust/WASM inside a one-shot Worker. **Partially compliant.**
- Save: Rust crates ddv-p1g-codec, ddv-save-patch and ddv-save-schema exist, and an experimental Rust Worker amount preview/copy exists. src/lib/save/registry.mjs and diagnostics-worker-core.mjs and other domain modules remain handwritten JS. Production Writer is not complete. **Not compliant.**
- World: native grid/world preview and domain operations are mainly in src/lib/world/*.mjs, invoked by a JS Worker, not a Rust computational core. **Not compliant for compute-heavy editing.**
- Guide and Acquisition: substantial untyped JavaScript model/business code remains under src/lib/guide and src/lib/acquisition. Migrate to typed TS interfaces, with Rust where computation/format parsing justifies it. **Not compliant.**
- DB-00: client/model.mjs contain product validation, merging, diff and search logic in JS. Node CLI tooling is exempt, but duplicated browser business logic is migration debt. **Partially compliant.**
- Deployment: GitHub Pages preview exists. It does not demonstrate completed Cloudflare/R2/Supabase production integration.

## Enforced migration boundary

tools/architecture/check-production-stack.mjs locks the existing set of **92 handwritten JS/MJS app modules**. They are NOT approved as final architecture. They may be deleted as equivalent Rust/TS paths go live, but newly introduced JS/MJS modules under src/lib or src/routes fail CI. Generated WASM glue, Node scripts and test files are excluded.

## Functional migration sequence

1. Complete Rust P1G ZIP compatibility, remove the JS decoder fallback, and port Collection saved-state/read projections into Rust; test Collection browser import and restore.
2. Port Save diagnostics, shape/reference analysis and Inventory/Chest Writer operations to Rust/WASM Worker + TS; verify open, edit, explicit export and independent reopen.
3. Move native-grid/world preview and editing computations to Rust/WASM; keep unsupported collision and unsafe persistent writes disabled.
4. Migrate DB-00 shared product models and Guide/Acquisition browser logic away from handwritten MJS into typed TS/Rust, preserving source hashes and exact version constraints.
5. Connect separately authorized community features to Supabase rather than a duplicate backend. Do not upload local saves.

Completion criterion: functioning Svelte -> TypeScript -> Rust/WASM -> result path with synthetic and real-browser validation, not just a Rust crate with no product connection.
