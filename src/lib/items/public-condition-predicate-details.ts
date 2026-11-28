/** Source-typed condition predicate details for acquisition and Guide.
 * Keep operators and unknown predicates, never flatten to mandatory requirements.
 * Target map mirrors the audited canonical source reference contract in
 * materialize-complete-source-master.mjs; no inferred numeric references. */
import {ITEM_MASTER_LOCALES,type PublicCompleteItemMaster,type ItemFieldValue,type ItemMasterLocale} from './public-item-master.ts';
const targets:Readonly<Record<string,readonly string[]>>={
  "MissionStepStatus.Mission": [
    "Mission"
  ],
  "MissionStatus.Mission": [
    "Mission"
  ],
  "DialogueFlag.Flag": [
    "Dialogue"
  ],
  "CommonConditions.Condition": [
    "Condition"
  ],
  "CurrentScene.Scene": [
    "Scene"
  ],
  "MissionObjectiveStatus.Mission": [
    "Mission"
  ],
  "CharacterUnlocked.Character": [
    "Character"
  ],
  "MissionCompleted.Mission": [
    "Mission"
  ],
  "MissionStepCompleted.Mission": [
    "Mission"
  ],
  "CharacterFriendship.Character": [
    "Character"
  ],
  "Inventory.Item": [
    "ActivityItem",
    "Upgrade",
    "Currency",
    "Clothing",
    "Furniture"
  ],
  "PetAssigned.Pet": [
    "Companion"
  ],
  "MissionOngoing.Mission": [
    "Mission"
  ],
  "KeyholeItemStatus.Item": [
    "ActivityItem",
    "Companion"
  ],
  "BuildingUnlocked.Building": [
    "Building"
  ],
  "CurrentVillage.VillageScene": [
    "Scene"
  ],
  "ToolUnlocked.Tool": [
    "Tool"
  ],
  "FTUEEventCompleted.FTUEEvent": [
    "Ftue"
  ],
  "PetUnlocked.Pet": [
    "Companion"
  ],
  "CharacterSkin.Skin": [
    "Skin"
  ],
  "HasEverOwned.Item": [
    "Furniture"
  ],
  "WearingClothes.Clothes": [
    "Clothing"
  ],
  "MissionObjectiveCompleted.Mission": [
    "Mission"
  ],
  "RealmUnlocked.Universe": [
    "Tag"
  ],
  "MountIsUnlocked.Mount": [
    "Companion"
  ],
  "MissionObjectiveProgression.Mission": [
    "Mission"
  ],
  "MountIsRiding.Mount": [
    "Companion"
  ],
  "MemoryShard.Shard": [
    "MemoryShard"
  ],
  "StoryCompleted.Story": [
    "Story"
  ],
  "MissionAvailable.Mission": [
    "Mission"
  ],
  "PetAssignedToCharacter.Pet": [
    "Companion"
  ],
  "StallAvailable.Stall": [
    "Building"
  ],
  "MountHasUpgrade.Upgrade": [
    "Upgrade"
  ],
  "MountBondingLevel.Mount": [
    "Companion"
  ],
  "CookingRecipeVisible.Recipe": [
    "ActivityData"
  ],
  "CookingRecipeKnownWith.Tag": [
    "Tag"
  ],
  "BuildingLevel.Building": [
    "Building"
  ],
  "PetAssignedToCharacter.Character": [
    "Character"
  ],
  "IsHangingOut.Character": [
    "Character"
  ],
  "MissionObjectiveSkipped.Mission": [
    "Mission"
  ],
  "TrialState.Trial": [
    "DutyAch"
  ]
};
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v);
const id=(v:unknown):v is number=>integer(v)&&v>0;
const comparisonNames=['Equal','NotEqual','LessThan','LessThanOrEqual','GreaterThan','GreaterThanOrEqual'] as const;
const booleanNames=['AND','OR','NOT'] as const;
const stateNames:Readonly<Record<number,string>>={0:'NotAvailableYet',2:'Available',4:'OnGoing',8:'Completed'};
const comparisonKinds=new Set(['CharacterFriendship','Inventory','MissionStatus','PlayerLevel']);
function check(ok:unknown,why:string):asserts ok{if(!ok)throw TypeError('DB01_CONDITION_DETAILS_'+why);}
export interface ConditionTargetIdentity {
  readonly sourceField:string;
  readonly itemId:number;
  readonly expectedCategories:readonly string[];
  readonly status:'resolved'|'missing_definition'|'category_mismatch';
  readonly name:string|null;
  readonly nativeCategory:string|null;
}
export interface ConditionPredicateDetails {
  readonly kind:string;
  readonly sourcePath:string;
  readonly original:ItemFieldValue;
  readonly comparisonCode:number|null;
  readonly comparison:typeof comparisonNames[number]|null;
  readonly missionStateCode:number|null;
  readonly missionState:string|null;
  readonly inversed:boolean|null;
  readonly targets:readonly Readonly<ConditionTargetIdentity>[];
}
export interface ConditionBranchDetails {
  readonly original:ItemFieldValue;
  readonly operatorCode:number|null;
  readonly operator:typeof booleanNames[number]|null;
  readonly children:readonly (Readonly<{type:'predicate';predicate:Readonly<ConditionPredicateDetails>}>|
    Readonly<{type:'branch';branch:Readonly<ConditionBranchDetails>}>)[];
}
interface Identity {category:string;name:string|null}
const lookup=(v:unknown)=>integer(v)?v:null;
/** Input trees are from canonical condition fields; only named reviewed IDs are
 * resolved. Unknown fields and omitted scalar values remain exactly as read. */
export async function readConditionPredicateDetails(db:PublicCompleteItemMaster,
  trees:readonly (ItemFieldValue|null)[],locale:ItemMasterLocale):Promise<readonly (Readonly<ConditionBranchDetails>|null)[]>{
  check(Array.isArray(trees)&&trees.length<=20000,'ROOTS');
  check(ITEM_MASTER_LOCALES.includes(locale),'LOCALE');
  const pinned=db.release.target.platform==='Steam'&&
    db.release.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
  check(pinned,'SOURCE_SCHEMA');
  const referenced=new Set<number>();
  const identities=new Map<number,Identity>();
  function walk(tree:ItemFieldValue,path:string,depth:number,resolve:boolean):Readonly<ConditionBranchDetails>{
    check(depth<=24,'DEPTH');
    const raw=obj(tree)?tree:{};
    const code=lookup(raw.Operator);
    const children:ConditionBranchDetails['children'][number][]=[];
    if(Array.isArray(raw.Conditions))for(const [i,leaf] of raw.Conditions.entries()){
      const prefix=path+'.Conditions['+i+']';
      const fields=obj(leaf)?Object.entries(leaf):[['Unknown',leaf] as const];
      for(const [kind,payload] of fields){
        const sourcePath=prefix+'.'+kind;
        if(kind==='SubConditions'&&obj(payload)){
          children.push(Object.freeze({type:'branch' as const,branch:walk(payload,sourcePath,depth+1,resolve)}));continue;
        }
        const p=obj(payload)?payload:{};
        const links:ConditionTargetIdentity[]=[];
        for(const [field,value] of Object.entries(p)){
          const key=kind+'.'+field;
          const allowed=Object.hasOwn(targets,key)?targets[key]:undefined;
          if(!allowed||!id(value))continue;
          if(!resolve){referenced.add(value);continue;}
          const identity=identities.get(value);
          const valid=identity&&allowed.includes(identity.category);
          links.push(Object.freeze({sourceField:sourcePath+'.'+field,itemId:value,expectedCategories:Object.freeze([...allowed]),
            status:valid?'resolved':identity?'category_mismatch':'missing_definition',
            name:valid?identity.name:null,nativeCategory:identity?.category??null}));
        }
        const comparisonCode=comparisonKinds.has(kind)?lookup(p.Operator):null;
        const missionStateCode=kind==='MissionStatus'?lookup(p.State):null;
        const predicate=Object.freeze({kind,sourcePath,original:payload,comparisonCode,
          comparison:comparisonCode===null?null:comparisonNames[comparisonCode]??null,
          missionStateCode,missionState:missionStateCode===null?null:stateNames[missionStateCode]??null,
          inversed:typeof p.Inversed==='boolean'?p.Inversed:null,targets:Object.freeze(links)});
        children.push(Object.freeze({type:'predicate' as const,predicate}));
      }
    }
    return Object.freeze({original:tree,operatorCode:code,operator:code===null?null:booleanNames[code]??null,
      children:Object.freeze(children)});
  }
  for(const tree of trees)if(tree!==null)walk(tree,'root',0,false);
  const ids=[...referenced].sort((a,b)=>a-b);
  for(let start=0;start<ids.length;start+=10000){
    for(const row of await db.getItemFields(ids.slice(start,start+10000),['nativeCategory','names.'+locale])){
      if(!row)continue;
      const category=row.values.nativeCategory,name=row.values['names.'+locale];
      check(typeof category==='string','CATEGORY');
      identities.set(row.itemId,{category,name:typeof name==='string'&&name.length?name:null});
    }
  }
  return Object.freeze(trees.map(t=>t===null?null:walk(t,'root',0,true)));
}
