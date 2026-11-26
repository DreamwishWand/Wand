import type {IndoorPosition} from './indoor-room-view.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export interface RoomCamera{x:number;y:number;w:number;h:number}
export function roomCameraBounds(viewBox:string):RoomCamera{
 const [x,y,w,h]=viewBox.trim().split(/\s+/).map(Number);
 return [x,y,w,h].every(Number.isFinite)&&w>0&&h>0?{x,y,w,h}:{x:0,y:0,w:1,h:1};
}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
function constrain(v:RoomCamera,b:RoomCamera):RoomCamera{
 return {x:clamp(v.x,b.x,b.x+b.w-v.w),y:clamp(v.y,b.y,b.y+b.h-v.h),w:v.w,h:v.h};
}
export function roomCameraZoom(v:RoomCamera,b:RoomCamera,scale:number,p={x:v.x+v.w/2,y:v.y+v.h/2}):RoomCamera{
 if(!Number.isFinite(scale)||scale<=0)return v;
 const ratio=clamp(v.w/b.w/scale,1/8,1),w=b.w*ratio,h=b.h*ratio;
 return constrain({x:p.x-(p.x-v.x)*w/v.w,y:p.y-(p.y-v.y)*h/v.h,w,h},b);
}
export function roomCameraPan(v:RoomCamera,b:RoomCamera,dx:number,dy:number):RoomCamera{
 return Number.isFinite(dx)&&Number.isFinite(dy)?constrain({...v,x:v.x+dx,y:v.y+dy},b):v;
}
/** Only request artwork for known shapes intersecting the visible native
 * map. Keep unresolved anchors as markers, not invented footprints. */
export function roomCameraArt(positions:readonly IndoorPosition[],shapes:Readonly<Record<string,SourceObjectShape>>,v:RoomCamera){
 return positions.flatMap((p,index)=>{const s=p.orientationCode===null?null:shapes[p.itemId+':'+p.orientationCode];return s&&p.x<v.x+v.w&&p.y<v.y+v.h&&p.x+s.width>v.x&&p.y+s.height>v.y?[{index,itemId:p.itemId,x:p.x,y:p.y,width:s.width,height:s.height}]:[];}).slice(0,512);
}
export const roomCameraWords={
 ja:['拡大','縮小','全体表示','マップを移動'],en:['Zoom in','Zoom out','Fit room','Pan map'],fr:['Zoom avant','Zoom arrière','Ajuster','Déplacer la carte'],it:['Ingrandisci','Riduci','Adatta','Sposta mappa'],de:['Vergrößern','Verkleinern','Einpassen','Karte verschieben'],'es-ES':['Acercar','Alejar','Ajustar','Mover mapa'],'zh-CN':['放大','缩小','显示全图','平移地图'],'pt-BR':['Ampliar','Reduzir','Ajustar','Mover mapa']
} as const;

import {indoorMove,indoorGroupMove,type IndoorSurface} from './indoor-room-view.ts';
export function roomDragDraft(face:IndoorSurface|null,shapes:Readonly<Record<string,SourceObjectShape>>,allowed:ReadonlySet<number>,indices:readonly number[],index:number,x:number,y:number){
 if(!indices.includes(index)||new Set(indices).size!==indices.length)return null;
 return indices.length>1?indoorGroupMove(face,shapes,allowed,indices,index,x,y):indoorMove(face,shapes,allowed,index,x,y);
}
export function roomKeyDelta(key:string,step=1){
 if(!Number.isSafeInteger(step)||step<1)return null;
 switch(key){case 'ArrowLeft':return {x:-step,y:0};case 'ArrowRight':return {x:step,y:0};case 'ArrowUp':return {x:0,y:-step};case 'ArrowDown':return {x:0,y:step};default:return null;}
}
