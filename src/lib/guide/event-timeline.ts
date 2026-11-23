/** Presentation-only, JST-anchored event timeline.
 * Original verified Star Path UTC instants stay exact; announced date-only
 * events are projected by day with NO invented start/end clock.
 * Every seven-day row uses Sun–Sat so the Wednesday reset sits in its centre.
 */
import type {GuideCalendarEvent} from './event-calendar.ts';

const HOUR=3_600_000;
const DAY=24*HOUR;
const JST=9*HOUR;
const WEEK=7*DAY;
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;

export interface GuideTimelineDay {
  readonly day:string;
  readonly dayNumber:number;
  readonly month:number;
  readonly weekday:number;
  readonly reset:boolean;
  readonly today:boolean;
}
export interface GuideTimelineWindow {
  readonly firstDay:string;
  readonly lastDay:string;
  readonly startMs:number;
  readonly endMs:number;
  readonly days:readonly GuideTimelineDay[];
  readonly todayDay:string;
  readonly todayPosition:number|null;
}
export type GuideTimelinePhase='task'|'exchange'|'limited';
export interface GuideTimelineSegment {
  readonly phase:GuideTimelinePhase;
  readonly left:number;
  readonly width:number;
  readonly clippedStart:boolean;
  readonly clippedEnd:boolean;
}
export interface GuideTimelineRow {
  readonly event:GuideCalendarEvent;
  readonly segments:readonly GuideTimelineSegment[];
}
function dayOf(timestamp:number):string {
  return new Date(timestamp).toISOString().slice(0,10);
}
function asDayMs(day:string):number {
  if(!ISO_DAY.test(day))throw new TypeError('Guide timeline: invalid day');
  const ms=Date.parse(day+'T00:00:00Z');
  if(!Number.isFinite(ms)||dayOf(ms)!==day)
    throw new TypeError('Guide timeline: invalid day');
  return ms;
}
function exactJstPosition(utc:string):number {
  const ms=Date.parse(utc);
  if(!Number.isFinite(ms)||!utc.endsWith('Z'))
    throw new TypeError('Guide timeline: invalid event boundary');
  return ms+JST;
}
/** The window is Sunday-first, making Wednesday the central day of each week.
 * Five weeks centres the current week in a readable desktop-wide view; nine
 * weeks supplies a longer, scrollable seasonal view without inventing dates.
 */
export function guideTimelineWindow(
  now:number, weeks:5|9=5, offsetWeeks=0
):GuideTimelineWindow {
  if(!Number.isFinite(now)||!Number.isInteger(offsetWeeks)||
    offsetWeeks< -104||offsetWeeks>104||(weeks!==5&&weeks!==9))
    throw new TypeError('Guide timeline: invalid range');
  const todayMs=now+JST;
  const currentDayStart=Math.floor(todayMs/DAY)*DAY;
  const currentWeekStart=currentDayStart-new Date(currentDayStart).getUTCDay()*DAY;
  const startMs=currentWeekStart-(Math.floor(weeks/2)-offsetWeeks)*WEEK;
  const endMs=startMs+weeks*WEEK;
  const todayDay=dayOf(currentDayStart);
  const days=Array.from({length:weeks*7},(_,i)=>{
    const ms=startMs+i*DAY;
    const date=new Date(ms);
    const day=dayOf(ms);
    const weekday=date.getUTCDay();
    return {
      day,dayNumber:date.getUTCDate(),month:date.getUTCMonth()+1,
      weekday,reset:weekday===3,today:day===todayDay
    };
  });
  const todayPosition=todayMs>=startMs&&todayMs<endMs
    ?100*(todayMs-startMs)/(endMs-startMs):null;
  return {firstDay:days[0].day,lastDay:days[days.length-1].day,
    startMs,endMs,days,todayDay,todayPosition};
}
function clipPhase(
  phase:GuideTimelinePhase, startMs:number,endMs:number,
  window:GuideTimelineWindow
):GuideTimelineSegment|null {
  if(endMs<=window.startMs||startMs>=window.endMs||endMs<=startMs)
    return null;
  const left=Math.max(startMs,window.startMs);
  const right=Math.min(endMs,window.endMs);
  return {
    phase,left:100*(left-window.startMs)/(window.endMs-window.startMs),
    width:100*(right-left)/(window.endMs-window.startMs),
    clippedStart:startMs<window.startMs,
    clippedEnd:endMs>window.endMs
  };
}
/** Source identity & event ordering are retained; only on-screen segments
 * are projected. Two same-day task/exchange portions never lose their exact
 * minute boundary, even if their date labels are identical.
 */
export function guideTimelineRows(
  events:readonly GuideCalendarEvent[],window:GuideTimelineWindow
):GuideTimelineRow[] {
  const rows:GuideTimelineRow[]=[];
  for(const event of events) {
    const segments:GuideTimelineSegment[]=[];
    if(event.precision==='utc-instant'){
      const task=clipPhase('task',exactJstPosition(event.startUtc),
        exactJstPosition(event.taskEndUtcExclusive),window);
      const exchange=clipPhase('exchange',
        exactJstPosition(event.taskEndUtcExclusive),
        exactJstPosition(event.endUtcExclusive),window);
      if(task)segments.push(task);
      if(exchange)segments.push(exchange);
    }else{
      const limited=clipPhase('limited',asDayMs(event.startDay),
        asDayMs(event.endDayInclusive)+DAY,window);
      if(limited)segments.push(limited);
    }
    if(segments.length)rows.push({event,segments});
  }
  return rows;
}
