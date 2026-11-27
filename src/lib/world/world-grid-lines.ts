import type {MapExtent} from './map-camera.ts';
export interface GridLinePaths {major:string;minor:string}
const empty=():GridLinePaths=>({major:'',minor:''});
/** Presentation only: draw the source cell lattice, clipped to the active
 * viewport and native grid rectangle. Minor lines represent native
 * half-cell anchors, not extra terrain or placement permission. */
export function worldGridLines(bounds:MapExtent,view:MapExtent,pixels:number,majorStep=1,minorStep=majorStep):GridLinePaths{
 if(![bounds.x,bounds.y,bounds.w,bounds.h,view.x,view.y,view.w,view.h,pixels,majorStep,minorStep].every(Number.isFinite)||bounds.w<=0||bounds.h<=0||view.w<=0||view.h<=0||majorStep<=0||minorStep<=0||majorStep<minorStep||pixels*majorStep<7)return empty();
 const left=Math.max(bounds.x,view.x),right=Math.min(bounds.x+bounds.w,view.x+view.w),top=Math.max(bounds.y,view.y),bottom=Math.min(bounds.y+bounds.h,view.y+view.h);
 if(right<=left||bottom<=top)return empty();
 const step=minorStep<majorStep&&pixels*minorStep>=12?minorStep:majorStep;
 const nx=Math.ceil((right-left)/step)+2,ny=Math.ceil((bottom-top)/step)+2;
 if(nx+ny>2048)return empty();
 const major:string[]=[],minor:string[]=[];
 function axis(lo:number,hi:number,origin:number,vertical:boolean){
  const start=Math.ceil((lo-origin)/step),end=Math.floor((hi-origin)/step);
  for(let i=start;i<=end;i++){
   const coord=origin+i*step,ratio=i*step/majorStep;
   const dst=Math.abs(ratio-Math.round(ratio))<1e-8?major:minor;
   dst.push(vertical?'M'+coord+' '+top+'V'+bottom:'M'+left+' '+coord+'H'+right);
  }
 }
 axis(left,right,bounds.x,true);axis(top,bottom,bounds.y,false);
 return {major:major.join(''),minor:minor.join('')};
}
export const mapGridWords={
 ja:'マス目',en:'Grid lines',fr:'Quadrillage',it:'Griglia',de:'Raster','es-ES':'Cuadrícula','zh-CN':'网格','pt-BR':'Grade'
} as const;
