/** Offline publication of the single current DB from the verified complete
 * projection. Stable content identities are independent of game version.
 * Historical compatibility paths remain available; never rewrite an object
 * whose bytes match its hash, never delete retained objects here.
 */
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,rmSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v)+'\n');
const SHA=/^[a-f0-9]{64}$/;
const SAFE=/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
function check(ok,code){if(!ok)throw Error('DB01_CURRENT_'+code);}
export function publishCurrentProjections(root,entry){
  const source=join(root,'steam-'+entry.gameVersion+'-complete');
  const index=JSON.parse(readFileSync(join(source,'index.json'),'utf8'));
  check(index.scope==='complete'&&index.version===entry.complete?.release&&
    index.target.gameVersion===entry.gameVersion&&index.count===entry.complete.count&&
    index.archiveSha256===entry.complete.archiveSha256,'SOURCE_IDENTITY');
  const objects=join(root,'objects'),current=join(root,'current');
  mkdirSync(objects,{recursive:true});mkdirSync(current,{recursive:true});
  const stats={added:0,reused:0,bytesAdded:0,bytesReused:0};
  function project(path,pin,asset){
    check(SAFE.test(path)&&!path.split('/').some(x=>x==='.'||x==='..')&&
      SHA.test(pin.sha256)&&Number.isSafeInteger(pin.bytes)&&pin.bytes>0,'PIN');
    const bytes=readFileSync(join(source,path));
    check(bytes.length===pin.bytes&&hash(bytes)===pin.sha256,'SOURCE_DIGEST');
    let canonical=bytes;
    if(asset){
      const doc=JSON.parse(bytes);
      check(doc.release===index.version,'SOURCE_ASSET_RELEASE');
      // Revision metadata is carried by the manifest, not every object.
      doc.release='wand.item-master.current';
      canonical=encode(doc);
    }
    const sha256=hash(canonical),dest=join(objects,sha256+'.json');
    if(existsSync(dest)){
      check(readFileSync(dest).equals(canonical),'CORRUPT_IMMUTABLE_OBJECT');
      stats.reused++;stats.bytesReused+=canonical.length;
    }else{
      const tmp=mkdtempSync(join(objects,'.stage-'));
      try{const file=join(tmp,'object');writeFileSync(file,canonical);renameSync(file,dest);}
      finally{rmSync(tmp,{recursive:true,force:true});}
      stats.added++;stats.bytesAdded+=canonical.length;
    }
    return {...pin,bytes:canonical.length,sha256};
  }
  const shards=Object.fromEntries(Object.entries(index.shards).map(([path,pin])=>[path,project(path,pin,false)]));
  const assets=Object.fromEntries(Object.entries(index.assets).map(([path,pin])=>[path,project(path,pin,true)]));
  const manifest=encode({...index,shards,assets,storage:'content-addressed-current@1'});
  const stage=mkdtempSync(join(current,'.stage-'));
  try{const file=join(stage,'index.json');writeFileSync(file,manifest);renameSync(file,join(current,'index.json'));}
  finally{rmSync(stage,{recursive:true,force:true});}
  console.log('DB-01 current DB objects:',JSON.stringify(stats));
  return stats;
}
