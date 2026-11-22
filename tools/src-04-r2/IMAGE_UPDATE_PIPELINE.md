# SRC-04 — future-version image delta workflow

Steam v1.26.2 media is finished: 13,202 items, 9,542 GUIDs, 19,054 verified lossless WebP variants uploaded to private R2. Do not repeat extraction or upload for that version.

**Scope:** tools/src-04-r2/plan_media_update.py uses versioned SRC-00 file scans, SRC-01 native item exports and SRC-04 private v2 image identities to produce a private, source-pinned delta report. It does not change images, game files, R2, DNS, or publication settings.

## Inputs

Baseline (local private):
- SRC-00 source-manifest.json
- SRC-01 source-items/items.jsonl
- SRC-04 private-media-overlay-v2-latest/ (manifest and 256 shards)

Future patched Steam game:
- A COMPLETE new-version SRC-00 source-manifest.json (version verified from FullVersion.txt)
- New-version SRC-01 items.jsonl (Item IDs and GUIDs verified from source)
- Installed target Steam game path, used to independently rehash relevant catalog and image bundles; SRC-00 caches by file metadata, which alone is not cryptographic evidence
- Optional newly extracted exact-guid-links.json (schema below), required when the Addressables catalog changes to revalidate the GUID→Unity path ID association

Example invocation (replace local paths for actual private folders; CLI accepts --help):

    python tools/src-04-r2/plan_media_update.py --base-scan OLD_SCAN --base-items OLD_ITEMS --base-overlay OLD_V2_OVERLAY --target-scan NEXT_SCAN --target-items NEXT_ITEMS --target-game NEXT_GAME_DIRECTORY --out LOCAL_PRIVATE_REPORT.json

The v1.26.2 baseline source-items SHA and private-v2-overlay manifest SHA are pinned by default. An explicitly verified later baseline requires --allow-custom-baseline and --base-overlay-sha. --target-items-sha optionally pins new SRC-01 bytes. Without --target-game, only --allow-unverified-target is permitted, and reuse cannot be marked verified.

Optional metadata proof input (schema wand.src04.exact-guid-links@1):
- privateOnly=true; publicationAuthorized=false; complete=true
- gameVersion matches verified target scan
- sourceScanSha256 matches exact target source-manifest.json bytes
- sourceItemsSha256 matches exact target items.jsonl bytes
- links contains at most one row for each new-version icon GUID; complete=true requires full GUID coverage, while complete=false allows a verified partial subset and leaves missing GUIDs for later relinking
- each row includes iconGuid, bundlePath, sourceBundleSha256, unityAssetId and identityEvidence=exact_catalog_key_and_serialized_bundle_path_id
- bundlePath and sourceBundleSha256 must match the target scan and actual target bytes

**Proofs must be produced by independently checking the new game's Addressables GUID→serialized object mapping. They cannot be invented from names, image similarity or old object offsets.** The schema is ready; future game-version extraction/actual proofs have not yet been performed.

## Result classification

| Status | Meaning | Next step |
| --- | --- | --- |
| reused_verified | SHA-pinned bundle and Unity asset identity unchanged; catalog linkage safely established; actual target bytes independently rehashed | Reuse old thumbnails/original without regeneration |
| needs_source_rehash | Source scan says unchanged, but target bytes have not been independently rehashed | Supply --target-game |
| needs_exact_guid_relink | Catalog/GUID or bundle linkage cannot be safely inferred | Generate new-version exact GUID proof |
| needs_decode | Exact new-version link refers to a new or changed Unity image object | Re-decode just that object and build both lossless WebP variants |

The plan also records catalog changes, changed AssetBundle files, new GUIDs, changed/added Item IDs and prior-only Item IDs (explicitly **not** declared removed because the extraction scope may be partial).

No image bytes, provenance ledgers, R2 credentials, owner saves or private outputs are committed to the public repository. Only a source exact, fully resolved next-version v2 manifest can proceed to separately authorized R2 staging and release.

## Owners

SRC-00: full source scanning/version evidence. SRC-01: native items and GUID export. SRC-04: exact image metadata relinking, changed-object decoding, variant creation and verification. DB-00/DB-01: versioned item source integration. WEB/INFRA: public CDN and client delivery.

## Tests

    python -m unittest discover -s tools/src-04-r2 -p "test_*.py" -v

Tests are synthetic; a future-version acceptance test is possible only once the actual future Steam files arrive.
