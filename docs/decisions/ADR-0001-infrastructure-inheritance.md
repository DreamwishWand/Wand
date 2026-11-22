# ADR-0001 — Infrastructure decisions inherited into the new Wand project

- Date: 2026-11-21
- Status: **Owner-confirmed for R2 adoption, no production GitHub Pages, existing Supabase/Resend accounts.** Other deployment details below are inherited architecture references and remain subject to implementation verification.
- Repository: `DreamwishWand/Wand`
- Scope: production architecture and SRC-04 asset pipeline. **This document does not reinstate the previous project's development process, stream orchestration, QA bureaucracy, or old repository structure.**

## Preserve the owner's decisions

1. **Cloudflare R2 is the intended storage service for Wand images and other large media/object assets.** This is a carry-forward decision from the old project, not a newly proposed alternative. Implement the new project using this target.
2. **GitHub Pages will not be used for the official production release.** It may continue to serve a temporary developer/test environment until replaced.
3. **GitHub remains the source-control, PR, build/CI and release automation system; not the production large-image storage backend.**
4. **Supabase is already registered.** Its deployment-specific Auth/PostgreSQL/RLS configuration still needs to be validated, not treated as finished merely because the account exists.
5. **Resend is already operational; `support@dreamwishwand.com` has been tested for inbound email.** Do not repeat initial account/onboarding setup.
6. **Save editing stays client-side (Rust/WASM); the user's save file is not uploaded to a server as part of normal editing.** Optional future cloud synchronization is a separate service and decision.

## Old architecture to carry forward as a technical baseline

- The earlier preferred production separation was `GitHub = source/CI`, `Cloudflare = production delivery/runtime`.
- `Cloudflare Workers + Static Assets` was the previous reference architecture for serving the SvelteKit frontend, Rust/WASM, CSS, static game data, with Workers for narrowly scoped server-side APIs.
- Large object media is served from **R2, preferably through a Cloudflare custom domain and CDN cache**, rather than routing ordinary image bytes through Workers.
- `Supabase PostgreSQL + Auth` is the backend database/authentication direction.
- `Resend` supplies transactional/support email infrastructure.
- Production image artifacts, published database data, and the deployed website must have explicit visibility boundaries; never treat a private media source-index or build fixture as a public asset.
- Media delivery should deduplicate assets, use hashed immutable keys, explicit release manifests, cache control, and version-aware rollbacks.

**Hosting implementation decision still open:** Whether the new SvelteKit application deploys through Workers Static Assets or Cloudflare Pages must be evaluated against the new architecture. Both are Cloudflare production-hosting options, but **neither implies GitHub Pages for production**. Do not mistakenly label Cloudflare Pages as the already owner-approved final choice.

## SRC-04 MEDIA: approved output contract, not yet public

The owner approved precisely two lossless WebP variants per decoded image:

| Variant | Production use | Resolution |
|---|---|---|
| `thumbnail` | Collection, Explore, list/search grids | Longest side ≤128px, resize with quality filtering, no upscaling |
| `original` | Item details | Exact native decoded pixel width/height, no resizing |

Steam v1.26.2 SRC-01/SRC-04 processing reported 13,202 mapped Item IDs and 9,542 native image GUIDs. The final private v2 256-shard index was independently inspected as metadata. V2 source manifests and generated files remain **private**. Actual WebP byte-level validation and production delivery have separate release gates. **Update (2026-11-22): local WebP byte-level verification passed; production delivery remains unperformed.**

### R2 delivery boundary

- **Source asset files, game Unity bundles, private extraction reports and owner save files stay out of public repositories and public buckets.**
- **The SRC-04 private v2 overlay is not a public CDN manifest**. It references private local source paths and carries `publicationAuthorized=false`.
- Only a separately verified **public export**, after explicit rights/release approval, may be placed in an R2 public media namespace.
- The precise R2 bucket name, split between private and public buckets, production Cloudflare account/credentials, custom hostname (a previous example was `media.dreamwishwand.com`), CDN caching policy, and production DNS cutover have **not been confirmed as already provisioned** in the new project.
- Do not create production buckets, change DNS, enable public reads, write secrets to GitHub, or upload copyrighted game media into a public endpoint without explicit owner authorization for those sensitive deployment operations.
- Image publication permission and image generation correctness are separate tests.

## Modernization boundary

Keep the **agreed product/security/storage principles**; reimplement delivery, tests, and automation efficiently in the new `DreamwishWand/Wand` repository. Do not migrate the old project's workflow/approval queues or duplicate completed validation tasks just because the architecture is inherited.

### Immediate implementation sequence

1. Locally verify each produced WebP actually contains lossless VP8L frames and that file hashes, alpha and native dimensions match the private v2 index.
2. Build an idempotent R2 sync tool that supports dry-run, SHA-backed incremental upload, prefix/version staging, report-only mode, and safe rollback. Do not perform a production upload in this ADR.
3. Prepare a separate publish-gated media manifest (Item ID → thumbnail/original hashed objects) that strips private source fields and is activated only after rights review.
4. Implement the Cloudflare production deployment and CDN media reader independently from the legacy workflow; make the cutover reversible.

## SRC-04 Steam v1.26.2 — completed local verification (2026-11-22)

Local execution report `wand.src04.r2-stage@1` (reviewed from owner-supplied output) confirmed `complete=true`, `status=verified_local`:

- `filesVerified=19054`: 9,527 thumbnails and 9,527 native originals
- Verified total: `854529084` bytes (~814.94 MiB)
- Item/identity coverage: 13,202 Item IDs, 9,542 unique GUIDs; 256 verified shards
- Exact v2 private manifest SHA-256: `fd2d07d541293a19ac7b845e996ccf4e3af41270c79daaa56b2ff74316a45e9f`
- Local auditor checked SHA-256, WebP RIFF VP8L losslessness, and decoded dimensions; `sourceFilesModified=false`
- **No R2 transfer**, DNS/CDN changes, or public release: `publicationApproved=false`, `uploadedToPublic=false`

Treat image extraction, v2 indexing, and local byte verification as **finished for Steam v1.26.2**. Do not rerun these expensive tasks unless the inputs change or new evidence indicates a defect. Remaining step: provision/confirm an actual **private** R2 bucket and perform an explicit remote plan, then separately authorize an upload.

## R2 private staging readiness (2026-11-22)

Owner screenshots verified a newly created `dreamwishwand-media-private` Cloudflare R2 bucket with **Public Access disabled**, Standard storage class, and zero bytes initially stored. An R2 Account API token scoped to that bucket with **Object Read & Write** appeared **Active** in Cloudflare dashboard. Never store any associated Access Key ID or Secret Access Key in the repo or conversation.

Owner-provided local report `wand.src04.r2-stage@1` confirmed read-only R2 connection + immutable source audit:

- `status=remote_plan_complete`, `complete=true`
- `remote.bucket=dreamwishwand-media-private`, `remote.mode=remote-plan`
- `remote.prefix=private/staging/src04/steam-v1.26.2/fd2d07d541293a19`
- `remote.existingVerified=0`, `remote.wouldUpload=19054`
- `localAudit.filesVerified=19054`, `localAudit.totalBytes=854529084`
- `publicationApproved=false`, `uploadedToPublic=false`

**Next step**: the owner must explicitly execute the private upload tool with locally entered credentials; review its `private_staging_uploaded` report and verify `remote.totalVerified=19054`. The report does **not** imply uploads are already complete. Public/CDN configuration remains untouched and requires separate authorization.

## R2 private staging complete (2026-11-22)

Owner-uploaded Windows report `src04-r2-stage-report(2).json` was reviewed. This supersedes the earlier pending/remote-plan status. The report states:

- `complete=true`, `status=private_staging_uploaded`
- `remote.mode=private-staging-upload`, `remote.bucket=dreamwishwand-media-private`
- `remote.prefix=private/staging/src04/steam-v1.26.2/fd2d07d541293a19`
- `remote.uploaded=19054`, `remote.totalVerified=19054`, `remote.existingVerified=0`
- `localAudit.filesVerified=19054` (9,527 thumbnail and 9,527 original); total `854529084` bytes
- Source Item IDs `13202`; distinct image GUIDs `9542`; SHA-verified private shards `256`
- Exact manifest SHA-256 `fd2d07d541293a19ac7b845e996ccf4e3af41270c79daaa56b2ff74316a45e9f`
- `publicationApproved=false`, `uploadedToPublic=false`, `sourceFilesModified=false`

**Result:** All 19,054 objects are reported uploaded to the *private* R2 staging prefix and their HEAD size + SHA-256 user-metadata checked by the uploader. This is not an independent remote GET/download checksum audit or public distribution. Do not perform extraction, re-encoding or re-upload again for this version without a specific defect or changed source. Next work is a separately reviewed, stripped distribution manifest and publication/CDN path.
