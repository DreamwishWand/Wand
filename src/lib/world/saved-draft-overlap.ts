/** Per-cell source-shape intersections on the same saved Grid only.
 * No inferred game collision, support relationship, or write permission.
 * Ordinary road coverage is contextual, not an automatic collision warning.
 * Surface-capable intersections remain uncertain. Landscape replacement is
 * a possible game behavior, never an instruction to delete an object.
 */
import type {SavedShapeMap,SavedShapeObject} from './saved-shape-map.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export type OverlapEvidence='shape-overlap'|'landscape-overlap'|'support-unknown'|'ground-overlap';
export interface OverlapRun {readonly x:number;readonly y:number;readonly width:number;readonly evidence:OverlapEvidence}
export interface SavedDraftOverlap {
  readonly runs:readonly OverlapRun[];
  readonly counts:Readonly<Record<OverlapEvidence,number>>;
  readonly relatedOrdinals:readonly number[];
  readonly unresolvedObjects:number;
  readonly truncated:boolean;
}
const kinds:readonly OverlapEvidence[]=['ground-overlap','support-unknown','landscape-overlap','shape-overlap'];
const evidence=(a:SavedShapeObject,b:SavedShapeObject):OverlapEvidence=>
  b.layer==='ground'?'ground-overlap':
  b.layer==='landscape'?'landscape-overlap':
  a.surfaceCapable||b.surfaceCapable?'support-unknown':'shape-overlap';
export function savedDraftOverlap(map:SavedShapeMap,selected:SavedShapeObject,shape:SourceObjectShape,x:number,y:number):SavedDraftOverlap{
  const counts:Record<OverlapEvidence,number>={'shape-overlap':0,'landscape-overlap':0,'support-unknown':0,'ground-overlap':0};
  const empty={runs:[],counts,relatedOrdinals:[],unresolvedObjects:0,truncated:false};
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))return empty;
  // Small UI projection; bound both working memory and row comparisons.
  // Never expand huge world rasters into per-cell data on the UI thread.
  if(shape.width*shape.height>65536)return {...empty,truncated:true};
  const mask=new Uint8Array(shape.width*shape.height),relatedOrdinals:number[]=[];
  let unresolvedObjects=0,work=0,truncated=false;
  for(const other of map.objects){
    if(other.localGridOrdinal!==selected.localGridOrdinal||other.localOrdinal===selected.localOrdinal)continue;
    const b=other.shapeKey?map.shapes[other.shapeKey]:null;
    if(!b){unresolvedObjects++;continue;}
    if(x+shape.width<=other.x||other.x+b.width<=x||y+shape.height<=other.y||other.y+b.height<=y)continue;
    const status=kinds.indexOf(evidence(selected,other))+1;
    let i=0,j=0,hit=false;
    while(i<shape.runs.length&&j<b.runs.length){
      if(++work>250000){truncated=true;break;}
      const aRun=shape.runs[i],bRun=b.runs[j];
      const ay=y+aRun.y,by=other.y+bRun.y;
      if(ay<by){i++;continue;}if(ay>by){j++;continue;}
      const ax=x+aRun.x,bx=other.x+bRun.x,ae=ax+aRun.width,be=bx+bRun.width;
      for(let px=Math.max(ax,bx);px<Math.min(ae,be);px++){
        if(++work>250000){truncated=true;break;}
        const index=aRun.y*shape.width+px-x;
        mask[index]=Math.max(mask[index],status);hit=true;
      }
      if(truncated)break;
      if(ae<=be)i++;if(be<=ae)j++;
    }
    if(hit)relatedOrdinals.push(other.localOrdinal);
    if(truncated)break;
  }
  const runs:OverlapRun[]=[];
  for(let dy=0;dy<shape.height;dy++)for(let dx=0;dx<shape.width;){
    const code=mask[dy*shape.width+dx];
    if(!code){dx++;continue;}
    const start=dx;
    while(dx<shape.width&&mask[dy*shape.width+dx]===code)dx++;
    const evidence=kinds[code-1],width=dx-start;
    counts[evidence]+=width;runs.push({x:x+start,y:y+dy,width,evidence});
  }
  return {runs,counts,relatedOrdinals,unresolvedObjects,truncated};
}
export const OVERLAP_COLORS:Readonly<Record<OverlapEvidence,string>>={
  'shape-overlap':'#ef5350','landscape-overlap':'#efc23e','support-unknown':'#b99ad8','ground-overlap':'#a7b1bf'};
