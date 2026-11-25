import test from 'node:test';import assert from 'node:assert/strict';
import {readExperimentalCopy,experimentalCopyDownload} from '../src/lib/world/experimental-copy.ts';
test('experimental copy transfer assembles chunks and clears temporary buffers',()=>{
 const chunks=[];const result=readExperimentalCopy(1048580,n=>{const b=new Uint8Array(n).fill(chunks.length+1);chunks.push(b);return b;});
 assert.equal(result.bytes[0],1);assert.equal(result.bytes[1048576],2);assert.equal(result.receipt.copyBytes,1048580);
 assert.ok(chunks.every(b=>b.every(x=>x===0)));
 assert.throws(()=>readExperimentalCopy(0,()=>new Uint8Array(0)));
 assert.throws(()=>readExperimentalCopy(5,()=>new Uint8Array(4)));
});
test('download preserves original extension and rejects inaccurate receipts',async()=>{
 const source=new File(['original'],'profile.json');const result=readExperimentalCopy(2,n=>new Uint8Array(n).fill(3));
 const download=experimentalCopyDownload(result,source);try{assert.equal(download.name,'profile-world-test.json');assert.deepEqual([...new Uint8Array(await (await fetch(download.url)).arrayBuffer())],[3,3]);assert.deepEqual([...result.bytes],[0,0]);assert.equal(await source.text(),'original');}finally{URL.revokeObjectURL(download.url);}
 const invalid=readExperimentalCopy(2,n=>new Uint8Array(n).fill(3));invalid.receipt.productionWriterAuthorized=true;assert.throws(()=>experimentalCopyDownload(invalid,source));assert.deepEqual([...invalid.bytes],[0,0]);
});
