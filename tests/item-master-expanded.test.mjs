import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openPublicItemMaster} from '../src/lib/items/public-item-master.ts';
import {openPublicItemDetails} from '../src/lib/items/public-item-details.ts';

const gameVersion='1.26.2';
const sourceFile=join(process.cwd(),'data/ddv/item-master/collectible-extension-steam-'+gameVersion+'.json');
const source=JSON.parse(await readFile(sourceFile,'utf8'));
function site(){
  const requests=[];
  return {requests,fetcher:async url=>{
    requests.push(url);
    assert.match(url,/^\/Wand\/(?:ddv\/item-master-releases\.json|ddv\/item-master\/steam-1\.26\.2(?:-expanded)?\/(?:index\.json|id\/[0-9a-f]{2}\.json)|acquisition\/public\/db01-item-(?:acquisition|source-relations)-1\.26\.2\.json)$/);
    const bytes=await readFile(join(process.cwd(),'static',url.slice('/Wand/'.length)));
    return new Response(new Uint8Array(bytes),{status:200});
  }};
}
const hash=b=>createHash('sha256').update(b).digest('hex');

test('expanded canonical Item Master preserves every base ID and includes all ten original classes',async()=>{
  const {fetcher,requests}=site();
  const db=await openPublicItemMaster('/Wand',fetcher,{scope:'expanded',gameVersion:'current'});
  assert.equal(db.release.version,'steam-1.26.2-item-id-master-v2');
  assert.equal(db.release.count,14753);
  assert.equal(db.release.baseCount,13202);
  assert.equal(db.release.extensionCount,1551);
  assert.equal(requests.length,2,'registry and expanded index only');
  assert.equal(db.release.extensionSha256,hash(await readFile(sourceFile)));
  const originals=await db.getItems(source.items.map(r=>r.itemId));
  assert.deepEqual(originals,source.items);
  assert(originals.every(r=>Object.isFrozen(r)&&Object.isFrozen(r.artwork)&&
    Object.isFrozen(r.universeTagIds)));
  const memory=originals.filter(r=>r.nativeCategory==='MemoryShard');
  assert.equal(memory.length,472);
  assert(memory.every(r=>/^[a-f0-9]{32}$/.test(r.artwork.imageGuid)&&
    /^[a-f0-9]{32}$/.test(r.artwork.maskGuid)));
  assert(memory.every(r=>!r.nameVerified&&Object.values(r.names).every(n=>n===null)));
  const known=await db.getItem(40005160);
  assert.equal(known.names.en,'Glass Shoe');
  const original=await openPublicItemMaster('/Wand',fetcher);
  assert.equal(original.release.count,13202);
  assert.deepEqual(await original.getItem(40005160),known);
  assert.equal(await original.getItem(source.items[0].itemId),null);
  assert.equal(await db.getItem(900000000),null);
});

test('Collection expanded browse index covers every ItemID exactly once with source subtype and universe status',async()=>{
  const f=JSON.parse(await readFile('static/ddv/collection/db01-expanded-facets-1262.json','utf8'));
  const b=JSON.parse(await readFile('static/ddv/collection/db01-facets-1262.json','utf8'));
  assert.equal(f.sourceItemCount,14753);
  assert.equal(f.nativeSubtypeItemCount,14753);
  assert.equal(f.universeSourceStatusItemCount,14753);
  assert.equal(f.gameRuntimeMembershipVerified,false);
  const types=new Map(f.nativeSubtypeItems.map(([id,...value])=>[id,value]));
  const statuses=new Map(f.universeSourceStatusItems);
  const universes=new Map(f.universeSourceTagItems);
  assert.equal(types.size,14753);assert.equal(statuses.size,14753);
  for(const [id,...value] of b.nativeSubtypeItems)assert.deepEqual(types.get(id),value);
  for(const r of source.items){
    assert.deepEqual(types.get(r.itemId),[r.itemType.name,r.itemType.subtypeCode,
      r.itemType.subtypeNameVerified?r.itemType.subtypeName:null]);
    assert.equal(statuses.get(r.itemId),r.universeSourceStatus);
    assert.deepEqual(universes.get(r.itemId)??[],r.universeTagIds);
  }
  assert.equal(source.items.filter(r=>r.universeSourceStatus==='source_linked').length,830);
  assert.equal(source.items.filter(r=>r.universeSourceStatus==='unresolved_source').length,592);
  assert.equal(source.items.filter(r=>r.universeSourceStatus==='no_universe_in_verified_tag_fields').length,129);
  assert.equal(new Set(f.universeSourceTagItems.map(x=>x[0])).size,f.universeSourceTagCount);
  assert.equal(b.sourceItemCount,13202);
});

test('expanded Item IDs retain DB-02 join and reject incompatible scope or release metadata',async()=>{
  const {fetcher}=site();
  const db=await openPublicItemDetails('/Wand',fetcher,{scope:'expanded',gameVersion:'1.26.2'});
  const candidate=source.items.find(r=>r.nativeCategory==='Companion');
  const item=await db.getItemWithSources(candidate.itemId);
  assert.equal(item.definition.itemId,candidate.itemId);
  assert.equal(item.acquisition.itemId,String(candidate.itemId));
  assert.equal(item.sourceRelations.itemId,String(candidate.itemId));
  await assert.rejects(openPublicItemMaster('/Wand',fetcher,{scope:'invalid'}),/ITEM_MASTER_INVALID_SCOPE/);
  const wrong=async url=>{
    const response=await fetcher(url);
    if(!url.endsWith('-expanded/index.json'))return response;
    const metadata=await response.json();
    return new Response(JSON.stringify({...metadata,extensionCount:metadata.extensionCount+1}));
  };
  await assert.rejects(
    openPublicItemMaster('/Wand',wrong,{scope:'expanded',gameVersion:'1.26.2'}),
    /ITEM_MASTER_INVALID_EXPANDED_RELEASE/
  );
});
