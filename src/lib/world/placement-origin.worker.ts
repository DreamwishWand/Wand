/** Local-only full-footprint floor candidate overlay. Heavy raster work is WASM. */
import init,{local_anchor_floor_bitmap} from './wasm/pkg/wand_world_core.js';
import wasmUrl from './wasm/pkg/wand_world_core_bg.wasm?url';
import type {TerrainRaster} from './terrain-binding.ts';
import type {SourceObjectShape} from './source-object-map.ts';
type Request={raster:TerrainRaster;factor:1|2;shape:SourceObjectShape};
const scope=self as unknown as {onmessage:((e:MessageEvent<Request>)=>void)|null;postMessage:(data:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
  try{
    const {raster,factor,shape}=data;
    if(!Number.isSafeInteger(shape.width)||!Number.isSafeInteger(shape.height)||
      shape.width<1||shape.height<1||shape.width>512||shape.height>512||
      shape.acceptedFloorTypesFlag===undefined||
      !Number.isInteger(shape.acceptedFloorTypesFlag)||shape.acceptedFloorTypesFlag<0||shape.acceptedFloorTypesFlag>0xffffffff)
      throw Error('shape');
    const mask=new Uint8Array(shape.width*shape.height);
    for(const run of shape.runs){
      if(!Number.isInteger(run.x)||!Number.isInteger(run.y)||!Number.isInteger(run.width)||
        run.x<0||run.y<0||run.y>=shape.height||run.width<1||run.x+run.width>shape.width)
        throw Error('shape run');
      mask.fill(1,run.y*shape.width+run.x,run.y*shape.width+run.x+run.width);
    }
    await init(wasmUrl);
    const bitmap=local_anchor_floor_bitmap(raster.nativeFloorValues,raster.sizeX,raster.sizeY,factor,
      shape.acceptedFloorTypesFlag,shape.width,shape.height,mask);
    const width=raster.sizeX*factor,height=raster.sizeY*factor;
    if(bitmap.length!==width*height)throw Error('bitmap');
    scope.postMessage({kind:'origins',bitmap,width,height},[bitmap.buffer as ArrayBuffer]);
  }catch{scope.postMessage({kind:'error'});}
};
