/**
 * Native GridData floor-mask canvas painter shared by exact source
 * grids and read-only region thumbnails. Colors identify native mask
 * values; they do not encode furniture placement permission.
 */
export interface NativeFloorCanvasSource {
  readonly sizeX:number;
  readonly sizeY:number;
  readonly nativeFloorValues?:Uint32Array;
  readonly previewValues?:Uint32Array;
}

export function nativeSourceFloorTint(value:number):readonly [number,number,number] {
  if(value===0)return [47,45,55];
  if(value&512)return [48,106,152];
  if(value&256)return [56,127,121];
  if(value&2048)return [127,105,127];
  if(value&4)return [80,137,95];
  if(value&1024)return [119,107,132];
  const v=Math.imul(value,2654435761)>>>0;
  return [66+(v&63),67+((v>>>8)&63),71+((v>>>16)&63)];
}

export function paintNativeTerrainCanvas(
  canvas:HTMLCanvasElement,source:NativeFloorCanvasSource
){
  function paint(grid:NativeFloorCanvasSource){
    const {sizeX,sizeY}=grid;
    const values=grid.nativeFloorValues??grid.previewValues;
    if(!values||!Number.isSafeInteger(sizeX)||!Number.isSafeInteger(sizeY)||
      sizeX<1||sizeY<1||sizeX*sizeY>250_000||
      values.length!==sizeX*sizeY)
      throw new TypeError('DB04_INVALID_NATIVE_TERRAIN_CANVAS');
    canvas.width=sizeX;canvas.height=sizeY;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)return;
    const image=ctx.createImageData(sizeX,sizeY);
    const palette=new Map<number,readonly [number,number,number]>();
    for(let i=0;i<values.length;i++){
      const v=values[i];
      let color=palette.get(v);
      if(!color){color=nativeSourceFloorTint(v);palette.set(v,color);}
      const pixel=i*4;
      image.data[pixel]=color[0];
      image.data[pixel+1]=color[1];
      image.data[pixel+2]=color[2];
      image.data[pixel+3]=255;
    }
    ctx.putImageData(image,0,0);
  }
  paint(source);
  return {update:paint};
}
