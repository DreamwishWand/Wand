/** Explicit reward bag contents, with an independently known ordinary
 * acquisition route for the bag. Never classify a generic table referrer,
 * random generator output, conditional entry or unknown/zero roll group. */
const id=v=>Number.isSafeInteger(v)&&v>0;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function ordinaryLootPresentLinks(rows,source,isOrdinary){
  const result=new Map();
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
    source.sourceFilesSha256.ActivityItem!=='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2'||
    source.sourceFilesSha256.LootTable!=='580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c')return result;
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  const props=r=>({...r.nativeProperties,...r.sourceAttributes});
  let bags=0,ordinaryBags=0,usedBags=0,occurrences=0;
  for(const bag of rows){
    if(bag.sourceClass!=='LootPresentItemData')continue;
    const tableId=props(bag).LootTableItemID,table=byId.get(tableId);
    if(!id(tableId)||table?.nativeCategory!=='LootTable')continue;
    bags++;
    if(!isOrdinary(bag.itemId))continue;
    ordinaryBags++;
    let emitted=false;
    for(const [groupIndex,g] of (props(table).Rewards?.SubLootTables??[]).entries()){
      if(!obj(g)||!id(g.Max)||!Number.isSafeInteger(g.Min)||g.Min<0||g.Min>g.Max||
        g.Empty===true||g.AvailableWhen!==undefined||(g.Filters??[]).length||
        (g.Types??g.Types_??[]).length||(g.Rarities??[]).length||g.MinRarity!==undefined||
        g.MaxRarity!==undefined||(g.ItemsConditional??[]).length||
        (g.Weight!==undefined&&!id(g.Weight)))continue;
      for(const [itemIndex,v] of (g.Items??[]).entries()){
        const target=v?.ItemID;
        if(!id(target)||!byId.has(target)||target===bag.itemId||byId.get(target).nativeCategory==='LootTable')continue;
        const list=result.get(target)??[];
        list.push({sourceItemId:bag.itemId,tableItemId:tableId,kind:'ordinary_loot_present_candidate',
          sourcePath:'source.LootTableItemID',tableSourcePath:'source.Rewards.SubLootTables['+groupIndex+'].Items['+itemIndex+'].ItemID',
          groupIndex,itemIndex,minimumRolls:g.Min,maximumRolls:g.Max,configuredWeight:g.Weight??null,
          sourceGameVersion:source.target.gameVersion,sourceActivityItemSha256:source.sourceFilesSha256.ActivityItem,
          sourceLootTableSha256:source.sourceFilesSha256.LootTable,
          ordinarySourceIndependentlyClassified:true,guaranteedGrantVerified:false,currentAvailabilityVerified:false});
        result.set(target,list);emitted=true;occurrences++;
      }
    }
    if(emitted)usedBags++;
  }
  console.log('DB01_ORDINARY_LOOT_PRESENT '+JSON.stringify({bags,ordinaryBags,usedBags,items:result.size,occurrences}));
  return result;
}
