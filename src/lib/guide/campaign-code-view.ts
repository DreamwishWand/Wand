import type {OfficialCampaign} from '../acquisition/origins.ts';
import type {Announcement} from './community-announcements.ts';

export type CodeWindowState='no-expiry-published'|'scheduled'|'within-published-window'|'ended'|'unknown';
export type CodeEntry=Readonly<{
 code:string;title:string;sourceUrl:string|null;sourceKind:'official'|'community';
 start:string|null;end:string|null;state:CodeWindowState;
 rewards:readonly Readonly<{name:string;itemId:string|null;quantity:number|null}>[];
}>;
/** Date-only boundaries are civil dates, not invented midnight instants.
 * A whole day on either side of UTC covers all local offsets. */
function bound(value:string|null,edge:'start'|'end'):number|null{
 if(!value)return null;
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))return null;
 return /^\d{4}-\d{2}-\d{2}$/.test(value)?ms+(edge==='start'?-86400000:2*86400000):ms;
}
export function codeWindowState(start:string|null,end:string|null,now:number,noExpiry=false):CodeWindowState{
 const s=bound(start,'start'), e=bound(end,'end');
 if(e!==null&&now>=e)return 'ended';
 if(s!==null&&now<s)return 'scheduled';
 if(noExpiry)return 'no-expiry-published';
 // Only exact timestamps can establish a precise published window.
 if(start?.includes('T')&&end?.includes('T')&&s!==null&&e!==null&&now>=s&&now<e)return 'within-published-window';
 return 'unknown';
}
export function campaignCodeEntries(official:readonly OfficialCampaign[],community:readonly Announcement[],now:number):readonly CodeEntry[]{
 const rows:CodeEntry[]=[];
 const seen=new Set<string>();
 for(const c of official){
  if(c.kind!=='redeem_code'||!c.code||c.source.kind!=='official_publication'||c.codeEvidence||c.communityArchiveEvidence||seen.has(c.code))continue;
  // The existing canonical source explicitly records this 2024 statement.
  const perpetual=c.source.sourceUrl==='https://disneydreamlightvalley.com/news/Pride-2024'&&c.conditions.some(v=>v.includes('codes will not expire'));
  rows.push({code:c.code,title:c.name,sourceUrl:c.source.sourceUrl,sourceKind:'official',start:c.window.start,end:c.window.endExclusive,state:codeWindowState(c.window.start,c.window.endExclusive,now,perpetual),rewards:c.rewards.map(x=>({name:x.name,itemId:x.itemId,quantity:x.quantity}))});
  seen.add(c.code);
 }
 // Keep official facts distinct; a community record may supplement, but cannot
 // silently overwrite a published expiry. No case folding of code tokens.
 for(const c of community){
  const code=c.code?.trim();if(c.kind!=='code'||!code||seen.has(code))continue;
  let sourceUrl:string|null=null;
  try{const u=new URL(c.sourceUrl??'');if(u.protocol==='https:'&&!u.username&&!u.password)sourceUrl=u.href;}catch{}
  rows.push({code,title:c.title,sourceUrl,sourceKind:'community',start:c.schedule.start?.value??null,end:c.schedule.end?.value??null,state:codeWindowState(c.schedule.start?.value??null,c.schedule.end?.value??null,now),rewards:c.rewards.map(x=>({name:x.name,itemId:x.itemId,quantity:x.quantity??null}))});
  seen.add(code);
 }
 const order:Record<CodeWindowState,number>={'no-expiry-published':0,'within-published-window':1,unknown:2,scheduled:3,ended:4};
 return rows.sort((a,b)=>order[a.state]-order[b.state]||(b.start??'').localeCompare(a.start??'')||a.code.localeCompare(b.code));
}
