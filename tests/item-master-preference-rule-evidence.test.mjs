import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {createPreferenceRuleEvidenceReader,readPreferenceRuleEvidence} from '../src/lib/items/public-preference-rule-evidence.ts';

test('predicate evidence preserves inclusion/exclusion and never combines them into runtime eligibility',()=>{
  const row={itemId:31600022,values:{sourceClass:'MineralItemData',tags:[{id:2000700000}],'source.IsShiny':false}};
  const result=readPreferenceRuleEvidence('FavoriteMinerals',{Inclusions:{Custom:{DominantColor:[2000700000],SpecificItems:[31600022]}},Exclusions:{Shiny:true,SpecificItems:[31600022]}},row);
  assert.equal(result.inclusionMode,'custom');
  assert.deepEqual(result.predicates.map(p=>[p.polarity,p.field,p.match]),[
    ['include','DominantColor',true],['include','SpecificItems',true],['exclude','Shiny',false],['exclude','SpecificItems',true]]);
  assert.equal(result.nativeMembershipVerified,false);
  const absent=readPreferenceRuleEvidence('FavoriteMinerals',{Inclusions:{All:{}},Exclusions:{Shiny:true}},{itemId:1,values:{sourceClass:'MineralItemData'}});
  assert.equal(absent.predicates[0].match,null);
  const meal=readPreferenceRuleEvidence('FavoriteMeals',{Inclusions:{Custom:{MealType:[2001500000],ContainsIngredients:[2001400000]}},Exclusions:{}},{itemId:1,values:{sourceClass:'MealItemData','source.MealType':2001500000}});
  assert.deepEqual(meal.predicates.map(p=>[p.evidenceKind,p.match]),[['source_scalar',true],['recorded_meal_state_required',null]]);
  const flower=readPreferenceRuleEvidence('FavoriteFlowers',{Inclusions:{},Exclusions:{Rarity:[0,1,1]}},{itemId:1,values:{sourceClass:'FlowerItemData','source.Rarity':0}});
  assert.equal(flower.inclusionMode,'unset');assert.equal(flower.predicates[0].match,true);
  assert.deepEqual(flower.predicates[0].configured,[0,1,1]);
});

test('all 430 current original rules preserve independently counted non-item predicates',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const ids=await db.findItemIdsByField('sourceClass',{kind:'equals',value:'PreferencePoolItemData'});
  assert.equal(ids.length,86);
  const reader=createPreferenceRuleEvidenceReader(db);
  const rows=await reader.getForPools(ids,[31700026]);
  assert(rows.every(r=>r.status==='indexed'&&r.items[0].rules.length===5));
  const rules=rows.flatMap(r=>r.items[0].rules);
  assert.equal(rules.length,430);
  const count=(group,polarity,field)=>rules.filter(r=>r.group===group&&r.predicates.some(p=>p.polarity===polarity&&p.field===field)).length;
  for(const [g,p,f,n] of [
    ['FavoriteFlowers','include','DominantColor',40],['FavoriteFlowers','exclude','DominantColor',5],['FavoriteFlowers','exclude','Rarity',1],
    ['FavoriteMinerals','include','DominantColor',37],['FavoriteMinerals','exclude','DominantColor',1],['FavoriteMinerals','exclude','Shiny',22],
    ['FavoriteIngredients','include','IngredientType',19],['FavoriteIngredients','exclude','IngredientType',22],['FavoriteIngredients','exclude','IngredientTags',1],
    ['FavoriteMeals','include','MealType',5],['FavoriteMeals','include','ContainsIngredients',12],['FavoriteMeals','exclude','ContainsIngredients',24]
  ])assert.equal(count(g,p,f),n,g+':'+p+':'+f);
  assert(rules.flatMap(r=>r.predicates).filter(p=>p.field==='ContainsIngredients').every(p=>p.match===null));
  assert(rules.flatMap(r=>r.predicates).some(p=>p.field==='SpecificItems'&&p.match===true));
  assert(rules.every(r=>r.nativeMembershipVerified===false&&r.dailySelectionVerified===false));
  const [r,missing,nonpool,repeat]=await reader.getForPools([ids[0],99999999,31700026,ids[0]],[31700026,99999999,31700026]);
  assert.equal(missing,null);assert.equal(nonpool.status,'not_pool');assert.equal(r.items[1],null);
  assert.deepEqual(r.items[0],r.items[2]);assert.deepEqual(r,repeat);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});
