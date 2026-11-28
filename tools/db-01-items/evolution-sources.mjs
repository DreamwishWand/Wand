import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const sourceFiles={Clothing:'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946',Tool:'2126651d27fcee9974f79e1ab86bf961be70d6182a778c2fb62d6c3c09a1457d'};
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const check=(ok,why)=>{if(!ok)throw Error('DB01_EVOLUTION_'+why)};
const id=v=>Number.isSafeInteger(v)&&v>0;
export function loadEvolutionSources(project,source,rows){
  const byBase=new Map(),byTarget=new Map();
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2')return {byBase,byTarget};
  const data=JSON.parse(readFileSync(join(project,'data/ddv/item-master/evolution-sources-steam-1.26.2.json'),'utf8'));
  check(data.schema==='wand.db01.evolution-sources@1'&&data.source.platform==='Steam'&&data.source.gameVersion==='1.26.2'&&data.source.il2cppDumpSha256===DUMP&&source.sourceIl2cppDumpSha256===DUMP,'SOURCE');
  for(const [k,v] of Object.entries(sourceFiles))check(data.source.files[k]===v&&source.sourceFilesSha256[k]===v,'FILE');
  const known=new Map(rows.map(r=>[r.itemId,r]));
  const expected=new Map([[50800150,['Clothing','GiftToCharacter',[50800151,50800152],[20,30]]],[110500016,['Tool','WaterPlant',[110500018,110500019],[100,150]]],[110400012,['Tool','MineMineral',[110400013,110400014],[25,100]]],[110100012,['Tool','CatchFish',[110100011,110100013],[10,20]]]]);
  for(const c of data.chains){
    const e=expected.get(c.baseItemId),base=known.get(c.baseItemId),decl=source.sourceFieldDeclarations[c.category+'ItemData'];
    check(e&&c.category===e[0]&&base?.nativeCategory===c.category&&base.sourceClass===c.category+'ItemData'&&!byBase.has(c.baseItemId)&&c.steps.length===2,'BASE');
    check(decl.EvolvingConditions===(c.category==='Clothing'?32:11)&&decl.IsEvolvedAsset===(c.category==='Clothing'?30:9),'DECLARATION');
    const steps=c.steps.map((step,index)=>{
      const target=known.get(step.EvolvesInto),action=step.EvolveAction[e[1]];
      check(target?.nativeCategory===c.category&&target.sourceClass===base.sourceClass&&step.EvolvesInto===e[2][index]&&!byTarget.has(step.EvolvesInto)&&Object.keys(step.EvolveAction).length===1&&action,'STEP');
      const props={...target.nativeProperties,...target.sourceAttributes};
      check(props.IsEvolvedAsset===true,'TARGET_FLAG');
      const amount=e[1]==='WaterPlant'?action.Amount?.Value?.Value:e[1]==='CatchFish'?action.ConditionType?.Amount?.AmountToCatch?.Value?.Value:action.TargetAmount?.Value?.Value;
      check(id(amount)&&amount===e[3][index],'AMOUNT');
      const evidence={kind:'item_evolution',baseItemId:c.baseItemId,targetItemId:step.EvolvesInto,stepIndex:index,previousConfiguredTargetItemId:index?c.steps[index-1].EvolvesInto:null,
        objectiveKind:e[1],configuredAmount:amount,originalAction:step.EvolveAction,sourcePath:'source.EvolvingConditions['+index+']',
        sourceGameVersion:source.target.gameVersion,sourceFileSha256:sourceFiles[c.category],sourceIl2cppDumpSha256:DUMP,
        requiresBaseItem:true,progressCounterSemanticsVerified:false,currentAvailabilityVerified:false,guaranteedGrantVerified:false};
      byTarget.set(step.EvolvesInto,evidence);return evidence;
    });
    byBase.set(c.baseItemId,steps);
  }
  check(byBase.size===4&&byTarget.size===8,'CENSUS');
  console.log('DB01_EVOLUTION '+JSON.stringify({bases:byBase.size,targets:byTarget.size}));
  return {byBase,byTarget};
}
