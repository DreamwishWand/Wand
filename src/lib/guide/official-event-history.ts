/** Official-only Guide event schedule archive.
 *
 * Player-visible history starts with Early Access on 2022-09-06, NOT the
 * later 2023 full release. Published dates are inclusive CIVIL days.
 * A news article's publication hour is NOT an event's start time.
 *
 * These entries are discrete, directly announced runs, not generated annual
 * recurrences. An absent year means no verified schedule, not no event.
 * Rewinding a device clock does not restore an online seasonal Star Path.
 */
export const GUIDE_EARLY_ACCESS_FIRST_DAY='2022-09-06' as const;
export const GUIDE_EARLY_ACCESS_SOURCE=
  'https://disneydreamlightvalley.com/news/early-access-play-now' as const;

interface OfficialHistoryBase{
  readonly id:string;
  readonly title:string;
  readonly startDay:string;
  readonly endDayInclusive:string;
  readonly sourceUrl:string;
}
interface OfficialHistoricStarpath extends OfficialHistoryBase{
  readonly kind:'starpath-history';
  /** Exact end explicitly stated by the 2022-09-06 official article:
   * October 11, 2022, 09:00 ET (EDT, UTC-4). Start CLOCK unconfirmed. */
  readonly officialEndUtc:'2022-10-11T13:00:00Z';
}
interface OfficialHistoricGameEvent extends OfficialHistoryBase{
  readonly kind:'limited-event';
  readonly category:'floating'|'other';
  /** The official dates are historic announcement dates. Never infer
   * game-server replayability from the existence of this record. */
  readonly participation:'game-clock'|'not-verified';
}
export type OfficialHistoricalGuideEvent=
  OfficialHistoricStarpath|OfficialHistoricGameEvent;

export const GUIDE_OFFICIAL_HISTORICAL_EVENTS=[
  {
    id:'pixar-fest-star-path-2022',kind:'starpath-history',
    title:'Pixar Fest Star Path',
    startDay:'2022-09-06',endDayInclusive:'2022-10-11',
    officialEndUtc:'2022-10-11T13:00:00Z',
    sourceUrl:GUIDE_EARLY_ACCESS_SOURCE
  },
  {
    id:'trick-or-treat-2023',kind:'limited-event',category:'other',
    title:'Trick or Treat',
    startDay:'2023-10-24',endDayInclusive:'2023-11-01',
    participation:'game-clock',
    sourceUrl:'https://disneydreamlightvalley.com/news/EnchantedAdventure_Update'
  },
  {
    id:'trick-or-treat-2024',kind:'limited-event',category:'other',
    title:'Trick or Treat',
    startDay:'2024-10-23',endDayInclusive:'2024-10-31',
    participation:'game-clock',
    sourceUrl:'https://disneydreamlightvalley.com/fr/news/update-oct-9-2024'
  },
  {
    id:'trick-or-treat-2025',kind:'limited-event',category:'other',
    title:'Trick or Treat',
    startDay:'2025-10-15',endDayInclusive:'2025-10-31',
    participation:'game-clock',
    sourceUrl:'https://disneydreamlightvalley.com/news/TrickOrTreatEvent2025'
  },
  {
    id:'haunted-floating-festival-2025',kind:'limited-event',category:'floating',
    title:'The Haunted Floating Festival',
    startDay:'2025-10-22',endDayInclusive:'2025-11-11',
    participation:'not-verified',
    sourceUrl:'https://disneydreamlightvalley.com/news/HauntedFloatingFestival2025'
  },
  {
    id:'trick-or-treat-2026',kind:'limited-event',category:'other',
    title:'Trick or Treat',
    startDay:'2026-10-14',endDayInclusive:'2026-10-31',
    participation:'game-clock',
    sourceUrl:'https://disneydreamlightvalley.com/news/SeasonofScaresUpdate'
  }
] as const satisfies readonly OfficialHistoricalGuideEvent[];

for(const row of GUIDE_OFFICIAL_HISTORICAL_EVENTS){
  if(row.startDay<GUIDE_EARLY_ACCESS_FIRST_DAY||row.endDayInclusive<row.startDay||
    new URL(row.sourceUrl).hostname!=='disneydreamlightvalley.com')
    throw new TypeError('Guide history: invalid official source date/domain');
}
