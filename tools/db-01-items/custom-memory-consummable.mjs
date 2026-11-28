/** Build-only join of original Custom memory definitions and their override
 * consumables. A shared visual/selector item is not a unique reward. */
const id=v=>Number.isSafeInteger(v)&&v>0;
const check=(ok,why)=>{if(!ok)throw Error('DB01_CUSTOM_MEMORY_'+why)};
export function customMemoryConsummables(rows,source,knownCategories){
  const byMemory=new Map(),byOrb=new Map();
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
    source.sourceFilesSha256.MemoryShard!=='e5c017b208dc50e3e4b543a143fe57400429d67151d5fd68938fbda0a4ef5367'||
    source.sourceFilesSha256.ActivityItem!=='4f4d3393887aececfcef16569cebc8dd7df08d03ba7b7c89083fe15bb7309dc2')return {byMemory,byOrb};
  const decl=source.sourceFieldDeclarations.ConsummableItemData;
  check(decl.ItemTypeSelector===10&&decl.DefaultItem===11,'SCHEMA');
  const byId=new Map(rows.map(r=>[r.itemId,r])),counts={},classified={};
  const props=r=>({...r.nativeProperties,...r.sourceAttributes});
  for(const row of rows){
    if(row.sourceClass!=='MemoryShardItemData')continue;
    const p=props(row);
    if(p.AppearanceCondition!==9)continue;
    const orb=byId.get(p.ConsummableOverrideItemID);
    check(orb?.sourceClass==='ConsummableItemData'&&orb.nativeCategory==='ActivityItem','ORB');
    const q=props(orb),d=q.DefaultItem;
    const selector=orb.observedFields.some(([n,w])=>n===decl.ItemTypeSelector&&w===2);
    const defaultPresent=orb.observedFields.some(([n,w])=>n===decl.DefaultItem&&w===2);
    check(selector!==defaultPresent,'CONTENT_ONEOF');
    if(defaultPresent)check(id(d?.ItemID)&&byId.get(d.ItemID)?.nativeCategory==='MemoryShard'&&id(d.Amount)&&
      Number.isSafeInteger(d.State?.MemoryShardIndex)&&d.State.MemoryShardIndex>=0,'DEFAULT');
    const status=selector?'selector_field_present':d.ItemID===row.itemId?'explicit_matching_default':'different_default';
    const eligible=status==='explicit_matching_default'&&d.State.MemoryShardIndex<p.NumberOfShards;
    const categories=eligible?['ordinary_gameplay','in_game_limited_event'].filter(c=>knownCategories(orb.itemId).has(c)):[];
    const evidence={kind:'custom_memory_consummable',memoryItemId:row.itemId,consummableItemId:orb.itemId,
      sourcePath:'source.ConsummableOverrideItemID',contentStatus:status,selectorFieldPresent:selector,
      defaultItem:defaultPresent?d:null,defaultItemSourcePath:defaultPresent?'source.DefaultItem':null,
      isMissionItem:q.IsMissionItem===true,configuredCategories:categories,
      sourceGameVersion:source.target.gameVersion,sourceMemorySha256:source.sourceFilesSha256.MemoryShard,
      sourceActivityItemSha256:source.sourceFilesSha256.ActivityItem,
      runtimeContentVerified:false,guaranteedGrantVerified:false,currentAvailabilityVerified:false};
    byMemory.set(row.itemId,evidence);
    const list=byOrb.get(orb.itemId)??[];list.push(row.itemId);byOrb.set(orb.itemId,list);
    counts[status]=(counts[status]??0)+1;
    for(const category of categories)classified[category]=(classified[category]??0)+1;
  }
  check(byMemory.size===299&&byOrb.size===102&&counts.explicit_matching_default===68&&counts.different_default===8&&counts.selector_field_present===223,'CENSUS');
  console.log('DB01_CUSTOM_MEMORY '+JSON.stringify({items:byMemory.size,orbs:byOrb.size,counts,classified}));
  return {byMemory,byOrb};
}
