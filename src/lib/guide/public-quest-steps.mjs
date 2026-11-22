/**
 * Deterministic, shareable public quest-step navigation.
 * A step is a 1-based display position, not saved player progress or
 * a game-server objective ID. Only one verified quest ID may scope it.
 */
const QUEST=/^[1-9][0-9]{0,15}$/;
const STEP=/^[1-9][0-9]{0,3}$/;
export function publicQuestStepIndex(search='',questId='',stepCount=0){
  if(typeof search!=='string'||search.length>2048||
    typeof questId!=='string'||!QUEST.test(questId)||
    !Number.isSafeInteger(stepCount)||stepCount<1||stepCount>10000)return 0;
  const params=new URLSearchParams(search);
  const quests=params.getAll('quest');
  if(quests.length!==1||quests[0]!==questId)return 0;
  const steps=params.getAll('step');
  if(!steps.length)return 0;
  if(steps.length!==1||!STEP.test(steps[0]))return 0;
  const index=Number(steps[0])-1;
  return index<stepCount?index:0;
}

/**
 * Return a canonical query for a selected, verified public quest step.
 * Do not preserve duplicated or foreign step and quest parameters.
 */
export function publicQuestStepQuery(questId,stepIndex,stepCount){
  if(typeof questId!=='string'||!QUEST.test(questId)||
    !Number.isSafeInteger(stepCount)||stepCount<1||stepCount>10000||
    !Number.isSafeInteger(stepIndex)||stepIndex<0||stepIndex>=stepCount)
    throw new TypeError('Public quest step: invalid selection');
  return '?quest='+questId+'&step='+(stepIndex+1);
}
