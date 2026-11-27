export interface RestoreStockDelta {
 returned:ReadonlyMap<number,number>;
 required:ReadonlyMap<number,number>;
}
export interface RestoreShortage {itemId:number;quantity:number}
export interface RestoreStockRow {itemId:number;returned:number;required:number;missing:number;finishes:number}
export function addRestoreQuantity(target:Map<number,number>,id:number,n:number){
 target.set(id,(target.get(id)??0)+n);
}
export function restoreStockRows(deltas:readonly RestoreStockDelta[],missing:readonly RestoreShortage[]=[],finishes:ReadonlyMap<number,number>=new Map()):RestoreStockRow[]{
 const rows=new Map<number,RestoreStockRow>();
 function row(id:number){let r=rows.get(id);if(!r){r={itemId:id,returned:0,required:0,missing:0,finishes:0};rows.set(id,r);}return r;}
 for(const d of deltas){for(const [id,n] of d.returned)row(id).returned+=n;for(const [id,n] of d.required)row(id).required+=n;}
 // Shortages are computed after pooling returns across the whole restore,
 // never by summing per-grid deficits.
 for(const p of missing)row(p.itemId).missing+=p.quantity;
 for(const [id,n] of finishes)row(id).finishes+=n;
 return [...rows.values()].filter(r=>r.returned||r.required||r.missing||r.finishes).sort((a,b)=>Number(b.missing>0)-Number(a.missing>0)||a.itemId-b.itemId);
}
