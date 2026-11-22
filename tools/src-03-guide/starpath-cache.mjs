/** DB-03: reproducible, pinned projection of an owner-private Steam liveops cache.
 * Never publish the source file, online UUIDs, resource addresses or raw objectives.
 * A cached Active flag is NOT a verified live event state.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
export const SCHEMA='wand.db03.public-starpath-cache@1';
export const SOURCE_SHA='4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14';
export const SOURCE_BYTES=186442;
const ok=(v,m)=>{if(!v)throw Error('DB03_STARPATH_'+m)};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const num=(x,m,zero=false)=>{ok(Number.isSafeInteger(x)&&x>=(zero?0:1)&&x<=1e9,m);return x};
const str=(x,m,n=240)=>{ok(typeof x==='string'&&x.length>0&&x.length<=n&&!/[\u0000-\u001f]/.test(x),m);return x};
function date(v,op){
  ok(obj(v)&&v.Operator===op&&Object.keys(v).length===2,'DATE_OPERATOR');
  const s=str(v.Date,'DATE',40);
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(s),'DATE_FORMAT');
  return s;
}
function reward(v){
  ok(obj(v),'REWARD');
  const x={itemId:String(num(v.ItemId,'ITEM_ID')),amount:num(v.Amount,'AMOUNT'),
    premium:v.IsPremium===true,bonus:v.IsBonus===true,recurrent:v.IsRecurrent===true};
  for(const [source,name] of [['Price','price'],['AlternateReward','alternateItemId'],['FeaturingPriority','featuringPriority']]){
    if(Object.hasOwn(v,source)){const value=num(v[source],source,true);x[name]=name==='alternateItemId'?String(value):value}
  }
  return x;
}
function pages(ps){
  ok(Array.isArray(ps)&&ps.length<=30,'PAGES');
  return ps.map((p,i)=>{
    ok(obj(p)&&Array.isArray(p.Rewards)&&p.Rewards.length<=30,'PAGE');
    const x={page:i+1,rewards:p.Rewards.map(reward)};
    if(Object.hasOwn(p,'Layout'))x.layout=str(p.Layout,'LAYOUT',80);
    if(Object.hasOwn(p,'UnlockRequirementRewards')){
      const u=p.UnlockRequirementRewards;
      ok(obj(u)&&Object.keys(u).length===1&&Object.hasOwn(u,'MinPurchasedFromLastPage'),'UNLOCK');
      x.minPurchasedFromPreviousPage=num(u.MinPurchasedFromLastPage,'UNLOCK_COUNT',true);
    }
    if(Object.hasOwn(p,'IsCurrencyConversionPage')){
      ok(typeof p.IsCurrencyConversionPage==='boolean','CONVERSION_PAGE');x.currencyConversionPage=p.IsCurrencyConversionPage;
    }
    return x;
  });
}
function task(t,weekly){
  ok(obj(t)&&obj(t.Objective)&&Object.keys(t.Objective).length===1,'TASK_OBJECTIVE');
  const kind=str(Object.keys(t.Objective)[0],'OBJECTIVE_KIND',90);
  ok(/^[A-Za-z][A-Za-z0-9_]*$/.test(kind),'TASK_OBJECTIVE_NAME');
  const desc=str(t.Description,'DESCRIPTION',300),local=desc.startsWith('Liveops.');
  const row={id:str(t.InternalName,'TASK_ID',70),objectiveKind:kind,tokenReward:num(t.CurrencyReward,'TOKEN_REWARD',true),
    description:local?null:desc,descriptionKey:local?desc:null};
  if(Object.hasOwn(t,'AvailableOnDay'))row.availableOnDay=num(t.AvailableOnDay,'AVAILABLE_DAY',true);
  ok(!weekly||local,'WEEKLY_TRANSLATION_REQUIRED');return row;
}
export function projectStarpathCache(raw,{expectedSha=SOURCE_SHA,expectedBytes=SOURCE_BYTES}={}){
  ok(Buffer.isBuffer(raw)&&raw.length===expectedBytes&&createHash('sha256').update(raw).digest('hex')===expectedSha,'SOURCE_FINGERPRINT');
  const root=JSON.parse(raw.toString('utf8'));
  ok(obj(root)&&Object.keys(root).length===1&&obj(root.Data)&&Object.keys(root.Data).length>0&&Object.keys(root.Data).length<=30,'ENVELOPE');
  const seasons=Object.entries(root.Data).sort(([a],[b])=>a.localeCompare(b,'en')).map(([id,encoded])=>{
    ok(typeof encoded==='string'&&encoded.length<2e6,'PAYLOAD');
    const x=JSON.parse(encoded);
    ok(obj(x)&&x.OnlineId===id&&x.Language==='en-US'&&typeof x.Active==='boolean','SEASON_PROVENANCE');
    const rewardPages=pages(x.RewardsPages),bonusPages=pages(x.BonusRewards?.Pages);
    ok(Array.isArray(x.VaultRewards?.Data?.Rewards)&&x.VaultRewards.Data.Rewards.length<=40,'VAULT');
    const vaultRewards=x.VaultRewards.Data.Rewards.map(reward);
    ok(Array.isArray(x.TaskConfig?.Tasks)&&Array.isArray(x.WeeklyTasksConfig?.WeeklyTasks),'TASK_CONFIG');
    const tasks=x.TaskConfig.Tasks.map(t=>task(t,false));
    const weeklyTasks=x.WeeklyTasksConfig.WeeklyTasks.map(w=>{ok(obj(w)&&Array.isArray(w.Tasks),'WEEK');return w.Tasks.map(t=>task(t,true))});
    const ids=[...tasks,...weeklyTasks.flat()].map(t=>t.id);ok(new Set(ids).size===ids.length,'DUPLICATE_TASK');
    const startUtc=date(x.StartDate,'IntOperator_GreaterThanOrEqual');
    const finishUtcExclusive=date(x.FinishDate,'IntOperator_LessThan');
    const endUtcExclusive=date(x.EndDate,'IntOperator_LessThan');
    ok(startUtc<finishUtcExclusive&&finishUtcExclusive<endUtcExclusive,'DATE_ORDER');
    return {id:str(id,'SEASON_ID',90),title:str(x.Title,'TITLE'),definitionVersion:num(x.Version,'VERSION'),
      minGameVersion:str(x.MinGameVersion,'MIN_GAME_VERSION',30),locale:x.Language,currencyName:str(x.CurrencyName,'CURRENCY',120),
      startUtc,finishUtcExclusive,endUtcExclusive,
      premiumPrice:{itemId:String(num(x.PremiumPassPrice?.Id,'PREMIUM_CURRENCY_ID')),amount:num(x.PremiumPassPrice?.Amount,'PREMIUM_PRICE',true)},
      freeActiveTaskSlots:num(x.FreeActiveTaskCount,'FREE_SLOTS',true),premiumActiveTaskSlots:num(x.PremiumActiveTaskCount,'PREMIUM_SLOTS',true),
      rewardPages,bonusPages,vaultRewards,tasks,weeklyTasks,
      counts:{rewardPages:rewardPages.length,bonusPages:bonusPages.length,
        normalRewards:rewardPages.reduce((sum,p)=>sum+p.rewards.length,0),
        bonusRewards:bonusPages.reduce((sum,p)=>sum+p.rewards.length,0),
        vaultRewards:vaultRewards.length,dailyTasks:tasks.length,
        weeklyTasks:weeklyTasks.reduce((sum,w)=>sum+w.length,0),weeks:weeklyTasks.length}};
  });
  return {schema:SCHEMA,source:{platform:'Steam',ownerDeclaredGameVersion:'1.26.2',cacheCaptureDate:'2026-11-22',
    fileSha256:expectedSha,sourceBytes:expectedBytes,sourceType:'owner_private_liveops_cache',
    liveAvailabilityVerified:false,seasonCatalogComplete:false},seasons};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [,,source,out]=process.argv;
  if(!source||!out)throw Error('usage: node starpath-cache.mjs /PRIVATE/battlepasses.dat /path/to/public.json');
  const data=projectStarpathCache(await readFile(source));
  await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(data)+'\n');
  console.log(data.seasons.map(s=>[s.id,s.counts]));
}
