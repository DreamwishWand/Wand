/** DB-03 source-backed event calendar, displayed in Japan Standard Time.
 *
 * Published UTC task/exchange boundaries and official date-only announcements
 * remain distinct. A calendar schedule is not real-time server availability,
 * player eligibility, entitlement, or a progress assertion.
 */
import {verifyPublicStarpath} from './public-starpath.ts';
import {isStarpathSeasonId,type StarpathSeasonId} from './starpath-locale-contract.ts';
import {GUIDE_OFFICIAL_HISTORICAL_EVENTS,GUIDE_EARLY_ACCESS_FIRST_DAY}
  from './official-event-history.ts';

export const GUIDE_EVENT_CALENDAR_CONTRACT=
  'wand.db03.event-calendar-schedule@1' as const;
export const GUIDE_EVENT_CALENDAR_AS_OF='2026-11-22' as const;
export const GUIDE_EVENT_CALENDAR_SOURCES=Object.freeze({
  haunting:'https://disneydreamlightvalley.com/news/update-sep-23-2026',
  seafaring:'https://disneydreamlightvalley.com/news/2026ShowcaseHighlights',
  festival:'https://disneydreamlightvalley.com/news/SeasonofScaresUpdate'
});

export interface GuideCalendarUtcWindow{
  readonly id:string;
  readonly precision:'utc-instant';
  readonly startUtc:string;
  readonly taskEndUtcExclusive:string;
  readonly endUtcExclusive:string;
}
export interface GuideCalendarDateWindow{
  readonly id:string;
  readonly precision:'date-only';
  readonly startDay:string;
  readonly endDayInclusive:string;
}
export type GuideCalendarWindow=GuideCalendarUtcWindow|GuideCalendarDateWindow;
export interface GuideStarpathCalendarEvent extends GuideCalendarUtcWindow{
  readonly kind:'starpath';
  readonly sourceSeasonId:StarpathSeasonId;
  readonly title:string;
  readonly sourceUrl:string;
  readonly evidence:'official-announcement+owner-game-cache';
  readonly liveVerified:false;
  readonly checkedDate:typeof GUIDE_EVENT_CALENDAR_AS_OF;
  readonly href:'/guide/star-path/';
}
export interface GuideDateOnlyCalendarEvent extends GuideCalendarDateWindow{
  readonly kind:'limited-event';
  /** Exclusive visual bucket; 'other' means non-Floating native Mini Events.
   * Official 'Valley Events' is an umbrella including Floating Festivals.
   */
  readonly category:'floating'|'other';
  readonly title:string;
  readonly sourceUrl:string;
  readonly evidence:'official-announcement';
  readonly liveVerified:false;
  readonly checkedDate:typeof GUIDE_EVENT_CALENDAR_AS_OF;
  readonly href:'/guide/events/?event=HauntedFloatingFestival2026'|null;
  readonly participation:'game-clock'|'not-verified';
}
export interface GuideHistoricalStarpathCalendarEvent extends GuideCalendarDateWindow{
  readonly kind:'starpath-history';
  readonly title:string;
  readonly sourceUrl:string;
  readonly evidence:'official-announcement';
  readonly officialEndUtc:string|null;
  readonly liveVerified:false;
  readonly checkedDate:typeof GUIDE_EVENT_CALENDAR_AS_OF;
  readonly href:null;
}
export type GuideCalendarEvent=
  GuideStarpathCalendarEvent|GuideDateOnlyCalendarEvent|GuideHistoricalStarpathCalendarEvent;
export type GuideEventScheduleState=
  'upcoming'|'task-window'|'exchange-only'|'date-window'|'ended';
export type GuideMonthEvent<T extends GuideCalendarWindow>=T&{
  readonly taskPeriod:boolean;
};
export interface GuideCalendarDay<T extends GuideCalendarWindow>{
  readonly day:string;
  readonly isCurrent:boolean;
  readonly dayOfMonth:number;
  readonly events:readonly GuideMonthEvent<T>[];
}

const YEAR_MONTH=/^\d{4}-\d{2}$/;
const YEAR_DAY=/^\d{4}-\d{2}-\d{2}$/;
const UTC_INSTANT=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const JST_OFFSET=9*60*60*1000;
const DAY_MILLISECONDS=24*60*60*1000;
const ids:Readonly<Record<StarpathSeasonId,string>>=Object.freeze({
  HauntingElegance2026:'haunting-elegance-2026',
  Seafaring2026:'seafaring-2026'
});
const metadata:Readonly<Record<StarpathSeasonId,{
  readonly short:string;readonly sourceUrl:string
}>>=Object.freeze({
  HauntingElegance2026:{
    short:'Haunting Elegance',sourceUrl:GUIDE_EVENT_CALENDAR_SOURCES.haunting
  },
  Seafaring2026:{
    short:'Seafaring Star Path',sourceUrl:GUIDE_EVENT_CALENDAR_SOURCES.seafaring
  }
});
interface RawStarpathSeasonTimeline{
  readonly id:string;
  readonly startUtc:string;
  readonly finishUtcExclusive:string;
  readonly endUtcExclusive:string;
}
interface RawStarpathCalendar{
  readonly seasons:readonly RawStarpathSeasonTimeline[];
}
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('Guide calendar: '+code);
}
function utcMillis(value:unknown):number{
  check(typeof value==='string'&&UTC_INSTANT.test(value)&&
    Number.isFinite(Date.parse(value))&&
    new Date(value).toISOString().replace('.000Z','Z')===value,
    'invalid exact source UTC');
  return Date.parse(value);
}
function japanDay(timestamp:number):string{
  return new Date(timestamp+JST_OFFSET).toISOString().slice(0,10);
}
const japanFormatter=new Intl.DateTimeFormat('ja-JP',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'
});
function japanCalendarDay(date:Date):string{
  const parts=Object.fromEntries(japanFormatter.formatToParts(date)
    .map(part=>[part.type,part.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}

/** Only the SHA-validated 2-season snapshot is projected to published events. */
export function guideCalendarEvents(raw:unknown):GuideCalendarEvent[]{
  verifyPublicStarpath(raw);
  const snapshot=raw as RawStarpathCalendar;
  const events:GuideCalendarEvent[]=snapshot.seasons.map(season=>{
    check(isStarpathSeasonId(season.id)&&
      utcMillis(season.startUtc)<utcMillis(season.finishUtcExclusive)&&
      utcMillis(season.finishUtcExclusive)<utcMillis(season.endUtcExclusive),
      'season bounds');
    const id=season.id;
    return {
      id:ids[id],kind:'starpath',sourceSeasonId:id,
      title:metadata[id].short,sourceUrl:metadata[id].sourceUrl,
      evidence:'official-announcement+owner-game-cache',
      precision:'utc-instant',
      startUtc:season.startUtc,
      taskEndUtcExclusive:season.finishUtcExclusive,
      endUtcExclusive:season.endUtcExclusive,
      liveVerified:false,checkedDate:GUIDE_EVENT_CALENDAR_AS_OF,
      href:'/guide/star-path/'
    };
  });
  // Announcement verifies calendar DAYS only; do not fabricate clock times.
  events.push({
    id:'haunted-floating-festival-2026',kind:'limited-event',category:'floating',
    title:'The Haunted Floating Festival',
    sourceUrl:GUIDE_EVENT_CALENDAR_SOURCES.festival,
    evidence:'official-announcement',
    precision:'date-only',startDay:'2026-10-07',endDayInclusive:'2026-10-31',
    liveVerified:false,checkedDate:GUIDE_EVENT_CALENDAR_AS_OF,
    participation:'not-verified',
    // Exact 2026 native FloatingFestival identifier, not the earlier similarly named definition.
    href:'/guide/events/?event=HauntedFloatingFestival2026'
  });
  // Preserve historic announcements independently from the two cached liveops
  // seasons. No article's publication timestamp is fabricated into a start
  // instant. Event clocks and Star Path online participation are distinct.
  for(const source of GUIDE_OFFICIAL_HISTORICAL_EVENTS){
    check(source.startDay>=GUIDE_EARLY_ACCESS_FIRST_DAY&&
      source.endDayInclusive>=source.startDay,'historical boundaries');
    if(source.kind==='starpath-history'){
      if(source.officialEndUtc!==undefined)
        check(utcMillis(source.officialEndUtc)>Date.parse(source.startDay+'T00:00:00Z'),
          'historical published end');
      events.push({
        id:source.id,kind:'starpath-history',title:source.title,
        sourceUrl:source.sourceUrl,evidence:'official-announcement',
        precision:'date-only',startDay:source.startDay,
        endDayInclusive:source.endDayInclusive,
        officialEndUtc:source.officialEndUtc??null,
        liveVerified:false,checkedDate:GUIDE_EVENT_CALENDAR_AS_OF,href:null
      });
    }else{
      events.push({
        id:source.id,kind:'limited-event',category:source.category,
        title:source.title,sourceUrl:source.sourceUrl,
        evidence:'official-announcement',precision:'date-only',
        startDay:source.startDay,endDayInclusive:source.endDayInclusive,
        participation:source.participation,
        liveVerified:false,checkedDate:GUIDE_EVENT_CALENDAR_AS_OF,href:null
      });
    }
  }
  check(events.length===3+GUIDE_OFFICIAL_HISTORICAL_EVENTS.length&&
    new Set(events.map(event=>event.id)).size===events.length,'event census');
  return events;
}

/** Current state means "inside the PUBLISHED calendar window", never
 * an independently checked live server state.
 */
export function eventScheduleState(
  event:GuideCalendarWindow,now:number|Date=Date.now()
):GuideEventScheduleState{
  const time=now instanceof Date?now.getTime():now;
  check(Number.isFinite(time),'clock');
  if(event.precision==='utc-instant'){
    const start=utcMillis(event.startUtc);
    const taskEnd=utcMillis(event.taskEndUtcExclusive);
    const end=utcMillis(event.endUtcExclusive);
    check(start<taskEnd&&taskEnd<end,'event time bounds');
    return time<start?'upcoming':time<taskEnd?'task-window':
      time<end?'exchange-only':'ended';
  }
  check(event.precision==='date-only'&&YEAR_DAY.test(event.startDay)&&
    YEAR_DAY.test(event.endDayInclusive)&&
    event.startDay<=event.endDayInclusive,'event day bounds');
  const day=japanCalendarDay(new Date(time));
  return day<event.startDay?'upcoming':
    day<=event.endDayInclusive?'date-window':'ended';
}
export function activeScheduleStarpaths(
  events:readonly GuideCalendarEvent[],now:number|Date=Date.now()
):GuideStarpathCalendarEvent[]{
  return events.filter((event):event is GuideStarpathCalendarEvent=>
    event.kind==='starpath'&&eventScheduleState(event,now)==='task-window');
}

/** Six-row max, Monday-start Japan-calendar grid. UTC exclusive deadlines
 * are converted to JST DAY MEMBERSHIP before any event is drawn.
 */
export function guideCalendarMonth<T extends GuideCalendarWindow>(
  events:readonly T[],month:string
):GuideCalendarDay<T>[]{
  check(YEAR_MONTH.test(month),'month format');
  const [year,oneBased]=month.split('-').map(Number);
  check(year>=2020&&year<=2100&&oneBased>=1&&oneBased<=12,
    'month range');
  const first=new Date(Date.UTC(year,oneBased-1,1));
  check(first.toISOString().slice(0,7)===month,'month validity');
  const monday=(first.getUTCDay()+6)%7;
  const start=Date.UTC(year,oneBased-1,1-monday);
  const days=7*Math.ceil((monday+new Date(Date.UTC(
    year,oneBased,0)).getUTCDate())/7);
  check(days>=28&&days<=42,'calendar grid bounds');
  return Array.from({length:days},(_,index)=>{
    const date=new Date(start+index*DAY_MILLISECONDS);
    const day=date.toISOString().slice(0,10);
    const shown:GuideMonthEvent<T>[]=events.filter(event=>{
      if(event.precision==='date-only')
        return event.startDay<=day&&day<=event.endDayInclusive;
      const from=japanDay(utcMillis(event.startUtc));
      const to=japanDay(utcMillis(event.endUtcExclusive)-1);
      return from<=day&&day<=to;
    }).map(event=>({
      ...event,
      taskPeriod:event.precision==='date-only'||
        day<=japanDay(utcMillis(event.taskEndUtcExclusive)-1)
    }));
    return {day,isCurrent:day.startsWith(month),
      dayOfMonth:date.getUTCDate(),events:shown};
  });
}
/** List membership is derived from the exact same JST-day grid as the cells. */
export function guideCalendarEventsInMonth<T extends GuideCalendarWindow>(
  events:readonly T[],month:string
):T[]{
  const days=guideCalendarMonth(events,month);
  const present=new Set(days.filter(day=>day.isCurrent).flatMap(
    day=>day.events.map(event=>event.id)));
  return events.filter(event=>present.has(event.id));
}
export function localGuideDateTime(utc:string):string{
  return new Intl.DateTimeFormat('ja-JP',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date(utcMillis(utc)))+' JST';
}
