import type {View} from './native-map-renderer.ts';
/** CSS pixel rectangle of the last completed image, in the current fitted viewport.
 * Canvas backing dimensions must not participate in layout. During redraw this
 * retains the old frame at its actual coordinates, rather than stretching it.
 */
export function nativeFrameRect(view:View,drawn:View,hostWidth:number,hostHeight:number){
 const scale=Math.min(hostWidth/view.width,hostHeight/view.height);
 return {left:(hostWidth-view.width*scale)/2+(drawn.x-view.x)*scale,
  top:(hostHeight-view.height*scale)/2+(drawn.y-view.y)*scale,
  width:drawn.width*scale,height:drawn.height*scale};
}
