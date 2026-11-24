/** Exact grid geometry, independent of mounted item cards. */
export const GRID_GAP=6;
export const WINDOW_ROWS=2;
export interface GridChunk {start:number;end:number;height:number}
export function catalogGridLayout(width:number,count:number,minTile=94){
  const columns=Math.max(1,Math.floor((width+GRID_GAP)/(minTile+GRID_GAP)));
  const tileSize=Math.max(0,(width-GRID_GAP*(columns-1))/columns);
  const chunks:GridChunk[]=[];
  if(width<=0||count<=0)return {columns,tileSize,chunks,height:0};
  const step=columns*WINDOW_ROWS;
  for(let start=0;start<count;start+=step){
    const end=Math.min(count,start+step);
    const rows=Math.ceil((end-start)/columns);
    chunks.push({start,end,height:rows*tileSize+(rows-1)*GRID_GAP});
  }
  const rows=Math.ceil(count/columns);
  return {columns,tileSize,chunks,height:rows*tileSize+(rows-1)*GRID_GAP};
}
