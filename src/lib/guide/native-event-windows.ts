/**
 * Source-pinned, offline game-original event date projection.
 * Steam v1.26.2 protoDb.bin = v1.26.1 byte-identical:
 * SHA-256 dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623
 * Extracted source: Definitions.MiniEventData.ConditionDate (operator >=/<=)
 * and Definitions.FloatingFestivalData protobuf Timestamp.
 *
 * This contains raw original UTC fields (no invented locale offset or
 * replayability assertion). TestEv is a source placeholder, not a real event.
 * Each tuple: [kind, source ID, teaser UTC, start UTC, inclusive end UTC].
 * Game-file data is first-party; no community-wiki date is used.
 */
export const GUIDE_NATIVE_EVENT_WINDOWS=[
  ['mini','ClickAndMagic_UI_2026','2026-07-08T00:00:00Z','2026-07-15T00:00:00Z','2026-07-28T23:59:00Z'],
  ['mini','DreamlightParkFest','2025-05-10T00:00:00Z','2025-05-28T00:00:00Z','2025-06-17T23:59:00Z'],
  ['mini','DreamlightParkFest_UI_2026','2026-06-03T00:00:00Z','2026-06-10T00:00:00Z','2026-06-30T23:59:00Z'],
  ['mini','Eggstravaganza','2025-03-18T00:00:00Z','2025-04-02T00:00:00Z','2025-04-22T23:59:00Z'],
  ['mini','Eggstravaganza_UI_2026','2026-03-25T00:00:00Z','2026-04-01T00:00:00Z','2026-04-21T23:59:00Z'],
  ['mini','LuckyYou_UI_2026','2026-03-04T00:00:00Z','2026-03-11T00:00:00Z','2026-03-17T23:59:00Z'],
  ['mini','MemoryMania','2025-08-12T00:00:00Z','2025-09-03T00:00:00Z','2025-09-16T23:59:00Z'],
  ['mini','MemoryMania_UI_2026','2026-09-09T00:00:00Z','2026-09-16T00:00:00Z','2026-09-29T23:59:00Z'],
  ['mini','StPatrick','2025-02-24T00:00:00Z','2025-03-10T00:00:00Z','2025-03-17T23:59:00Z'],
  ['mini','SummerSizzle','2025-06-19T00:00:00Z','2025-07-02T00:00:00Z','2025-07-22T23:59:00Z'],
  ['mini','SummerSizzle_UI_2026','2026-07-29T00:00:00Z','2026-08-05T00:00:00Z','2026-08-18T23:59:00Z'],
  ['mini','TheCheshireChaos','2025-04-24T00:00:00Z','2025-05-07T00:00:00Z','2025-05-20T23:59:00Z'],
  ['mini','TheGiftOfGiving_UI_2025','2025-12-10T00:00:00Z','2025-12-17T00:00:00Z','2025-12-31T23:59:00Z'],
  ['mini','TreasureHunt','2025-07-16T00:00:00Z','2025-07-30T00:00:00Z','2025-08-12T23:59:00Z'],
  ['mini','TreasureHunt_UI_2026','2026-05-20T00:00:00Z','2026-05-27T00:00:00Z','2026-06-09T23:59:00Z'],
  ['mini','TrickOrTreat','2025-10-14T00:00:00Z','2025-10-15T00:00:00Z','2025-10-31T23:59:00Z'],
  ['mini','TrickOrTreat_2026','2026-10-07T00:00:00Z','2026-10-14T00:00:00Z','2026-10-31T23:59:00Z'],
  ['mini','ValleyValentines_UI_2026','2026-02-04T00:00:00Z','2026-02-11T00:00:00Z','2026-02-25T23:59:00Z'],
  ['festival','HauntedFloatingFestival','2025-10-15T00:00:00Z','2025-10-22T00:00:00Z','2025-11-11T23:59:00Z'],
  ['festival','HauntedFloatingFestival2026','2026-09-30T00:00:00Z','2026-10-07T00:00:00Z','2026-10-31T23:59:00Z'],
  ['festival','ParksFloatingFestival','2026-08-12T00:00:00Z','2026-08-19T00:00:00Z','2026-09-08T23:59:00Z'],
  ['festival','SpringFloatingFestival','2026-04-22T00:00:00Z','2026-04-29T00:00:00Z','2026-05-19T23:59:00Z'],
  ['festival','WinterFloatingFestival','2025-12-31T00:00:00Z','2026-01-07T00:00:00Z','2026-01-28T23:59:00Z']
] as const;

export type GuideNativeEventWindow=typeof GUIDE_NATIVE_EVENT_WINDOWS[number];
export const GUIDE_NATIVE_EVENT_SCHEDULE_SOURCE_SHA=
  'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623' as const;
