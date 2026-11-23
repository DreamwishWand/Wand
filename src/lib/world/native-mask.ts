/**
 * Source-pinned native GridLayers and GridFloorType flags.
 * Unsigned 32-bit bit arithmetic keeps flags above 2^31 distinguishable.
 * Display names do NOT encode passability, collision or placement permission.
 */
export const GRID_LAYER_FLAGS:Readonly<Record<number,string>>=Object.freeze({
  1:'Ground',2:'Floor',4:'Low',8:'Medium',
  16:'High',32:'Clear',64:'Blocking'
});
export const GRID_FLOOR_FLAGS:Readonly<Record<number,string>>=Object.freeze({
  1:'Beach',2:'Wetland',4:'Meadow',8:'Urban',
  16:'Savannah',32:'Forest',64:'DarkMountains',128:'Cliff',
  256:'Shore',512:'Water',1024:'Floor',2048:'Wall',
  4096:'Surface',8192:'AtlanteanOutpost',16384:'Desert',
  32768:'Jungle',65536:'Mythology',131072:'FairyTales',
  262144:'BlockAutomaticSpawning',524288:'Library',
  1048576:'Puzzle',2097152:'PuzzleSurface',4194304:'Rockies',
  8388608:'Fashion',16777216:'Wishland',33554432:'OutsideFloor',
  67108864:'Honeywood',134217728:'Pirates',
  268435456:'Candy',536870912:'Kingdom'
});
export interface NativeMaskDescription {
  readonly symbols:readonly string[];
  readonly unrecognizedBits:number;
}
function symbolicNativeMask(value:number,dictionary:Readonly<Record<number,string>>)
  :NativeMaskDescription {
  if(!Number.isSafeInteger(value)||value<0||value>0xffffffff)
    throw new TypeError('Invalid native uint32 mask');
  let remainder=value;
  const names:string[]=[];
  for(const [bit,name] of Object.entries(dictionary)){
    const flag=Number(bit);
    if(Math.floor(remainder/flag)%2===1){
      names.push(name);remainder-=flag;
    }
  }
  return {symbols:names,unrecognizedBits:remainder};
}
export const describeNativeLayerMask=(mask:number):NativeMaskDescription=>
  symbolicNativeMask(mask,GRID_LAYER_FLAGS);
export const describeNativeFloorMask=(mask:number):NativeMaskDescription=>
  symbolicNativeMask(mask,GRID_FLOOR_FLAGS);
