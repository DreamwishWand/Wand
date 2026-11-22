/** Exact source-native archived festival scene/subscene and expansion scene refs.
 *
 * The byte-identical Steam 1.26.1/1.26.2 protoDb.bin and Scene.json were
 * attested offline; public projection contains IDs only. The original Scene
 * source records are NOT published, and these IDs alone DO NOT establish an
 * event's running location, coordinates, player access, world association,
 * expansion ownership, or a localized scene name.
 */
import type {PublicEventFriendshipRewards} from './public-event-friendship-rewards.ts';

export const DB03_EVENT_SCENE_SCHEMA='wand.db03.public-event-scene-links@1' as const;
export const DB03_EVENT_SCENE_FILE='event-scene-links-1.26.2.json' as const;
export const DB03_EVENT_SCENE_BYTES=1659 as const;
export const DB03_EVENT_SCENE_SHA=
  '74bba4f6289105ae92541b4d0ec825ab1494418b53c2a55b5a65965a8720c91e' as const;
const PROTO_SHA='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const SCENE_SHA='d8fc56cfc282323df94461e360c26aaf98a884f01b7bd83cabf967ac2cd397d5';
const LINKS_SHA='4802d7f6cfd4f72733ceb5c16dd149aa6e724e118bb5795b6c72ad50ebee3b0c';
const EVENTS_SHA='9b8857dfaa557a458a8e922ea4145895bc698e50d8d1ce0ad68017492f18b5c9';
const SCENE=/^[1-9][0-9]{0,15}$/;
const FESTIVAL=/^[A-Za-z0-9_-]{1,128}$/;
const EXPANSIONS=Object.freeze(['BaseGame','Expansion01','Expansion02',
  'Expansion03','Expansion04','WinnieDLC']);
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB03_EVENT_SCENE_'+code);
}
function sceneId(raw:unknown):string|null{
  const s=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  return typeof s==='string'&&SCENE.test(s)&&Number.isSafeInteger(Number(s))?s:null;
}
export type FestivalSceneKind='target_scene'|'target_subscene';
export interface FestivalSceneSourceLink{
  readonly festivalId:string;
  readonly sceneId:string;
  readonly kind:FestivalSceneKind;
  /** Original protobuf slot index. Not geographic or chronological ordering. */
  readonly sourcePosition:number;
  readonly nativeSourceIndexMembershipVerified:true;
  readonly sourceDefinitionOnly:true;
  readonly liveAvailabilityVerified:false;
  readonly sceneWorldMembershipVerified:false;
  readonly playerLocationVerified:false;
  readonly sceneNameVerified:false;
}
export interface ExpansionSceneSourceLink{
  readonly expansionId:string;
  readonly sceneId:string;
  readonly kind:'village_scene';
  readonly nativeSourceIndexMembershipVerified:true;
  readonly sourceDefinitionOnly:true;
  readonly expansionEntitlementVerified:false;
  readonly sceneWorldMembershipVerified:false;
  readonly sceneNameVerified:false;
}
export interface PublicEventSceneIndex{
  readonly schema:typeof DB03_EVENT_SCENE_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly coverage:Readonly<{
    floatingFestivals:5;expansions:6;
    festivalTargetScenes:5;festivalTargetSubscenes:12;
    expansionVillageScenes:6;distinctScenes:20;
    staticOnly:true;liveAvailabilityVerified:false;
    playerLocationVerified:false;sceneNameVerified:false;
    sceneWorldMembershipVerified:false;expansionEntitlementVerified:false;
  }>;
  getFestivalScenes(festivalId:string):readonly FestivalSceneSourceLink[];
  getSceneFestivals(sceneId:string|number):readonly FestivalSceneSourceLink[];
  getExpansionScene(expansionId:string):ExpansionSceneSourceLink|null;
  getSceneExpansions(sceneId:string|number):readonly ExpansionSceneSourceLink[];
}
const EMPTY_FESTIVAL=Object.freeze([]) as readonly FestivalSceneSourceLink[];
const EMPTY_EXPANSIONS=Object.freeze([]) as readonly ExpansionSceneSourceLink[];
/** Caller-supplied JSON must be byte/SHA attested by the loader for authenticity. */
export function verifyPublicEventSceneLinks(
  raw:unknown,events:PublicEventFriendshipRewards
):PublicEventSceneIndex{
  check(events?.schema==='wand.db03.public-event-friendship-rewards@1'&&
    events.coverage.sourceNativeEvents===24&&
    events.coverage.floatingFestivals===5&&
    events.coverage.liveEventAvailabilityVerified===false&&
    typeof events.getEvent==='function','FESTIVAL_SOURCE_REQUIRED');
  check(obj(raw)&&raw.schema===DB03_EVENT_SCENE_SCHEMA&&
    obj(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2','TARGET');
  const source=raw.source,counts=raw.counts;
  check(obj(source)&&
    source.originalProtoDbSha256===PROTO_SHA&&
    source.originalSceneJsonSha256===SCENE_SHA&&
    source.originalEventLinksSha256===LINKS_SHA&&
    source.eventRewardProjectionSha256===EVENTS_SHA&&
    source.protoDbIdenticalSteam1261And1262===true&&
    source.sceneJsonIdenticalSteam1261And1262===true&&
    source.nativeSceneIndexMembershipVerified===true&&
    source.sourceStaticOnly===true&&
    source.liveEventVerified===false&&
    source.playerLocationVerified===false&&
    source.sceneNameVerified===false&&
    source.sceneWorldMembershipVerified===false&&
    source.locationAccessVerified===false&&
    source.expansionOwnershipVerified===false,'SOURCE');
  check(obj(counts)&&counts.floatingFestivals===5&&
    counts.expansions===6&&counts.festivalTargetScenes===5&&
    counts.festivalTargetSubscenes===12&&
    counts.expansionVillageScenes===6&&counts.distinctScenes===20,
    'CENSUS');
  check(obj(raw.festivals)&&Object.keys(raw.festivals).length===5&&
    obj(raw.expansions)&&Object.keys(raw.expansions).length===6,'FAMILIES');

  const festivals=new Map<string,readonly FestivalSceneSourceLink[]>();
  const bySceneFestival=new Map<string,FestivalSceneSourceLink[]>();
  const expansions=new Map<string,ExpansionSceneSourceLink>();
  const bySceneExpansion=new Map<string,ExpansionSceneSourceLink[]>();
  const unique=new Set<string>();
  let targets=0,subscenes=0;
  for(const [festivalId,definition] of Object.entries(raw.festivals)){
    check(FESTIVAL.test(festivalId)&&events.getEvent('floating_festival',festivalId)!==null&&
      obj(definition)&&sceneId(definition.targetScene)!==null&&
      Array.isArray(definition.subscenes)&&
      definition.subscenes.length>=1&&definition.subscenes.length<=12,
      'FESTIVAL');
    const refs:FestivalSceneSourceLink[]=[];
    const target=definition.targetScene as string;
    const local=new Set<string>();
    for(const [i,value] of [target,...definition.subscenes].entries()){
      const id=sceneId(value);
      check(id!==null,'SCENE_ID');
      check(!local.has(id),'DUPLICATE_SCENE');local.add(id);unique.add(id);
      const kind=i===0?'target_scene' as const:'target_subscene' as const;
      const link:FestivalSceneSourceLink=Object.freeze({
        festivalId,sceneId:id,kind,sourcePosition:i===0?0:i-1,
        nativeSourceIndexMembershipVerified:true,
        sourceDefinitionOnly:true,liveAvailabilityVerified:false,
        sceneWorldMembershipVerified:false,playerLocationVerified:false,
        sceneNameVerified:false
      });
      refs.push(link);
      const reverse=bySceneFestival.get(id)??[];
      reverse.push(link);bySceneFestival.set(id,reverse);
      if(i===0)targets++;else subscenes++;
    }
    festivals.set(festivalId,Object.freeze(refs));
  }
  for(const [expansionId,value] of Object.entries(raw.expansions)){
    check(EXPANSIONS.includes(expansionId),'EXPANSION_ID');
    const id=sceneId(value);
    check(id!==null,'EXPANSION_SCENE_ID');
    unique.add(id);
    const link:ExpansionSceneSourceLink=Object.freeze({
      expansionId,sceneId:id,kind:'village_scene',
      nativeSourceIndexMembershipVerified:true,
      sourceDefinitionOnly:true,expansionEntitlementVerified:false,
      sceneWorldMembershipVerified:false,sceneNameVerified:false
    });
    expansions.set(expansionId,link);
    const reverse=bySceneExpansion.get(id)??[];
    reverse.push(link);bySceneExpansion.set(id,reverse);
  }
  check(festivals.size===5&&expansions.size===6&&
    targets===5&&subscenes===12&&unique.size===20,'RECOMPUTED_CENSUS');
  const festivalReverse=new Map<string,readonly FestivalSceneSourceLink[]>();
  for(const [id,refs] of bySceneFestival)festivalReverse.set(id,Object.freeze(refs));
  const expansionReverse=new Map<string,readonly ExpansionSceneSourceLink[]>();
  for(const [id,refs] of bySceneExpansion)expansionReverse.set(id,Object.freeze(refs));
  return Object.freeze({
    schema:DB03_EVENT_SCENE_SCHEMA,
    gameVersion:'1.26.2' as const,
    coverage:Object.freeze({
      floatingFestivals:5 as const,expansions:6 as const,
      festivalTargetScenes:5 as const,festivalTargetSubscenes:12 as const,
      expansionVillageScenes:6 as const,distinctScenes:20 as const,
      staticOnly:true as const,liveAvailabilityVerified:false as const,
      playerLocationVerified:false as const,sceneNameVerified:false as const,
      sceneWorldMembershipVerified:false as const,
      expansionEntitlementVerified:false as const
    }),
    getFestivalScenes:(id:string)=>typeof id==='string'?
      festivals.get(id)??EMPTY_FESTIVAL:EMPTY_FESTIVAL,
    getSceneFestivals:(raw:string|number)=>
      festivalReverse.get(sceneId(raw)??'')??EMPTY_FESTIVAL,
    getExpansionScene:(id:string)=>typeof id==='string'?
      expansions.get(id)??null:null,
    getSceneExpansions:(raw:string|number)=>
      expansionReverse.get(sceneId(raw)??'')??EMPTY_EXPANSIONS
  });
}
export async function loadPublicEventSceneLinks(
  events:PublicEventFriendshipRewards,
  url:string,fetcher:typeof fetch=fetch
):Promise<PublicEventSceneIndex>{
  check(typeof url==='string'&&url.length>0&&url.length<2048,'URL');
  const response=await fetcher(url);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB03_EVENT_SCENE_BYTES,'BYTES');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(b=>b.toString(16).padStart(2,'0')).join('');
  check(hash===DB03_EVENT_SCENE_SHA,'SHA');
  return verifyPublicEventSceneLinks(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),events);
}

/** Public-only deep link to festivals referencing this exact native Scene ID.
 * Returns null for unknown/unsupported scene IDs; never claims active access.
 */
export function guideFestivalSceneHref(
  index:PublicEventSceneIndex,raw:unknown,base=''
):string|null{
  check(index?.schema===DB03_EVENT_SCENE_SCHEMA&&
    typeof index.getSceneFestivals==='function','INDEX_REQUIRED');
  const id=sceneId(raw);
  if(!id||index.getSceneFestivals(id).length===0)return null;
  check(typeof base==='string'&&
    /^\/?(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(base),
    'BASE');
  const root=base===''?'':('/'+base.replace(/^\/+|\/+$/g,''));
  return root+'/guide/events/?scene='+id;
}
