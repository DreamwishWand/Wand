# DB-03 GUIDE — Information architecture and live-event calendar contract

## Owner decision: 2026-11-22

**Guide is one service. Star Path is a subsection, not a parallel top-level application.** The Guide user-facing root is now `/guide/`.

| Guide section | Purpose | Source/runtime boundary |
| --- | --- | --- |
| `/guide/quests/` | Story, realm and villagers' friendship-related quests, steps and factual targets | Original Mission index; 733 / 7,878 / 11,782 exact source counts |
| `/guide/star-path/` | **Only schedules in the task-active window**; user-facing, editorial **actual actions and riddle answers** (not simply original in-game cryptic duty prose) | Steam v1.26.2 owner cache plus published official date source; client clock; no real live API nor individual progress |
| `/guide/events/` | Floating Island and Valley limited-time events, walkthroughs and verified dates | Official event articles; no fabricated times or puzzle answers |
| `/guide/` | Event calendar and links to all three sections | UTC event instants, explicitly date-only events and provenance |
| `/guide/characters/` | 142 exact source names and 733 linked missions (NPC/internal names included) | Part of Quest Guide, not a fourth core service |
| `/guide/source/` | Original private-source inspection/file import developer tool | Former `/guide/`; remains local/read-only, unlinked from top-level navigation |

The site header has one top-level **Guide** link and no competing top-level **Star Path** tab.

## Why source date ≠ currently live

The existing authenticated source is `Cache/liveops/battlepasses.dat` captured **2026-11-22** on Steam **v1.26.2**. The original SHA-256 is `4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14`. Public static projection: `static/guide/public/starpath-cache-2026-11-22.json` with SHA-256 `78819b4d36042e3c60b576583149e58541d3ca297fa0c3ba8a9a775009614198`.

**These are historical cached definitions**, not an authoritative live event feed; the game may have changed and the response may be incomplete or account-/platform-specific. Its `Active` field must not be read as a live authoritative availability signal.

The new `src/lib/guide/event-calendar.ts` has an explicit `liveVerified:false` for every entry. Its scheduled dates are published evidence:

- **Haunting Elegance Star Path**: Steam snapshot `2026-09-23T13:00:00Z` to task **exclusive** `2026-12-08T14:00:00Z`; reward exchange until **exclusive** `2026-12-09T14:00:00Z`. Announced by the official **Season of Scares** patch notes: https://disneydreamlightvalley.com/news/update-sep-23-2026
- **Seafaring Star Path**: Steam snapshot `2026-10-21T17:00:00Z` to task **exclusive** `2026-12-01T14:00:00Z`; exchange until **exclusive** `2026-12-02T14:00:00Z`. The official showcase independently confirms the October 21–December 2 public window: https://disneydreamlightvalley.com/news/2026ShowcaseHighlights
- **The Haunted Floating Festival**: official **October 7–31, 2026** dates (inclusive). The actual start/end **clock time was not independently confirmed**; stored as `date-only` and never fabricated as UTC timestamps. Official: https://disneydreamlightvalley.com/news/SeasonofScaresUpdate
- **Oogie Boogie's Halloween Event**: official 2026 six-week Valley event and week 6 dated October 28, but exact end time was not verified. Guide-only record, **no fabricated calendar interval**. Official: https://disneydreamlightvalley.com/news/OogieBoogieEvent2026

A day-only scheduled event receives status `date-window`, **not** `task-window`, and no time-of-day claim. A Star Path has separate task and redemption end instants. Browser calculates position using its own current clock **once per minute**, in Asia/Tokyo display time, and documents that this does not prove the game's online state. No automatic authenticated Gameloft feed is installed or asserted.

**User intent**: show active Star Path tasks only. `/guide/star-path/` now displays the two **date-eligible** source seasons while within the task window and refuses to show task lists after their exclusive finish, including during the reward-exchange-only period. This is *schedule-filtered*, not real-server-verified, and is described honestly in the UI. Adding a verified real-time feed later must use authenticated source/version/freshness semantics, permit different player platforms, and fail closed rather than treating missing `BattlePassesUpdated` map entries as deletions.

## Actionable interpretation instead of the in-game riddle text

`src/lib/guide/starpath-task-guidance.mjs` defines **14** direct and **7** weekly source-ID-bound **editorially interpreted** tasks. For example:

- "a hot-tempered duck" → Donald Duck
- "a long-bearded wizard" → Merlin
- "a boy who never grows up" → Peter Pan
- "collection of dinglehoppers" / "youngest of seven sisters" → Ariel
- "a seafaring prince" → Prince Eric
- "the Pumpkin King" → Jack Skellington
- "the patchwork Villager from Pumpkin Town" → Sally
- "an explorer from Motunui" → Moana

Each direct mapping is bound to exact original `seasonId`, `TaskId`, original objective kind, and descriptive keyword; weekly mappings require the original `Liveops.<season>_<weekTask>_Description` localization key. A mismatched source yields **no** editor-authored answer. The editorial text is provided in Japanese and English to start; it is **not** passed off as original 8-locale translation. The authenticated original descriptions are still available secondarily for reference. The other **164** / **185** task definitions currently show **解答未確認／達成方法は検証中** instead of invented walkthroughs. Completing the editorial coverage and external expert cross-check is still required.

The underlying original per-player progress and runtime duty visibility are not inferred from `availableOnDay` or the user's save. Some events expire earlier than the overall Star Path, so a source-backed editorial walkthrough should warn when a linked prerequisite has ended. **Never guarantee that a particular duty is still completable solely because the Star Path's schedule has not expired.**

## Planned genuinely real-time version

1. Establish an authorized official event status feed (or continuously independently audited official announcements), with source link, retrieved-at timestamp, explicit timezone, platform and freshness policy. An archival cache is NOT such a feed.
2. Publish a small immutable, SHA-pinned Guide event schedule/revision with verified start/end instants, any known date-only precision, source assertions and a maximum age. Never silently treat missing incremental updates as event removals.
3. Use scheduled browser current time for visual presentation and source freshness checks; *only* label an event 'サーバー確認済みの開催中' after actual authoritative current verification. Until then, use '日程上のタスク期間内'.
4. Update the calendar and detailed walkthroughs without re-extracting Unity assets, publishing private PlayFab account data or requiring visitors' saves.

## Tests / deployment

`tests/guide-event-calendar.test.mjs` checks exact start, task-exclusivity and redemption boundaries, DST-safe J​ST day conversion, date-only festival, current-only filters, 733 Mission classification, 14+7 curated task explanations and safety on stale/changed IDs. `browser/guide-smoke.mjs` checks the public Guide landing, month navigation, colors/entries, mobile overflow, limited-event route, expired Star Path refusal, and direct editorial riddle answers. The original developer import was moved unchanged to `/guide/source/`; other source binary, private R2 and game assets are not copied into the published Guide.

The SRC-04 image publication remains separately gated and **unpublished**.
