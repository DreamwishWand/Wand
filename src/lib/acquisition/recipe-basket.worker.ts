/**
 * DB-02 one-shot owner-local acquisition plan Worker.
 * Untrusted user ZIP is SHA-verified against independent v1.26.2 pins before
 * any source rows are passed to the Rust/WASM material planner.
 *
 * No save access, network upload, persistence, live stock or sale-price claims.
 */
import init,{plan_recipe_basket_wasm} from './wasm/pkg/wand_acquisition_core.js';
import wasmUrl from './wasm/pkg/wand_acquisition_core_bg.wasm?url';
import {loadPrivateSrc02BrowserBundle}
  from './private-browser-bundle.mjs';
import {buildNativeRecipeBasketRequest}
  from './recipe-basket-request.ts';
import type {Src02IndependentPin}
  from './private-browser-bundle.mjs';
import type {RecipeBasketGoal,RecipeBasketOptions}
  from './recipe-basket-request.ts';

type Incoming={
  command:'plan-private-recipe-basket';
  archive:Uint8Array;
  pin:Src02IndependentPin;
  goals:RecipeBasketGoal[];
  options:RecipeBasketOptions;
};
type Outgoing=
  | {kind:'error'}
  | {kind:'result';report:Record<string,unknown>};

const MAX_ARCHIVE=24*1024*1024;
const MAX_OUTPUT_BYTES=12*1024*1024;
const worker=self as unknown as {
  onmessage:((event:MessageEvent<Incoming>)=>void)|null;
  postMessage:(message:Outgoing)=>void;
  close:()=>void;
};
let used=false;
worker.onmessage=async ({data})=>{
  if(used)return;
  used=true;
  const source=data?.archive;
  let response:Outgoing={kind:'error'};
  try{
    if(!data||data.command!=='plan-private-recipe-basket'||
        Object.keys(data).sort().join(',')!=='archive,command,goals,options,pin'||
        !(source instanceof Uint8Array)||
        source.byteLength<22||source.byteLength>MAX_ARCHIVE)
      throw new TypeError('DB02_RUST_WORKER_REQUEST_DENIED');
    // Provenance/CRC/native relation admission is handled by existing
    // authenticated private-source loader; Rust does all material arithmetic.
    const db=await loadPrivateSrc02BrowserBundle(source,data.pin);
    const request=buildNativeRecipeBasketRequest(db,data.goals,data.options);
    await init(wasmUrl);
    const raw=plan_recipe_basket_wasm(JSON.stringify(request));
    if(typeof raw!=='string'||raw.length>MAX_OUTPUT_BYTES)
      throw new TypeError('DB02_RUST_WORKER_OUTPUT_LIMIT');
    const result:unknown=JSON.parse(raw);
    if(!result||typeof result!=='object'||Array.isArray(result))
      throw new TypeError('DB02_RUST_WORKER_RESULT_SHAPE');
    const report=result as Record<string,unknown>;
    if(report.schema!=='wand.db02.material-basket@1'||
        report.recipeEligibilityEvaluated!==false||
        report.acquisitionAvailabilityVerified!==false||
        !Array.isArray(report.requiredMaterials)||
        !Array.isArray(report.goals)||
        !Array.isArray(report.steps))
      throw new TypeError('DB02_RUST_WORKER_NEGATIVE_SAFETY_FLAGS');
    // Output is static source-derived only, with explicit non-verification.
    response={kind:'result',report};
  }catch{
    // Never return untrusted ZIP errors, item data or private identifiers.
  }finally{
    if(source instanceof Uint8Array&&source.byteLength)source.fill(0);
  }
  worker.postMessage(response);
  worker.close();
};
