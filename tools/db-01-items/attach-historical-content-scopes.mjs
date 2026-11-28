/**
 * Historical source-only content scope and positive mandatory gate evidence.
 * A direct UpdateVersion value is an explicit content grouping; indirect
 * quest grouping, gate dependency and grants remain candidates, not ownership.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const PIN='b673e86dee51967645004b64bb05562c717cce386956e888b934ca3cfc3e0346';
const BEFORE='2a06e746b885057f0e00dd8d4ebd809f12aae6d9318c1266515cd2cdb8789daf';
const AFTER='4ccf2816de3a5f2e27e780aa1c5a954b8ed0e325ccbd7d6bb76597f0f09ad41c';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const HOTFIX_CONDITION='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const RELEASE='dlc.the-keepsake-sea',SCOPE='Expansion04Main',EXPANSION='Expansion04';
const SHA=/^[a-f0-9]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(v,c)=>{if(!v)throw Error('DB01_HISTORICAL_CONTENT_SCOPE_'+c)};
const id=v=>Number.isSafeInteger(v)&&v>0;
const str=v=>typeof v==='string'&&v.length>0;
const canonical=o=>JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a],[b])=>a<b?-1:a>b?1:0)));
const allowedScopeClasses={
  Mission:new Set(['MissionItemData']),
  Dialogue:new Set(['DialogueItemData','HangoutDialogueItemData','NpcDiscussionItemData','BoardGameDialogueItemData','PetAssignmentDialogueItemData'])
};
export function attachHistoricalContentScopes(project,source,history,fresh,add){
  const bytes=readFileSync(join(project,'data/ddv/item-master/historical-content-scope-steam-1261.json'));
  check(sha(bytes)===PIN,'PIN');
  const d=JSON.parse(bytes);
  check(d.schema==='wand.db01.historical-content-scope@1'&&d.platform==='Steam'&&
    d.introducedAfter==='1.25.3'&&d.introducedVersion==='1.26.1'&&
    d.introducedAfterSourceCorpusSha256===BEFORE&&d.introducedSourceCorpusSha256===AFTER&&
    d.schemaDumpVersion==='1.26.2'&&d.schemaDumpSha256===DUMP&&d.nativeScope===SCOPE&&
    d.expansion===EXPANSION&&d.runtimeAvailabilityVerified===false&&
    d.accountEntitlementVerified===false&&d.allContentAttributionVerified===false&&
    Object.keys(d.sourceFiles).length===39&&Object.values(d.sourceFiles).every(x=>SHA.test(x))&&
    sha(canonical(d.sourceFiles))===AFTER,'SOURCE');
  const current=source.target.gameVersion==='1.26.2';
  const byId=new Map(source.items.map(r=>[r.itemId,r]));
  const declarations=source.sourceFieldDeclarations;
  if(current)check(source.sourceIl2cppDumpSha256===DUMP&&
    Object.entries(d.sourceFiles).every(([k,v])=>source.sourceFilesSha256[k]===(k==='Condition'?HOTFIX_CONDITION:v)),
    'CURRENT_SOURCE');
  const seenScope=new Set(),scopeMissions=new Set(),seenGate=new Set(),groups=new Set(),grants=new Set();
  const owned=(i,cat,cls,field,n,w=2)=>{
    check(id(i)&&str(cat)&&str(cls)&&str(field)&&Number.isSafeInteger(n)&&n>0,'OWNER_SHAPE');
    if(current){
      const row=byId.get(i);
      check(fresh(history.get(i))&&row?.nativeCategory===cat&&row.sourceClass===cls&&
        declarations?.[cls]?.[field]===n&&row.observedFields.some(x=>x[0]===n&&x[1]===w&&x[2]===1),
        'TYPED_OWNER_'+i+'_'+field);
    }
  };
  const c=d.counts;
  check(c.rootConditionFields===1497&&c.gateDefinitions===53&&c.gateFields===53&&
    c.scopeByCategory.Dialogue===445&&c.scopeByCategory.Mission===45&&c.groupDefinitions===17&&
    c.gatedGrantOccurrences===11&&c.gatedGrantItems===11&&c.unmappedScopeLookingDialogueCount===16&&
    d.scopeRows.length===490&&d.gateRows.length===53&&d.groupRows.length===17&&d.grantRows.length===11,
    'COUNTS');
  for(const [i,cat,cls,n] of d.scopeRows){
    check(!seenScope.has(i)&&allowedScopeClasses[cat]?.has(cls)&&n===(cat==='Mission'?12:20),'SCOPE_ROW');
    owned(i,cat,cls,'UpdateVersion',n);
    seenScope.add(i);if(cat==='Mission')scopeMissions.add(i);
    const h=history.get(i);if(!fresh(h))continue;
    h.nativeContentScope=SCOPE;
    add(i,'native_content_scope',SCOPE,RELEASE);
    // UpdateVersion is an explicit native content-group property; unlike a
    // string in a name, world tag or conditional gate, it directly assigns the
    // definition. Never replace a separately confirmed conflicting assignment.
    if(h.contentReleaseId!==null&&h.contentReleaseId!==RELEASE){
      h.contentOriginConflict=true;
      continue;
    }
    if(h.contentReleaseId===null){
      h.contentReleaseId=RELEASE;
      h.contentReleaseKind='paid_dlc';
      h.contentDlcType='expansion';
      h.contentAttributionEvidenceKind='verified_native_content_scope';
      h.contentReleaseEvidenceSha256=PIN;
      h.contentAssignmentSha256=sha(JSON.stringify([i,cat,cls,n,SCOPE,AFTER,PIN]));
    }
  }
  check(seenScope.size===490&&scopeMissions.size===45,'SCOPE_CENSUS');
  for(const [i,cat,cls,field,n,rootSha,paths] of d.gateRows){
    check(!seenGate.has(i)&&SHA.test(rootSha)&&Array.isArray(paths)&&paths.length>0&&
      paths.every(p=>Array.isArray(p)&&p.length===2&&Array.isArray(p[0])&&p[0].length>0&&
        p[0].every(x=>Number.isSafeInteger(x)&&x>=0)&&Array.isArray(p[1])&&
        p[1].every(id)&&new Set(p[1]).size===p[1].length),'GATE_ROW');
    owned(i,cat,cls,field,n);seenGate.add(i);
    const h=history.get(i);if(!fresh(h))continue;
    h.expansionGateEvidence=[{expansion:EXPANSION,sourceClass:cls,sourceField:field,sourceFieldNumber:n,
      rootSha256:rootSha,positiveAndPaths:paths,sourceGameVersion:'1.26.1',
      runtimeAvailabilityVerified:false,accountEntitlementVerified:false}];
    add(i,'mandatory_expansion_gate',EXPANSION,RELEASE);
  }
  for(const [i,refs] of d.groupRows){
    check(id(i)&&!groups.has(i)&&Array.isArray(refs)&&refs.length>0&&
      refs.every((v,j)=>scopeMissions.has(v)&&(j===0||v>refs[j-1])),'GROUP_ROW');
    groups.add(i);
    if(current){
      const owner=byId.get(i);
      check(fresh(history.get(i))&&owner?.sourceClass==='MissionQuestItemData','QUEST_GROUP_OWNER');
      for(const ref of refs){
        owned(ref,'Mission','MissionItemData','QuestId',13,0);
        const value=byId.get(ref).nativeProperties?.QuestId;
        check(value===undefined||value===i,'QUEST_GROUP_JOIN');
      }
    }
    if(fresh(history.get(i)))for(const ref of refs)add(i,'quest_group_mission_scope',ref,RELEASE);
  }
  const grantFields={conditional_grant:['GiveItem',23],conditional_mail_attachment:['SendMailbox',27],
    conditional_swap_grant:['SwapItem',35]};
  for(const [event,i,amount,role] of d.grantRows){
    check(id(event)&&id(i)&&seenGate.has(event)&&Object.hasOwn(grantFields,role)&&
      Number.isSafeInteger(amount)&&amount>0&&amount<=0x7fffffff&&!grants.has(i),'GRANT_ROW');
    grants.add(i);
    if(current){
      const [field,n]=grantFields[role];owned(event,'ConditionalEvent','ConditionalEventItemData',field,n);
      check(fresh(history.get(i))&&byId.has(i),'GRANT_TARGET');
    }
    const h=history.get(i);if(!fresh(h))continue;
    h.gatedGrantOriginEvidence=[{sourceEventItemId:event,role,amount,requiredSourceExpansion:EXPANSION,
      sourceGameVersion:'1.26.1',runtimeGrantVerified:false}];
    add(i,'gated_grant_candidate',event,RELEASE);
  }
  check(seenGate.size===53&&groups.size===17&&grants.size===11,'EVIDENCE_CENSUS');
}
