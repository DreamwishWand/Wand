import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('conditional event signed amounts, mail attachments and swap sides preserve original occurrence roles',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const ids=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'ConditionalEvent'});
  const rows=await db.getItemFields(ids,['source.GiveItem','source.SendMailbox','source.SwapItem']);
  const expected=[];
  for(const row of rows){
    const v=row.values;
    for(const [i,e] of (v['source.GiveItem']?.Items??[]).entries()){
      expected.push({source:row.itemId,item:e.ItemID,amount:e.Amount,path:'source.GiveItem.Items['+i+'].ItemID',
        role:e.Amount>0?'conditional_grant':null});
    }
    for(const [i,e] of (v['source.SendMailbox']?.Attachments??[]).entries()){
      expected.push({source:row.itemId,item:e.Attachment.ItemID,amount:e.Amount,path:'source.SendMailbox.Attachments['+i+'].Attachment.ItemID',
        role:e.Amount>0?'conditional_mail_attachment':null});
    }
    for(const field of ['ItemsToGive','ItemsToRemove'])for(const [i,e] of (v['source.SwapItem']?.[field]??[]).entries()){
      expected.push({source:row.itemId,item:e.ItemID,amount:e.Amount,path:'source.SwapItem.'+field+'['+i+'].ItemID',
        role:field==='ItemsToGive'&&e.Amount>0?'conditional_swap_grant':null});
    }
  }
  assert.equal(expected.length,414);
  assert.equal(expected.filter(e=>e.role==='conditional_grant').length,237);
  assert.equal(expected.filter(e=>e.path.startsWith('source.GiveItem')&&e.amount<0).length,59);
  assert.equal(expected.filter(e=>e.role==='conditional_mail_attachment').length,115);
  assert.equal(expected.filter(e=>e.role==='conditional_swap_grant').length,1);
  assert.equal(expected.filter(e=>e.path.startsWith('source.SwapItem.ItemsToRemove')).length,2);
  const targets=[...new Set(expected.map(e=>e.item))],sources=[...new Set(expected.map(e=>e.source))];
  const [incoming,outgoing,acquisition]=await Promise.all([
    db.getItemsReferences(targets,'incoming'),db.getItemsReferences(sources,'outgoing'),db.getNativeAcquisitionCandidates(targets)
  ]);
  const inc=new Map(targets.map((id,i)=>[id,incoming[i]]));
  const out=new Map(sources.map((id,i)=>[id,outgoing[i]]));
  const acq=new Map(targets.map((id,i)=>[id,acquisition[i]]));
  for(const e of expected){
    assert(inc.get(e.item)?.some(([id,p])=>id===e.source&&p===e.path),e.path);
    assert(out.get(e.source)?.some(([id,p])=>id===e.item&&p===e.path),e.path);
    assert.deepEqual(acq.get(e.item)?.filter(([id,,p])=>id===e.source&&p===e.path),
      e.role?[[e.source,e.role,e.path]]:[],JSON.stringify(e));
  }
  const sourceKeys=new Map(await db.getFieldRows('acquisition.nativeSourceRoleKeys'));
  for(const e of expected.filter(e=>e.role))assert(sourceKeys.get(e.item)?.includes(JSON.stringify(['item_definition',e.source,e.role])));
  const removal=expected.find(e=>e.source===1520000829&&e.amount===-1);
  assert.equal(removal.item,30300438);
  const removed=await db.findItemIdsByAcquisitionSource({family:'native',sourceItemId:removal.source,role:'conditional_grant'});
  assert(!removed.itemIds.includes(removal.item));
  const swapped=await db.findItemIdsByAcquisitionSource({family:'native',sourceItemId:1520002964,role:'conditional_swap_grant'});
  assert.deepEqual(swapped.itemIds,[31202068]);
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
});


test('conditional event source reader joins every signed action to original condition tree and item grant index',async()=>{
  const requests=[];
  const fetcher=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
  const db=await openCurrentItemDatabase('',fetcher);
  const {createConditionalEventSourceReader}=await import('../src/lib/items/public-conditional-event-sources.ts');
  const reader=createConditionalEventSourceReader(db);
  const ids=await db.findItemIdsByField('nativeCategory',{kind:'equals',value:'ConditionalEvent'});
  const [events,raw]=await Promise.all([reader.getForEvents(ids),db.getItemFields(ids,['source.Conditions'])]);
  for(const [i,e] of events.entries()){
    assert.equal(e.status,'indexed');
    assert.equal(e.conditionsFieldPresent,Object.hasOwn(raw[i].values,'source.Conditions'));
    assert.deepEqual(e.conditions,raw[i].values['source.Conditions']??null);
    assert.equal(e.executionVerified,false);
    assert.equal(e.currentAvailabilityVerified,false);
  }
  const all=events.flatMap(e=>e.actions.map(action=>({event:e,action})));
  assert.equal(all.length,414);
  const grants=all.filter(e=>e.action.grantRole!==null);
  assert.equal(grants.length,353);
  assert.equal(all.filter(e=>e.action.kind==='give'&&e.action.configuredAmount<0).length,59);
  assert.equal(all.filter(e=>e.action.kind==='swap_remove').length,2);
  const itemIds=[...new Set(all.map(e=>e.action.itemId))];
  const inverse=await reader.getForItems(itemIds);
  const key=e=>JSON.stringify([e.event.eventItemId,e.action.itemId,e.action.sourcePath,e.action.grantRole]);
  assert.deepEqual(inverse.flatMap(r=>r.grants.map(key)).sort(),grants.map(key).sort());
  assert(inverse.every(r=>r.status==='indexed'&&r.currentAvailabilityVerified===false));
  const [a,missing,other,b]=await reader.getForEvents([1520000829,99999999,30300438,1520000829]);
  assert.equal(missing,null);assert.equal(other.status,'not_conditional_event');assert.deepEqual(a,b);
  assert(a.actions.some(r=>r.itemId===30300438&&r.configuredAmount===-1&&r.grantRole===null));
  assert(Object.isFrozen(a)&&Object.isFrozen(a.actions));
  assert(!requests.some(u=>u.includes('/id/')||u.includes('/locale/')||u.includes('/text/')||u.includes('/acquisition/public/')));
  const details=await (await import('../src/lib/items/public-item-details.ts')).openCurrentItemDetails('',fetcher);
  assert.deepEqual(await details.getConditionalEventSources([1520000829]),[a]);
  assert.deepEqual(await details.getItemConditionalEventSources([31202068]),await reader.getForItems([31202068]));
});
