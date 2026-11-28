/** Build-only evidence index. A quest objective, spawn configuration or
 * loot entry is not proof of a grant or a currently available item.
 * Orb-only references are keyed by orb, never propagated to all its memories.
 */
const id=n=>Number.isSafeInteger(n)&&n>0;
const rules={
  LootTable:{Rewards:[
    [/^\.SubLootTables\[\d+\]\.(?:Items\[\d+\]|ItemsConditional\[\d+\]\.Items\[\d+\])\.ItemID$/,'loot_item_candidate'],
    [/^\.SubLootTables\[\d+\]\.(?:Items\[\d+\]|ItemsConditional\[\d+\]\.Items\[\d+\])\.State\.ConsummableData\.ItemID$/,'loot_configured_consumable_memory']
  ]},
  ConditionalEvent:{Spawn:[
    [/^\.RewardOverride\.ItemID$/,'spawn_reward_override'],
    [/^\.RewardOverride\.State\.ConsummableData\.ItemID$/,'spawn_configured_consumable_memory'],
    [/^\.ConsummableItem\.Item\.Item\.Item$/,'spawn_consumable_selector'],
    [/^\.InboxReward$/,'spawn_inbox_reward'],
    [/^\.RewardOverride\.State\.LootPresentData\.Items\[\d+\]\.ItemID$/,'spawn_present_item']
  ]},
  Mission:{
    ItemsToGive:[[/^\[\d+\]\.ItemToGive\.ItemToGive\.Item\.Item\.Item$/,'quest_item_to_give_selector']],
    Steps:[
      [/^\[\d+\]\.SubSteps\[\d+\]\.Objectives\[\d+\]\.Unlock\.MemoryShard\.MemoryShard$/,'quest_memory_unlock_objective'],
      [/^\[\d+\]\.SubSteps\[\d+\]\.Objectives\[\d+\]\.ConsumeItem\.Item\.Item\.Item\.Item$/,'quest_consume_objective'],
      [/^\[\d+\]\.SubSteps\[\d+\]\.Objectives\[\d+\]\.TalkToCharacter\.ItemsToGive\[\d+\]\.ItemToGive\.ItemToGive\.Item\.Item\.Item$/,'quest_dialogue_item_selector'],
      [/^\[\d+\]\.SubSteps\[\d+\]\.BringItem\.ItemsToGive\[\d+\]\.ItemToGive$/,'quest_bring_item_selector'],
      [/^\[\d+\]\.SubSteps\[\d+\]\.Objectives\[\d+\]\.PickUp\.RewardOverride\.ItemID$/,'quest_pickup_reward_override']
    ]
  },
  DutyAch:{Unlock:[[/^\.MemoryShard\.MemoryShard$/,'duty_memory_unlock_objective']]},
  ActivityData:{Result:[[/^\.ItemID$/,'activity_result_candidate']]}
};
export function buildMemoryNativeReferences(source,rows,memoryAppearance){
  const result=new Map();
  if(!memoryAppearance.size)return result;
  const known=new Map(rows.map(r=>[r.itemId,r]));
  const targets=new Map([...memoryAppearance.keys()].map(n=>[n,'memory']));
  for(const m of memoryAppearance.values()){
    const n=m.consummableOverrideItemId;
    if(id(n)&&m.consummableOverrideResolved&&known.get(n)?.nativeCategory==='ActivityItem'&&!targets.has(n))
      targets.set(n,'orb');
  }
  const counts={};
  for(const row of rows){
    const family=rules[row.nativeCategory];
    if(!family)continue;
    const attrs={...row.nativeProperties,...row.sourceAttributes};
    for(const [field,patterns] of Object.entries(family)){
      const scan=(value,path)=>{
        if(Array.isArray(value)){value.forEach((v,i)=>scan(v,path+'['+i+']'));return;}
        if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))scan(v,path+'.'+k);return;}
        if(!targets.has(value))return;
        const match=patterns.find(([pattern])=>pattern.test(path));
        if(!match)return;
        const role=match[1],targetScope=targets.get(value);
        const l={sourceItemId:row.itemId,sourceCategory:row.nativeCategory,targetItemId:value,targetScope,
          role,sourcePath:'source.'+field+path,sourceGameVersion:source.target.gameVersion,
          sourceFileSha256:source.sourceFilesSha256[row.nativeCategory],
          sourceIl2cppDumpSha256:source.sourceIl2cppDumpSha256,
          currentAvailabilityVerified:false,guaranteedGrantVerified:false};
        const links=result.get(value)??[];links.push(l);result.set(value,links);
        counts[targetScope+':'+role]=(counts[targetScope+':'+role]??0)+1;
      };
      scan(attrs[field],'');
    }
  }
  console.log('DB01_MEMORY_NATIVE_REFERENCES '+JSON.stringify({targets:result.size,counts}));
  return result;
}
