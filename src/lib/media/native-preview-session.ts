import type {LocalNativePreviewPack} from './native-local-preview.ts';

type Listener=(pack:LocalNativePreviewPack|null)=>void;
/** In-memory test session only. Share the exact provider and verified cache
 * between mounted or remounted workspaces without persisting the manifest. */
export function createNativePreviewSession(){
 let pack:LocalNativePreviewPack|null=null;
 const listeners=new Set<Listener>();
 function publish(next:LocalNativePreviewPack|null){
  if(pack===next)return;
  pack=next;
  for(const listener of [...listeners])if(listeners.has(listener))listener(pack);
 }
 return {
  get:()=>pack,
  subscribe(listener:Listener){listeners.add(listener);listener(pack);return ()=>{listeners.delete(listener);};},
  set:(next:LocalNativePreviewPack)=>publish(next),
  clear:()=>publish(null)
 };
}
export const nativePreviewSession=createNativePreviewSession();
