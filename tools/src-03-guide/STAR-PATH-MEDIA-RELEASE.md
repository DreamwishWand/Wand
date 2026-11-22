# DB-03 GUIDE — Star Path public image release gate

## State on 2026-11-22

- Steam v1.26.2 source-backed reward candidates: **60 distinct Item IDs**.
- Public `DB-01 steam-1.26.2-native-itemlist-v1`: **43** verified four-category items with 8-language original labels. These are the **only currently eligible SRC-04 Item ID associations**.
- The other 17 IDs comprise 9 separately verified non-DB01 categories and 8 unnamed `TouchOfMagic` motifs, all with verified source identities but **outside** the four-category SRC-04 public candidate. No image ID joins for these 17 are asserted.
- SRC-04 privately audited and staged **19,054 lossless WebP variants** on a **private R2 bucket**, under an explicitly **unpublished** distribution candidate. Its `private/` object prefix is not an authorization token and no private URL can be inferred or exposed.
- **Production state: unactivated.** `STARPATH_MEDIA_ACTIVATION.state === 'unpublished'` and all URL/hash configuration values are `null`. The browser makes **zero** manifest and thumbnail requests and does not display speculative images.

## Consumer release contract

`src/lib/guide/starpath-public-media.mjs` provides a separate explicit-source-controlled gate. Never set it to `published` merely because `distribution-candidate/manifest.json` exists. A public promotion must be completed by SRC-04 with a separately audited public CDN/namespace.

The only accepted release format is a **curated, public, source-backed Guide subset**, not the owner-private full R2 list. Sample *schema* below; all IDs, digests, byte sizes and URLs in real releases must come from actual verified public objects:

```json
{
  "schema":"wand.db03.starpath-public-media@1",
  "target":{
    "platform":"Steam",
    "gameVersion":"1.26.2",
    "db01Release":"steam-1.26.2-native-itemlist-v1",
    "src04Release":"steam-v1.26.2"
  },
  "release":{
    "state":"published",
    "publicationAuthorized":true,
    "publicObjectByteAudit":true,
    "publicReadbackVerified":true,
    "releaseId":"<real-immutable-release-id>",
    "sourceCandidateSha256":"<exact-64-hex-candidate-sha256>"
  },
  "items":{
    "<verified-four-category-item-id>":{
      "thumbnail":{
        "key":"media/steam-v1.26.2/thumbnail/<2-hex>/<sha256>.webp",
        "sha256":"<64-hex-encoded-webp-sha256>",
        "bytes":1,
        "width":128,
        "height":128
      },
      "original":{
        "key":"media/steam-v1.26.2/original/<2-hex>/<sha256>.webp",
        "sha256":"<64-hex-encoded-webp-sha256>",
        "bytes":1,
        "width":512,
        "height":512
      }
    }
  }
}
```

**This is a schema illustration, not an authorized release**: placeholder IDs, digests and bytes above are intentionally unusable. Real release records require both thumbnail and original metadata, strict encoded-content SHA path equivalence, positive byte sizes, dimensions, and the source-verified reward Item ID. The full manifest must contain **1–43** current supported ID rows; it must not refer to the private 17 or any unverified media associations. Shared assets can reuse the same digest, provided sizes and dimensions match. The release manifest contains no raw Unity GUID, asset ID, private R2 key, private bucket, signed URL, user data, credentials, source archive, or source-specific binary bytes.

## Activation procedure for SRC-04 / owner

1. SRC-04 completes a **separate public media promotion**, records an actual affirmative publication decision, verifies the public bucket/domain can be fetched without credentials, and confirms content-addressed image URL paths. The source candidate is not the production release.
2. Read back **all files used by the Star Path subset** directly from the final public CDN and independently compare encoded WebP SHA-256, bytes, MIME type, dimensions and source Item ID mapping. Flag missing or substituted objects; do not silently omit them or fall back to private R2.
3. Generate a *minimal* UTF-8 `\n`-terminated JSON manifest following the format above. Pin its exact SHA-256 and byte count. Name it `static/guide/public/starpath-media-<first-12-hex-of-sha256>.json`; make the file public only after public object readback has passed.
4. In `src/lib/guide/starpath-public-media.mjs`, change `STARPATH_MEDIA_ACTIVATION` to `published` and pin `manifestPath`, `manifestSha256`, `manifestBytes` and the **verified** HTTPS public origin. Currently the only acceptable origin hostnames are `media.dreamwishwand.com` and `cdn.dreamwishwand.com`; neither is presumed to be configured. If the approved production domain differs, update and review the code allowlist, not a user-supplied URL.
5. Verify with `node --test tests/guide-starpath-public-media.test.mjs`, full `npm test`, `npm run check`, `npm run build` and `node browser/guide-smoke.mjs`. For a published release, extend Playwright to verify image loading and a corrupt/404 media manifest failure without exposing private images.

**Runtime security boundary:** the browser checks the exact manifest *bytes* against the source-controlled SHA-256 **before** trusting it, validates the original 60-ID reward census and all row paths, and constructs image URLs solely from pre-approved public origins and encoded-SHA-only paths. The browser does **not** independently download/hash the actual CDN WebP object; SRC-04 must provide verified public readback, and the production CDN must serve immutable objects. The published state and publication claim in JSON alone are insufficient; the separately source-controlled, content-hash pinned activation is mandatory.

The existing private SRC-04 source validation, staging report and sanitized distribution candidate remain unchanged. No R2 bucket permissions, DNS, external publication or credentials are altered by this Guide feature.
