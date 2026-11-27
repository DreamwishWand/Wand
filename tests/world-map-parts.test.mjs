import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseWorldMapPartReport,mapPartBounds,visibleMapParts,localMapPartFiles,verifyMapPartBytes} from '../src/lib/media/world-map-parts.ts';
const pixel='b'.repeat(64),sha='a'.repeat(64);
const part={name:'original_part',imagePath:'images/maps/original/bb/'+pixel+'.webp',
  imageSha256:sha,layoutEvidence:{componentEnabled:true,mapping:'observed_guid_field_exact_catalog_internal_id_container_pptr'},
  imageToCanvas:[1,0,0,1,20,30],renderMode:'native_pixel_copy'};
const report={schema:'wand.src04.world-map-repair@3',gameVersion:'1.26.2',publicationAuthorized:false,
  worlds:[{prefab:'MapVillage',worldCandidate:'valley',width:100,height:100,sha256:sha,
    worldPlacementVerified:false,status:'incomplete_ocean_not_rendered',parts:[part]}]};
test('original byte digest is distinct from filename identity; preserve ordered affine rows',()=>{
  const parsed=parseWorldMapPartReport(report),map=parsed.maps[0];
  assert.deepEqual(map.parts[0],{name:part.name,sourceFilename:pixel+'.webp',sha256:sha,imageToCanvas:[1,0,0,1,20,30]});
  assert.equal(map.oceanMissing,true);
  assert.equal(map.worldPlacementVerified,false);
  assert.equal(parsed.publicationAuthorized,false);
  assert.throws(()=>parseWorldMapPartReport({...report,publicationAuthorized:true}));
  for(const p of [{...part,imagePath:'../private.webp'},{...part,imageToCanvas:[0,0,0,1,0,0]},{...part,layoutEvidence:{...part.layoutEvidence,componentEnabled:false}}])
    assert.throws(()=>parseWorldMapPartReport({...report,worlds:[{...report.worlds[0],parts:[p]}]}));
});
test('affine viewport culling retains painter order and handles rotation and reflection',()=>{
  const rows=[{id:1,width:10,height:20,imageToCanvas:[1,0,0,1,0,0]},
    {id:2,width:10,height:20,imageToCanvas:[0,1,-1,0,40,0]},
    {id:3,width:10,height:20,imageToCanvas:[-1,0,0,1,90,0]}];
  assert.deepEqual(mapPartBounds(rows[1]),{x:20,y:0,w:20,h:10});
  assert.deepEqual(visibleMapParts(rows,{x:0,y:0,w:50,h:50}).map(p=>p.id),[1,2]);
  assert.deepEqual(visibleMapParts(rows,{x:80,y:0,w:10,h:20}).map(p=>p.id),[3]);
});
test('local file matching cannot substitute by similar asset name or ambiguous duplicate',()=>{
  const map=parseWorldMapPartReport(report).maps[0],f=new File(['x'],pixel+'.webp');
  assert.equal(localMapPartFiles([f,new File(['x'],'other.webp')],map).size,1);
  assert.throws(()=>localMapPartFiles([f,f],map),/AMBIGUOUS/);
});
test('original byte identity is checked before any decode',async()=>{
  const bytes=new Uint8Array(20);
  bytes.set([82,73,70,70]);new DataView(bytes.buffer).setUint32(4,12,true);
  bytes.set([87,69,66,80,86,80,56,76],8);
  const digest=createHash('sha256').update(bytes).digest('hex');
  assert.equal((await verifyMapPartBytes(new Blob([bytes]),digest)).byteLength,20);
  await assert.rejects(verifyMapPartBytes(new Blob([bytes]),sha),/SHA/);
  bytes[0]=0;
  await assert.rejects(verifyMapPartBytes(new Blob([bytes]),digest),/WEBP/);
});
