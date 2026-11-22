/**
 * Stable, source-backed reward-slot links shared by Guide, Collection and DB-02.
 * A link identifies a CONFIGURED reward occurrence, not possession, entitlement
 * or live availability. Identical Item IDs in different slots remain distinct.
 */
import type {GuideRewardIndex,GuideRewardOccurrence} from './reward-relations';

export interface StarpathRewardSelection {
  readonly seasonId:string;
  readonly occurrence:GuideRewardOccurrence;
}
const APP_BASE=/^(?:|\/(?:[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+)*)$/;
const ID=/^[1-9][0-9]{0,15}$/;
const SLOT=/^[A-Za-z0-9_-]+\/(?:normal-[1-9][0-9]*|bonus-[1-9][0-9]*|vault)\/[1-9][0-9]*$/;

/**
 * A URL is only valid if its exact slot occurs ONCE in the provided original
 * Guide reward index. Neither a syntactically valid ID nor an Item-ID name
 * match is sufficient to invent an origin.
 */
export function resolveStarpathRewardLink(
  search:string,index:GuideRewardIndex|null|undefined
):StarpathRewardSelection|null{
  if(typeof search!=='string'||search.length>2048||
    index?.contract!=='wand.db03.reward-relations@1')return null;
  const params=new URLSearchParams(search);
  if(params.getAll('season').length!==1||params.getAll('reward').length!==1||
    [...params.keys()].some(key=>key!=='season'&&key!=='reward'))return null;
  const seasonId=params.get('season')??'',occurrenceId=params.get('reward')??'';
  if(!SLOT.test(occurrenceId)||!occurrenceId.startsWith(seasonId+'/')||
    !index.getSeason(seasonId))return null;
  const matches=index.getSeasonRewards(seasonId).filter(row=>row.occurrenceId===occurrenceId);
  return matches.length===1?Object.freeze({seasonId,occurrence:matches[0]}):null;
}

/** Call with a source-returned reward occurrence, never a guessed Item ID. */
export function starpathRewardHref(base:string,occurrence:GuideRewardOccurrence):string{
  if(typeof base!=='string'||!APP_BASE.test(base)||
    typeof occurrence?.seasonId!=='string'||typeof occurrence.occurrenceId!=='string'||
    !SLOT.test(occurrence.occurrenceId)||
    !occurrence.occurrenceId.startsWith(occurrence.seasonId+'/')||
    typeof occurrence.itemId!=='string'||!ID.test(occurrence.itemId))
    throw new TypeError('Star Path reward permalink: invalid link');
  return base+'/guide/star-path/?season='+encodeURIComponent(occurrence.seasonId)+
    '&reward='+encodeURIComponent(occurrence.occurrenceId);
}
