import fs from 'node:fs/promises';
import {combine} from './split-loader.js';
const [dir,sha,out]=process.argv.slice(2);const m=JSON.parse(await fs.readFile(dir+'/index.json','utf8'));const c=m.clips.find(x=>x.sourceSha256===sha);if(!c)throw Error('no clip');const b=async name=>{const x=await fs.readFile(dir+'/'+name);return x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength)};const payload=await combine(await b(m.model.sha256+'.glb'),await b(c.sha256+'.wpa'),m,c);await fs.writeFile(out,new Uint8Array(payload),{flag:'wx'});
