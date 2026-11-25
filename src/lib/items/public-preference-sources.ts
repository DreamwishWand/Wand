/** Shared source-defined character preference profile, slot and pool rules.
 * No daily selection, unlock state, probability or native filter result is
 * inferred from these static references. Repeated slots are intentional.
 */
import type {PublicCompleteItemMaster,ItemFieldValue} from './public-item-master.ts';
const CHAR='da6794c66a801a1de43a6ac7b7b79d77a663661f3226bc51a249092632777f0f';
const PREF='07690a024240d6040de3d9bf087f0c05d4c1dc5dcf0dd5bec59db6ee2004d948';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function check(v:unknown,why:string):asserts v{if(!v)throw TypeError('DB01_PREFERENCE_'+why);}
function input(ids:readonly number[]){check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');}
const unique=(ids:readonly number[])=>[...new Set(ids)].sort((a,b)=>a-b);
const groupNames=['FavoriteFlowers','FavoriteMeals','FavoriteIngredients','FavoriteMinerals','FavoriteCraftingMaterials'] as const;
export type PreferenceGroup=typeof groupNames[number];
export type PreferenceProfileRole='primary'|'fallback';
export type PreferencePolarity='include'|'exclude';
type Status='indexed'|'not_indexed';
const primary='source.PreferedItemsProfileItemID',fallback='source.FallbackPreferedItemsProfileItemID',slots='source.Slots';
const explicit=/^source\.(FavoriteFlowers|FavoriteMeals|FavoriteIngredients|FavoriteMinerals|FavoriteCraftingMaterials)\.(Inclusions\.Custom|Exclusions)\.SpecificItems\[(\d+)\]$/;
const slotPath=/^source\.Slots\[(\d+)\]$/;
function role(path:string):PreferenceProfileRole|null{return path===primary?'primary':path===fallback?'fallback':null;}
export interface PreferenceRule {
  readonly group:PreferenceGroup;
  readonly inclusionMode:'all'|'custom'|'unset'|'unresolved';
  readonly inclusions:Obj;
  readonly exclusions:Obj;
  readonly original:Obj;
}
export interface PreferencePoolDefinition {
  readonly poolItemId:number;
  readonly rules:readonly Readonly<PreferenceRule>[];
  readonly dailySelectionVerified:false;
}
export interface PreferenceProfileDefinition {
  readonly profileItemId:number;
  readonly slots:readonly Readonly<{slotIndex:number;poolItemId:number;pool:Readonly<PreferencePoolDefinition>}>[];
}
export interface CharacterPreferenceDefinition {
  readonly characterItemId:number;
  readonly primary:Readonly<PreferenceProfileDefinition>|null;
  readonly fallback:Readonly<PreferenceProfileDefinition>|null;
  readonly preferredItemDifficulties:ItemFieldValue|null;
  readonly dailySelectionVerified:false;
}
export interface CharacterPreferenceResult {
  readonly itemId:number;
  readonly status:Status|'not_character';
  readonly definition:Readonly<CharacterPreferenceDefinition>|null;
}
export interface PreferenceItemOccurrence {
  readonly poolItemId:number;
  readonly group:PreferenceGroup;
  readonly polarity:PreferencePolarity;
  readonly sourcePath:string;
  readonly itemIndex:number;
  readonly characterSlots:readonly Readonly<{characterItemId:number;profileItemId:number;role:PreferenceProfileRole;slotIndex:number}>[];
}
export interface PreferenceItemResult {
  readonly itemId:number;
  readonly status:Status;
  readonly occurrences:readonly Readonly<PreferenceItemOccurrence>[];
  readonly filterMembershipVerified:false;
  readonly dailySelectionVerified:false;
}
function rule(group:PreferenceGroup,raw:unknown):Readonly<PreferenceRule>{
  check(obj(raw)&&obj(raw.Inclusions)&&obj(raw.Exclusions),'RULE');
  const inc=raw.Inclusions,exc=raw.Exclusions,keys=Object.keys(inc);
  const mode:PreferenceRule['inclusionMode']=!keys.length?'unset':
    keys.length===1&&obj(inc.All)?'all':keys.length===1&&obj(inc.Custom)?'custom':'unresolved';
  return Object.freeze({group,inclusionMode:mode,inclusions:inc,exclusions:exc,original:raw});
}
export function createPreferenceSourceReader(db:PublicCompleteItemMaster){
  const release=db.release,source=release.sourceFilesSha256;
  const pinned=release.target.platform==='Steam'&&release.sourceIl2cppDumpSha256===DUMP&&source?.Character===CHAR&&source?.Preference===PREF;
  let task:Promise<ReadonlySet<string>|null>|undefined;
  function index(){
    if(!task){
      const promise=(async()=>{
        if(!pinned)return null;
        const catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
        return ['sourceClass',primary,fallback,slots,'references.incoming',...groupNames.map(g=>'source.'+g)].every(f=>catalog.has(f))?catalog:null;
      })();task=promise;void promise.catch(()=>{if(task===promise)task=undefined;});
    }
    return task;
  }
  async function getForCharacters(ids:readonly number[]):Promise<readonly (Readonly<CharacterPreferenceResult>|null)[]>{
    input(ids);const catalog=await index();
    if(!catalog)return Object.freeze((await db.getItemFields(ids,['itemId'])).map(r=>r?Object.freeze({itemId:r.itemId,status:'not_indexed' as const,definition:null}):null));
    const rows=await db.getItemFields(ids,['sourceClass',primary,fallback,...(catalog.has('source.PreferredItemDifficulties')?['source.PreferredItemDifficulties']:[])]);
    const profileIds=unique(rows.flatMap(r=>r?.values.sourceClass==='CharacterItemData'?[r.values[primary],r.values[fallback]].filter(id):[]));
    const profiles=new Map<number,readonly number[]>();
    for(const row of await db.getItemFields(profileIds,['sourceClass',slots])){
      check(row?.values.sourceClass==='PreferenceProfileItemData','PROFILE_JOIN');
      const values=row.values[slots];check(Array.isArray(values)&&values.every(id),'SLOTS');
      profiles.set(row.itemId,values as readonly number[]);
    }
    const pools=new Map<number,Readonly<PreferencePoolDefinition>>();
    for(const row of await db.getItemFields(unique([...profiles.values()].flat()),['sourceClass',...groupNames.map(g=>'source.'+g)])){
      check(row?.values.sourceClass==='PreferencePoolItemData','POOL_JOIN');
      pools.set(row.itemId,Object.freeze({poolItemId:row.itemId,rules:Object.freeze(groupNames.map(g=>rule(g,row.values['source.'+g]))),dailySelectionVerified:false}));
    }
    const definitions=new Map<number,Readonly<PreferenceProfileDefinition>>();
    for(const [profileItemId,slotIds] of profiles){
      definitions.set(profileItemId,Object.freeze({profileItemId,slots:Object.freeze(slotIds.map((poolItemId,slotIndex)=>{
        const pool=pools.get(poolItemId);check(pool,'POOL_SLOT');
        return Object.freeze({slotIndex,poolItemId,pool});
      }))}));
    }
    return Object.freeze(rows.map(row=>{
      if(!row)return null;
      const status:CharacterPreferenceResult['status']=!catalog?'not_indexed':row.values.sourceClass==='CharacterItemData'?'indexed':'not_character';
      const profile=(key:string)=>{
        const v=row.values[key];if(v===undefined||v===0)return null;
        check(id(v),'PROFILE_ID');const p=definitions.get(v);check(p,'PROFILE_REF');return p;
      };
      return Object.freeze({itemId:row.itemId,status,definition:status==='indexed'?Object.freeze({
        characterItemId:row.itemId,primary:profile(primary),fallback:profile(fallback),
        preferredItemDifficulties:row.values['source.PreferredItemDifficulties']??null,dailySelectionVerified:false as const
      }):null});
    }));
  }
  /** Inverse only for explicit item lists. Tag, category and other rule
   * conditions remain in pool definitions; no false inclusion/exclusion. */
  async function getForItems(ids:readonly number[]):Promise<readonly (Readonly<PreferenceItemResult>|null)[]>{
    input(ids);const catalog=await index();
    if(!catalog)return Object.freeze((await db.getItemFields(ids,['itemId'])).map(r=>r?Object.freeze({
      itemId:r.itemId,status:'not_indexed' as const,occurrences:Object.freeze([]),filterMembershipVerified:false as const,dailySelectionVerified:false as const}):null));
    const incoming=await db.getItemsReferences(ids,'incoming');
    const poolIds=unique(incoming.flatMap(r=>(r??[]).filter(([,path])=>explicit.test(path)).map(([i])=>i)));
    const poolRows=await db.getItemFields(poolIds,['sourceClass']);
    check(poolRows.every(r=>r?.values.sourceClass==='PreferencePoolItemData'),'POOL_CLASS');
    const poolIncoming=await db.getItemsReferences(poolIds,'incoming');
    const profileIds=unique(poolIncoming.flatMap(r=>(r??[]).filter(([,path])=>slotPath.test(path)).map(([i])=>i)));
    const profileRows=await db.getItemFields(profileIds,['sourceClass',slots]);
    check(profileRows.every(r=>r?.values.sourceClass==='PreferenceProfileItemData'),'PROFILE_CLASS');
    const profileIncoming=await db.getItemsReferences(profileIds,'incoming');
    const charIds=unique(profileIncoming.flatMap(r=>(r??[]).filter(([,path])=>role(path)!==null).map(([i])=>i)));
    const chars=new Map((await db.getItemFields(charIds,['sourceClass',primary,fallback])).flatMap(r=>r?[[r.itemId,r.values] as const]:[]));
    const profiles=new Map(profileRows.map((r,i)=>[profileIds[i],{row:r,refs:profileIncoming[i]??[]}]));
    const poolContexts=new Map(poolIds.map((poolItemId,i)=>{
      const contexts:PreferenceItemOccurrence['characterSlots'][number][]=[];
      for(const [profileItemId,path] of poolIncoming[i]??[]){
        const m=slotPath.exec(path);if(!m)continue;
        const p=profiles.get(profileItemId),s=p?.row?.values[slots],slotIndex=Number(m[1]);
        check(p&&Array.isArray(s)&&s[slotIndex]===poolItemId,'SLOT_REF');
        for(const [characterItemId,charPath] of p.refs){
          const r=role(charPath);if(r===null)continue;
          const v=chars.get(characterItemId);check(v?.sourceClass==='CharacterItemData'&&v[charPath]===profileItemId,'CHAR_REF');
          contexts.push(Object.freeze({characterItemId,profileItemId,role:r,slotIndex}));
        }
      }
      return [poolItemId,Object.freeze(contexts)] as const;
    }));
    return Object.freeze(incoming.map((r,i)=>r===null?null:Object.freeze({itemId:ids[i],status:'indexed' as const,
      occurrences:Object.freeze(r.flatMap(([poolItemId,sourcePath])=>{
        const m=explicit.exec(sourcePath);if(!m)return [];
        return [Object.freeze({poolItemId,group:m[1] as PreferenceGroup,polarity:m[2]==='Exclusions'?'exclude' as const:'include' as const,
          sourcePath,itemIndex:Number(m[3]),characterSlots:poolContexts.get(poolItemId)??Object.freeze([])})];
      })),filterMembershipVerified:false as const,dailySelectionVerified:false as const})));
  }
  return Object.freeze({release,getForCharacters,getForItems});
}
