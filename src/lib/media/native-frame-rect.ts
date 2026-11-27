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

export type NativeFramePlan={view:View;w:number;h:number};
/** Guard band uses the same backing-pixel density as the requested frame.
 * If the viewport already reaches the pixel budget, render it unchanged.
 */
export function nativeFramePlan(view:View,w:number,h:number):NativeFramePlan{
 const scale=Math.min(1.25,4096/w,4096/h,Math.sqrt(4_194_304/(w*h)));
 const pw=Math.max(w,Math.floor(w*scale)),ph=Math.max(h,Math.floor(h*scale));
 const width=view.width*pw/w,height=view.height*ph/h;
 return {view:{x:view.x-(width-view.width)/2,y:view.y-(height-view.height)/2,width,height},w:pw,h:ph};
}
export function nativeFrameCovers(frame:NativeFramePlan,view:View,w:number,h:number):boolean{
 const v=frame.view;
 // Never reuse a different zoom or backing density as a completed frame.
 const near=(a:number,b:number)=>Math.abs(a-b)<=Math.max(Math.abs(a),Math.abs(b))*1e-10;
 return near(frame.w/v.width,w/view.width)&&near(frame.h/v.height,h/view.height)&&
  v.x<=view.x&&v.y<=view.y&&v.x+v.width>=view.x+view.width&&v.y+v.height>=view.y+view.height;
}
