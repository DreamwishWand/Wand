import {writable} from 'svelte/store';
export const ANNOUNCEMENT_KINDS=['update','expansion','adventure','drops','code','showcase','other'] as const;
export type AnnouncementKind=typeof ANNOUNCEMENT_KINDS[number];
export type AnnouncementDate=Readonly<{precision:'day';value:string}|{precision:'instant';value:string}>;
export type AnnouncementSchedule=Readonly<{start?:AnnouncementDate;end?:AnnouncementDate}>;
export type AnnouncementReward=Readonly<{itemId:string;name:string;quantity?:number;minutes?:number}>;
export type AnnouncementDraft=Readonly<{
  kind:AnnouncementKind;title:string;schedule:AnnouncementSchedule;code?:string;
  rewards:readonly AnnouncementReward[];sourceUrl?:string;body?:string;language:string;
}>;
export type Announcement=AnnouncementDraft&Readonly<{
  id:string;confidenceLabel:string;imageUrl?:string;
}>;
export type AnnouncementResult=Readonly<{
  /** Public, discoverable, ranked and currently relevant, decided by CHC. */
  latest:readonly Announcement[];
  /** CHC's canonical confidence/visibility policy determines inclusion. */
  calendar:readonly Announcement[];
}>;
export type AnnouncementQuery=Readonly<{firstDay:string;lastDay:string;timeZone:string;language:string}>;
export type AnnouncementItem=Readonly<{itemId:string;name:string;imageUrl?:string}>;
/** CHC owns persisted information, rights/attachments, deduplication, confidence,
 * authorization, validation and revisions. Guide only consumes this public port. */
export interface AnnouncementProvider{
  list(query:AnnouncementQuery,signal:AbortSignal):Promise<AnnouncementResult>;
  similar(kind:AnnouncementKind,title:string,signal:AbortSignal):Promise<readonly Announcement[]>;
  searchItems(query:string,language:string,signal:AbortSignal):Promise<readonly AnnouncementItem[]>;
  create(draft:AnnouncementDraft,image:File|undefined):Promise<{id:string}>;
  threadHref(id:string):string;
  browseHref():string;
  supplementHref(id:string):string;
}
export const announcementProvider=writable<AnnouncementProvider|null>(null);
export const EMPTY_ANNOUNCEMENTS:AnnouncementResult={latest:[],calendar:[]};
export function isPointAnnouncement(kind:AnnouncementKind){
  return kind==='update'||kind==='expansion'||kind==='adventure'||kind==='showcase';
}
export function announcementDate(day:string,time:string,offset:string):AnnouncementDate|undefined{
  if(!day)return undefined;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new TypeError('date');
  if(!time)return {precision:'day',value:day};
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!/^([+-](0\d|1[0-4]):[0-5]\d)$/.test(offset))throw new TypeError('time');
  const ms=Date.parse(day+'T'+time+':00'+offset);
  if(!Number.isFinite(ms))throw new TypeError('time');
  return {precision:'instant',value:new Date(ms).toISOString()};
}
export function announcementSourceUrl(value:string):string|undefined{
  if(!value.trim())return undefined;
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.username||url.password)throw new TypeError('source');
  return url.href;
}
