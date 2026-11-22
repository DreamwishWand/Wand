/**
 * DB-03 Guide calendar. Exact source UTC boundaries and official date-only events
 * never imply authoritative online availability, player eligibility or ownership.
 */
import {verifyPublicStarpath} from './public-starpath.mjs';

const OFFICIAL=Object.freeze({
  haunting:'https://disneydreamlightvalley.com/news/update-sep-23-2026',
  seafaring:'https://disneydreamlightvalley.com/news/2026ShowcaseHighlights',
  festival:'https://disneydreamlightvalley.com/news/SeasonofScaresUpdate'
});
const IDs=Object.freeze({HauntingElegance2026:'haunting-elegance-2026',Seafaring2026:'seafaring-2026'});
const fail=msg=>{throw new TypeError('Guide calendar: '+msg)};
const assert=(v,msg)=>{if(!v)fail(msg)};
const YYYYMM=/^\d{4}-\d{2}$/;
const YYYYMMDD=/^\d{4}-\d{2}-\d{2}$/;
const EXACT_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ms=value=>{assert(typeof value==='string'&&EXACT_UTC.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString().replace('.000Z','Z')===value,
  'invalid exact source UTC');return Date.parse(value);};
const jstDay=timestamp=>{
  const d=new Date(timestamp+9*60*60*1000);
  return d.toISOString().slice(0,10);
};
const jstDays=()=>{
  const fmt=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
  return date=>{const parts=Object.fromEntries(fmt.formatToParts(date).map(v=>[v.type,v.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;};
};
const japaneseDay=jstDays();
const metadata={
  HauntingElegance2026:{short:'Haunting Elegance',sourceUrl:OFFICIAL.haunting},
  Seafaring2026:{short:'Seafaring Star Path',sourceUrl:OFFICIAL.seafaring}
};
export const GUIDE_EVENT_CALENDAR_CONTRACT='wand.db03.event-calendar-schedule@1';
export const GUIDE_EVENT_CALENDAR_AS_OF='2026-11-22';
export const GUIDE_EVENT_CALENDAR_SOURCES=OFFICIAL;

/** Expose a strictly bounded static schedule. The same snap is shared with
 * the Star Path consumer; source-snapshot freshness is NOT live verification.
 */
export function guideCalendarEvents(starpath){
  verifyPublicStarpath(starpath);
  const result=starpath.seasons.map(s=>{
    assert(Object.hasOwn(IDs,s.id)&&ms(s.startUtc)<ms(s.finishUtcExclusive)&&
      ms(s.finishUtcExclusive)<ms(s.endUtcExclusive),'season bounds');
    return {
      id:IDs[s.id],kind:'starpath',sourceSeasonId:s.id,
      title:metadata[s.id].short,sourceUrl:metadata[s.id].sourceUrl,
      evidence:'official-announcement+owner-game-cache',
      precision:'utc-instant',startUtc:s.startUtc,
      taskEndUtcExclusive:s.finishUtcExclusive,
      endUtcExclusive:s.endUtcExclusive,
      liveVerified:false,checkedDate:GUIDE_EVENT_CALENDAR_AS_OF,
      href:'/guide/star-path/'
    };
  });
  // Developer's 2026 Season of Scares official article verifies DATES only;
  // it does NOT establish the clock time or live availability.
  result.push({
    id:'haunted-floating-festival-2026',kind:'limited-event',
    title:'The Haunted Floating Festival',
    sourceUrl:OFFICIAL.festival,evidence:'official-announcement',
    precision:'date-only',startDay:'2026-10-07',endDayInclusive:'2026-10-31',
    liveVerified:false,checkedDate:GUIDE_EVENT_CALENDAR_AS_OF,
    href:'/guide/events/'
  });
  assert(result.length===3,'event census');
  return result;
}

/** UI status is the *published schedule*, not real server state. */
export function eventScheduleState(e,now=Date.now()){
  const time=now instanceof Date?now.getTime():now;
  assert(Number.isFinite(time),'clock');
  if(e.precision==='utc-instant'){
    const start=ms(e.startUtc),taskEnd=ms(e.taskEndUtcExclusive),end=ms(e.endUtcExclusive);
    assert(start<taskEnd&&taskEnd<end,'event time bounds');
    return time<start?'upcoming':time<taskEnd?'task-window':time<end?'exchange-only':'ended';
  }
  assert(e.precision==='date-only'&&YYYYMMDD.test(e.startDay)&&
    YYYYMMDD.test(e.endDayInclusive)&&e.startDay<=e.endDayInclusive,'event day bounds');
  const day=japaneseDay(new Date(time));
  return day<e.startDay?'upcoming':day<=e.endDayInclusive?'date-window':'ended';
}
export function activeScheduleStarpaths(events,now=Date.now()){
  return events.filter(e=>e.kind==='starpath'&&eventScheduleState(e,now)==='task-window');
}
export function guideCalendarMonth(events,month){
  assert(YYYYMM.test(month),'month format');
  const [year,oneBased]=month.split('-').map(Number);
  assert(year>=2020&&year<=2100&&oneBased>=1&&oneBased<=12,'month range');
  const first=new Date(Date.UTC(year,oneBased-1,1));
  assert(first.toISOString().slice(0,7)===month,'month validity');
  const pad=n=>String(n).padStart(2,'0');
  // Calendar begins on Monday, preserving a six-row maximum and trailing days.
  const monday=(first.getUTCDay()+6)%7;
  const start=Date.UTC(year,oneBased-1,1-monday);
  const totalDays=7*Math.ceil((monday+new Date(Date.UTC(year,oneBased,0)).getUTCDate())/7);
  assert(totalDays>=28&&totalDays<=42,'calendar grid bounds');
  return Array.from({length:totalDays},(_,i)=>{
    const date=new Date(start+i*86400000);
    const day=date.toISOString().slice(0,10),isCurrent=day.startsWith(month);
    const shown=events.filter(e=>{
      if(e.precision==='date-only')return e.startDay<=day&&day<=e.endDayInclusive;
      const from=jstDay(ms(e.startUtc)),to=jstDay(ms(e.endUtcExclusive)-1);
      return from<=day&&day<=to;
    }).map(e=>({...e,taskPeriod:e.precision==='utc-instant'?
      day<=jstDay(ms(e.taskEndUtcExclusive)-1):true}));
    return {day,isCurrent,dayOfMonth:date.getUTCDate(),events:shown};
  });
}
/**
 * The Guide event list and calendar cells must agree on Japan-local month
 * membership. In particular, events starting after 15:00 UTC on the last day
 * of a month belong to the NEXT month in Japan; the exclusive end is honored.
 * Reuse the calendar's day projection so date-only events stay date-only.
 */
export function guideCalendarEventsInMonth(events,month){
  const days=guideCalendarMonth(events,month);
  const ids=new Set(days.filter(day=>day.isCurrent)
    .flatMap(day=>day.events.map(event=>event.id)));
  return events.filter(event=>ids.has(event.id));
}
export function localGuideDateTime(utc){
  return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    hour12:false}).format(new Date(ms(utc)))+' JST';
}
