/** Source-derived catalog purchase gates and generator flags.
 * A generator flag is not a proof of Scrooge's store membership. Catalog
 * visibility predicates are not grants. Reuse canonical decoded fields only.
 */
import {buildPurchaseCurrencyFacts} from './purchase-currency-facts.mjs';
const check=(ok,code)=>{if(!ok)throw Error('DB01_CATALOG_FACTS_'+code)};
const families={FurnitureItemData:'Furniture',ClothingItemData:'Clothing',TrimmingItemData:'Trimming'};
const missionKinds=new Set(['MissionAvailable','MissionCompleted','MissionOngoing','MissionStatus',
  'MissionStepCompleted','MissionStepStatus','MissionObjectiveCompleted','MissionObjectiveStatus',
  'MissionObjectiveSkipped','MissionObjectiveProgression']);
const targetKinds={CharacterUnlocked:['Character','Character'],CharacterFriendship:['Character','Character'],
  HasEverOwned:['Item',null],RealmUnlocked:['Universe','Tag'],CurrentScene:['Scene','Scene'],
  CommonConditions:['Condition','Condition']};
const flags=['IsUnavailableForGenerator','IsSyncOnlineItem','IsHidden'];
export function buildCatalogFacts(source,rows){
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  const facts=new Map(),dependents=new Map();
  const totals={items:0,excluded:0,withoutReviewFlags:0,nonempty:0,missionItems:0,missionOccurrences:0};
  const missionIds=new Set();
  const push=(id,value)=>{const a=dependents.get(id)??[];a.push(value);dependents.set(id,a);};
  const category=id=>byId.get(id)?.nativeCategory;
  for(const row of rows){
    if(!Object.hasOwn(families,row.sourceClass))continue;
    check(row.nativeCategory===families[row.sourceClass],'CLASS');
    const decl=source.sourceFieldDeclarations[row.sourceClass];
    if(!decl||!Object.hasOwn(decl,'CatalogVisibilityConditions')||!Object.hasOwn(decl,'IsUnavailableForGenerator'))continue;
    const prop={...row.nativeProperties,...row.sourceAttributes};
    const gate=prop.CatalogVisibilityConditions;
    if(gate===undefined)continue; // Missing decoded source is not an empty gate.
    check(gate!==null&&typeof gate==='object'&&!Array.isArray(gate),'GATE');
    const scalar=(name)=>{
      if(!Object.hasOwn(decl,name))return null;
      const v=prop[name];
      if(v===undefined){
        // Proto3 omitted scalar defaults only when absent in the original wire.
        if(row.observedFields?.some(([n])=>n===decl[name]))return null;
        return name==='OnlineCategory'?0:false;
      }
      check(name==='OnlineCategory'?Number.isInteger(v):typeof v==='boolean','SCALAR_'+name);
      return v;
    };
    const generator=scalar('IsUnavailableForGenerator'),sync=scalar('IsSyncOnlineItem'),
      hidden=scalar('IsHidden'),online=scalar('OnlineCategory');
    const exclusionFlags=[...flags.filter((f,i)=>[generator,sync,hidden][i]===true),
      ...(online===1?['OnlineCategory.Premium']:online===2?['OnlineCategory.TimeLimited']:[])];
    const flagsKnown=generator!==null&&sync!==null&&online!==null&&
      (!Object.hasOwn(decl,'IsHidden')||hidden!==null)&&[0,1,2].includes(online);
    const links=[];
    const emit=(id,expected,kind,path,predicate,commonPath)=>{
      check(Number.isSafeInteger(id)&&id>0,'REFERENCE_ID');
      // Unresolved references remain visible in original predicates, but
      // cannot be indexed as a canonical relationship.
      const resolved=byId.has(id)&&(!expected||category(id)===expected);
      const link={targetItemId:id,kind,sourcePath:path,predicate,commonConditionPath:commonPath,resolved};
      links.push(link);
      if(resolved)push(id,{itemId:row.itemId,...link});
      if(kind.startsWith('Mission')){
        totals.missionOccurrences++;
        if(resolved)missionIds.add(id);
      }
    };
    const walk=(list,path,stack=[])=>{
      if(!list||typeof list!=='object'||Array.isArray(list))return;
      const a=list.Conditions;
      if(!Array.isArray(a))return;
      a.forEach((condition,i)=>{
        if(!condition||typeof condition!=='object'||Array.isArray(condition))return;
        for(const [kind,predicate] of Object.entries(condition)){
          if(!predicate||typeof predicate!=='object'||Array.isArray(predicate))continue;
          const p=path+'.Conditions['+i+'].'+kind;
          if(kind==='SubConditions'){
            walk(predicate,p,stack);continue;
          }
          const selector=missionKinds.has(kind)?['Mission','Mission']:targetKinds[kind];
          if(!selector)continue;
          const [field,expected]=selector,id=predicate[field];
          if(!Number.isSafeInteger(id)||id<=0)continue;
          emit(id,expected,kind,p+'.'+field,predicate,stack);
          if(kind==='CommonConditions'&&category(id)==='Condition'&&!stack.includes(id)&&stack.length<16){
            const nested=byId.get(id).sourceAttributes?.Conditions;
            walk(nested,p+'.Condition('+id+').Conditions',[...stack,id]);
          }
        }
      });
    };
    if(Number.isSafeInteger(gate.CharacterId)&&gate.CharacterId>0)
      emit(gate.CharacterId,'Character','CatalogCharacter','source.CatalogVisibilityConditions.CharacterId',
        {CharacterId:gate.CharacterId,...(Object.hasOwn(gate,'MinFriendship')?{MinFriendship:gate.MinFriendship}:{})},[]);
    walk(gate.Conditions,'source.CatalogVisibilityConditions.Conditions');
    // A positive single-condition equality is the only case promoted
    // to a straightforward prerequisite. Keep other trees as original
    // predicates, never interpret NOT/OR or incomplete source data.
    const only=gate.Conditions?.Conditions;
    let prerequisite=null;
    if(Object.keys(gate).length===1&&Array.isArray(only)&&only.length===1&&
      (gate.Conditions.Operator===undefined||gate.Conditions.Operator===0)&&
      Object.keys(only[0]).length===1){
      const m=only[0].MissionStatus,s=only[0].MissionStepStatus;
      if(m&&category(m.Mission)==='Mission'&&m.State===8&&(m.Operator===undefined||m.Operator===0)&&
        Object.keys(m).every(k=>['Mission','State','Operator'].includes(k)))
        prerequisite={kind:'mission_completed',missionItemId:m.Mission};
      else if(s&&category(s.Mission)==='Mission'&&s.Status===4&&Number.isSafeInteger(s.StepID)&&
        Object.keys(s).every(k=>['Mission','StepID','Status'].includes(k)))
        prerequisite={kind:'mission_step_completed',missionItemId:s.Mission,stepId:s.StepID};
    }
    const gateStatus=Object.keys(gate).length===0?'empty_source_gate':
      'configured_source_gate';
    const value={generatorExcluded:generator,syncOnline:sync,hidden,onlineCategoryCode:online,
      exclusionFlags,flagsKnown,gateStatus,
      // Predicates are preserved verbatim; links are navigation, not a
      // flattened AND expression or sufficient acquisition condition.
      catalogVisibilityConditions:gate,relatedConditions:links,prerequisite,
      storeMembershipVerified:false,currentAvailabilityVerified:false};
    facts.set(row.itemId,value);
    totals.items++;
    if(generator===true)totals.excluded++;
    if(flagsKnown&&!exclusionFlags.length)totals.withoutReviewFlags++;
    if(gateStatus==='configured_source_gate')totals.nonempty++;
    if(links.some(l=>l.kind.startsWith('Mission')))totals.missionItems++;
  }
  // Independent wire census of exact current original three item families.
  if(source.target.gameVersion==='1.26.2'){
    check(totals.items===7694&&totals.excluded===3646&&totals.withoutReviewFlags===2742&&
      totals.nonempty===590&&totals.missionItems===217&&totals.missionOccurrences===217&&
      missionIds.size===75,'ORIGINAL_CENSUS_'+JSON.stringify({...totals,missions:missionIds.size}));
  }
  console.log('DB01_CATALOG_FACTS '+JSON.stringify({...totals,missions:missionIds.size}));
  // Only the authenticated 1.26.2 native furniture type helper and
  // IsNotBuyable's IIsHiddable and IAvailability branches are interpreted.
  // The native metadata type table resolves both interface identities.
  // Online tags or passing these gates are not proof of sale eligibility.
  const storeScreens=new Map();
  const pinned=source.target.platform==='Steam'&&source.target.gameVersion==='1.26.2'&&
    source.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'&&
    source.sourceFilesSha256.Furniture==='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196'&&
    source.sourceFilesSha256.Clothing==='a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946';
  if(pinned){
    const counts={};
    for(const row of rows){
      if(!['Furniture','Clothing'].includes(row.nativeCategory))continue;
      const furniture=row.nativeCategory==='Furniture';
      const furnitureTypeGate=furniture?[0,3].includes(row.itemType.subtypeCode):null;
      const expectedClass=furniture?'FurnitureItemData':'ClothingItemData';
      let hidden=null,generatorExcluded=null;
      if(row.sourceClass===expectedClass){
        check(source.sourceFieldDeclarations[expectedClass].IsHidden===(furniture?24:29),'HIDDEN_FIELD');
        check(source.sourceFieldDeclarations[expectedClass].IsUnavailableForGenerator===(furniture?50:33),'GENERATOR_FIELD');
        const value=facts.get(row.itemId);
        if(typeof value?.hidden==='boolean')hidden=value.hidden;
        if(typeof value?.generatorExcluded==='boolean')generatorExcluded=value.generatorExcluded;
      }
      const status=furnitureTypeGate===false?'excluded_by_furniture_type':
        hidden===true?'excluded_by_hidden':
        generatorExcluded===true?'excluded_by_generator':
        hidden===false&&generatorExcluded===false?'not_excluded_by_reviewed_gates':'unresolved';
      counts[status]=(counts[status]??0)+1;
      storeScreens.set(row.itemId,{status,furnitureTypeGate,hidden,generatorExcluded,
        scope:'generated_furniture_clothing_display',
        otherNativeConditionsVerified:false,storeMembershipVerified:false,currentAvailabilityVerified:false});
    }
    check(storeScreens.size===8787&&counts.excluded_by_furniture_type===1458&&
      counts.excluded_by_hidden===1537&&counts.excluded_by_generator===3344&&
      counts.not_excluded_by_reviewed_gates===2448&&
      !counts.unresolved,'NATIVE_STORE_SCREEN_CENSUS_'+JSON.stringify(counts));
  }
  return {facts,dependents,storeScreens,purchaseCurrencies:buildPurchaseCurrencyFacts(source,rows)};
}
