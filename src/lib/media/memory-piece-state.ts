/** Local Collection record only, never a Save bit interpretation. */
export function completeMemoryBits(count:number):number{
  if(!Number.isInteger(count)||count<1||count>10)throw new RangeError('Memory piece count');
  return (1<<count)-1;
}
export function recordedMemoryBits(entry:{memoryPieces?:number;status?:string}|undefined,count:number):number{
  const full=completeMemoryBits(count),bits=entry?.memoryPieces;
  return typeof bits==='number'&&Number.isInteger(bits)&&bits>=0&&bits<=full?bits:entry?.status==='owned'?full:0;
}
export function memoryPieceCount(bits:number):number{
  let n=0;for(let v=bits&1023;v;v&=v-1)n++;return n;
}
/** Reject interpolated/multi-bit pixels; do not guess a piece at its edge. */
export function exactMemoryHit(rgba:ArrayLike<number>,count:number):number|null{
  const bit=rgba[0]+256*rgba[1];
  return rgba[2]===0&&rgba[3]===255&&bit>0&&(bit&(bit-1))===0&&bit<=completeMemoryBits(count)?bit:null;
}
