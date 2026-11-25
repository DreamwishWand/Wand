/** Original quest objective selectors from the current canonical Mission
 * structures. A target candidate is NOT an unconditional requirement, grant,
 * or evidence of player progress. No separate quest-item database.
 */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';

const RULES={
  BringItem:{selectors:['TargetItem'],any:true,amount:'AmountToGive'},
  Possess:{selectors:['Item'],any:false,amount:'ItemAmount'},
  CraftItem:{selectors:['Target'],any:false,amount:'AmountToCraft'},
  CookMeal:{selectors:['TargetMealItem','TargetIngredientItem'],any:false,amount:'AmountToCook'},
  ConsumeItem:{selectors:['Item'],any:false,amount:'ItemAmount'},
  CollectCurrency:{selectors:['CurrencyType'],any:false,amount:'TargetAmount'},
  MineMineral:{selectors:['TargetItem'],any:false,amount:'TargetAmount'},
  GiftToCharacter:{selectors:['TargetItem'],any:false,amount:'TargetAmount'},
  PurchaseItem:{selectors:['ItemToPurchase'],any:true,amount:'ItemToPurchaseAmount'},
  SellItem:{selectors:['ItemToSell'],any:true,amount:'ItemToGiveAmount'},
  PickUp:{selectors:['FlowerItem','EphemeralItem','IngredientItem','QuestItem','RegularItem'],any:false,amount:'AmountToCollect'},
  CatchFish:{selectors:['TargetItem'],any:false,amount:null},
  GardeningHarvest:{selectors:['TargetItem','TargetSeed'],any:false,amount:'Amount'},
  GardeningPlant:{selectors:['TargetItem','TargetSeed'],any:false,amount:'Amount'}
} as const;
const MODES=['Item','ItemList','ItemGenerator','FilterGenerator'] as const;
type Obj=Readonly<Record<string,ItemFieldValue>>;
export type QuestObjectiveKind=keyof typeof RULES;
export type QuestSelectorMode=typeof MODES[number];
export interface QuestObjectiveItemCandidate {
  readonly itemId:number;
  readonly role:'direct'|'alternative';
  readonly generatorKind:'Item'|'ItemIngredient';
  readonly sourcePath:string;
  readonly weight:ItemFieldValue|null;
  readonly useAsFilter:boolean|null;
}
export interface QuestObjectiveItemSelector {
  readonly questId:number;
  readonly stepIndex:number;
  readonly subStepIndex:number;
  readonly objectiveIndex:number;
  readonly stepId:number|null;
  readonly subStepId:number|null;
  readonly objectiveId:number|null;
  readonly objectiveKind:QuestObjectiveKind;
  readonly selectorField:string;
  readonly sourcePath:string;
  readonly selectorMode:QuestSelectorMode|null;
  readonly anyCategoryCode:number|null;
  /** Original amount shape, preserving omitted/explicit Value and Range. */
  readonly amount:ItemFieldValue|null;
  readonly amountField:string|null;
  readonly originalSelector:Obj;
  readonly candidates:readonly Readonly<QuestObjectiveItemCandidate>[];
  readonly runtimeRequirementVerified:false;
}
export interface QuestObjectiveResult {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed';
  readonly selectors:readonly Readonly<QuestObjectiveItemSelector>[];
  readonly runtimeRequirementVerified:false;
}
export interface QuestObjectiveItemUse {
  readonly selector:Readonly<QuestObjectiveItemSelector>;
  readonly candidate:Readonly<QuestObjectiveItemCandidate>;
}
const object=(x:unknown):x is Obj=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const int=(x:unknown):number|null=>typeof x==='number'&&Number.isSafeInteger(x)?x:null;
function check(ok:unknown,reason:string):asserts ok{if(!ok)throw new TypeError('DB01_QUEST_OBJECTIVES_'+reason);}
function array(v:unknown):readonly ItemFieldValue[]{if(v===undefined)return [];check(Array.isArray(v),'ARRAY');return v;}
function assertIds(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
function parseSelector(raw:Obj,path:string,any:boolean){
  const inner=any?raw.ItemToGive:raw;
  check(inner===undefined||object(inner),'SELECTOR');
  const modes=MODES.filter(m=>object(inner)&&Object.hasOwn(inner,m));
  check(modes.length<=1,'ONEOF');
  const selectorMode=modes[0]??null;
  const candidates:QuestObjectiveItemCandidate[]=[];
  if(selectorMode!==null&&object(inner)){
    const g=inner[selectorMode];check(object(g),'GENERATOR');
    const base=path+(any?'.ItemToGive':'')+'.'+selectorMode;
    for(const generatorKind of ['Item','ItemIngredient'] as const){
      const choice=g[generatorKind];if(choice===undefined)continue;
      check(object(choice),'CHOICE');
      const direct=choice.Item,list=choice.ItemList;
      check(direct===undefined||list===undefined,'CHOICE_ONEOF');
      if(direct!==undefined){
        check(typeof direct==='number'&&Number.isSafeInteger(direct),'DIRECT_ID');
        if(id(direct))candidates.push(Object.freeze({itemId:direct,role:'direct',generatorKind,
          sourcePath:base+'.'+generatorKind+'.Item',weight:null,useAsFilter:null}));
      }
      if(list!==undefined){
        check(object(list),'LIST');
        check(list.UseAsFilter===undefined||typeof list.UseAsFilter==='boolean','FILTER');
        for(const [i,entry] of array(list.List).entries()){
          check(object(entry),'WEIGHTED_ITEM');
          if(id(entry.Item))candidates.push(Object.freeze({itemId:entry.Item,role:'alternative',generatorKind,
            sourcePath:base+'.'+generatorKind+'.ItemList.List['+i+'].Item',
            weight:entry.Weight??null,useAsFilter:list.UseAsFilter===true}));
        }
      }
    }
  }
  return {selectorMode,anyCategoryCode:any?int(raw.ItemTypeToGive):null,candidates:Object.freeze(candidates)};
}
export function createCurrentQuestObjectiveReader(db:PublicCompleteItemMaster){
  // This reader is calibrated against the original schema and corpus. A
  // future different source must be verified before claiming indexed coverage.
  const verified=db.release.target.platform==='Steam'&&
    db.release.sourceFilesSha256?.Mission==='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24'&&
    db.release.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
  async function getForQuests(ids:readonly number[]):Promise<readonly (Readonly<QuestObjectiveResult>|null)[]>{
    assertIds(ids);
    const catalog=await db.getFieldCatalog();
    const indexed=verified&&catalog.some(f=>f.field==='source.Steps')&&catalog.some(f=>f.field==='nativeCategory');
    const rows=await db.getItemFields(ids,indexed?['nativeCategory','source.Steps']:['itemId']);
    return Object.freeze(rows.map(r=>{
      if(!r)return null;
      const selectors:QuestObjectiveItemSelector[]=[];
      if(indexed&&r.values.nativeCategory==='Mission'){
        for(const [stepIndex,step] of array(r.values['source.Steps']).entries()){
          check(object(step),'STEP');
          for(const [subStepIndex,sub] of array(step.SubSteps).entries()){
            check(object(sub),'SUBSTEP');
            for(const [objectiveIndex,objective] of array(sub.Objectives).entries()){
              check(object(objective),'OBJECTIVE');
              for(const objectiveKind of Object.keys(RULES) as QuestObjectiveKind[]){
                const rule=RULES[objectiveKind],data=objective[objectiveKind];
                if(data===undefined)continue;
                check(object(data),'OBJECTIVE_KIND');
                for(const selectorField of rule.selectors){
                  const raw=data[selectorField];if(raw===undefined)continue;
                  check(object(raw),'SELECTOR_FIELD');
                  const sourcePath='source.Steps['+stepIndex+'].SubSteps['+subStepIndex+'].Objectives['+objectiveIndex+'].'+objectiveKind+'.'+selectorField;
                  selectors.push(Object.freeze({questId:r.itemId,stepIndex,subStepIndex,objectiveIndex,
                    stepId:int(step.StepID),subStepId:int(sub.SubStepID),objectiveId:int(objective.ObjectiveID),
                    objectiveKind,selectorField,sourcePath,...parseSelector(raw,sourcePath,rule.any),
                    amount:rule.amount===null?null:data[rule.amount]??null,amountField:rule.amount,
                    originalSelector:raw,runtimeRequirementVerified:false as const}));
                }
              }
            }
          }
        }
      }
      return Object.freeze({itemId:r.itemId,status:indexed?'indexed' as const:'not_indexed' as const,
        selectors:Object.freeze(selectors),runtimeRequirementVerified:false as const});
    }));
  }
  async function getForItems(ids:readonly number[]):Promise<readonly (Readonly<{
    itemId:number;status:'indexed'|'not_indexed';uses:readonly Readonly<QuestObjectiveItemUse>[];runtimeRequirementVerified:false
  }>|null)[]>{
    assertIds(ids);
    const catalog=await db.getFieldCatalog();
    const indexed=verified&&catalog.some(f=>f.field==='source.Steps')&&catalog.some(f=>f.field==='references.incoming');
    const refs=indexed?await db.getItemsReferences(ids,'incoming'):null;
    if(!refs){
      const rows=await db.getItemFields(ids,['itemId']);
      return Object.freeze(rows.map(r=>r?Object.freeze({itemId:r.itemId,status:'not_indexed' as const,uses:Object.freeze([]),runtimeRequirementVerified:false as const}):null));
    }
    const paths=refs.map(list=>list?.filter(([,p])=>/^source\.Steps\[\d+\]\.SubSteps\[\d+\]\.Objectives\[\d+\]\./.test(p))??null);
    const questIds=[...new Set(paths.flatMap(list=>(list??[]).map(([q])=>q)))].sort((a,b)=>a-b);
    const quests=new Map<number,Readonly<QuestObjectiveResult>>();
    for(let i=0;i<questIds.length;i+=10000)for(const q of await getForQuests(questIds.slice(i,i+10000)))if(q)quests.set(q.itemId,q);
    return Object.freeze(paths.map((list,i)=>{
      if(list===null)return null;
      const uses:QuestObjectiveItemUse[]=[];
      const seen=new Set<string>();
      for(const [questId,path] of list){
        const key=questId+':'+path;if(seen.has(key))continue;seen.add(key);
        for(const selector of quests.get(questId)?.selectors??[])for(const candidate of selector.candidates){
          if(candidate.itemId===ids[i]&&candidate.sourcePath===path)uses.push(Object.freeze({selector,candidate}));
        }
      }
      return Object.freeze({itemId:ids[i],status:'indexed' as const,uses:Object.freeze(uses),runtimeRequirementVerified:false as const});
    }));
  }
  return Object.freeze({release:db.release,getForQuests,getForItems});
}
