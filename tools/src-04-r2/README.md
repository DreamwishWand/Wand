# SRC-04 MEDIA → Cloudflare R2 staging

**Current status:** Local source v2 metadata passed prior cross-check; image bytes remain on the owner's Windows PC. This tool performs actual byte-level verification, then (only if explicitly requested) synchronizes verified images into a **pre-existing private Cloudflare R2 bucket**.

**Production release is NOT performed by this tool.** It never enables a public bucket or custom domain, changes ACLs/DNS, deletes images, uploads raw Unity bundles/private manifests, or deploys to GitHub Pages.

## Input/output

Source on Windows:

\`%USERPROFILE%\Documents\DreamwishWand\SRC-04 MEDIA\Steam-v1.26.2\`

Required inputs from previous local extraction:
- \`source-items/items.jsonl\` — immutable SRC-01 source (exact known SHA-256)
- \`private-media-overlay-v2-latest/manifest.json\` and all 256 \`id/XX.json\` shards
- \`images-v2/thumbnail/..\` and \`images-v2/original/..\` — the actual WebP bytes.

The tool checks all 13,202 Item ID/GUID relationships, 9,542 GUID identities, every source item/hash/shard metadata, and every unique variant byte SHA-256 and native dimensions. It parses RIFF/WebP VP8L framing to **reject lossy WebP**, then decodes with Pillow to confirm dimensions; WebP source alpha equivalence cannot be independently established without rereading native Unity originals.

Writes \`src04-r2-stage-report.json\` into the local output root and prints progress. Logs may be kept separately; **the report contains no credentials**.

## 1. Local-only audit (no network)

Download \`stage_media_v2.py\` and \`SRC04-R2-AUDIT.cmd\` into the same Windows folder. With Python 3 and Pillow installed (already used during SRC-04 extraction), double-click \`SRC04-R2-AUDIT.cmd\`.

Or in terminal:

\`\`\`powershell
py -3 -m pip install Pillow
py -3 stage_media_v2.py
\`\`\`

This action does **not** require boto3 or any Cloudflare account/token; it never uploads images. Upload just \`src04-r2-stage-report.json\` into the conversation for review.

## 2. Preview future R2 changes (read-only network access)

Only after creating a **private** bucket and scoped R2 API token via Cloudflare:

\`\`\`powershell
py -3 -m pip install boto3
# Supply R2_ACCOUNT_ID, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY as
# local environment variables; do not place secrets in files or chats.
py -3 stage_media_v2.py --remote-plan --bucket YOUR_PRIVATE_BUCKET
\`\`\`

Uses Cloudflare R2's S3 API endpoint \`https://<account-id>.r2.cloudflarestorage.com\`, region \`auto\`, and LIST/HEAD to identify only missing objects.

It does not upload anything. Use **read-only** R2 permissions for \`--remote-plan\` if possible.

## 3. Explicit private staging upload (not automatic)

After the owner explicitly approves transfer and the bucket's private/public-access status is confirmed separately through the Cloudflare dashboard:

\`\`\`powershell
py -3 stage_media_v2.py --apply --bucket YOUR_PRIVATE_BUCKET --confirm-private-bucket I_CONFIRM_THIS_BUCKET_IS_PRIVATE
\`\`\`

The script verifies *all local files first*. It uploads only missing content-addressed image files, under an immutable staging prefix such as:

\`private/staging/src04/steam-v1.26.2/<manifest-hash-16>/images-v2/thumbnail/<content-prefix>/<content-hash>.webp\`

Uploaded objects carry \`x-amz-meta-sha256\`, \`image/webp\` Content-Type, and \`Cache-Control: private, no-store\`. Every upload uses a conditional \`If-None-Match: *\` and HEAD verification. Existing matches are skipped; conflicting metadata fails closed instead of overwriting. R2 ETag is **not** used as SHA-256. Interrupted runs can restart safely, because uploaded objects are rediscovered and validated by LIST/HEAD. No deletion, publication or manifest activation occurs.

**Important:** An R2 object prefix named \`private/\` is **not an access control**. The destination bucket must actually be private, with no public custom domain or r2.dev access. The tool cannot prove bucket visibility via the S3 interface and therefore requires explicit external confirmation and \`--confirm-private-bucket\`. The bucket/token must be provisioned and managed out of band; secrets must never be embedded in the repository or an upload report.

## Release boundary and next stage

The final release process will:
1. Verify this report contains a successful local byte audit (no lossy images, mismatched dimensions or hashes).
2. Verify the private staging upload and retain the exact source v2 index and manifest SHA.
3. Generate a separate, stripped, rights-approved **public distribution manifest**, mapping Item IDs to immutable public media keys without including private paths, Unity object IDs, save files, or source bundle data.
4. Promote eligible objects into a **separate public R2 namespace/bucket** and enable CDN custom-domain caching only after explicit rights/production authorization.

Neither SRC-04's owner-approved **two-variant image format** nor choosing Cloudflare R2 by itself constitutes permission to publish.

Source: Cloudflare R2 documentation, S3 API endpoint and boto3 configuration:
- https://developers.cloudflare.com/r2/get-started/s3/
- https://developers.cloudflare.com/r2/examples/aws/boto3/
- https://developers.cloudflare.com/r2/api/s3/conditional-operations/
