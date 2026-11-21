# Steam v1.26.2 — native Tag exact multilingual display names (private)

This is an independent supplement to the source-verified native Tag identity
index. It **does not** change SRC-02 r5 or publish original localization ZIPs.

Eight full owner-private Steam v1.26.2 `ddv_Data/StreamingAssets/Localization/
LocDB_*.zip` archives were re-opened from the game-source archive, verified
**byte-for-byte SHA-256** against the independent SRC-01 format probe, and
individually inspected for `Tag.locbin`. The complete native Tag ID corpus
contains **409** `TagItemData` rows; every one of the eight `Tag.locbin` files
contains exactly **409** source-localized key/value entries. The join
`TagItemData.DisplayName == 'Tag.' + Tag.locbin.key` is exhaustive in all
languages, with zero missing, duplicate, extra, or empty values:

| locale | full ZIP original name | source SHA-256 |
| --- | --- | --- |
| en | `LocDB_en-US.zip` | `792b400f79bd29440d2d6d624c16e92ce380a3b927ebf2c7e9b7f19121acda86` |
| fr | `LocDB_fr.zip` | `2769b7694887f0cd4331c01ebe63faa2b933f45c4e25b54434a2ba32249ec970` |
| it | `LocDB_it.zip` | `dae2f265496cb60a525cd170f82f82b5e21f8194dcf9140865a57284360cbdbf` |
| de | `LocDB_de.zip` | `bf545ab41e59ae2a28974d4ce8ff1d3e926ee0b7a196caf5fa1f46d5d9802538` |
| es-ES | `LocDB_es.zip` | `7daabcde7b39e152eee704216f5ed80e0c7a0a3ed7235f5b474e045c02cedaf5` |
| ja | `LocDB_ja.zip` | `071e495bc199898078f75c3c5aef51f1c7abc92da699a65578d109fbb9bd7758` |
| zh-CN | `LocDB_zh-CN.zip` | `977b8f9b8568cf6e2aac8d46f558e2748ba32e54bd9bf443c8175227ca80993c` |
| pt-BR | `LocDB_pt-BR.zip` | `ef5e376fc1f9f0f72e82bd85839d4241c7c037412c7fe68c7cddbaa6e5c67b16` |

No inference, AI translation or v1.26.1 fallback was used. Source-exact
localized Tag coverage is **409 × 8 = 3,272** strings. This is **not**
complete game-wide item localization; it describes `Tag.locbin` alone.

The owner-private extractor `extract_tag_locales.py` takes the exact SHA-pinned
native Tag release plus the eight ZIP originals and writes only a versioned,
SHA-256 ledgered `tag-locales.jsonl`, `manifest.json` and `report.json` to
an owner-selected non-Git directory. The original ZIPs and game binaries remain
private, unchanged, and are never included in generated browser assets.

```sh
python tools/src-02-acquisition/extract_tag_locales.py \
 --tag-evidence OWNER_PRIVATE/Steam-v1.26.2-r5-native-tags \
 --locales OWNER_GAME/ddv_Data/StreamingAssets/Localization \
 --out OWNER_PRIVATE/Steam-v1.26.2-r5-tag-eight-locales
```

The optional `loadVerifiedNativeTagLocales(manifestBytes,tagLocalesBytes,
verifiedTagEvidence,{expectedManifestSha256:<independent private audit SHA>})`
consumer performs independent manifest + row SHA validation, requires native
Tag identity evidence and checks the same exact eight current ZIP SHA pins.
`getDisplayName(tagId,locale)`, `getRecipeSelectorName` and
`getIngredientMembershipName` return **actual source-exact strings** for the
current game version, while retaining all original identity and provenance.

Private-only, read-only. Neither game rights, item ownership, current sale
prices, current stock, recipe eligibility, nor save writing is established.
Do not put any translated strings or original archives into public GitHub or
Pages without separate rights authorization.