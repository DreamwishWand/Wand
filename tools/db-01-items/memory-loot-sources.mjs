/** Build-time exact memory payloads in loot definitions. Keep the source
 * container/blocker references separate from any inferred availability.
 */
const id=n=>Number.isSafeInteger(n)&&n>0;
export function buildMemoryLootSources(rows,source,memories){
  const result=new Map();
  if(!memories.size||source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceFilesSha256.LootTable!=='580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c')return result;
  const props=r=>({...r.nativeProperties,...r.sourceAttributes});
  const referrers=new Map();
  for(const row of rows){
    const p=props(row);
    const field=row.sourceClass==='LootPresentItemData'?'LootTableItemID':
      row.sourceClass==='EphemeralItemData'?'TreasureLootTable':
      row.sourceClass==='FurnitureBlockerItemData'?'RewardLootTableItemID':null;
    if(!field||!id(p[field]))continue;
    const list=referrers.get(p[field])??[];
    list.push({sourceItemId:row.itemId,sourceClass:row.sourceClass,sourceCategory:row.nativeCategory,
      sourcePath:'source.'+field,sourceFileSha256:source.sourceFilesSha256[row.nativeCategory]});
    referrers.set(p[field],list);
  }
  let occurrences=0;
  for(const row of rows){
    if(row.nativeCategory!=='LootTable')continue;
    for(const [gi,g] of (props(row).Rewards?.SubLootTables??[]).entries()){
      const groups=[{items:g.Items??[],path:'Items',conditions:null},...(g.ItemsConditional??[]).map((c,i)=>({items:c.Items??[],path:'ItemsConditional['+i+'].Items',conditions:c.Conditions??null}))];
      for(const b of groups)for(const [ii,v] of b.items.entries()){
        const direct=memories.has(v.ItemID),nested=v.State?.ConsummableData,target=direct?v.ItemID:nested?.ItemID;
        const memory=memories.get(target);
        if(memory?.appearanceConditionCode!==9)continue;
        const state=direct?v.State:nested?.State,index=state?.MemoryShardIndex;
        const list=result.get(target)??[];
        list.push({tableItemId:row.itemId,targetItemId:target,
          sourcePath:'source.Rewards.SubLootTables['+gi+'].'+b.path+'['+ii+']'+(direct?'.ItemID':'.State.ConsummableData.ItemID'),
          groupIndex:gi,itemIndex:ii,shardIndex:Number.isSafeInteger(index)?index:null,
          shardIndexValid:Number.isSafeInteger(index)&&index>=0&&index<memory.configuredShardCount,
          configuredOrbItemId:direct?null:v.ItemID,configuredConsumableAmount:direct?null:nested?.Amount??null,
          minimumRolls:g.Min??null,maximumRolls:g.Max??null,configuredWeight:g.Weight??null,
          conditions:b.conditions,referrers:referrers.get(row.itemId)??[],sourceGameVersion:source.target.gameVersion,
          sourceLootTableSha256:source.sourceFilesSha256.LootTable,guaranteedGrantVerified:false,currentAvailabilityVerified:false});
        result.set(target,list);occurrences++;
      }
    }
  }
  console.log('DB01_MEMORY_LOOT '+JSON.stringify({items:result.size,occurrences,tables:new Set([...result.values()].flat().map(l=>l.tableItemId)).size}));
  return result;
}
