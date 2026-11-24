import {publicQuestSection,publicQuestStoryArc,publicQuestNativeOrder,comparePublicQuestBrowseOrder,type PublicQuestIndex,type PublicQuestIndexRow,type PublicQuestStoryArc} from './public-guide.ts';
import type {PublicQuestConditionReader,PublicConditionBranch} from './public-quest-conditions.ts';
export interface QuestStoryFlow{
 readonly main:readonly PublicQuestIndexRow[];
 readonly related:readonly PublicQuestIndexRow[];
}
export function questStoryFlow(index:PublicQuestIndex,arc:PublicQuestStoryArc,locale:string):QuestStoryFlow{
 const rows=index.quests.filter(row=>publicQuestSection(row)==='story'&&publicQuestStoryArc(row)===arc)
  .sort((a,b)=>comparePublicQuestBrowseOrder(a,b,index,locale));
 return {main:rows.filter(row=>publicQuestNativeOrder(row)!==null),related:rows.filter(row=>publicQuestNativeOrder(row)===null)};
}
/** Only positive MissionCompleted predicates necessary within the source tree.
 * A NOT expression is never evidence of completion; OR requires intersection.
 * These are static explicit clauses, not an exhaustive runtime dependency graph. */
export function requiredStoryCompletionIds(branch:PublicConditionBranch|null|undefined):ReadonlySet<string>{
 if(!branch||branch.operator==='NOT'||!branch.clauses.length)return new Set();
 const sets=branch.clauses.map(node=>{
  if(node.type==='nested')return requiredStoryCompletionIds(node.tree);
  const raw=node.sourceFields.missionId;
  const id=typeof raw==='string'||typeof raw==='number'?String(raw):'';
  return new Set(node.kind==='MissionCompleted'&&/^[1-9][0-9]{0,15}$/.test(id)?[id]:[]);
 });
 if(branch.operator==='OR')return new Set([...sets[0]].filter(id=>sets.every(set=>set.has(id))));
 return new Set(sets.flatMap(set=>[...set]));
}
export function storyCompletionReferences(index:PublicQuestIndex,row:PublicQuestIndexRow,reader:PublicQuestConditionReader|null):readonly PublicQuestIndexRow[]{
 const condition=reader?.getQuest(row.id);
 if(!condition)return [];
 const ids=new Set([...requiredStoryCompletionIds(condition.availability),...requiredStoryCompletionIds(condition.unlock)]);
 return index.quests.filter(candidate=>candidate.id!==row.id&&ids.has(candidate.id));
}
