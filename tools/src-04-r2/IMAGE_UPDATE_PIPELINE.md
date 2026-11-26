# SRC-04 — future-version image delta workflow

Steam v1.26.2 Item media: 13,202 items, 9,542 GUIDs; 14,742 canonical public WebP objects and 257 index objects verified by R2 receipts. Preserve the native originals and the 256px cache; do not repeat extraction or upload for this version. Historical private 128px staging is not the future release path.

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


## Automatic metadata-only GUID probe

The new proof producer tools/src-04-r2/probe_guid_links.py scans selected SOURCE SHA-verified Unity AssetBundles *without decoding their image pixels*. It checks exact 32-hex GUID tokens in Unity container keys and their serialized Sprite/Texture2D object file and path ID. It rejects ambiguous matches.

    python tools/src-04-r2/probe_guid_links.py --base-scan OLD_SCAN --base-overlay OLD_V2_OVERLAY --target-scan NEXT_SCAN --target-items NEXT_ITEMS --target-game NEXT_GAME_DIRECTORY --out LOCAL_PRIVATE_EXACT_LINKS.json

The default scan scope includes prior icon source bundles, all generated-icons bundles, and every bundle newly added or changed in the target SRC-00 scan. Optional --all-bundles scans all bundles (more expensive); --max-bundles can increase the bound from 3000 if explicitly required.

The probe returns a *partial exact-link ledger* with complete=false if some GUIDs cannot be unambiguously resolved or a bundle fails to parse. In that case plan_media_update.py --target-proofs uses any verified subset and leaves the rest as needs_exact_guid_relink. No fuzzy matching, image-byte decoding, automatic substitution, or public release occurs.

This metadata-only proof cannot resolve every possible indirect Unity asset reference; unresolved new-version GUIDs still require the specialized game-source dependency parser. Every next-version change must be tested with actual game files when available.


## Build the next-version 256px Item release

After plan_media_update.py has no unresolved jobs and metadata-only proofs
have been obtained, the existing build_next_media_v2.py CLI invokes build_next_item_256.py. It reuses prior verified native WebP files, the prior root's item-thumbnails-256 encoded-hash cache, and decodes only exact new/changed Unity objects. New list variants use long edge 256 with maximum lossless WebP settings. Small originals are reused as-is. It writes an atomic new local directory with the next source, original/thumbnail overlay, canonical 256px cache, candidate index and generation report.

    python tools/src-04-r2/build_next_media_v2.py --base-root OLD_MEDIA_ROOT --base-scan OLD_SCAN --target-scan NEW_SCAN --target-items NEW_ITEMS --target-proofs NEW_PROOFS --target-game NEW_STEAM_GAME --out NEW_PRIVATE_MEDIA_ROOT

The destination must not exist before execution. Exact old v1.26.2
source-items and v2 manifest SHA pins are enforced; a later independently
validated baseline can be supplied via --base-items-sha and --base-overlay-sha.
Any unresolved GUID, tampered game source, ambiguous Unity object or invalid
WebP aborts before a complete new snapshot can appear. Local copies of the
unchanged images are SHA-verified; shared media files are deduplicated within
the target directory. The result has no public URLs or R2 upload side effects.

## Legacy private R2 staging — historical only

Do **not** use this section for new Item releases. The old staging tool remains for the historical 128px private overlay and its regression tests. The current CLI builds the 256px local overlay instead. For historical reference, stage_media_update.py uses the prior successful private upload report (or
the prior update's verified private source map) plus the new v2 index. It
references previously staged WebP bytes by their exact encoded SHA-256 and
creates new-version objects ONLY for byte-new WebP files. Earlier version
objects remain present and untouched.

    python tools/src-04-r2/stage_media_update.py --prior OLD_MEDIA_ROOT --next NEW_PRIVATE_MEDIA_ROOT

This default mode audits local source bytes and builds a private plan but
makes **no network request**. To review R2 inventory without writes:

    python tools/src-04-r2/stage_media_update.py --prior OLD_MEDIA_ROOT --next NEW_PRIVATE_MEDIA_ROOT --remote-plan --account-id CLOUDFLARE_ACCOUNT_ID

After separately confirming the bucket is actually private and explicitly
authorizing the transfer:

    python tools/src-04-r2/stage_media_update.py --prior OLD_MEDIA_ROOT --next NEW_PRIVATE_MEDIA_ROOT --apply --account-id CLOUDFLARE_ACCOUNT_ID --confirm-private-bucket I_CONFIRM_THIS_BUCKET_IS_PRIVATE

R2 credentials must come from local AWS_ACCESS_KEY_ID and
AWS_SECRET_ACCESS_KEY environment variables. They are never written to source,
reports or GitHub. The destination is the already existing private R2 bucket.
The applied upload checks existing objects with HEAD, never overwrites or
deletes, and writes the PRIVATE source path→R2 object-key map for the next
version. That map is **not** a public distribution manifest.

These tools do not run automatically or on a schedule. When the next genuine
Steam update arrives, all version-specific source evidence still needs to be
supplied by SRC-00/SRC-01. The future-game end-to-end acceptance gate remains
unrun until that source exists.

## Current direct public R2 delta publication

After reviewing the build report, use its `gameVersion`, `sourceItemsSha256` and `privateOverlayManifestSha256` as explicit pins. The root must be the new local build (not the old extraction).

    python tools/src-04-r2/migrate_item_thumbnails_256.py --root NEW_PRIVATE_MEDIA_ROOT --resume --version X.Y.Z --source-items-sha ITEMS_SHA --overlay-sha OVERLAY_SHA

This reconstructs publication inputs without resizing. To publish only missing canonical keys, add `--r2 --prior-receipt OLD_PUBLIC_ITEM_RECEIPT --max-new-uploads N --max-new-bytes N`. The previous verified receipt is intersected with the actual public R2 inventory; unchanged hashes are not uploaded or redundantly HEAD-checked. Pending objects are verified before conditional writes; over-budget plans stop. Review the account-wide free allowance before approving the bounded upload.

Then prepare the new distribution index from the actual image publication receipt:

    python tools/src-04-r2/publish_item_256_index.py --root NEW_PRIVATE_MEDIA_ROOT/item-thumbnails-256 --version steam-X.Y.Z

Review the manifest hash, item count and exact index size. Repeat with `--r2 --expected-manifest MANIFEST_SHA --max-index-bytes N` only after confirming remaining free allowance. The index tool writes/reads back 257 immutable JSON files and no images. Activate the common TypeScript resolver only after verified publication; retain the prior release and all old objects until their references are migrated. Never upload the private source overlay.

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

## Canonical public delivery (Owner 2026-11-24)

All game artwork uses `images/<encoded-sha256>.webp`. Image role, language, game version, service and DLC belong in metadata, not object keys. Keep the global inventory of verified public objects across releases, including previous-only hashes. A new release computes missing encoded hashes locally using `plan_public_upload.py`; its default and only mode is offline, with required caps for new writes and added bytes. Example: `python tools/src-04-r2/plan_public_upload.py --root LOCAL_MEDIA_ROOT --inventory VERIFIED_PUBLIC_KEYS.json --max-new-uploads N --max-new-bytes N --out PRIVATE_PLAN.json`. The prior public inventory is a local JSON object mapping canonical key to verified encoded byte count; it must be built from actual verified public receipts, not private staging. If the inventory is missing, the plan treats every image as new, and does not upload anything. Public upload should write only missing approved game-art objects directly to their final keys with conditional create, then verify before publishing manifests. Existing private staging remains for unapproved source evidence only; do not stage public assets twice. Existing legacy URLs remain intact; no migration, network request or deletion is performed by the planner. Direct R2 execution and published manifest activation remain separate implementation steps.

## Free-tier public serving policy (Owner requirement)

- Use one canonical public host `media.dreamwishwand.com`, linked to the **public-art-only** R2 bucket; keep private source bucket inaccessible. No production `r2.dev` or per-request Worker proxy. Disable the public development URL once the verified custom domain is ready.
- Store approved canonical WebP bytes with `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable`, Standard storage class. The offline plan carries these exact upload attributes. Never mutate a content-addressed object or append version, language, random or service query parameters. A changed byte stream gets a new key. Browser cache retention and edge cache hits are not guaranteed for the full TTL.
- Configure a Free-plan Cache Rule scoped to the media host and `/images/` path; eligible for cache, respect the long successful-response cache headers, short or no caching of errors, ignore query strings only for this immutable public image path if the available settings permit it. Enable Smart Tiered Cache on the Free plan; no paid Cache Reserve, Argo Smart Routing, Images transformation, Workers or Smart Shield paid add-ons without Owner approval. Do not purge all images on game updates.
- DB-01 and service projections should carry verified image hashes alongside existing item records; when feasible ship compact immutable lookup metadata from the application static host rather than requiring additional R2 index requests. No network request per item to resolve its URL, and no HEAD-before-GET in the UI. Shared fallback catalog readers must memoize in-flight requests. If R2-hosted JSON indexes are used, explicitly cache immutable successful JSON responses (JSON is not cached by default).
- Collection/Explorer: reuse ItemArtwork and the existing viewport virtualization, request only visible cards plus a small buffer, not all categories/items or original images at initial render. Thumbnail by default, original only for explicit detail/zoom. Shared UI icons should use stable keys; Wand-authored SVG stays bundled. Do not repeatedly retry missing images; show local placeholder and retry only on explicit refresh/new release.
- Review account-wide R2 storage and Class A/B billing metrics, CDN hit ratio and unexpected external traffic. Recommended alert levels 50/80/90 percent of free allowance; alerts are not hard caps. Do not promise zero charges from a public endpoint. Rate-limit abusive traffic using available free controls only, without blocking legitimate browsers. If growth threatens the budget, Owner decides on temporary image suppression, free-tier controls or other hosting before enabling any paid feature. Do not bulk warm CDN or perform full-corpus remote GET audits for every release; reuse verified receipts, verify changed bytes only, sample actual CDN headers on a few representative assets. No live Cloudflare change is made by this repository policy.

Official references: https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ ; https://developers.cloudflare.com/cache/how-to/tiered-cache/ ; https://developers.cloudflare.com/r2/pricing/ .
