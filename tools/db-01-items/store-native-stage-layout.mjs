/** Original Display.json dimensions and LayoutInfo.GetAreas, Steam 1.26.2.
 * Source pins are checked by buildInstalledShelfCandidates; the native
 * instruction windows are verified by audit_native_store_purchase_1262.py.
 * StoreUtil resolves StoreLayoutArea_{0}x{1} and deduplicates equal areas
 * within a layout before invoking the shared catalogue enumeration.
 */
const DIMENSIONS=new Map([[2140000000,[6,6]],[2140000001,[8,8]],[2140000002,[16,16]],
  [2140000015,[10,10]],[2140000018,[6,6]]]);
export function stageAreaSlots(displayId,layouts,original){
  const size=DIMENSIONS.get(displayId);
  if(!size||!Array.isArray(layouts))return [];
  const [x,y]=size;
  // When the canonical projection carries the raw dimensions, require equality.
  if(original.SizeX!==undefined&&original.SizeX!==x||original.SizeY!==undefined&&original.SizeY!==y)return [];
  const hx=Math.trunc(x/2),hy=Math.trunc(y/2),ty=Math.trunc(y/3),by=Math.trunc(2*y/3);
  const rules={0:[[x,y]],1:[[hx,y],[hx,y]],2:[[x,ty],[x,by]],3:[[hx,hy],[hx,hy],[hx,hy],[hx,hy]],
    4:[],5:[[x,ty],[hx,by],[hx,by]],6:[[hx,ty],[hx,ty],[x,by]]};
  const output=[];
  for(const [stageLayoutIndex,l] of layouts.entries()){
    if(!Number.isSafeInteger(l.weight)||l.weight<=0||!Object.hasOwn(rules,l.typeCode))continue;
    const byArea=new Map();
    for(const [i,xy] of rules[l.typeCode].entries()){
      if(!xy.every(n=>Number.isSafeInteger(n)&&n>0))continue;
      const key='StoreLayoutArea_'+xy.join('x');
      const a=byArea.get(key)??{areaKey:key,stageLayoutType:l.typeCode,stageLayoutIndex,
        stageLayoutWeight:l.weight,stageSourceSize:[...size],stageAreaSize:xy,stageSlotIndices:[]};
      a.stageSlotIndices.push(i);byArea.set(key,a);
    }
    output.push(...byArea.values());
  }
  return output;
}
