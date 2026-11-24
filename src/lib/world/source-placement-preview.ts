/**
 * Small per-pointer UI projection of the worker's mapped source GridArea.
 * It cannot infer actual game legality from source floor overlap. A neutral
 * result means unknown, not legal. Optional certified per-cell rules are
 * separate from technical write guards; ordinary conflicts do not block writes.
 */
export type SourceCellEvidence='floor-mismatch'|'outside-source-grid'|'unknown';
export type GameCellStatus='normal'|'replacement'|'conflict'|'unknown';
export type PreviewCell={x:number;y:number;evidence:SourceCellEvidence;gameStatus:GameCellStatus};
export type PreviewShape={width:number;height:number;cells:Uint8Array;acceptedFloorTypesFlag:number};
export type PreviewRaster={sizeX:number;sizeY:number;nativeFloorValues:Uint32Array};
export type GridPoint={x:number;y:number};
export function previewSourceCells(shape:PreviewShape,raster:PreviewRaster,origin:GridPoint):PreviewCell[]{
  if(!Number.isSafeInteger(shape.width)||!Number.isSafeInteger(shape.height)||
    shape.width<1||shape.height<1||shape.width*shape.height>65536||
    shape.cells.length!==shape.width*shape.height||
    !Number.isSafeInteger(raster.sizeX)||!Number.isSafeInteger(raster.sizeY)||
    raster.sizeX<1||raster.sizeY<1||raster.nativeFloorValues.length!==raster.sizeX*raster.sizeY||
    !Number.isSafeInteger(shape.acceptedFloorTypesFlag)||shape.acceptedFloorTypesFlag<0||
    shape.acceptedFloorTypesFlag>0xffffffff||
    !Number.isSafeInteger(origin.x)||!Number.isSafeInteger(origin.y)||
    Math.abs(origin.x)>1e6||Math.abs(origin.y)>1e6)
    throw new TypeError('DB04_SOURCE_PREVIEW_INVALID');
  const out:PreviewCell[]=[];
  for(let dy=0;dy<shape.height;dy++)for(let dx=0;dx<shape.width;dx++){
    if(shape.cells[dy*shape.width+dx]!==1)continue;
    const x=origin.x+dx,y=origin.y+dy;
    const inside=x>=0&&y>=0&&x<raster.sizeX&&y<raster.sizeY;
    const evidence:SourceCellEvidence=!inside?'outside-source-grid':
      (raster.nativeFloorValues[y*raster.sizeX+x]&shape.acceptedFloorTypesFlag)===0?
        'floor-mismatch':'unknown';
    out.push({x,y,evidence,gameStatus:'unknown'});
  }
  return out;
}
/** Presentation only: source warnings are red, unknown is grey; certified
 * replacement/normal remain available for the future native rule provider. */
export function previewCellColor(cell:PreviewCell):string{
  if(cell.gameStatus==='conflict'||cell.evidence!=='unknown')return '#ef5350';
  if(cell.gameStatus==='replacement')return '#efc23e';
  if(cell.gameStatus==='normal')return '#46c781';
  return '#a7b1bf';
}
export function gridLinePath(sizeX:number,sizeY:number):string{
  if(!Number.isSafeInteger(sizeX)||!Number.isSafeInteger(sizeY)||
    sizeX<1||sizeY<1||sizeX+sizeY>65537)throw new TypeError('DB04_GRID_LINE_SIZE_INVALID');
  const parts:string[]=[];
  for(let x=0;x<=sizeX;x++)parts.push('M'+x+' 0V'+sizeY);
  for(let y=0;y<=sizeY;y++)parts.push('M0 '+y+'H'+sizeX);
  return parts.join('');
}
