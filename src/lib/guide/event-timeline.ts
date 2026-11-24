/** Viewer-local calendar axis for verified UTC instants.
 * Announcement-only events remain civil dates; no imaginary clock is assigned.
 * Wednesday is a day marker, never an invented precise reset instant.
 */
import type {GuideCalendarEvent} from './event-calendar.ts';

const DAY=86_400_000;
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
export interface GuideTimelineDay {
  readonly day:string; readonly dayNumber:number; readonly month:number;
  readonly weekday:number; readonly reset:boolean; readonly today:boolean;
}
export interface GuideTimelineWindow {
  readonly firstDay:string; readonly lastDay:string;
  readonly startMs:number; readonly endMs:number;
  readonly starts:readonly number[];
  readonly days:readonly GuideTimelineDay[];
  readonly todayDay:string; readonly todayPosition:number|null;
  readonly timeZone:string;
}
export type GuideTimelinePhase='task'|'exchange'|'limited'|'historic';
export interface GuideTimelineSegment {
  readonly phase:GuideTimelinePhase; readonly left:number; readonly width:number;
  readonly clippedStart:boolean; readonly clippedEnd:boolean;
}
export interface GuideTimelineRow {
  readonly event:GuideCalendarEvent; readonly segments:readonly GuideTimelineSegment[];
}
function asDayMs(day:string):number{
  if(!ISO_DAY.test(day))throw new TypeError('Guide timeline: invalid day');
  const ms=Date.parse(day+'T00:00:00Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==day)
    throw new TypeError('Guide timeline: invalid day');
  return ms;
}
function civilDay(ms:number):string{return new Date(ms).toISOString().slice(0,10);}
function nextCivil(day:string,count=1):string{return civilDay(asDayMs(day)+count*DAY);}
function zoneParts(utcMs:number,timeZone:string){
  const fmt=new Intl.DateTimeFormat('en-GB',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  });
  const parts=Object.fromEntries(fmt.formatToParts(new Date(utcMs))
    .map(p=>[p.type,p.value]));
  return {
    y:Number(parts.year),m:Number(parts.month),d:Number(parts.day),
    h:Number(parts.hour),mi:Number(parts.minute),s:Number(parts.second)
  };
}
function zonedDay(ms:number,timeZone:string):string{
  const p=zoneParts(ms,timeZone);
  return [p.y,String(p.m).padStart(2,'0'),String(p.d).padStart(2,'0')].join('-');
}
/** Iterative inverse of the timezone projection. Handles DST 23h/25h days.
 * If midnight was skipped in a historical zone, use the first valid instant.
 */
function localDayStart(day:string,timeZone:string):number{
  const target=asDayMs(day);
  let guess=target;
  for(let i=0;i<5;i++){
    const p=zoneParts(guess,timeZone);
    const wall=Date.UTC(p.y,p.m-1,p.d,p.h,p.mi,p.s);
    const diff=target-wall;
    if(!diff)break;
    guess+=diff;
  }
  return guess;
}
function exactUtc(utc:string):number{
  const time=Date.parse(utc);
  if(!Number.isFinite(time)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(utc)||
    new Date(time).toISOString().replace('.000Z','Z')!==utc)
    throw new TypeError('Guide timeline: invalid source instant');
  return time;
}
/** Today is four local calendar days into the viewport (~11% on 5 weeks).
 * Past periods remain accessible in seven-day increments.
 */
export function guideTimelineWindow(
  now:number,weeks:5|9=5,offsetWeeks=0,timeZone='Asia/Tokyo'
):GuideTimelineWindow{
  if(!Number.isFinite(now)||!Number.isInteger(offsetWeeks)||
    offsetWeeks< -520||offsetWeeks>520||(weeks!==5&&weeks!==9))
    throw new TypeError('Guide timeline: invalid range');
  const todayDay=zonedDay(now,timeZone);
  const firstDay=nextCivil(todayDay,-4+offsetWeeks*7);
  const length=weeks*7;
  const days=Array.from({length},(_,i)=>{
    const day=nextCivil(firstDay,i);
    const date=new Date(asDayMs(day));
    const weekday=date.getUTCDay();
    return {
      day,dayNumber:date.getUTCDate(),month:date.getUTCMonth()+1,
      weekday,reset:weekday===3,today:day===todayDay
    };
  });
  const starts=Array.from({length:length+1},(_,i)=>
    localDayStart(nextCivil(firstDay,i),timeZone));
  const range={
    firstDay,lastDay:days[length-1].day,startMs:starts[0],endMs:starts[length],
    starts,days,todayDay,timeZone,todayPosition:null
  };
  const todayPosition=now>=range.startMs&&now<range.endMs
    ?positionOf(now,range):null;
  return {...range,todayPosition};
}
/** Even-width calendar cells show clock instants at the correct fractional
 * position of their local civil day, including DST days of unequal length.
 */
function positionOf(time:number,range:Pick<GuideTimelineWindow,'starts'>):number{
  const starts=range.starts,days=starts.length-1;
  if(time<=starts[0])return 0;
  if(time>=starts[days])return 100;
  let index=0;
  while(index<days-1&&starts[index+1]<=time)index++;
  return 100*(index+(time-starts[index])/(starts[index+1]-starts[index]))/days;
}
function clip(
  phase:GuideTimelinePhase,start:number,end:number,range:GuideTimelineWindow
):GuideTimelineSegment|null{
  if(end<=range.startMs||start>=range.endMs||end<=start)return null;
  const left=positionOf(Math.max(range.startMs,start),range);
  const right=positionOf(Math.min(range.endMs,end),range);
  return {
    phase,left,width:right-left,clippedStart:start<range.startMs,
    clippedEnd:end>range.endMs
  };
}
export function guideTimelineRows(
  events:readonly GuideCalendarEvent[],range:GuideTimelineWindow
):GuideTimelineRow[]{
  const rows:GuideTimelineRow[]=[];
  for(const event of events){
    const segments:GuideTimelineSegment[]=[];
    if(event.precision==='utc-instant'){
      const task=clip('task',exactUtc(event.startUtc),
        exactUtc(event.taskEndUtcExclusive),range);
      const exchange=clip('exchange',exactUtc(event.taskEndUtcExclusive),
        exactUtc(event.endUtcExclusive),range);
      if(task)segments.push(task);
      if(exchange)segments.push(exchange);
    }else if(event.kind==='starpath-history'&&event.taskEndDayInclusive){
      const transition=localDayStart(nextCivil(event.taskEndDayInclusive),range.timeZone);
      const task=clip('historic',localDayStart(event.startDay,range.timeZone),transition,range);
      const exchange=clip('exchange',transition,localDayStart(nextCivil(event.endDayInclusive),range.timeZone),range);
      if(task)segments.push(task);
      if(exchange)segments.push(exchange);
    }else{
      // First-party Mini Event/Festival timestamps are exact archived instants;
      // official article-only intervals remain civil days with no fake hour.
      const sourceStart=event.kind==='limited-event'?event.sourceStartUtc:null;
      const sourceEnd=event.kind==='limited-event'?event.sourceEndUtcInclusive:null;
      const limited=clip('limited',
        sourceStart&&sourceEnd?exactUtc(sourceStart):
          localDayStart(event.startDay,range.timeZone),
        sourceStart&&sourceEnd?exactUtc(sourceEnd)+1:
          event.kind==='starpath-history'&&event.officialEndUtc?exactUtc(event.officialEndUtc):
          localDayStart(nextCivil(event.endDayInclusive),range.timeZone),range);
      if(limited)segments.push({...limited,
        phase:event.kind==='starpath-history'?'historic':'limited'});
    }
    if(segments.length)rows.push({event,segments});
  }
  return rows;
}

/** Separate CHC projection. Unknown times stay day-only; no invented duration.
 * Day-only intervals include their final civil day. Point markers are centered
 * on date-only cells and exact at confirmed instants. */
export function guideAnnouncementMarker(
  schedule:import('./community-announcements.ts').AnnouncementSchedule,
  point:boolean,range:GuideTimelineWindow
):{left:number;width:number;point:boolean}|null{
  try{
    const {start,end}=schedule;
    if(!start&&!end)return null;
    function boundary(date:NonNullable<typeof start>,finish:boolean){
      if(date.precision==='day')return localDayStart(finish?nextCivil(date.value):date.value,range.timeZone);
      const ms=Date.parse(date.value);
      if(!Number.isFinite(ms))throw Error('instant');
      return ms;
    }
    if(point||!start||!end){
      const date=start??end!;
      const time=boundary(date,false);
      if(time<range.startMs||time>=range.endMs)return null;
      const left=date.precision==='day'?(positionOf(time,range)+positionOf(boundary(date,true),range))/2:positionOf(time,range);
      return {left,width:0,point:true};
    }
    const from=boundary(start,false),to=boundary(end,true);
    if(to<=from)return null;
    const result=clip('limited',from,to,range);
    return result?{left:result.left,width:result.width,point:false}:null;
  }catch{return null;}
}
