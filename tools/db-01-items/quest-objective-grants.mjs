/** Original positive explicit objective ItemsToGive configurations.
 * Preserve quest cleanup and uncertain quest taxonomy; never treat an
 * objective grant as proof of permanent ownership or actual delivery.
 */
const id=n=>Number.isSafeInteger(n)&&n>0;
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function buildQuestObjectiveGrants(rows,source,questKinds){
  const result=new Map();
  if(!questKinds||source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||
    source.sourceFilesSha256.Mission!=='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24')return result;
  const known=new Map(rows.map(r=>[r.itemId,r]));
  let direct=0,unresolved=0,classified=0;const targets=new Set(),quests=new Set(),byKind={};
  for(const row of rows){
    if(row.nativeCategory!=='Mission')continue;
    const p={...row.nativeProperties,...row.sourceAttributes};
    const cleanup=new Set(p.ItemsToDeleteAfterMission??[]);
    for(const [si,step] of (p.Steps??[]).entries())for(const [ui,sub] of (step.SubSteps??[]).entries())
      for(const [oi,o] of (sub.Objectives??[]).entries())for(const kind of ['TalkToCharacter','Chase'])
        for(const [gi,v] of (o[kind]?.ItemsToGive??[]).entries()){
          const sel=v.ItemToGive?.ItemToGive?.Item,target=sel?.Item?.Item,amount=v.ItemToGiveAmount?.Value?.Value;
          if(!id(target)||id(sel.ItemIngredient?.Item)||!id(amount)||
            !exact(v.ItemToGiveAmount,['Value'])||!exact(v.ItemToGiveAmount.Value,['Value'])||
            !exact(sel.Item,['Item']))continue;
          direct++;
          if(!known.has(target)){unresolved++;continue;}
          const category=questKinds.get(row.itemId)??null;
          const link={sourceItemId:row.itemId,targetItemId:target,category,objectiveKind:kind,
            sourcePath:'source.Steps['+si+'].SubSteps['+ui+'].Objectives['+oi+'].'+kind+'.ItemsToGive['+gi+'].ItemToGive.ItemToGive.Item.Item.Item',
            stepIndex:si,subStepIndex:ui,objectiveIndex:oi,grantIndex:gi,configuredAmount:amount,
            originalGrant:v,cleanupConfigured:cleanup.has(target),permanentOwnershipVerified:false,
            sourceGameVersion:source.target.gameVersion,sourceMissionSha256:source.sourceFilesSha256.Mission,
            guaranteedGrantVerified:false,currentAvailabilityVerified:false};
          const list=result.get(target)??[];list.push(link);result.set(target,list);
          if(category!==null){classified++;targets.add(target);quests.add(row.itemId);
            const k=kind+':'+category;byKind[k]=(byKind[k]??0)+1;}
        }
  }
  console.log('DB01_QUEST_OBJECTIVE_GRANTS '+JSON.stringify({direct,unresolved,classified,classifiedItems:targets.size,quests:quests.size,byKind}));
  return result;
}
