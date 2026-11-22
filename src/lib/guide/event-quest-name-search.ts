/** Localized, public-only Event -> related Quest search text.
 *
 * Relies on independently verified public Quest catalogue and SHA-pinned
 * native Event↔Quest projection. Never turns a static source relationship into
 * a prerequisite, active event, task ordering, or personal progress.
 */
import {verifyPublicQuestIndex,formatPublicGuideText} from './public-guide.mjs';
import type {PublicEventQuestIndex} from './public-event-quest-links.ts';
import type {PublicEventFriendshipRewards} from './public-event-friendship-rewards.ts';

export const DB03_EVENT_QUEST_SEARCH_SCHEMA='wand.db03.event-quest-name-search@1' as const;
const LOCALES=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'] as const;
export type EventQuestSearchLocale=typeof LOCALES[number];
type QuestRow={id:string;names:Partial<Record<EventQuestSearchLocale,string>>};
interface QuestCatalog{quests:readonly QuestRow[]}
export interface EventQuestNameSearch {
  readonly schema:typeof DB03_EVENT_QUEST_SEARCH_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly linkedEvents:8;
  readonly linkedQuests:49;
  readonly currentAvailabilityVerified:false;
  readonly playerProgressVerified:false;
  readonly questPrerequisitesVerified:false;
  /** Source-exact IDs and only verified public localized Quest names. */
  getEventSearchTerms(eventId:string,locale:EventQuestSearchLocale):readonly string[];
}
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('DB03_EVENT_QUEST_SEARCH_'+code);
}
const EMPTY=Object.freeze([]) as readonly string[];
export function createEventQuestNameSearch(
  eventSource:PublicEventFriendshipRewards,
  questIndex:unknown,
  links:PublicEventQuestIndex
):EventQuestNameSearch{
  check(eventSource?.schema==='wand.db03.public-event-friendship-rewards@1'&&
    eventSource.coverage.sourceNativeEvents===24&&
    typeof eventSource.getEvent==='function','EVENT_SOURCE_REQUIRED');
  check(links?.schema==='wand.db03.public-event-quest-links@1'&&
    links.coverage.publicLinks===62&&links.coverage.linkedEvents===8&&
    links.coverage.distinctQuests===49&&
    links.coverage.currentAvailabilityVerified===false&&
    links.coverage.questPrerequisitesVerified===false&&
    links.coverage.playerProgressVerified===false,'LINK_SOURCE_REQUIRED');
  const catalog=verifyPublicQuestIndex(questIndex) as QuestCatalog;
  const byId=new Map(catalog.quests.map(row=>[row.id,row]));
  check(byId.size===733,'QUEST_CENSUS');
  const byEvent=new Map<string,Readonly<Record<EventQuestSearchLocale,readonly string[]>>>();
  const unique=new Set<string>();
  let refs=0;
  for(const event of eventSource.events){
    if(event.id==='TestEv'||event.kind!=='mini_event')continue;
    const attached=links.getEventQuests(event.id);
    if(!attached.length)continue;
    const names:Record<EventQuestSearchLocale,readonly string[]>=
      {} as Record<EventQuestSearchLocale,readonly string[]>;
    for(const lang of LOCALES){
      const terms:string[]=[];
      for(const relation of attached){
        check(relation.eventId===event.id&&relation.nativeStaticReference===true&&
          relation.prerequisiteVerified===false&&
          relation.playerCompletionVerified===false&&
          relation.liveEventVerified===false,'RELATION');
        const row=byId.get(relation.questId);
        check(row!==undefined,'UNKNOWN_QUEST');
        terms.push(row.id);
        const localized=formatPublicGuideText(row.names[lang]||row.names.en);
        const english=formatPublicGuideText(row.names.en);
        if(localized)terms.push(localized);
        if(english&&english!==localized)terms.push(english);
      }
      names[lang]=Object.freeze(terms);
    }
    for(const relation of attached){unique.add(relation.questId);refs++;}
    byEvent.set(event.id,Object.freeze(names));
  }
  check(refs===62&&byEvent.size===8&&unique.size===49,'CROSS_REFERENCE_COUNTS');
  return Object.freeze({
    schema:DB03_EVENT_QUEST_SEARCH_SCHEMA,gameVersion:'1.26.2' as const,
    linkedEvents:8 as const,linkedQuests:49 as const,
    currentAvailabilityVerified:false as const,
    playerProgressVerified:false as const,
    questPrerequisitesVerified:false as const,
    getEventSearchTerms(eventId:string,locale:EventQuestSearchLocale){
      return byEvent.get(eventId)?.[LOCALES.includes(locale)?locale:'ja']??EMPTY;
    }
  });
}
