/**
 * DB-00: unified public, source-only Event / Quest / Duty / Scene reference API.
 *
 * DB-03 owns the SHA-pinned extraction, decoding and original ID semantics.
 * This reader only joins its already authenticated, version-compatible
 * projections. Static event configuration never proves live availability,
 * prerequisites, player completion, geographic scene access or DLC ownership.
 */
import type {
  PublicEventFriendshipRewards,NativeEventDefinition,PublicNativeEventFamily
} from '../guide/public-event-friendship-rewards.ts';
import type {
  PublicEventQuestIndex,EventQuestSourceLink
} from '../guide/public-event-quest-links.ts';
import type {
  PublicEventDutyIndex,EventDutySourceLink
} from '../guide/public-event-duty-links.ts';
import type {
  PublicEventSceneIndex,FestivalSceneSourceLink,ExpansionSceneSourceLink
} from '../guide/public-event-scene-links.ts';

export const DB00_EVENT_SOURCE_SCHEMA='wand.game-db.event-source-join@1' as const;
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY_EVENTS=Object.freeze([]) as readonly Db00PublicEvent[];
function ensure(ok:unknown,reason:string):asserts ok {
  if(!ok)throw new TypeError('DB00_EVENT_SOURCES_'+reason);
}
function nativeId(raw:string|number):string|null {
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  return typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value))?value:null;
}
export interface Db00PublicEvent {
  readonly event:NativeEventDefinition;
  readonly eventId:string;
  readonly family:PublicNativeEventFamily;
  readonly questLinks:readonly EventQuestSourceLink[];
  readonly dutyLinks:readonly EventDutySourceLink[];
  readonly sceneLinks:readonly FestivalSceneSourceLink[];
  readonly sourceConfigurationOnly:true;
  readonly currentAvailabilityVerified:false;
  readonly playerProgressVerified:false;
  readonly questPrerequisitesVerified:false;
  readonly dutyUnlockConditionsVerified:false;
  readonly sceneWorldMembershipVerified:false;
  readonly sceneAccessVerified:false;
}
export interface Db00SceneReferences {
  readonly sceneId:string;
  readonly festivals:readonly Db00PublicEvent[];
  readonly expansions:readonly ExpansionSceneSourceLink[];
  readonly sourceConfigurationOnly:true;
  readonly sceneWorldMembershipVerified:false;
  readonly sceneAccessVerified:false;
  readonly expansionEntitlementVerified:false;
}
export interface Db00PublicEventSources {
  readonly schema:typeof DB00_EVENT_SOURCE_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly counts:Readonly<{
    readonly publicEvents:23;
    readonly eventQuestReferences:62;
    readonly eventDutyReferences:79;
    readonly festivalSceneReferences:17;
    readonly expansionVillageSceneReferences:6;
  }>;
  readonly events:readonly Db00PublicEvent[];
  readonly sourceConfigurationOnly:true;
  readonly currentAvailabilityVerified:false;
  readonly playerProgressVerified:false;
  getEvent(family:PublicNativeEventFamily,id:string):Db00PublicEvent|null;
  /** An original Quest ID in a Mini Event is not a prerequisite. */
  getQuestEvents(questId:string|number):readonly Db00PublicEvent[];
  /** A source Duty ID does not imply player progress or unlock state. */
  getDutyEvents(dutyId:string|number):readonly Db00PublicEvent[];
  /** Festival source scenes and expansion village scene refs remain separate. */
  getSceneReferences(sceneId:string|number):Db00SceneReferences|null;
}
export function createDb00PublicEventSources(
  source:PublicEventFriendshipRewards,
  quest:PublicEventQuestIndex,
  duty:PublicEventDutyIndex,
  scene:PublicEventSceneIndex
):Db00PublicEventSources{
  ensure(source?.schema==='wand.db03.public-event-friendship-rewards@1' &&
    source.coverage.sourceNativeEvents===24 &&
    source.coverage.miniEvents===19 &&
    source.coverage.floatingFestivals===5 &&
    source.coverage.liveEventAvailabilityVerified===false &&
    quest?.schema==='wand.db03.public-event-quest-links@1' &&
    quest.gameVersion==='1.26.2' &&
    quest.coverage.publicLinks===62 &&
    quest.coverage.linkedEvents===8 &&
    quest.coverage.currentAvailabilityVerified===false &&
    quest.coverage.questPrerequisitesVerified===false &&
    quest.coverage.playerProgressVerified===false &&
    duty?.schema==='wand.db03.public-event-duty-links@1' &&
    duty.gameVersion==='1.26.2' &&
    duty.coverage.publishedReferences===79 &&
    duty.coverage.linkedEvents===18 &&
    duty.coverage.currentAvailabilityVerified===false &&
    duty.coverage.dutyUnlockConditionsVerified===false &&
    duty.coverage.playerProgressVerified===false &&
    scene?.schema==='wand.db03.public-event-scene-links@1' &&
    scene.gameVersion==='1.26.2' &&
    scene.coverage.festivalTargetScenes===5 &&
    scene.coverage.festivalTargetSubscenes===12 &&
    scene.coverage.expansionVillageScenes===6 &&
    scene.coverage.sceneWorldMembershipVerified===false &&
    scene.coverage.expansionEntitlementVerified===false,
    'EXACT_STATIC_SOURCE_READERS_REQUIRED');

  const entries:Db00PublicEvent[]=[];
  const byId=new Map<string,Db00PublicEvent>();
  const byQuest=new Map<string,Db00PublicEvent[]>();
  const byDuty=new Map<string,Db00PublicEvent[]>();
  const byScene=new Map<string,Db00PublicEvent[]>();
  const add=(index:Map<string,Db00PublicEvent[]>,
    id:string,entry:Db00PublicEvent):void=>{
    const list=index.get(id)??[];
    ensure(!list.includes(entry),'DUPLICATE_EVENT_REVERSE_LINK');
    list.push(entry);index.set(id,list);
  };
  let quests=0,duties=0,scenes=0,mini=0,festivals=0;
  for(const event of source.events){
    // Native "TestEv" is internal test configuration, never a user event.
    if(event.id==='TestEv'){
      ensure(event.kind==='mini_event','UNEXPECTED_INTERNAL_TEST_EVENT');
      continue;
    }
    ensure(source.getEvent(event.kind,event.id)===event,
      'EVENT_SOURCE_IDENTITY_MISMATCH');
    const key=event.kind+':'+event.id;
    ensure(!byId.has(key),'DUPLICATE_EVENT_ID');
    const q=quest.getEventQuests(event.id);
    const d=duty.getEventDuties(event.id);
    const s=event.kind==='floating_festival'?
      scene.getFestivalScenes(event.id):[];
    ensure((event.kind==='mini_event'&&s.length===0||
      event.kind==='floating_festival'&&q.length===0&&d.length===0) &&
      q.every(row=>row.eventId===event.id&&row.nativeStaticReference===true&&
        row.prerequisiteVerified===false&&row.liveEventVerified===false&&
        row.playerCompletionVerified===false&&nativeId(row.questId)!==null) &&
      d.every(row=>row.eventId===event.id&&
        row.nativeDutyIndexMembershipVerified===true&&
        row.sourceConfigurationOnly===true&&
        row.currentAvailabilityVerified===false&&
        row.dutyUnlockConditionVerified===false&&
        row.playerProgressVerified===false&&
        nativeId(row.dutyId)!==null) &&
      s.every(row=>row.festivalId===event.id&&
        row.nativeSourceIndexMembershipVerified===true&&
        row.sourceDefinitionOnly===true&&
        row.liveAvailabilityVerified===false&&
        row.sceneWorldMembershipVerified===false&&
        nativeId(row.sceneId)!==null),
      'STATIC_CROSS_REFERENCE_MISMATCH');
    const entry:Db00PublicEvent=Object.freeze({
      event,eventId:event.id,family:event.kind,
      questLinks:Object.freeze([...q]),
      dutyLinks:Object.freeze([...d]),
      sceneLinks:Object.freeze([...s]),
      sourceConfigurationOnly:true as const,
      currentAvailabilityVerified:false as const,
      playerProgressVerified:false as const,
      questPrerequisitesVerified:false as const,
      dutyUnlockConditionsVerified:false as const,
      sceneWorldMembershipVerified:false as const,
      sceneAccessVerified:false as const
    });
    byId.set(key,entry);
    entries.push(entry);
    for(const ref of q)add(byQuest,ref.questId,entry);
    for(const ref of d)add(byDuty,ref.dutyId,entry);
    for(const ref of s)add(byScene,ref.sceneId,entry);
    quests+=q.length;duties+=d.length;scenes+=s.length;
    if(event.kind==='mini_event')mini++;else festivals++;
  }
  ensure(entries.length===23&&mini===18&&festivals===5&&
    quests===62&&duties===79&&scenes===17,
    'ORIGINAL_EVENT_REFERENCE_CENSUS');
  for(const map of [byQuest,byDuty,byScene])
    for(const [id,values] of map)map.set(id,Object.freeze(values) as Db00PublicEvent[]);
  const expansionRefs:ExpansionSceneSourceLink[]=[];
  for(const expansionId of [
    'BaseGame','Expansion01','Expansion02','Expansion03',
    'Expansion04','WinnieDLC'
  ]){
    const ref=scene.getExpansionScene(expansionId);
    ensure(ref!==null && ref.sourceDefinitionOnly===true &&
      ref.expansionEntitlementVerified===false &&
      ref.sceneWorldMembershipVerified===false &&
      nativeId(ref.sceneId)!==null,'EXPANSION_SOURCE_REFERENCE_MISSING');
    expansionRefs.push(ref);
  }
  ensure(expansionRefs.length===6,'EXPANSION_SOURCE_CENSUS');
  const list=Object.freeze(entries);
  return Object.freeze({
    schema:DB00_EVENT_SOURCE_SCHEMA,
    gameVersion:'1.26.2' as const,
    counts:Object.freeze({
      publicEvents:23 as const,eventQuestReferences:62 as const,
      eventDutyReferences:79 as const,festivalSceneReferences:17 as const,
      expansionVillageSceneReferences:6 as const
    }),
    events:list,
    sourceConfigurationOnly:true as const,
    currentAvailabilityVerified:false as const,
    playerProgressVerified:false as const,
    getEvent(family:PublicNativeEventFamily,id:string){
      return byId.get(family+':'+id)??null;
    },
    getQuestEvents(id:string|number){
      return byQuest.get(nativeId(id)??'')??EMPTY_EVENTS;
    },
    getDutyEvents(id:string|number){
      return byDuty.get(nativeId(id)??'')??EMPTY_EVENTS;
    },
    getSceneReferences(raw:string|number):Db00SceneReferences|null{
      const sceneId=nativeId(raw);
      if(!sceneId)return null;
      const festivalEntries=byScene.get(sceneId)??EMPTY_EVENTS;
      const expansions=scene.getSceneExpansions(sceneId);
      ensure(expansions.every(ref=>
        ref.sceneId===sceneId&&ref.expansionEntitlementVerified===false&&
        ref.sceneWorldMembershipVerified===false),
        'SCENE_EXPANSION_REVERSE_MISMATCH');
      if(festivalEntries.length===0&&expansions.length===0)return null;
      return Object.freeze({
        sceneId,festivals:festivalEntries,expansions:Object.freeze([...expansions]),
        sourceConfigurationOnly:true as const,
        sceneWorldMembershipVerified:false as const,
        sceneAccessVerified:false as const,
        expansionEntitlementVerified:false as const
      });
    }
  });
}
