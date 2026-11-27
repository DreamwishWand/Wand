import type {LocalNativePreviewPack} from './native-local-preview.ts';

/** In-memory test session only: no uploads, persistent storage or default public manifest. */
export function createNativePreviewSession(){
 let pack:LocalNativePreviewPack|null=null;
 return {
  get:()=>pack,
  set:(next:LocalNativePreviewPack)=>{pack=next;},
  clear:()=>{pack=null;}
 };
}
export const nativePreviewSession=createNativePreviewSession();
