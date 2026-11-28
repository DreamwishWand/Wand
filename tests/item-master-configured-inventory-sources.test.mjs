import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {readItemAcquisitionSourceDetails} from '../src/lib/items/public-item-acquisition-details.ts';

test('configured inventory source joins preserve occurrences and inverse lookup without granting ownership',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const c=JSON.parse(await readFile('static/acquisition/public/container-inventory-1.26.2.json','utf8'));
  const d=JSON.parse(await readFile('static/acquisition/public/default-inventories-1.26.2.json','utf8'));
  const expected=new Map();
  function add(row,kind,name,type,field){
    const [pos,raw,amount]=row,i=Number(raw),list=expected.get(i)??[];
    list.push([kind,name,pos,amount,type,field]);expected.set(i,list);
  }
  for(const [name,rows] of c.containers)for(const r of rows)add(r,'configured_container_slot',name,'container',3);
  for(const [name,field,type,rows] of d.groups)for(const r of rows)add(r,'configured_default_inventory_entry',name,type,field);
  assert.equal(expected.size,401);
  const ids=[...expected.keys()];
  const fields=await db.getItemFields(ids,['itemId','acquisition.additionalSources']);
  const canonical=new Set();
  for(const [n,row] of fields.entries()){
    if(!row)continue;
    const id=ids[n];canonical.add(id);
    const extras=row.values['acquisition.additionalSources'].filter(l=>l.kind==='configured_container_slot'||l.kind==='configured_default_inventory_entry');
    assert.deepEqual(extras.map(e=>[e.kind,e.sourceId,e.sourcePosition,e.configuredAmount,e.sourceInventoryType,e.sourceFieldNumber]),expected.get(id));
    for(const e of extras){
      assert.equal(e.currentAvailabilityVerified,false);assert.equal(e.grantVerified,false);assert.equal(e.playerOwnershipVerified,false);
      assert.match(e.sourceProjectionSha256,/^[a-f0-9]{64}$/);
    }
  }
  assert(canonical.size>0);
  const lookup=async(kind,name,rows)=>{
    const result=await db.findItemIdsByAcquisitionSource({family:'additional',kind,sourceId:name});
    assert.equal(result.status,'indexed');
    assert.deepEqual(result.itemIds,[...new Set(rows.map(r=>Number(r[1])).filter(i=>canonical.has(i)))].sort((a,b)=>a-b));
    assert.equal(result.currentAvailabilityVerified,false);
  };
  for(const [name,rows] of c.containers.filter(([n])=>['CastleSecretRoomContainer01','Chest_16Slot','MRQS_E04_081_FridgeContainer'].includes(n)))
    await lookup('configured_container_slot',name,rows);
  for(const [name,,,rows] of d.groups.filter(g=>['HomeStorage','Catalog','Wardrobe','EnvironmentalFX'].includes(g[0])))
    await lookup('configured_default_inventory_entry',name,rows);
  const [sample]=await readItemAcquisitionSourceDetails(db,[31500006],'ja');
  assert.equal(sample.additional.filter(x=>x.evidence.kind==='configured_default_inventory_entry'&&x.evidence.sourceId==='HomeStorage').length,2);
  assert(!requests.some(u=>u.includes('/acquisition/public/')));
});
