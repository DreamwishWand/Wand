/**
 * Browser-local, one-shot Rust recipe basket entrypoint.
 * Only the owner-selected, independently SHA-pinned private SRC-02 r5 archive
 * is admissible. The Worker handles ZIP and Rust planning off the UI thread.
 * No original source files, player saves or plan results are uploaded.
 */
import type {Src02IndependentPin} from './private-browser-bundle.mjs';
import type {RecipeBasketGoal,RecipeBasketOptions} from './recipe-basket-request';
import type {MaterialBasket} from './planner.mjs';

const MAX_ARCHIVE=24*1024*1024;

function trustedPin(pin:Src02IndependentPin):boolean{
  return pin!==null&&typeof pin==='object'&&
    pin.platform==='Steam'&&pin.gameVersion==='1.26.2'&&
    /^[a-f0-9]{64}$/.test(pin.manifestSha256)&&
    /^[a-f0-9]{64}$/.test(pin.src01ManifestSha256)&&
    pin.currentConditionSha256===
      '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
}

/** Private r5 source stays in the dedicated Worker until the one reply. */
export async function planVerifiedRecipeBasket(
  archive:File,pin:Src02IndependentPin,goals:readonly RecipeBasketGoal[],
  options:RecipeBasketOptions={},signal?:AbortSignal
):Promise<MaterialBasket>{
  if(!(archive instanceof File)||archive.size<22||archive.size>MAX_ARCHIVE||
      !trustedPin(pin)||signal?.aborted)
    throw new TypeError('DB02_RUST_PLAN_SOURCE_OR_PIN_INVALID');
  // This is a file chosen by the user, not a fetch or automatic remote load.
  const bytes=new Uint8Array(await archive.arrayBuffer());
  if(signal?.aborted){bytes.fill(0);throw new TypeError('DB02_RUST_PLAN_ABORTED');}
  return new Promise((resolve,reject)=>{
    let worker:Worker|null=null;
    let finished=false;
    const done=(error:Error|null,plan?:MaterialBasket)=>{
      if(finished)return;
      finished=true;
      signal?.removeEventListener('abort',aborted);
      worker?.terminate();
      if(error)reject(error);
      else if(plan)resolve(plan);
      else reject(new TypeError('DB02_RUST_PLAN_NO_RESULT'));
    };
    const aborted=()=>done(new TypeError('DB02_RUST_PLAN_ABORTED'));
    try{
      signal?.addEventListener('abort',aborted,{once:true});
      if(signal?.aborted){aborted();return;}
      worker=new Worker(new URL('./recipe-basket.worker.ts',import.meta.url),
        {type:'module'});
      worker.onmessage=({data}:MessageEvent<unknown>)=>{
        const reply=data&&typeof data==='object'&&!Array.isArray(data)
          ?data as Record<string,unknown>:null;
        const report=reply?.report&&typeof reply.report==='object'&&
          !Array.isArray(reply.report)?reply.report as Record<string,unknown>:null;
        if(reply?.kind!=='result'||!report||
            report.schema!=='wand.db02.material-basket@1'||
            report.recipeEligibilityEvaluated!==false||
            report.acquisitionAvailabilityVerified!==false||
            !Array.isArray(report.goals)||!Array.isArray(report.requiredMaterials))
          return done(new TypeError('DB02_RUST_PLAN_FAILED'));
        done(null,report as unknown as MaterialBasket);
      };
      worker.onerror=event=>{
        event.preventDefault();
        done(new TypeError('DB02_RUST_PLAN_WORKER_FAILED'));
      };
      worker.onmessageerror=()=>done(new TypeError('DB02_RUST_PLAN_WORKER_MESSAGE_FAILED'));
      worker.postMessage({
        command:'plan-private-recipe-basket',archive:bytes,pin,
        goals:[...goals],options
      },[bytes.buffer]);
    }catch{
      if(bytes.byteLength)bytes.fill(0);
      done(new TypeError('DB02_RUST_PLAN_WORKER_SETUP_FAILED'));
    }
  });
}
