/** Shared contour composition and development-only progress composition. Share the GPU context, not generated images.
 * Each caller supplies a destination canvas; no composite is stored or uploaded.
 * The queue never runs two texture uploads/draws concurrently on the same GPU.
 */
import type {MemorySources} from './memory-media.ts';
import {openMaskPreview} from './memory-mask-preview.ts';
import {maskPreviewEligible} from './memory-mask-preview-evidence.ts';
let surface:HTMLCanvasElement|null=null;
let tail:Promise<void>=Promise.resolve();

export function enqueueMemoryCandidate(
  destination:HTMLCanvasElement,source:MemorySources,flags:number|null,large:boolean,signal:AbortSignal
):Promise<void>{
  const job=tail.then(async()=>{
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    if(flags!==null&&!maskPreviewEligible(source.mask.sha256,source.numberOfShards))
      throw new Error('Unverified mask layout');
    if(flags!==null&&(!Number.isInteger(flags)||flags<0||flags>=2**source.numberOfShards))
      throw new RangeError('Invalid candidate flags');
    // Same material and candidate polarity as the diagnostic comparison.
    // Use native originals only in the opened inspector.
    const input=large?{...source,thumbnail:source.original}:source;
    const gpu=surface??(surface=document.createElement('canvas'));
    const renderer=await openMaskPreview(gpu,input,signal,flags===null);
    try{
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      renderer.draw(flags??(2**source.numberOfShards-1),true,false,true,'mask',1,false);
      const target=destination.getContext('2d');
      if(!target)throw new Error('Canvas2D unavailable');
      destination.width=gpu.width;destination.height=gpu.height;
      target.drawImage(gpu,0,0);
    }finally{renderer.dispose();}
  });
  tail=job.catch(()=>{});
  return job;
}
