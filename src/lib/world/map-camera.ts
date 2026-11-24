/** Camera math and browser pointer gesture only. Grid coordinates remain
 * in their original map space. No game/save mutations. */
export interface MapCamera{zoom:number;x:number;y:number}
export interface MapExtent{x:number;y:number;w:number;h:number}
export const defaultMapCamera=():MapCamera=>({zoom:1,x:.5,y:.5});
export function maxMapZoom(longestAxisInCells:number):number{
  return Math.min(1_048_576,Math.max(64,Math.ceil(longestAxisInCells/8)));
}
const clamp=(v:number,zoom:number)=>Math.max(.5/zoom,Math.min(1-.5/zoom,v));
export function zoomMapCamera(camera:MapCamera,zoom:number,max:number,anchorX=camera.x,anchorY=camera.y):MapCamera{
  if(!Number.isFinite(zoom)||!Number.isFinite(max)||max<1)return camera;
  const next=Math.max(1,Math.min(max,zoom));
  const factor=camera.zoom/next;
  return {zoom:next,x:clamp(anchorX+(camera.x-anchorX)*factor,next),
    y:clamp(anchorY+(camera.y-anchorY)*factor,next)};
}
export function panMapCamera(camera:MapCamera,dx:number,dy:number):MapCamera{
  return {...camera,x:clamp(camera.x+dx,camera.zoom),y:clamp(camera.y+dy,camera.zoom)};
}
export function mapCameraViewBox(camera:MapCamera,extent:MapExtent):string{
  return [extent.x+(camera.x-.5/camera.zoom)*extent.w,extent.y+(camera.y-.5/camera.zoom)*extent.h,
    extent.w/camera.zoom,extent.h/camera.zoom].join(' ');
}
function normalizedScreenPoint(svg:SVGSVGElement,extent:MapExtent,x:number,y:number){
  const ctm=svg?.getScreenCTM();if(!ctm||!extent.w||!extent.h)return null;
  try{
    const p=new DOMPoint(x,y).matrixTransform(ctm.inverse());
    const nx=(p.x-extent.x)/extent.w,ny=(p.y-extent.y)/extent.h;
    return Number.isFinite(nx)&&Number.isFinite(ny)?{x:nx,y:ny}:null;
  }catch{return null;}
}
export function wheelMapCamera(event:WheelEvent,svg:SVGSVGElement,extent:MapExtent,camera:MapCamera,max:number):MapCamera{
  if(!event.deltaY)return camera;
  const point=normalizedScreenPoint(svg,extent,event.clientX,event.clientY);
  if(!point)return camera;
  event.preventDefault();
  return zoomMapCamera(camera,camera.zoom*(event.deltaY<0?1.5:1/1.5),max,point.x,point.y);
}
/** Drag threshold distinguishes a click to select/place from navigation.
 * Middle button or Shift+drag can pan while a placement preview is active. */
export function createMapPanGesture(){
  let active:{id:number;x:number;y:number;startX:number;startY:number;dragged:boolean}|null=null;
  let suppressClick=false;
  return {
    begin(event:PointerEvent,canPan:boolean){
      suppressClick=false;
      if(!canPan||active||!(event.button===0||event.button===1))return;
      active={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,dragged:false};
      if(event.button===1)event.preventDefault();
    },
    move(event:PointerEvent,svg:SVGSVGElement,extent:MapExtent,camera:MapCamera):MapCamera|null{
      if(!active||active.id!==event.pointerId)return null;
      if(!active.dragged&&Math.hypot(event.clientX-active.startX,event.clientY-active.startY)<5)return null;
      if(!active.dragged){
        active.dragged=true;suppressClick=true;
        try{(event.currentTarget as Element).setPointerCapture(event.pointerId);}catch{/* pointer ended */}
      }
      const prev=normalizedScreenPoint(svg,extent,active.x,active.y);
      const next=normalizedScreenPoint(svg,extent,event.clientX,event.clientY);
      active.x=event.clientX;active.y=event.clientY;event.preventDefault();
      return prev&&next?panMapCamera(camera,prev.x-next.x,prev.y-next.y):camera;
    },
    end(event:PointerEvent){if(active?.id===event.pointerId)active=null;},
    leave(){if(active&&!active.dragged)active=null;},
    consumeClick(){const result=suppressClick;suppressClick=false;return result;}
  };
}
