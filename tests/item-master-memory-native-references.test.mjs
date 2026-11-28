import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('memory and orb source references retain exact original paths and distinct objective/loot/spawn roles',async()=>{
  const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
  const memory=new Map(await db.getFieldRows('acquisition.memoryAppearance'));
  const custom=new Set([...memory].filter(([,m])=>m.appearanceConditionCode===9).map(([id])=>id));
  assert.equal(custom.size,299);
  const customOrbs=new Set([...custom].map(id=>memory.get(id).consummableOverrideItemId));
  const refs=new Map(await db.getFieldRows('acquisition.memoryNativeReferences'));
  const ids=new Map(await db.getFieldRows('acquisition.memoryNativeSourceItemIds'));
  const counts={};
  const byField=new Map();
  for(const [target,links] of refs){
    assert.deepEqual(ids.get(target),[...new Set(links.map(l=>l.sourceItemId))].sort((a,b)=>a-b));
    for(const l of links){
      assert.equal(l.targetItemId,target);
      assert.equal(l.targetScope,memory.has(target)?'memory':'orb');
      assert.equal(l.guaranteedGrantVerified,false);assert.equal(l.currentAvailabilityVerified,false);
      assert.equal(l.sourceFileSha256,db.release.sourceFilesSha256[l.sourceCategory]);
      assert.equal(l.sourceIl2cppDumpSha256,db.release.sourceIl2cppDumpSha256);
      assert.equal(l.sourceGameVersion,db.release.target.gameVersion);
      const field=/^source\.[A-Za-z]+/.exec(l.sourcePath)[0];
      const a=byField.get(field)??[];a.push(l);byField.set(field,a);
      if(custom.has(target)||l.targetScope==='orb'&&customOrbs.has(target)){
        const k=l.targetScope+':'+l.role;counts[k]=(counts[k]??0)+1;
      }
    }
  }
  for(const [field,links] of byField){
    const src=[...new Set(links.map(l=>l.sourceItemId))].sort((a,b)=>a-b);
    const rows=new Map((await db.getItemFields(src,[field,'nativeCategory'])).map(r=>[r.itemId,r.values]));
    for(const l of links){
      const v=rows.get(l.sourceItemId);assert.equal(v.nativeCategory,l.sourceCategory);
      const tail=l.sourcePath.slice(field.length).match(/[A-Za-z_][A-Za-z0-9_]*|\d+/g)??[];
      assert.equal(tail.reduce((x,k)=>x[k],v[field]),l.targetItemId);
    }
  }
  // Independent census from the original reviewed Steam 1.26.2 fields.
  // These are occurrence counts, not numbers of granted memories.
  assert.equal(counts['memory:quest_memory_unlock_objective'],52);
  assert.equal(counts['memory:spawn_reward_override'],76);
  assert.equal(counts['memory:spawn_configured_consumable_memory'],2);
  assert.equal(counts['memory:loot_configured_consumable_memory'],16);
  assert.equal(counts['memory:loot_item_candidate'],36);
  assert.ok(counts['orb:quest_consume_objective']>=41);
  assert.ok(counts['orb:spawn_consumable_selector']>=53);
  console.log('DB01_MEMORY_NATIVE_REFERENCE_CENSUS '+JSON.stringify({targets:refs.size,counts}));
});
