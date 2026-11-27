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

/** A missing local record is zero only without a selected Save. Unverified
 * native Save flags cannot establish either ownership or absence. */
export function knownMemoryBits(entry:{memoryPieces?:number;status?:string}|undefined,count:number,saveSelected:boolean):number|null{
  const full=completeMemoryBits(count),bits=entry?.memoryPieces;
  if(typeof bits==='number'&&Number.isInteger(bits)&&bits>=0&&bits<=full)return bits;
  if(entry?.status==='owned')return full;
  if(entry?.status==='missing')return 0;
  return saveSelected?null:0;
}
/** Convert an object-fit:contain hit to a native mask pixel, excluding margins. */
export function memoryMaskPixel(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number},artWidth:number,artHeight:number,maskWidth:number,maskHeight:number):{x:number;y:number}|null{
  if(![clientX,clientY,rect.left,rect.top,rect.width,rect.height,artWidth,artHeight,maskWidth,maskHeight].every(Number.isFinite)||
     Math.min(rect.width,rect.height,artWidth,artHeight,maskWidth,maskHeight)<=0)return null;
  const scale=Math.min(rect.width/artWidth,rect.height/artHeight),w=artWidth*scale,h=artHeight*scale;
  const u=(clientX-rect.left-(rect.width-w)/2)/w,v=(clientY-rect.top-(rect.height-h)/2)/h;
  return u>=0&&u<1&&v>=0&&v<1?{x:Math.floor(u*maskWidth),y:Math.floor(v*maskHeight)}:null;
}
