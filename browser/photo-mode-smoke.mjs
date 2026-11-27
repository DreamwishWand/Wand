import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const index=JSON.parse(await readFile('build/photo-mode-preview/index.json','utf8'));
assert.equal(index.schema,'wand.photo-mode.pages-test@2');
const byKind=kind=>Object.entries(index.items).find(([,row])=>row.male?.kind===kind&&row.female?.kind===kind)?.[0];
const companionOnly=Object.entries(index.items).find(([,row])=>row.male?.kind==='player'&&row.male?.companionIncluded===false)?.[0];
const attached=Object.entries(index.items).find(([,row])=>row.male?.companionIncluded===true&&row.female?.companionIncluded===true)?.[0];
const expansion='120000009';
assert.ok(index.items[expansion]?.male?.kind==='player'&&index.items[expansion]?.female?.kind==='player','new companion scene');
const multi='120000227';
assert.equal(Object.keys(index.variants).length,5);
const maxDog='120000152';
assert.equal(index.variants[maxDog].length,1);
assert.ok(index.variants[maxDog][0].male.companionIncluded===false&&index.variants[maxDog][0].female.companionIncluded===true,'native body-specific Max alternate');
assert.equal(index.variants[multi].length,1);
assert.notEqual(index.items[multi].male.sourceSha256,index.variants[multi][0].male.sourceSha256);
const expandedActor='120000238';
assert.ok(index.items[expandedActor]?.male?.companionIncluded===true&&index.items[expandedActor]?.female?.companionIncluded===true,'new actor scene');
const bindActor='120000005';
assert.ok(index.items[bindActor]?.male?.companionIncluded===true&&index.items[bindActor]?.female?.companionIncluded===true,'native-bind actor scene');
assert.equal(Object.values(index.variants).flat().filter(row=>row.male?.companionIncluded===true&&row.female?.companionIncluded===true).length,2);
const curveActor='120000264';
assert.ok(index.items[curveActor]?.male?.companionIncluded===true&&index.items[curveActor]?.female?.companionIncluded===true,'quality-flag actor scene');
const rigidActor='120000147',partialActor='120000177';
assert.ok(index.items[rigidActor]?.male?.companionIncluded===true&&index.items[rigidActor]?.female?.companionIncluded===true,'rigid actor');
assert.ok(index.items[partialActor]?.male?.companionIncluded===false&&index.items[partialActor]?.female?.companionIncluded===true,'body-specific actor');
assert.equal(Object.values(index.items).filter(row=>row.male?.companionIncluded===false&&row.female?.companionIncluded===true).length,6);
const props=['70200018','70200020'];
assert.ok(props.every(id=>['male','female'].every(b=>index.items[id][b].accessoryIncluded===true)),'both prop scenes');
const materialActor='120000113',secondaryActor='120000109';
assert.ok(index.items[materialActor]?.male?.companionIncluded===true&&index.items[materialActor]?.female?.companionIncluded===true,'external texture actor');
assert.ok(index.items[secondaryActor]?.male?.secondaryPassOmitted===true&&index.items[secondaryActor]?.female?.secondaryPassOmitted===true,'base pass actor');
assert.equal(Object.values(index.items).filter(row=>row.male?.secondaryPassOmitted===true&&row.female?.secondaryPassOmitted===true).length,6);
const eulerSquirrel='120000005',eulerPair='120000001';
assert.ok(index.items[eulerSquirrel]?.male?.eulerRotationCorrected===true&&index.items[eulerPair]?.male?.eulerRotationCorrected===true,'Euler rotation corrections');
assert.equal(Object.values(index.items).flatMap(row=>Object.values(row)).filter(o=>o.eulerRotationCorrected===true).length,52);
const mermaids=['70200021','70200023','70200024','70200025','70200026','70200027','70200028','70200029'];
assert.ok(mermaids.every(id=>['male','female'].every(b=>index.items[id][b].kind==='mermaid'&&index.items[id][b].neutralMaterialProjection===true)),'all mermaid diagnostic poses');
const ids=[...new Set([maxDog,mermaids[0],mermaids[7],eulerSquirrel,eulerPair,materialActor,secondaryActor,...props,byKind('player'),byKind('pair'),companionOnly,attached,expansion,multi,expandedActor,bindActor,curveActor,rigidActor,partialActor])];
assert.ok(ids.every(Boolean),'both scene kinds and player-only companion must be published');
assert.equal(Object.values(index.items).filter(row=>row.male?.companionIncluded===false&&row.female?.companionIncluded===false).length,26);
assert.equal(Object.keys(index.items).length,263);
assert.equal(Object.values(index.items).filter(row=>row.male?.companionIncluded===true&&row.female?.companionIncluded===true).length,206);
const base='http://127.0.0.1:4191/Wand';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4191'],{env:{...process.env,BASE_PATH:'/Wand'},stdio:'pipe'});
let browser;
try{
  let ready=false;
  for(let i=0;i<80;i++){
    try{if((await fetch(base+'/photo-mode-preview/index.json')).ok){ready=true;break}}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  assert.ok(ready,'preview server not ready');
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  for(const [i,id] of ids.entries()){
    await page.goto(base+'/collection/?item='+id);
    const detail=page.locator('details.pose-test');
    await detail.locator('summary').waitFor({timeout:60000});
    await detail.locator('summary').click();
    const preview=detail.locator('.pose-preview');
    const body=preview.locator('.body-options button');
    const seek=preview.locator('input.seek');
    await body.nth(1).waitFor({state:'visible',timeout:15000});
    assert.equal(await body.count(),2,'two original body type controls');
    for(let b=0;b<2;b++){
      await body.nth(b).click();
      await page.waitForFunction(()=>{const e=document.querySelector('.pose-preview input.seek');return e&&!e.disabled},{},{timeout:45000});
      assert.equal(await body.nth(b).getAttribute('aria-pressed'),'true');
      const duration=Number(await seek.getAttribute('max'));
      assert.ok(duration>0);
      await seek.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}))},duration*.5);
      await preview.locator('select').selectOption('0.5');
      assert.equal(await preview.locator('select').inputValue(),'0.5');
      const t=await seek.inputValue();
      const toggle=preview.locator('input[type=checkbox]');
      const option=index.items[id][b===0?'male':'female'];
      const hasActor=option.kind==='pair'||option.companionIncluded===true||option.accessoryIncluded===true;
      assert.equal(await toggle.count(),hasActor?1:0);
      if(hasActor){await toggle.uncheck();assert.equal(await seek.inputValue(),t);await toggle.check();assert.equal(await seek.inputValue(),t)}
      const canvas=preview.locator('canvas');
      await canvas.focus();await canvas.press('ArrowRight');
      assert.equal(await seek.inputValue(),t);
      const play=preview.locator('.controls').first().locator('button').first();
      await play.click();
      await page.waitForFunction(previous=>{const e=document.querySelector('.pose-preview input.seek');return e&&Math.abs(Number(e.value)-Number(previous))>.01},t,{timeout:10000});
      await play.click();
      const paused=await seek.inputValue();
      await page.waitForTimeout(100);
      assert.equal(await seek.inputValue(),paused,'pause holds playback position');
    }
    if(id===multi||id===maxDog){
      const variants=detail.locator('.pose-variants button');
      assert.equal(await variants.count(),2);
      await variants.nth(1).click();
      await page.waitForFunction(()=>{const e=document.querySelector('.pose-preview input.seek');return e&&!e.disabled},{},{timeout:45000});
      assert.equal(await variants.nth(1).getAttribute('aria-pressed'),'true');
      if(id===maxDog){
        await body.nth(0).click();
        await page.waitForFunction(()=>{const e=document.querySelector('.pose-preview input.seek');return e&&!e.disabled},{},{timeout:45000});
        assert.equal(await body.nth(0).getAttribute('aria-pressed'),'true');
        assert.equal(await preview.locator('input[type=checkbox]').count(),0);
      }
      await body.nth(1).click();
      await page.waitForFunction(()=>{const e=document.querySelector('.pose-preview input.seek');return e&&!e.disabled},{},{timeout:45000});
      assert.equal(await body.nth(1).getAttribute('aria-pressed'),'true');
      const toggle=preview.locator('input[type=checkbox]');
      assert.equal(await toggle.count(),1);
      const t=await seek.inputValue();await toggle.uncheck();assert.equal(await seek.inputValue(),t);await toggle.check();assert.equal(await seek.inputValue(),t);
      console.log('Native alternate pose ready:',id,'both body types');
    }
    console.log('Collection pose scene ready:',id,'both body types; seek, speed, orbit, visibility');
  }
}finally{await browser?.close();server.kill('SIGTERM')}
