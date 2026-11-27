/** Local semantic replay journal. No Save bytes, filenames, native IDs,
 * account information or pending previews are serialized. A bounded, locally
 * selected house layout can accompany its creation step for offline replay. */
const COMMANDS=['transfer-export','landscape-export','furniture-stock-export','group-pickup-export','group-paste-export','group-cut-export','biome-furniture-export','island-furniture-export','island-decoration-export','biome-network-export','biome-decoration-export','cardinal-road-copy','cardinal-fence-copy','cardinal-fence-erase','support-child-copy','support-parent-copy','indoor-furniture-export','indoor-room-project-export','indoor-room-rename-export','indoor-room-resize-export','indoor-append-floor-export','room-finish-export','export-grid-mixed-batch-copy'] as const;
export type ReplayCommand=typeof COMMANDS[number];
export interface WorldReplayStep{command:ReplayCommand;plan:unknown;destination?:unknown}
export interface CheckpointJournal{steps:readonly WorldReplayStep[];cursor:number;firstStep:number}
export const MAX_REPLAY_STEPS=512;
const MAX_STEP=128*1024,MAX_JOURNAL=4*1024*1024;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
// These plans are authored exclusively by the existing editor and revalidated
// by the same Rust writer at replay. Reject non-JSON data, blobs, unexpected
// top-level fields and dangerous object keys before any persistence.
function plain(v:unknown,depth=0,arrayLimit=2048,depthLimit=16):boolean{
 if(depth>depthLimit)return false;
 if(v===null||typeof v==='boolean'||typeof v==='string'&&v.length<=1024||typeof v==='number'&&Number.isSafeInteger(v))return true;
 if(Array.isArray(v))return v.length<=arrayLimit&&v.every(x=>plain(x,depth+1,arrayLimit,depthLimit));
 return object(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)&&Object.keys(v).length<=64&&Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype','nativeHouseTemplate'].includes(k)&&/^[A-Za-z][A-Za-z0-9_]*$/.test(k)&&plain(x,depth+1,arrayLimit,depthLimit));
}
// A source-pinned house constructor requires its original layout during replay.
// Keep the exception restricted to this one command and exact plan shape.
// The codec authenticates the original SHA-256 and item binding again at replay.
function replayPlan(command:unknown,plan:unknown,arrayLimit:number,depthLimit:number):boolean{
 if(command==='group-paste-export'&&object(plan)&&Object.keys(plan).length===1&&object(plan.buildingInitial)&&Object.hasOwn(plan.buildingInitial,'nativeHouseTemplate')){
  const b=plan.buildingInitial;
  if(![Object.prototype,null].includes(Object.getPrototypeOf(plan))||![Object.prototype,null].includes(Object.getPrototypeOf(b)))return false;
  if(Object.keys(b).length!==6||!['itemId','destination','x','y','orientation','nativeHouseTemplate'].every(k=>Object.hasOwn(b,k)))return false;
  const {nativeHouseTemplate:hex,...rest}=b;
  if(typeof hex!=='string'||hex.length<2||hex.length>16384||hex.length%2!==0||!/^[0-9a-f]+$/.test(hex))return false;
  if(typeof rest.itemId!=='string'||!/^205[0-9]{5}$/.test(rest.itemId)||!object(rest.destination)||!integer(rest.x,-2147483648,2147483647)||!integer(rest.y,-2147483648,2147483647)||typeof rest.orientation!=='string')return false;
  return plain({buildingInitial:rest},0,arrayLimit,depthLimit);
 }
 return plain(plan,0,arrayLimit,depthLimit);
}
export function parseReplayStep(v:unknown):WorldReplayStep{
 if(!object(v)||!COMMANDS.includes(v.command as ReplayCommand)||Object.keys(v).some(k=>!['command','plan','destination'].includes(k))||
 !v.plan||typeof v.plan!=='object'||!replayPlan(v.command,v.plan,(v.command==='biome-network-export'||v.command==='biome-decoration-export'||v.command==='island-decoration-export')?4608:2048,(v.command==='biome-decoration-export'||v.command==='island-decoration-export'||v.command==='indoor-room-project-export')?40:16)||'destination'in v&&((v.command!=='furniture-stock-export'&&v.command!=='landscape-export')||!plain(v.destination)))throw Error('CHECKPOINT_STEP');
 const step={command:v.command as ReplayCommand,plan:v.plan,...('destination'in v?{destination:v.destination}:{})};
 const text=JSON.stringify(step);if(text.length>((v.command==='biome-network-export'||v.command==='biome-decoration-export'||v.command==='island-decoration-export')?v.command==='island-decoration-export'?3_500_000:1_500_000:(v.command==='biome-furniture-export'||v.command==='island-furniture-export')?1_500_000:MAX_STEP))throw Error('CHECKPOINT_STEP_LIMIT');return JSON.parse(text) as WorldReplayStep;
}
export function parseCheckpointJournal(v:unknown):CheckpointJournal{
 if(!object(v)||Object.keys(v).length!==3||!Array.isArray(v.steps)||!v.steps.length||v.steps.length>MAX_REPLAY_STEPS||
 !integer(v.cursor,0,v.steps.length)||!integer(v.firstStep,0,v.cursor))throw Error('CHECKPOINT_HISTORY');
 const steps=v.steps.map(parseReplayStep);
 if(JSON.stringify(steps).length>MAX_JOURNAL)throw Error('CHECKPOINT_LIMIT');
 return {steps,cursor:v.cursor,firstStep:v.firstStep};
}
const replaySteps=new WeakMap<File,WorldReplayStep>();
export function rememberReplayStep(copy:File,command:ReplayCommand,plan:unknown,destination?:unknown){
 try{replaySteps.set(copy,parseReplayStep({command,plan,...(destination!==undefined?{destination}:{})}));}catch{/* Copy remains usable; autosave reports unavailable. */}
}
export const replayStepFor=(copy:File)=>replaySteps.get(copy);
export function appendReplayStep(previous:CheckpointJournal|undefined,sourceStep:number,copy:File,firstStep:number):CheckpointJournal|undefined{
 const step=replayStepFor(copy);if(!step||!previous&&sourceStep!==0||previous&&previous.cursor!==sourceStep)return undefined;
 try{return parseCheckpointJournal({steps:[...(previous?.steps.slice(0,sourceStep)??[]),step],cursor:sourceStep+1,firstStep});}catch{return undefined;}
}
export function travelReplayStep(journal:CheckpointJournal|undefined,cursor:number):CheckpointJournal|undefined{
 return journal&&cursor>=journal.firstStep&&cursor<=journal.steps.length?{...journal,cursor}:undefined;
}
