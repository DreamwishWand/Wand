/** Offline source evidence only. Switch snapshots are never fed into the
 * Steam introduction ledger, content-release assignments or acquisition facts. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
const PIN='265d59f8782170581c354894088cc3a9a561f3a5781b1cf58036661eb939d747';
const SHA=/^[a-f0-9]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(v,c)=>{if(!v)throw Error('DB01_SWITCH_SOURCE_'+c)};
const canonical=o=>JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a],[b])=>a<b?-1:a>b?1:0)));
export function attachSwitchSourceObservations(project,history){
  const raw=readFileSync(join(project,'data/ddv/item-master/switch-source-census-1241-12411.json'));
  check(sha(raw)===PIN,'PIN');
  const doc=JSON.parse(raw);
  check(doc.schema==='wand.db01.switch-source-census@1'&&doc.platform==='Switch'&&doc.sourcePresenceOnly===true&&
    Array.isArray(doc.snapshots)&&doc.snapshots.length===2,'SCHEMA');
  const expected=[['1.24.1',38,33820],['1.24.11',39,34721]];
  const sets=doc.snapshots.map((s,i)=>{
    const [version,categories,count]=expected[i];
    const keys=Object.keys(s.sourceFiles);
    check(s.version===version&&s.definitionCount===count&&keys.length===categories&&
      keys.every(k=>/^[A-Za-z][A-Za-z0-9]*$/.test(k)&&SHA.test(s.sourceFiles[k])&&
        Number.isSafeInteger(s.categoryCounts[k])&&s.categoryCounts[k]>=0)&&
      Object.keys(s.categoryCounts).length===categories&&
      Object.values(s.categoryCounts).reduce((a,b)=>a+b,0)===count&&
      SHA.test(s.versionFileSha256)&&sha(canonical(s.sourceFiles))===s.sourceCorpusSha256,'CENSUS');
    const runs=JSON.parse(inflateSync(Buffer.from(s.idRuns,'base64'),{maxOutputLength:800000}));
    check(Array.isArray(runs)&&runs.length%2===0&&runs.length<=count*2,'RUNS');
    const ids=[];let last=0;
    for(let j=0;j<runs.length;j+=2){
      const [gap,n]=runs.slice(j,j+2);
      check(Number.isSafeInteger(gap)&&gap>0&&Number.isSafeInteger(n)&&n>0&&
        ids.length+n<=count&&Number.isSafeInteger(last+gap+n-1),'RUN');
      const start=last+gap;
      for(let k=0;k<n;k++)ids.push(start+k);
      last=start+n-1;
    }
    check(ids.length===count&&sha(JSON.stringify(ids))===s.itemIdsSha256,'IDS');
    return new Set(ids);
  });
  const [old,later]=sets;
  const common=[...old].filter(i=>later.has(i)).length;
  check(common===33815&&later.size-common===906&&old.size-common===5,'DELTA');
  check(!Object.hasOwn(doc.snapshots[0].sourceFiles,'Environment')&&Object.hasOwn(doc.snapshots[1].sourceFiles,'Environment')&&
    Object.keys(doc.snapshots[0].sourceFiles).every(k=>Object.hasOwn(doc.snapshots[1].sourceFiles,k)),'CATEGORY_COVERAGE');
  let indexed=0,earlierThanSteam=0,conflicts=0;
  const versionOrder=(a,b)=>{const aa=a.split('.').map(Number),bb=b.split('.').map(Number);return aa[0]-bb[0]||aa[1]-bb[1]||aa[2]-bb[2]};
  for(const [id,entry] of history){
    const versions=sets.flatMap((set,i)=>set.has(id)?[expected[i][0]]:[]);
    if(!versions.length)continue;
    indexed++;
    if(entry.firstObservedVersion&&versionOrder(versions[0],entry.firstObservedVersion)<0)earlierThanSteam++;
    if(entry.introducedVersion&&versionOrder(versions[0],entry.introducedVersion)<0)conflicts++;
    // The field is intentionally sparse. A missing observation is not an
    // assertion of non-existence, removal or later game-wide introduction.
    history.set(id,{...entry,switchFirstObservedVersion:versions[0],switchObservedVersions:versions});
  }
  return {platform:'Switch',projectionSha256:PIN,sourcePresenceOnly:true,
    snapshots:doc.snapshots.map(s=>({version:s.version,versionFileSha256:s.versionFileSha256,
      sourceCorpusSha256:s.sourceCorpusSha256,itemIdsSha256:s.itemIdsSha256,
      definitionCount:s.definitionCount,categoryCount:Object.keys(s.sourceFiles).length})),
    observedUnionCount:old.size+later.size-common,canonicalItemCount:indexed,
    earlierThanSteamObservedCount:earlierThanSteam,earlierThanSteamIntroductionCount:conflicts,
    commonCount:common,laterOnlyCount:later.size-common,earlierOnlyCount:old.size-common,
    gameWideIntroductionVerified:false,runtimeAvailabilityVerified:false};
}
