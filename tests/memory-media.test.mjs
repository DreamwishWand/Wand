import test from 'node:test';
import assert from 'node:assert/strict';
import release from '../data/ddv/media/memory-steam-1.26.2.json' with {type:'json'};
import {itemMedia} from '../src/lib/media/item-media.ts';
import {createMemoryMediaReader,getMemorySources} from '../src/lib/media/memory-media.ts';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64),d='d'.repeat(64);
function fixture(){return {schema:'wand.media.memory-release@1',state:'published',gameVersion:'1.26.2',canonicalMetadataVerified:true,pieceBitMappingVerified:false,
  items:{130000001:[a,b,c,d,10],130000002:[a,b,c,d,10]},
  images:{[a]:{width:1024,height:576,bytes:100},[b]:{width:512,height:288,bytes:50},
    [c]:{width:1024,height:576,bytes:20},[d]:{width:1024,height:576,bytes:30}}};}
test('unpublished native Memory sources resolve nothing',()=>{
  assert.equal(createMemoryMediaReader({state:'unpublished'}).get(1),null);
});
test('completed 512px list image and original mask sources share exact hashes',()=>{
  const r=createMemoryMediaReader(fixture()),m=r.get(130000001),other=r.get(130000002);
  assert.equal(m.thumbnail.url,'https://media.dreamwishwand.com/images/'+b+'.webp');
  assert.equal(m.original.width,1024);
  assert.equal(m.mask.width,1024);
  assert.equal(m.mask,other.mask);
  assert.equal(m.numberOfShards,10);
  assert.equal(m.pieceBitMappingVerified,false);
  assert.equal(r.get(130000003),null);
});
test('wrong version, premature bit mapping, oversized thumbnail, missing source rejected',()=>{
  assert.throws(()=>createMemoryMediaReader(fixture(),'1.27.0'),/release identity/);
  const x=fixture();x.pieceBitMappingVerified=true;assert.throws(()=>createMemoryMediaReader(x),/release identity/);
  const y=fixture();y.images[b].width=513;assert.throws(()=>createMemoryMediaReader(y),/thumbnail policy/);
  const z=fixture();delete z.images[c];assert.throws(()=>createMemoryMediaReader(z),/unresolved image/);
});

test('all published Memory IDs use exact receipt-verified native artwork',async()=>{
  assert.equal(release.state,'published');
  assert.equal(Object.keys(release.items).length,472);
  assert.equal(Object.keys(release.images).length,575);
  assert.equal(Object.values(release.images).reduce((n,v)=>n+v.bytes,0),440114298);
  for(const [id,row] of Object.entries(release.items)){
    const m=getMemorySources(Number(id));
    assert.deepEqual([m.original.sha256,m.thumbnail.sha256,m.mask.sha256,m.outline.sha256,m.numberOfShards],row);
    assert.equal(m.pieceBitMappingVerified,false);
    assert.equal((await itemMedia.getItemImage(Number(id))).sha256,row[1]);
    assert.equal((await itemMedia.getItemImage(Number(id),'original')).sha256,row[0]);
  }
});
