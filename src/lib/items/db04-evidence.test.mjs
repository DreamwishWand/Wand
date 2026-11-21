import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDb01WorldEvidenceClient,DB01_WORLD_EVIDENCE_SCHEMA} from './db04-evidence.ts';

const sha = value=>createHash('sha256').update(value).digest('hex');
const db01Source=sha('catalog original');
const sourceFurniture=sha('Furniture original');
const sourceBuilding=sha('Building original');
const worldZip=sha('world zip original');
const sqlite=sha('SQLite bytes');
const version='1.26.2';
const row={itemId:40000047,nativeCategory:'Furniture',nativeKey:'Mickey!Chair',
  localizationKey:'Furniture.Mickey!Chair_DisplayName',sourceSha256:sourceFurniture,
  footprint:{sizeX:2,sizeY:3,acceptedFloorTypesFlag:1024,layerValuesSha256:sha('native layers'),
  nativeDimensionsVerified:true,placementLegalityVerified:false,
  cellIndexToXYVerified:false,layerMaskSemanticsVerified:false}};
function fixture() {
  const files={}, bytes=new Map();
  for(let i=0;i<256;i++){
    const file=`${i.toString(16).padStart(2,'0')}.json`;
    const content=new TextEncoder().encode(JSON.stringify(i===row.itemId%256?[row]:[])+'\n');
    files[file]={sha256:sha(content),bytes:content.byteLength,count:i===row.itemId%256?1:0};
    bytes.set(file,content);
  }
  const manifest={schema:DB01_WORLD_EVIDENCE_SCHEMA, privateOnly:true,publicationAuthorized:false,
    platform:'Steam',db01GameVersion:version,worldGameVersion:'1.26.1',
    db01SourceItemsSha256:db01Source,db01SqliteSha256:sqlite,
    worldArchiveSha256:worldZip,worldManifestSha256:sha('world manifest'),
    worldObjectsSha256:sha('world objects'),
    sourceSha256ByCategory:{Building:sourceBuilding,Furniture:sourceFurniture},
    categories:['Building','Furniture'],bucketCount:256,itemCount:1,
    byCategory:{Building:0,Furniture:1},recoveredLocalizationKeys:{Building:0,Furniture:1},
    verifiedFootprints:{Building:0,Furniture:1},fullWorldHierarchyVerified:false,
    placementLegalityVerified:false,saveStateOrOwnershipVerified:false,files};
  const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest)+'\n');
  const calls=[];
  const catalog={source:{privateOnly:true,platform:'Steam',gameVersion:version,sourceItemsSha256:db01Source},
    async getItem(id){calls.push('db01:'+id);return id===row.itemId?{
      itemId:id,nativeCategory:row.nativeCategory,nativeKey:row.nativeKey,
      localizationKey:null,sourceSha256:row.sourceSha256}:null;}};
  const args={catalog,manifestBytes,load:async file=>{calls.push('world:'+file);return bytes.get(file)},
    expectedManifestSha256:sha(manifestBytes),expectedWorldArchiveSha256:worldZip,
    expectedDb01SqliteSha256:sqlite};
  return {manifest,bytes,calls,args};
}
test('exact original 1.26.1/1.26.2 files rejoin Furniture only as private native candidate evidence',async()=>{
  const f=fixture(); const api=await createDb01WorldEvidenceClient(f.args);
  const item=await api.getItem(row.itemId);
  assert.equal(item.localizationKey,row.localizationKey);
  assert.equal(item.localizationKeyRecoveredFromWorld,true);
  assert.equal(item.footprint.sizeX,2);
  assert.equal(item.footprint.sizeY,3);
  assert.equal(item.sourceGameVersions.world,'1.26.1');
  assert.equal(item.sourceGameVersions.item,'1.26.2');
  assert.equal(item.placementLegalityVerified,false);
  assert.equal(item.worldCoordinatesVerified,false);
  assert.equal(item.saveStateOrOwnershipVerified,false);
  assert.equal(item.publicationAuthorized,false);
  assert.ok(Object.isFrozen(item));
  assert.deepEqual(f.calls,['db01:40000047','world:2f.json']);
  await api.getItem(row.itemId);
  assert.deepEqual(f.calls,['db01:40000047','world:2f.json','db01:40000047']);
});
test('unmatched ID is not a claim about all game definitions and fetches no world file',async()=>{
  const f=fixture();const api=await createDb01WorldEvidenceClient(f.args);
  assert.equal(await api.getItem(999),null);
  assert.deepEqual(f.calls,['db01:999']);
});
test('trusted manifest, archive and SQLite SHA are mandatory and independently checked',async()=>{
  for(const key of ['expectedManifestSha256','expectedWorldArchiveSha256','expectedDb01SqliteSha256']){
    const f=fixture();f.args[key]=sha('forgery');
    await assert.rejects(createDb01WorldEvidenceClient(f.args),/PIN_MISMATCH|VERSION_OR_SOURCE_MISMATCH/);
  }
});
test('private, nonpublication and incompatible source-version flags cannot be tampered',async()=>{
  for(const [key,value] of [['publicationAuthorized',true],['privateOnly',false],
    ['placementLegalityVerified',true],['db01GameVersion','1.26.1']]) {
    const f=fixture();f.manifest[key]=value;
    f.args.manifestBytes=new TextEncoder().encode(JSON.stringify(f.manifest));
    f.args.expectedManifestSha256=sha(f.args.manifestBytes);
    await assert.rejects(createDb01WorldEvidenceClient(f.args),/PRIVATE_PROOF_REQUIRED|VERSION_OR_SOURCE_MISMATCH/);
  }
});
test('tampered or missing source item fields are rejected even with valid shard SHA',async()=>{
  for(const field of ['nativeKey','sourceSha256']) {
    const f=fixture();const changed={...row,[field]:'forged'};
    const encoded=new TextEncoder().encode(JSON.stringify([changed])+'\n');
    const key='2f.json';f.bytes.set(key,encoded);
    f.manifest.files[key]={sha256:sha(encoded),bytes:encoded.byteLength,count:1};
    f.args.manifestBytes=new TextEncoder().encode(JSON.stringify(f.manifest));
    f.args.expectedManifestSha256=sha(f.args.manifestBytes);
    const api=await createDb01WorldEvidenceClient(f.args);
    await assert.rejects(api.getItem(row.itemId),/ORIGINAL_SOURCE_IDENTITY_MISMATCH|INVALID_NATIVE_ROW/);
  }
});
test('localization metadata changes require independent manifest SHA re-approval',async()=>{
  const f=fixture(); const modified={...row,localizationKey:'Forged.Value'};
  const encoded=new TextEncoder().encode(JSON.stringify([modified])+'\n');
  f.bytes.set('2f.json',encoded);f.manifest.files['2f.json']={sha256:sha(encoded),bytes:encoded.length,count:1};
  f.args.manifestBytes=new TextEncoder().encode(JSON.stringify(f.manifest));
  // Trusted manifest SHA deliberately does NOT change with this untrusted input.
  await assert.rejects(createDb01WorldEvidenceClient(f.args),/MANIFEST_PIN_MISMATCH/);
});
test('raw layer flags cannot authorize placement from this interface',async()=>{
  const f=fixture();const modified={...row,footprint:{...row.footprint,placementLegalityVerified:true}};
  const encoded=new TextEncoder().encode(JSON.stringify([modified])+'\n');
  f.bytes.set('2f.json',encoded);f.manifest.files['2f.json']={sha256:sha(encoded),bytes:encoded.length,count:1};
  f.args.manifestBytes=new TextEncoder().encode(JSON.stringify(f.manifest));
  f.args.expectedManifestSha256=sha(f.args.manifestBytes);
  const api=await createDb01WorldEvidenceClient(f.args);
  await assert.rejects(api.getItem(row.itemId),/INVALID_FOOTPRINT_EVIDENCE/);
});
test('asset body tampering detected before JSON values are parsed',async()=>{
  const f=fixture();f.bytes.set('2f.json',new TextEncoder().encode('[{}]\n'));
  const api=await createDb01WorldEvidenceClient(f.args);
  await assert.rejects(api.getItem(row.itemId),/ASSET_SIZE_MISMATCH|ASSET_SHA_MISMATCH/);
});