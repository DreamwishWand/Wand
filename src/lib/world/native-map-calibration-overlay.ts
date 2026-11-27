import {nativeSourceFloorTint} from './native-terrain-canvas.ts';
import type {MainlandGrid} from './mainland-world-coordinates.ts';
import type {TerrainRaster} from './terrain-binding.ts';
/** Source y-major cells increase north (+Z). SVG uses south-positive Y. */
export function nativeCalibrationGridTransform(g:MainlandGrid):string{
 return 'translate('+g.bounds.x+' '+(-2*g.origin.position[2])+') scale(1 -1)';
}
export function nativeCalibrationPixels(r:TerrainRaster):Uint8ClampedArray{
 if(!Number.isSafeInteger(r.sizeX)||!Number.isSafeInteger(r.sizeY)||r.sizeX<1||r.sizeY<1||r.sizeX*r.sizeY>250000||r.nativeFloorValues.length!==r.sizeX*r.sizeY)throw Error('Invalid source terrain raster');
 const pixels=new Uint8ClampedArray(r.nativeFloorValues.length*4),colors=new Map<number,readonly number[]>();
 for(let i=0;i<r.nativeFloorValues.length;i++){
  const value=r.nativeFloorValues[i];
  // Automatic-spawn-only flag does not establish a visible floor.
  if((value&~262144)===0)continue;
  let color=colors.get(value);if(!color){color=nativeSourceFloorTint(value);colors.set(value,color);}
  pixels.set([color[0],color[1],color[2],255],i*4);
 }
 return pixels;
}
