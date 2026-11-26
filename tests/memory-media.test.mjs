import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryMediaReader,getMemorySources} from '../src/lib/media/memory-media.ts';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64),d='d'.repeat(64);
function fixture(){return {schema:'wand.media.memory-release@1',state:'published',gameVersion:'1.26.2',canonicalMetadataVerified:true,pieceBitMappingVerified:false,
  items:{130000001:[a,b,c,d,10],130000002:[a,b,c,d,10]},
  images:{[a]:{width:1024,height:576,bytes:100},[b]:{width:512,height:288,bytes:50},
    [c]:{width:1024,height:576,bytes:20},[d]:{width:1024,height:576,bytes:30}}};}
test('unpublished native Memory sources resolve nothing',()=>{
  assert.equal(getMemorySources(130000001),null);
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
