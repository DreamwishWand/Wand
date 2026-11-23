/** Pure TypeScript navigation for a source-verified public Quest detail.
 *
 * The URL step is a 1-based display position, not a native objective ID,
 * stored player progress, a quest unlock or a server-side event status.
 * Callers must first verify the Quest ID and source step count.
 */
export const PUBLIC_QUEST_STEP_NAVIGATION_SCHEMA=
  'wand.db03.public-quest-step-navigation@1' as const;
const QUEST_ID=/^[1-9][0-9]{0,15}$/;
const STEP_POSITION=/^(?:[1-9][0-9]{0,3}|10000)$/;
const MAX_STEPS=10000;
const MAX_QUERY_LENGTH=2048;

function validQuestId(value:unknown):value is string{
  return typeof value==='string'&&QUEST_ID.test(value)&&
    Number.isSafeInteger(Number(value));
}
function validStepCount(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&
    value>=1&&value<=MAX_STEPS;
}
function validStepIndex(value:unknown,count:number):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&
    value>=0&&value<count;
}
/** Reject foreign Quest IDs and duplicate, malformed, or out-of-range steps.
 * Invalid URL state only resets the display position; it cannot change a save.
 */
export function publicQuestStepIndex(
  search:string='',questId:string='',stepCount:number=0
):number{
  if(typeof search!=='string'||search.length>MAX_QUERY_LENGTH||
    !validQuestId(questId)||!validStepCount(stepCount))return 0;
  const params=new URLSearchParams(search);
  const quests=params.getAll('quest');
  if(quests.length!==1||quests[0]!==questId)return 0;
  const steps=params.getAll('step');
  if(steps.length!==1||!STEP_POSITION.test(steps[0]))return 0;
  const index=Number(steps[0])-1;
  return validStepIndex(index,stepCount)?index:0;
}

/** Construct a canonical URL query only for a caller-verified Quest and step.
 * Arbitrary or duplicated URL parameters are never propagated.
 */
export function publicQuestStepQuery(
  questId:string,stepIndex:number,stepCount:number
):string{
  if(!validQuestId(questId)||!validStepCount(stepCount)||
    !validStepIndex(stepIndex,stepCount))
    throw new TypeError('Public quest step: invalid selection');
  return '?quest='+questId+'&step='+(stepIndex+1);
}
