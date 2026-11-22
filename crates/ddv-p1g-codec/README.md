# DB-05 P1G — native Rust interoperability laboratory

This crate is a source-only, synthetic-fixture-first Rust implementation
of the game's existing AES-256-ECB + PKCS7 packaged-profile envelope and
single-profile ZIP layout. It does not add another JavaScript writer.

Scope:
- decrypt P1G locally, require exactly one ZIP entry called profile
- support stored (0) or raw deflate (8) entry
- reject multi-file ZIP, encryption flags, data descriptors, ZIP64, missing
  or malformed headers, inconsistent CRC/length and malformed JSON
- validate GameInfo.Version, Player and World roots without comparing a Steam
  or Switch build number
- no-op returns the exact original encrypted bytes (not recompressed)
- native-only opt-in laboratory function combines the existing Rust exact
  Amount-token patch with ZIP CRC/length updates and AES re-encryption
- immediately decrypt/reopen every generated synthetic candidate and compare
  the patched JSON bytes exactly
- keeps unknown JSON members/escaping/ordering/number formatting unchanged
  and preserves original ZIP header metadata, filename, extra and comment

Run:
    cargo test --manifest-path crates/ddv-p1g-codec/Cargo.toml --features native-p1g-lab

The native-p1g-lab feature is compiled OUT of the wasm32 target by design.
No browser UI, product save download, live Writer, save replacement, ownership
authorization or real-save validation exists in this feature.

This codec deliberately refuses archives other than a minimal supported
single-profile ZIP; this is not a claim that all Steam/Switch save envelopes
are identical. Input size cap: 128 MiB. Before product release, run the
private real profile specimens through decrypt/no-op/edited roundtrip and
independently verify exact ZIP metadata, game reloading, item quantity caps
and access restrictions. Never commit original saves, decrypted JSON,
identifiers, private report values, or generated patched P1G copies.

Pending:
1. independently compare this native Codec with the mature JS read-only
   reference and owner-private genuine Steam 1.26.2 and Switch structures
2. implement a Worker-only Rust/WASM SaveSession with bounded chunk transfers
3. preserve multi-entry ZIP or fail closed in all unsupported cases
4. validate real game engine acceptance and semantic inventory/chest invariants
5. expose a user-initiated export ONLY after completing the above gates

## Browser Worker integration (read-only; independent native audit)

With `--features wasm`, `WasmP1gAudit` accepts an encrypted P1G in
at most 1 MiB chunks, with a total limit of 32 MiB. It independently
decrypts, parses the supported single-profile ZIP and verifies its CRC,
strict JSON keys and required roots. It emits only the SHA-256 of the
original validated UTF-8 profile **to its calling Worker**, never to a
page component.

`src/lib/save/save-native-p1g-audit.mjs` compares this private digest
with the output of the existing independently validated JS P1G read Codec,
then destroys the digest and emits only a fixed anonymous status:
`matched`, `diverged`, `rejected_by_rust`, `skipped_large_save`, or
`unavailable`. The existing diagnostics workflow is not blocked if
the new Rust reader rejects an uncommon ZIP envelope already accepted by
the legacy JS Codec; the result remains read-only. Rust/WASM is **not**
yet a replacement for the complete multi-entry-capable JS reader.

No private fingerprint, decrypted bytes, item IDs, personal values,
or arbitrary native exception text cross the Worker/page boundary.
The Rust code zeroizes owned encrypted/decrypted buffers when released,
although this does not guarantee erasure of copies managed by the browser.

Build:
```sh
wasm-pack build crates/ddv-p1g-codec --release --target web --out-dir ../../src/lib/save/wasm/p1g-pkg --features wasm
```
CI separately executes a synthetic encrypted P1G upload in a real
Chromium Worker and verifies that the compiled WASM module loaded and
returned an independently matching decode. This is not a genuine
Steam/Switch game-save round-trip and cannot authorize exporting edits.
