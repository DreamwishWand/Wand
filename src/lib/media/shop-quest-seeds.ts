import type {PublicCompleteItemMaster} from '../items/public-item-master.ts';
import type {ItemFieldRow} from '../items/item-field-reader.ts';
/** Native GetCharacterSkinQuests (0x6F76750) iterates MissionItemData,
 * tests AvailableConditions.conditions_ (0x70 -> 0x30) directly.
 * Predicate 0x6F77A5D compares oneof=60 and Skin at +0x18;
 * does NOT test SkinCondition, evaluate nested OR, or recurse into CommonConditions.
 * Other predicates are direct links to missions already in questsHash.
 * Thus without a direct seed the fixpoint is empty, independent of runtime order.
 * Exact original census: 1030 frames, 7 direct conditions, 3 distinct skins.
 * This gate is NOT a reward projection or proof of order of nonempty chains.
 */
const MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const DUMP_SHA='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
// Cross-check independently parsed native seed identities; never use these
// constants as fallback when DB data is unavailable. Values sorted by IDs
// solely for validation, NOT as an asserted runtime order.
const originalSeeds='170000014:2070000927,2070000928,2070000929;170000021:2070000951,2070000952,2070000953;170000081:2070001335';
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function verifyShopQuestSeeds(missionIds:readonly number[],conditionRows:readonly ItemFieldRow[]):ReadonlySet<number>|null{
 const missions=new Set(missionIds);
 if(missions.size!==1030||missionIds.length!==1030)return null;
 const pairs=new Map<number,number[]>();
 let count=0;
 for(const [mission,value] of conditionRows){
   if(!missions.has(mission))continue;
   if(!Array.isArray(value))return null;
   for(const leaf of value){
     if(!obj(leaf)||!Object.hasOwn(leaf,'CharacterSkin'))continue;
     const skin=leaf.CharacterSkin;
     if(!obj(skin)||typeof skin.Skin!=='number'||!Number.isSafeInteger(skin.Skin)||skin.Skin<=0)return null;
     const ids=pairs.get(skin.Skin)??[];ids.push(mission);pairs.set(skin.Skin,ids);count++;
   }
 }
 const signature=[...pairs].sort((a,b)=>a[0]-b[0]).map(([skin,ids])=>skin+':'+ids.sort((a,b)=>a-b).join(',')).join(';');
 return count===7&&signature===originalSeeds?new Set(pairs.keys()):null;
}
type Reader=Pick<PublicCompleteItemMaster,'release'|'getFieldCatalog'|'getFieldRows'|'findItemIdsByField'>;
const cache=new WeakMap<Reader,Promise<ReadonlySet<number>|null>>();
export function readShopQuestSeeds(db:Reader):Promise<ReadonlySet<number>|null>{
 const prior=cache.get(db);if(prior)return prior;
 const task=(async()=>{
   if(db.release.target.platform!=='Steam'||db.release.target.gameVersion!=='1.26.2'||
      db.release.sourceFilesSha256?.Mission!==MISSION_SHA||db.release.sourceIl2cppDumpSha256!==DUMP_SHA)return null;
   const fields=new Set((await db.getFieldCatalog()).map(f=>f.field));
   if(!fields.has('sourceClass')||!fields.has('source.AvailableConditions.Conditions'))return null;
   const [ids,conditions]=await Promise.all([
     db.findItemIdsByField('sourceClass',{kind:'equals',value:'MissionItemData'}),
     db.getFieldRows('source.AvailableConditions.Conditions')
   ]);
   return verifyShopQuestSeeds(ids,conditions);
 })();
 cache.set(db,task);
 void task.catch(()=>{if(cache.get(db)===task)cache.delete(db);});
 return task;
}
