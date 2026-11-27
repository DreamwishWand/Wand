/** Background blocker state only. This does not select overlays or evaluate the game's lock predicates.
 * The caller supplies explicit area state. Never interpret missing state as locked or unlocked.
 */
export function selectNativeBackgroundLayers<T extends {readonly blockerAreaTypes:readonly number[]}>(layers:readonly T[],locked:ReadonlyMap<number,boolean>):T[]{
 return layers.filter(layer=>{
  if(!Array.isArray(layer.blockerAreaTypes)||layer.blockerAreaTypes.some(id=>!Number.isSafeInteger(id)||id<0))throw new Error('Invalid native blocker metadata');
  const states=layer.blockerAreaTypes.map(id=>{
   const state=locked.get(id);
   if(typeof state!=='boolean')throw new Error('Unknown area lock state: '+id);
   return state;
  });
  return states.every(Boolean);
 });
}
