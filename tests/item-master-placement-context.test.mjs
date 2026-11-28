import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';

test('native floor-context filter reconciles the entire original Furniture and Building census',async()=>{
  const requests=[];
  const db=await openCurrentItemDatabase('',async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});});
  const contexts=await db.getFieldRows('placement.sourceContext');
  const classes=new Map(await db.getFieldRows('placement.sourceFloorClass'));
  const maskNames=new Map(await db.getFieldRows('placement.sourceFloorTypeNames'));
  const surfaces=new Map(await db.getFieldRows('placement.sourceSupportsSurface'));
  const masks=new Map(await db.getFieldRows('source.GridAreaData.AcceptedFloorTypesFlag'));
  const nativeCategory=new Map(await db.getFieldRows('nativeCategory'));
  const counts={Furniture:{},Building:{}};
  const known=new Map(contexts);
  for(const [id,c] of contexts){
    assert.equal(c.placementLegalityVerified,false);
    const kind=nativeCategory.get(id);
    assert(['Furniture','Building'].includes(kind));
    if(c.floor){
      const f=c.floor;
      assert.equal(f.mask,masks.get(id));assert.equal(f.unknownBits,0);
      assert.equal(f.kind,classes.get(id));assert.deepEqual(f.floorTypes,maskNames.get(id));
      assert.equal(f.surface,Boolean(f.mask&4096));assert.equal(f.surface,surfaces.get(id));
      assert.equal(f.room,Boolean(f.mask&3072));
      counts[kind][f.kind]=(counts[kind][f.kind]??0)+1;
    }
  }
  assert.deepEqual(counts,{Furniture:{terrain_and_floor_wall:4009,terrain_only:2028,floor_wall_only:661,surface_or_special:48},
    Building:{terrain_and_floor_wall:45,terrain_only:347,floor_wall_only:2}});
  assert.equal(known.get(40000047).floor.kind,'terrain_and_floor_wall');
  assert.equal(known.get(40000048).floor.surface,true);
  assert.deepEqual(known.get(40000052).floor.floorTypes,['Wall']);
  assert.equal(known.get(40200001).floor.kind,'terrain_only');
  assert.deepEqual(known.get(40003445).floor.floorTypes,['Puzzle']);
  assert.equal(known.get(20100000).scene.sceneItemId,1540000000);
  assert.equal(known.get(40003272).scene.sceneTypeCode,0);
  assert.equal(known.get(40003272).scene.sceneTypeName,'Main');
  assert.equal(known.get(40200626).scene.sceneTagItemId,2001200082);
  const ids=await db.findItemIdsByFields([
    {field:'nativeCategory',anyOf:[{kind:'equals',value:'Furniture'}]},
    {field:'placement.sourceFloorClass',anyOf:[{kind:'equals',value:'floor_wall_only'}]}
  ]);
  assert.equal(ids.length,661);
  const [a,missing,b]=await db.getItemFields([40000047,99999999,40000047],['placement.sourceContext']);
  assert.equal(missing,null);assert.deepEqual(a,b);
  // The shared browse projection must not claim runtime legality or invent scope.
  const path='/ddv/item-master/steam-'+db.release.target.gameVersion+'-complete/explore.json';
  const catalog=JSON.parse(await readFile('static'+path,'utf8'));
  assert.deepEqual(await db.getDecorationBrowse(),catalog,'pinned current browse matches the generated compatibility view');
  for(const row of catalog.items){
    const c=known.get(row.itemId);
    assert.deepEqual(row.sourcePlacement,c?{floorClass:c.floor?.kind??null,
      acceptedFloorMask:c.floor?.mask??null,surface:c.floor?.surface??null,scene:c.scene,
      ordinaryScope:c.ordinaryScope,placementLegalityVerified:false}:undefined);
    assert.equal(row.placementScope,undefined);
  }
  assert(!requests.some(url=>url.includes('/id/')||url.includes('/locale/')||url.includes('/text/')));
});

test('Explore uses a verified current content-addressed projection; rejects byte tampering',async()=>{
 const requests=[];
 const read=async url=>{requests.push(url);return new Response(await readFile('static'+url),{status:200});};
 const db=await openCurrentItemDatabase('',read);
 const manifest=JSON.parse(await readFile('static/ddv/item-master/current/index.json','utf8'));
 const pin=manifest.assets['explore.json'];
 assert.match(pin.sha256,/^[a-f0-9]{64}$/);
 const object='/ddv/item-master/objects/'+pin.sha256+'.json';
 const catalog=await db.getDecorationBrowse();
 assert.ok(catalog.items.length>500);
 assert.equal(catalog.items.length,pin.count);
 assert.ok(requests.includes(object));
 assert.equal(requests.filter(url=>url===object).length,1);
 await db.getDecorationBrowse();
 assert.equal(requests.filter(url=>url===object).length,1);
 assert(!requests.some(url=>url.endsWith('/explore.json')),'no versioned decoration read');
 const broken=await openCurrentItemDatabase('',async url=>{
  const bytes=await readFile('static'+url);
  if(url===object)bytes[0]^=1;
  return new Response(bytes,{status:200});
 });
 await assert.rejects(broken.getDecorationBrowse(),/SHA_MISMATCH/);
});
