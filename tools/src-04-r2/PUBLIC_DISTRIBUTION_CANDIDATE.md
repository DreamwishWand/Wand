# SRC-04 — sanitized public catalog candidate

The owner has completed Steam v1.26.2 SRC-04 extraction and a full 19,054-file lossless WebP local audit. A verified local report records 19,054 successful private R2 staging uploads, 13,202 Item IDs, 9,542 GUIDs and 256 v2 shards. Private R2 bucket: \`dreamwishwand-media-private\`; public access remained disabled.

**Do not re-extract or re-upload those 19,054 source files.**

The distribution candidate is generated **locally** using \`build_public_candidate.py\` alongside the existing \`stage_media_v2.py\`. No R2/HTTP calls occur in this generation step; no public bucket or CDN access is enabled.

Inputs already present in the local SRC-04 output:
- \`src04-r2-stage-report.json\` with \`status=private_staging_uploaded\`, \`remote.totalVerified=19054\`
- Source-pinned \`private-media-overlay-v2-latest/manifest.json\` and 256 verified shards
- Source-pinned \`source-items/items.jsonl\`

Outputs:
- \`distribution-candidate/manifest.json\` and \`id/00.json\` … \`id/ff.json\`: **sanitized, unactivated** public catalog, with only Item ID, thumbnail/original public object key, and dimensions
- \`src04-private-promotion-plan.json\`: **private, sensitive** mapping of private R2 source keys to future public R2 object keys, exact encoded WebP byte SHA and size; do not check this into public GitHub or deploy it with static assets
- \`src04-distribution-candidate-report.json\`: candidate counts/hashes, no image bytes/credentials

Object keys for future public delivery are **encoded WebP SHA-256 keyed**, not Unity GUID or decoded-source hashed. Example:
\`images/<sha[0:2]>/<encoded-webp-sha>.webp\`.
Identical encoded WebP assets deduplicate across game versions, services and variants. Original and thumbnail are logical references, not physical namespaces. The game version remains in manifests and private source staging paths, never in newly generated public image keys. Preserve existing published keys; copy existing R2 bytes server-side to canonical keys only when missing, verify SHA and size, and do not delete old objects.

Candidate manifests have \`releaseState=candidate_unpublished\` and **must not be treated as production public metadata until a separate release/rights approval and publication step**. The source v2 manifest itself retains \`publicationAuthorized=false\` by design. This tool neither changes it nor turns it into a release flag.

At release time, the future promotion tool must copy only vetted objects to an explicitly public R2 bucket or namespace, and then activate a separate published release manifest atomically. It must never copy the private promotion plan, Unity object IDs, source bundle hashes, private reports, or any save file into public assets.

Code tests:
\`python -m unittest discover -s tools/src-04-r2 -p 'test_*.py' -v\`

## Shared application lookup

Use `itemMedia.getItemImage(itemId, 'thumbnail' | 'original')` from `src/lib/media/item-media.ts` for all game item views. A verified public release publishes a `wand.media.distribution@1` manifest with `releaseState: published` and the existing sanitized shard format under `index/items/<gameVersion>/<manifest-sha256>/manifest.json` and `id/xx.json`. Pin the manifest bytes and SHA in the application only after public image readback. The private candidate is not accepted. Lookups download only the requested Item ID shard and share the result between services. UI/map/memory assets use the existing shared media client. Image keys are independent of this index path.
