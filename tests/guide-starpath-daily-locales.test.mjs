import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyPublicStarpath} from '../src/lib/guide/public-starpath.mjs';
import {STARPATH_DAILY_RELEASE,verifyStarpathDailyPart,loadStarpathDailyPart,loadStarpathDailyLocales,starpathDailyDescription} from '../src/lib/guide/public-starpath-daily.ts';
const root=new URL('../static/guide/public/',import.meta.url);
const read=async file=>readFile(new URL(file,root));
const sha=data=>createHash('sha256').update(data).digest('hex');
const snapshot=async()=>verifyPublicStarpath(JSON.parse(await read('starpath-cache-2026-11-22.json')));
const arrayBuffer=raw=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
test('146 authentic daily Star Path tasks have 1168 complete source languages, exact SHA and original English cache equality',async()=>{
  const seasons=(await snapshot()).seasons;
  assert.deepEqual(seasons.map(s=>s.id),['HauntingElegance2026','Seafaring2026']);
  let total=0,translations=0;
  for(const season of seasons){
    const info=STARPATH_DAILY_RELEASE[season.id];
    const raw=await read(info.file);
    assert.equal(raw.length,info.bytes);
    assert.equal(sha(raw),info.sha256);
    const doc=verifyStarpathDailyPart(JSON.parse(raw),season);
    total+=Object.keys(doc).length;
    translations+=Object.values(doc).reduce((n,v)=>n+Object.keys(v).length,0);
    const fetcher=async()=>({ok:true,arrayBuffer:async()=>arrayBuffer(raw)});
    assert.equal(Object.keys(await loadStarpathDailyPart('ignored:',season,fetcher)).length,info.count);
    const changed=Buffer.from(raw);changed[100]^=1;
    await assert.rejects(()=>loadStarpathDailyPart('ignored:',season,async()=>({ok:true,arrayBuffer:async()=>arrayBuffer(changed)})),/fingerprint mismatch/);
    const first=Object.keys(doc)[0];
    assert.throws(()=>verifyStarpathDailyPart(Object.fromEntries(Object.entries(doc).slice(1)),season),/daily key census/);
    assert.throws(()=>verifyStarpathDailyPart({...doc,extra:{ja:'fake'}},season),/daily key census/);
    assert.throws(()=>verifyStarpathDailyPart({...doc,[first]:{...doc[first],ja:'<img src=x>'}},season),/invalid native text/);
    assert.throws(()=>verifyStarpathDailyPart({...doc,[first]:{...doc[first],'en-US':'fabricated text'}},season),/English source mismatch/);
  }
  assert.equal(total,146);
  assert.equal(translations,1168);
});
test('public daily text resolves exact original language and fails closed on unknown IDs',async()=>{
  const seasons=(await snapshot()).seasons;
  const fetcher=async url=>{
    const raw=await read(url.split('/').at(-1));
    return {ok:true,arrayBuffer:async()=>arrayBuffer(raw)};
  };
  const all=await loadStarpathDailyLocales('local/',seasons,fetcher);
  assert.equal(starpathDailyDescription(all,'HauntingElegance2026','Task01','ja'),'闇のトゲを引っこ抜く');
  assert.equal(starpathDailyDescription(all,'HauntingElegance2026','Task01','en'),'Uproot Night Thorns.');
  assert.equal(starpathDailyDescription(all,'Seafaring2026','Task02','ja'),'魚を釣る');
  assert.equal(starpathDailyDescription(all,'Seafaring2026','Task10','fr'),'Va pêcher des algues (exprès\u00a0!).');
  assert.equal(starpathDailyDescription(all,'Seafaring2026','Task02','nope'),null);
  assert.equal(starpathDailyDescription(all,'__proto__','Task02','en'),null);
  assert.equal(starpathDailyDescription(all,'Seafaring2026','__proto__','en'),null);
  await assert.rejects(()=>loadStarpathDailyLocales('local/',[seasons[0],seasons[0]],fetcher),/season census/);
});


test('typed daily source contract rejects forged snapshot and preserves exact local-language closure',async()=>{
  const catalog=await snapshot();
  const source=catalog.seasons[0];
  const original=JSON.parse(await read('starpath-daily-haunting-2026-11-22.json'));
  const accepted=verifyStarpathDailyPart(original,source);
  assert.equal(starpathDailyDescription({[source.id]:accepted},source.id,'Task01','es-ES'),
    accepted[`${source.id}_Task01_Description`].es);
  assert.equal(starpathDailyDescription({[source.id]:accepted},source.id,'Task01','__proto__'),null);
  assert.equal(starpathDailyDescription(Object.create(null),source.id,'Task01'),null);
  assert.equal(starpathDailyDescription({[source.id]:accepted},source.id,'Task001','ja'),null);
  const forged=structuredClone(source);
  forged.tasks[0].description='changed cached English';
  assert.throws(()=>verifyStarpathDailyPart(original,forged),/English source mismatch/);
  const unknown=structuredClone(source);
  unknown.id='Unknown2026';
  assert.throws(()=>verifyStarpathDailyPart(original,unknown),/season identity/);
});
