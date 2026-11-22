# DB-03 GUIDE — source-verified character-name directory (Steam v1.26.2)

## Public scope

The new `/guide/characters/` route is a **navigation and name index** derived directly from the already released source-verified `static/guide/public/quest-index.json`. It does **not** download a separate character database, game archive, private Quest ZIP, any user's save or Cloudflare media. Its names and quest IDs come from the existing 733 original-derived Mission rows and 8-locale source name dictionary.

The exact original index has the following closed counts:

| Source-scoped fact | Count |
| --- | ---: |
| `characters` key/value records | **142** |
| Different source label IDs directly referenced by a Quest's `characterId` | **86** |
| Source label IDs with no directly linked Quest in this particular index | **56** |
| Quest rows assigned to exactly one source label | **733** |
| Character label locale values | **142 × 8**, all populated |
| Character name entries retaining an original placeholder/DoNotTranslate token | **3** |

Original source labels include **NPCs, objects, preview/internal character entries and localization placeholders**. Thus 142 **must not** be presented as a census of unlockable, playable, resident or currently available Disney Dreamlight Valley characters. An ID with zero directly linked Quests does not establish that the character has no associated content or is unlocked/locked in live gameplay. Specifically, the dictionary has names for **フランダー / Flounder** and **セバスチャン / Sebastian** but **neither is directly linked to a `characterId` Quest row in this curated 733-Quest index**. That distinction is important for source-faithful Guide behavior.

The three source-internal markers are `10000100`, `10000102` (Placeholder/LegacyPlaceholder) and `10000138` (DoNotTranslate). Their original tokens are preserved as text and explicitly flagged as **internal source labels** in the UI. Their apparent text is not certified as an official character display name. No additional source identities are inferred.

## User-facing behavior

- Browse all 142 dictionary entries with eight original source locales and source numeric IDs.
- Search Japanese, English, or any of the eight source-locale labels together; Unicode NFKC handles full-width numeric IDs and characters. This is a **name directory**, not a player-state query.
- Show 86/56 source link filters; all 733 quest rows are linked to a source character-name ID.
- Selecting an entry reveals **only directly linked Quest rows** (real source `quest.characterId` equals the selected ID). Clicking opens the existing `/guide/quests/?quest=<native-ID>` route, which verifies and lazily fetches quest steps and objectives.
- Permalinks use exactly one source-verified `/guide/characters/?character=<native-ID>`. Unknown, duplicate, malformed and unbounded values fail closed. Browser history Back/Forward restores current selected source entry.
- No speculative character portraits. The SRC-04 media staging remains **private**; no media URL is generated.
- The existing public Quest Guide links character names back to the character directory. No modification to private Game Source Archive, Steam data ZIP, save files or source-provenance claims.

## Source contract and validation

`src/lib/guide/public-characters.mjs` requires the already published `verifyPublicQuestIndex` contract (Steam 1.26.2, source static-projection version 1.26.1 with verified original byte parity), independently checks 142 × 8 complete dictionary entries, all 733 source quest references, exact 86/56/3 source-scoped counts, and numeric ID safety. The browser creates no new network request except the publicly available existing Quest index. Sorting respects the selected locale.

```sh
node --test tests/guide-public-characters.test.mjs
npm test
npm run check
npm run build
node browser/guide-smoke.mjs
```

The end-to-end test verifies the public character route on desktop/mobile, source totals, zero private uploads and zero quest detail downloads until the user follows a Quest link, eight-language display, Flounder as a zero-direct-link case, Jack Sparrow with source-linked Quests, filters, shareable URLs, Back/Forward and internal-marker warnings. It checks that duplicate deep link IDs cannot select unrelated content.

This is a navigational display of source facts, not a Condition dependency graph, DLC entitlement verifier, quest reward/achievement editor or proof of live status.
