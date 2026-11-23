/** Merge first-party Steam schedule timestamps into the Guide calendar.
 * Retain official articles for 2022–24 definitions absent from the current
 * game; replace duplicate 2025–26 announcement rows with original time windows.
 * Archived source dates never prove that system-clock rollback enables a quest.
 */
import type {GuideCalendarEvent,GuideDateOnlyCalendarEvent} from './event-calendar.ts';
import {GUIDE_EVENT_CALENDAR_AS_OF} from './event-calendar.ts';
import type {PublicEventFriendshipRewards} from './public-event-friendship-rewards.ts';
import {GUIDE_NATIVE_EVENT_WINDOWS} from './native-event-windows.ts';

// Stable, manually verified same-event identities across article and native ID.
// No fuzzy matching of event names (several years share the same title).
const SOURCE_TO_OFFICIAL:Readonly<Record<string,string>>={
  ClickAndMagic_UI_2026:'picture-pursuit-2026',
  DreamlightParkFest:'dreamlight-parks-fest-2025',
  DreamlightParkFest_UI_2026:'dreamlight-parks-fest-2026',
  Eggstravaganza_UI_2026:'eggstravaganza-2026',
  LuckyYou_UI_2026:'lucky-you-2026',
  TrickOrTreat:'trick-or-treat-2025',
  TrickOrTreat_2026:'trick-or-treat-2026',
  ValleyValentines_UI_2026:'valley-valentines-2026',
  HauntedFloatingFestival:'haunted-floating-festival-2025',
  HauntedFloatingFestival2026:'haunted-floating-festival-2026'
};

function validUtc(value:string):number{
  const valueMs=Date.parse(value);
  if(!Number.isFinite(valueMs)||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)||
    new Date(valueMs).toISOString().replace('.000Z','Z')!==value)
    throw new TypeError('Guide native calendar: invalid original UTC field');
  return valueMs;
}
function sourceDay(utc:string):string{return utc.slice(0,10);}

export function mergeGuideNativeEvents(
  published:readonly GuideCalendarEvent[],
  source:PublicEventFriendshipRewards
):GuideCalendarEvent[]{
  if(source.coverage.sourceNativeEvents!==24||source.coverage.miniEvents!==19||
    source.coverage.floatingFestivals!==5)
    throw new TypeError('Guide native calendar: incompatible original source');
  const publishedById=new Map(published.map(row=>[row.id,row]));
  const replacedIds=new Set<string>(),nativeRows:GuideDateOnlyCalendarEvent[]=[];
  const seen=new Set<string>();
  for(const [kind,key,teasing,start,end] of GUIDE_NATIVE_EVENT_WINDOWS){
    if(seen.has(key))throw new TypeError('Guide native calendar: repeated ID');
    seen.add(key);
    const native=source.getEvent(kind==='mini'?'mini_event':'floating_festival',key);
    if(!native)throw new TypeError('Guide native calendar: source ID missing '+key);
    const teaserMs=validUtc(teasing),startMs=validUtc(start),endMs=validUtc(end);
    if(!(teaserMs<=startMs&&startMs<endMs))
      throw new TypeError('Guide native calendar: invalid source boundaries '+key);
    const matchedId=SOURCE_TO_OFFICIAL[key];
    const previous=matchedId?publishedById.get(matchedId):undefined;
    if(matchedId&&(!previous||previous.kind!=='limited-event'))
      throw new TypeError('Guide native calendar: changed official mapping '+key);
    if(previous)replacedIds.add(previous.id);
    const related=previous?.kind==='limited-event'?previous:null;
    nativeRows.push({
      id:matchedId??'native-'+key,kind:'limited-event',
      category:kind==='festival'?'floating':'other',
      title:native.names.en,
      nativeEventId:key,nativeNames:native.names,
      evidence:'verified-game-original',sourceUrl:related?.sourceUrl??null,
      precision:'date-only',
      startDay:sourceDay(start),endDayInclusive:sourceDay(end),
      sourceTeasingUtc:teasing,sourceStartUtc:start,sourceEndUtcInclusive:end,
      participation:related?.participation??'not-verified',
      href:'/guide/events/?event='+encodeURIComponent(key),
      liveVerified:false,checkedDate:GUIDE_EVENT_CALENDAR_AS_OF
    });
  }
  if(nativeRows.length!==23)throw new TypeError('Guide native calendar: census');
  const merged=[...published.filter(row=>!replacedIds.has(row.id)),...nativeRows];
  if(new Set(merged.map(row=>row.id)).size!==merged.length)
    throw new TypeError('Guide native calendar: duplicate event identity');
  return merged.sort((a,b)=>{
    const start=(event:GuideCalendarEvent)=>event.precision==='utc-instant'
      ?event.startUtc:event.startDay;
    return start(a).localeCompare(start(b));
  });
}
