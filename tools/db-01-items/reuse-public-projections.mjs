/** Offline build helper, not browser runtime. Reuse only byte-identical data.
 * Never changes a prior release, never uploads, and never trusts a stale ledger
 * in lieu of matching the actual file bytes.
 */
import {readFileSync,writeFileSync,mkdirSync,linkSync,copyFileSync,lstatSync,
  readdirSync,constants,renameSync,rmSync,existsSync,mkdtempSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const safePath=/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
export function createProjectionWriter(root,stage,destination){
  const prior=[destination,...readdirSync(root,{withFileTypes:true})
    .filter(d=>d.isDirectory()&&/^steam-\d+\.\d+\.\d+-complete$/.test(d.name))
    .map(d=>join(root,d.name)).filter(p=>p!==destination).sort()];
  const stats={written:0,reusedSameRelease:0,reusedOtherRelease:0,bytesReused:0};
  function write(path,value,count){
    if(!safePath.test(path)||path.split('/').some(p=>p==='.'||p==='..'))throw Error('DB01_PROJECTION_PATH');
    const bytes=Buffer.from(JSON.stringify(value)+'\n'),sha256=hash(bytes),target=join(stage,path);
    mkdirSync(dirname(target),{recursive:true});
    let reused=false;
    for(const sourceRoot of prior){
      const source=join(sourceRoot,path);
      try{
        const stat=lstatSync(source);
        if(!stat.isFile()||stat.size!==bytes.length||!readFileSync(source).equals(bytes))continue;
        // A same-release predecessor is replaced as a whole below; its old
        // inode need not be rewritten. Across releases prefer copy-on-write:
        // never leave two independently retained release trees hardlinked.
        if(sourceRoot===destination)linkSync(source,target);
        else copyFileSync(source,target,constants.COPYFILE_FICLONE_FORCE);
        if(!readFileSync(target).equals(bytes)){
          rmSync(target,{force:true});continue;
        }
        if(sourceRoot===destination)stats.reusedSameRelease++;
        else stats.reusedOtherRelease++;
        stats.bytesReused+=bytes.length;reused=true;break;
      }catch{
        // Unsupported hardlink/reflink, missing predecessor, or corrupt file:
        // normal deterministic generation remains the safe fallback.
        if(existsSync(target))rmSync(target,{force:true});
      }
    }
    if(!reused){writeFileSync(target,bytes);stats.written++;}
    return {count,bytes:bytes.length,sha256};
  }
  return {write,stats};
}
/** Replace the generated version tree only after the entire new tree exists.
 * Preserve the prior usable version if installing the completed stage fails.
 */
export function installProjectionStage(stage,destination){
  if(!existsSync(destination)){renameSync(stage,destination);return;}
  const backupRoot=mkdtempSync(join(dirname(destination),'.previous-complete-'));
  const backup=join(backupRoot,basename(destination));
  try{
    renameSync(destination,backup);
    try{renameSync(stage,destination);}
    catch(err){renameSync(backup,destination);throw err;}
  }finally{
    // If restoration itself failed, retain backup rather than destroying it.
    if(!existsSync(backup)||existsSync(destination))rmSync(backupRoot,{recursive:true,force:true});
  }
}
