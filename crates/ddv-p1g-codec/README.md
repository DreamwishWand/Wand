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
