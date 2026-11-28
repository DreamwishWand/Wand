import type {MainlandDesignFrame} from './mainland-design-frame.ts';
import type {MapExtent} from './map-camera.ts';
/** Design SVG is display-local north-up; the source map uses absolute
 * half-world ticks, X east and Y=-Z. No fitting or save transform. */
export function nativeDesignViewport(frame:Pick<MainlandDesignFrame,'minX'|'minZ'>&{raster:Pick<MainlandDesignFrame['raster'],'sizeX'|'sizeY'>},v:MapExtent):MapExtent{
 const {minX,minZ,raster}=frame;
 if(![minX,minZ,raster.sizeX,raster.sizeY,v.x,v.y,v.w,v.h].every(Number.isFinite)||raster.sizeX<1||raster.sizeY<1||v.w<=0||v.h<=0)throw Error('Invalid design map extent');
 return {x:minX+v.x,y:-minZ-raster.sizeY+v.y,w:v.w,h:v.h};
}
