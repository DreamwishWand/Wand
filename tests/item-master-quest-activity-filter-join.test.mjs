import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createCurrentQuestObjectiveReader} from '../src/lib/items/public-quest-objective-items.ts';
import {createQuestFilterCandidateReader} from '../src/lib/items/public-quest-filter-candidates.ts';
import {createCurrentActivityEvidenceReader} from '../src/lib/items/public-activity-evidence.ts';

test('original objective selectors join optional activity evidence without claiming runtime eligibility',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const objectives=createCurrentQuestObjectiveReader(db);
  const questIds=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'Mission'});
  const selectors=(await objectives.getForQuests(questIds)).flatMap(r=>r.selectors).filter(s=>s.selectorMode==='FilterGenerator');
  const reader=createQuestFilterCandidateReader(db),activity=createCurrentActivityEvidenceReader(db);
  const raw=s=>s.originalSelector.FilterGenerator??s.originalSelector.ItemToGive?.FilterGenerator;
  const ingredient=selectors.find(s=>raw(s).ActivityItemType===11&&raw(s).IngredientsType?.length);
  const meal=selectors.find(s=>raw(s).ActivityItemType===3&&raw(s).IngredientsType?.length);
  const fish=selectors.find(s=>raw(s).ActivityItemType===10&&raw(s).FishLocation?.UseField===true);
  assert(ingredient&&meal&&fish);
  for(const selector of [ingredient,meal,fish]){
    const result=await reader.resolveObjectiveSelector(selector);
    assert.equal(result.status,'source_definition_candidates');
    assert.equal(result.nativeFilterVerified,false);
    assert.equal(result.runtimeRequirementVerified,false);
    assert(result.candidates.length>0);
    const ids=result.candidates.map(c=>c.itemId);
    if(selector===fish){
      assert.deepEqual(result.candidates.map(c=>c.fishingEvidence),await activity.getFishingFilterEvidence(ids,raw(selector)));
    }else{
      assert.deepEqual(result.candidates.map(c=>c.ingredientEvidence),await activity.getIngredientDefinitionEvidence(ids,raw(selector).IngredientsType));
      if(selector===meal)assert(result.candidates.every(c=>c.ingredientEvidence.status==='recorded_meal_ingredients_required'));
    }
  }
  const simple=selectors.find(s=>!raw(s).IngredientsType?.length&&!raw(s).FishLocation?.UseField&&!raw(s).FishRarity?.UseField);
  const result=await reader.resolveObjectiveSelector(simple);
  assert(result.candidates.every(c=>c.ingredientEvidence===null&&c.fishingEvidence===null));
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')||url.includes('/acquisition/public/')));
  await assert.rejects(reader.resolveObjectiveSelector({...simple,selectorMode:'Item'}),/OBJECTIVE_FILTER_REQUIRED/);
});
