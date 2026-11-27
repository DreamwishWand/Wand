import {parseCheckpointJournal,type CheckpointJournal,type WorldReplayStep} from './checkpoint-journal.ts';
import {experimentalCopyDownload} from './experimental-copy.ts';
import {WORLD_CHECKPOINT_MAX_BYTES,WORLD_CHECKPOINT_MAX_STEPS,type WorldCheckpointHistory} from '../ui/local-save-session.ts';
import {testSaveExportEnabled} from './test-save-export.ts';
/** Reuse the exact existing worker commands and independent reopen receipts.
 * Replay is isolated from the active Save until every reachable step succeeds. */
async function replayStep(file:File,step:WorldReplayStep,signal:AbortSignal):Promise<File>{
 if(signal.aborted)throw Error('REPLAY_ABORTED');
 const command=step.command,grid=command==='export-grid-mixed-batch-copy';
 const own=grid?new Worker(new URL('../save/save-amount-preview.worker.ts',import.meta.url),{type:'module'}):
 command==='transfer-export'?new Worker(new URL('./structure-preview.worker.ts',import.meta.url),{type:'module'}):
 command==='support-child-copy'||command==='support-parent-copy'?new Worker(new URL('./subgrid-local.worker.ts',import.meta.url),{type:'module'}):
 command==='indoor-furniture-export'||command==='room-finish-export'||command==='indoor-room-project-export'?new Worker(new URL('./indoor-room-view.worker.ts',import.meta.url),{type:'module'}):
 command==='cardinal-road-copy'||command==='cardinal-fence-copy'||command==='cardinal-fence-erase'?new Worker(new URL('./cardinal-road-save.worker.ts',import.meta.url),{type:'module'}):
 new Worker(new URL('./furniture-stock-preview.worker.ts',import.meta.url),{type:'module'});
 try{
  return await new Promise<File>((resolve,reject)=>{
   let settled=false;
   const end=(error:unknown,file?:File)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);clearTimeout(timer);own.terminate();if(file)resolve(file);else reject(error);};
   const abort=()=>end(Error('REPLAY_ABORTED'));
   const timer=setTimeout(()=>end(Error('REPLAY_TIMEOUT')),120000);
   signal.addEventListener('abort',abort,{once:true});
   own.onmessage=e=>{
    const d=e.data;
    if(settled){d?.bytes?.fill(0);return;}
    try{
     const expected=grid?'copy':command==='transfer-export'?'transfer-copy':command==='support-child-copy'||command==='support-parent-copy'?command:
       command==='indoor-room-project-export'?'indoor-room-project-copy':command==='indoor-furniture-export'?'indoor-furniture-copy':command==='room-finish-export'?'room-finish-copy':
       command.startsWith('cardinal-')?'cardinal-road-copy':'furniture-stock-copy';
     if(d?.kind!==expected)throw Error('REPLAY_RECEIPT');
     const copy=experimentalCopyDownload(d,file);URL.revokeObjectURL(copy.url);end(null,copy.file);
    }catch(e){d?.bytes?.fill(0);end(e);}
   };
   own.onerror=e=>{e.preventDefault();end(Error('REPLAY_WORKER'));};own.onmessageerror=()=>end(Error('REPLAY_MESSAGE'));
   if(signal.aborted){abort();return;}
   if(grid)void file.arrayBuffer().then(buffer=>{
    if(settled){new Uint8Array(buffer).fill(0);return;}
    const bytes=new Uint8Array(buffer);
    try{own.postMessage({command,format:file.name.toLowerCase().endsWith('.json')?'json':'auto',bytes,edits:step.plan,allowExperimentalCopy:true},[buffer]);}
    catch(e){if(bytes.byteLength)bytes.fill(0);end(e);}
   }).catch(end);
   else try{own.postMessage({command,file,plan:step.plan,...((command==='furniture-stock-export'||command==='landscape-export')?{destination:step.destination??null}:{}),allowExperimentalCopy:true});}catch(e){end(e);}
  });
 }finally{own.terminate();}
}
export async function replayWorldCheckpoints(original:File,value:CheckpointJournal,signal:AbortSignal,onProgress:(done:number,total:number)=>void=()=>{}):Promise<WorldCheckpointHistory>{
 if(!testSaveExportEnabled(window.location)||original.size<1||original.size>32*1024*1024)throw Error('REPLAY_DISABLED');
 const journal=parseCheckpointJournal(value),files:File[]=[];
 if(journal.steps.length-journal.firstStep+1>WORLD_CHECKPOINT_MAX_STEPS+1)throw Error('REPLAY_HISTORY_LIMIT');
 let file=original,total=original.size;
 if(journal.firstStep===0)files.push(file);
 for(let i=0;i<journal.steps.length;i++){
  if(signal.aborted)throw Error('REPLAY_ABORTED');
  file=await replayStep(file,journal.steps[i],signal);
  if(i+1>=journal.firstStep){total+=file.size;if(total>WORLD_CHECKPOINT_MAX_BYTES)throw Error('REPLAY_MEMORY_LIMIT');files.push(file);}
  onProgress(i+1,journal.steps.length);
 }
 return {original,files,firstStep:journal.firstStep,cursor:journal.cursor-journal.firstStep,journal};
}
