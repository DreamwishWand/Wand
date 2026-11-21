import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {openPrivateDb01Zip} from '../src/lib/collection/private-db01-zip.mjs';

const utf8=x=>new TextEncoder().encode(x);
const name='private-shards/manifest.json';
function crc32(data){let c=0xffffffff;for(const b of data){c^=b;for(let j=0;j<8;j++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);}return(c^0xffffffff)>>>0;}
function put16(b,n,o){b.writeUInt16LE(n,o)}
function put32(b,n,o){b.writeUInt32LE(n>>>0,o)}
function zip(entries){
 const local=[],central=[];let offset=0;
 for(const entry of entries){
  const n=Buffer.from(entry.name),u=Buffer.from(entry.content),method=entry.method??8;
  const compressed=method===8?deflateRawSync(u):u;
  const crc=crc32(u),l=Buffer.alloc(30+n.length+compressed.length),c=Buffer.alloc(46+n.length);
  put32(l,0x04034b50,0);put16(l,20,4);put16(l,method,8);put32(l,crc,14);put32(l,compressed.length,18);put32(l,u.length,22);put16(l,n.length,26);
  n.copy(l,30);compressed.copy(l,30+n.length);
  put32(c,0x02014b50,0);put16(c,20,4);put16(c,20,6);put16(c,method,10);put32(c,crc,16);put32(c,compressed.length,20);put32(c,u.length,24);put16(c,n.length,28);put32(c,offset,42);n.copy(c,46);
  local.push(l);central.push(c);offset+=l.length;
 }
 const cent=Buffer.concat(central),end=Buffer.alloc(22);
 put32(end,0x06054b50,0);put16(end,entries.length,8);put16(end,entries.length,10);put32(end,cent.length,12);put32(end,offset,16);
 return Buffer.concat([...local,cent,end]);
}
const files=()=>[{name,content:'{"schema":"synthetic"}'},{name:'private-shards/id/00.json',content:'[{"itemId":256}]'}];

test('private ZIP reads only requested manifest/id shards with CRC and raw DEFLATE',async()=>{
 const obj=openPrivateDb01Zip(zip(files()));
 assert.equal(obj.entryCount,2);
 assert.equal(new TextDecoder().decode(await obj.readShard(name)),'{"schema":"synthetic"}');
 assert.equal(new TextDecoder().decode(await obj.readShard('private-shards/id/00.json')),'[{"itemId":256}]');
 await assert.rejects(obj.readShard('private-shards/historical/00.json'),/MISSING_SHARD/);
 await assert.rejects(obj.readShard('private-shards/../personal.json'),/UNAPPROVED_PATH/);
});
test('store-compressed entries are supported, but unrelated archive entries are inaccessible',async()=>{
 const obj=openPrivateDb01Zip(zip([...files(),{name:'private-1262.sqlite',content:'unrelated',method:0}]));
 assert.equal(obj.entryCount,3);
 assert.equal(new TextDecoder().decode(await obj.readShard('private-shards/id/00.json')),'[{"itemId":256}]');
 await assert.rejects(obj.readShard('private-1262.sqlite'),/UNAPPROVED_PATH/);
});
test('rejects malformed ZIP directory, duplicates and traversal entries',()=>{
 assert.throws(()=>openPrivateDb01Zip(new Uint8Array(50)),/BAD_DIRECTORY/);
 assert.throws(()=>openPrivateDb01Zip(zip([...files(),files()[0]])),/INVALID_PATH/);
 assert.throws(()=>openPrivateDb01Zip(zip([{name:'../private-shards/manifest.json',content:'bad'},...files()])),/INVALID_PATH/);
});
test('read-time corruption fails CRC/DEFLATE, never yields unchecked bytes',async()=>{
 const original=zip(files());const changed=Buffer.from(original);
 const point=30+Buffer.from(name).length+7;
 changed[point]^=0x80;
 const obj=openPrivateDb01Zip(changed);
 await assert.rejects(obj.readShard(name));
});
test('private ZIP rejects unknown, inaccessible and missing shard paths',async()=>{
 const obj=openPrivateDb01Zip(zip(files()));
 await assert.rejects(obj.readShard('private-shards/id/ab.json'),/MISSING_SHARD/);
 await assert.rejects(obj.readShard('private-shards/manifest.json?foo'),/UNAPPROVED_PATH/);
});