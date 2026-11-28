import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';
test('original furniture container links expose configured size and exact content candidates without runtime claims',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const doc=JSON.parse(await readFile('data/ddv/item-master/container-furniture-source-steam-1.26.2.json','utf8'));
  const c=JSON.parse(await readFile('static/acquisition/public/container-inventory-1.26.2.json','utf8'));
  const templates=new Map(doc.templates.map(r=>[r[0],r]));
  const contents=new Map(c.containers);
  const facts=new Map(await db.getFieldRows('storage.containerFacts'));
  assert.equal(facts.size,136);
  const indexed=await db.getItemFields([...new Set(c.containers.flatMap(([,r])=>r.map(x=>Number(x[1]))))],['itemId']);
  const ids=new Set(indexed.filter(Boolean).map(r=>r.itemId));
  const expected=new Map();
  for(const [id,name,upgrade] of doc.furniture){
    const tpl=templates.get(name),f=facts.get(id);
    assert.equal(f.templateKey,name);assert.equal(f.sourceConfiguredSize,tpl?.[2]??null);
    assert.equal(f.upgradedFurnitureItemId,upgrade);assert.equal(f.runtimeContentsVerified,false);
    assert.equal(f.capacityRuntimeVerified,false);assert.equal(f.spawnVerified,false);
    const rows=(contents.get(name)??[]).filter(r=>ids.has(Number(r[1])));
    assert.deepEqual(f.configuredContentItemIds,[...new Set(rows.map(r=>Number(r[1])))].sort((a,b)=>a-b));
    for(const [pos,raw,amount] of rows){
      const itemId=Number(raw),list=expected.get(itemId)??[];
      list.push([id,name,pos,amount]);expected.set(itemId,list);
    }
  }
  const all=await db.getItemFields([...expected.keys()],['acquisition.additionalSources']);
  for(const row of all){
    const links=row.values['acquisition.additionalSources'].filter(l=>l.kind==='configured_container_furniture_slot');
    assert.deepEqual(links.map(l=>[l.sourceId,l.templateKey,l.sourcePosition,l.configuredAmount]),expected.get(row.itemId));
    assert(links.every(l=>!l.grantVerified&&!l.currentAvailabilityVerified&&!l.playerOwnershipVerified));
  }
  for(const id of [40006669,40006670,40000229,40000591]){
    const result=await db.findItemIdsByAcquisitionSource({family:'additional',kind:'configured_container_furniture_slot',sourceId:id});
    assert.equal(result.status,'indexed');
    assert.deepEqual(result.itemIds,facts.get(id).configuredContentItemIds);
  }
  assert.equal(facts.get(40000229).sourceConfiguredSize,16);
  assert.equal(facts.get(40000229).upgradedFurnitureItemId,40001679);
  assert.equal(facts.get(40001679).sourceConfiguredSize,32);
  assert.equal(facts.get(40001680).sourceConfiguredSize,48);
  const [item]=await readItemAcquisitionSourceDetails(db,[31202232],'ja');
  assert(item.additional.some(x=>x.evidence.kind==='configured_container_furniture_slot'&&x.evidence.sourceId===40006669));
  assert(!requests.some(u=>u.includes('/acquisition/public/')));
});
