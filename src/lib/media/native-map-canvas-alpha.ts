export type GroupRef={cab:string;pathID:string};
export type AlphaNode={rectTransform:string;parent:string};
export type NativeCanvasGroup={pathID:string;node:string;alpha:number;enabled:boolean;ignoreParentGroups:boolean};
export type AlphaArea={areaType:number;enabled:boolean;mode:'overlay'|'canvas-group';canvasGroup:GroupRef|null;areaNameCanvasGroup:GroupRef|null};
export type AlphaSettings={backgroundLocked:number;backgroundUnlocked:number;nameLocked:number;nameUnlocked:number};
function check(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
const validAlpha=(n:number)=>Number.isFinite(n)&&n>=0&&n<=1;
/** Static source-derived candidate, after the explicitly supplied area state is applied. */
export function computeNativeCanvasAlpha(nodes:readonly AlphaNode[],groups:readonly NativeCanvasGroup[],areas:readonly AlphaArea[],cab:string,settings:AlphaSettings,locked:ReadonlyMap<number,boolean>):ReadonlyMap<string,number>{
 check(Object.values(settings).every(validAlpha),'Invalid alpha settings');
 const byNode=new Map(nodes.map(n=>[n.rectTransform,n]));check(byNode.size===nodes.length,'Duplicate node');
 const byGroup=new Map(groups.map(g=>[g.pathID,g]));check(byGroup.size===groups.length,'Duplicate CanvasGroup');
 const overrides=new Map<string,number>();
 for(const a of areas){
  if(!a.enabled)continue;
  const assign=(ref:GroupRef|null,lockedAlpha:number,unlockedAlpha:number)=>{
   if(ref===null)return;
   check(ref.cab.toLowerCase()===cab.toLowerCase()&&byGroup.has(ref.pathID),'Unknown CanvasGroup reference');
   const state=locked.get(a.areaType);check(typeof state==='boolean','Unknown area lock state: '+a.areaType);
   const alpha=state?lockedAlpha:unlockedAlpha;
   check(!overrides.has(ref.pathID)||overrides.get(ref.pathID)===alpha,'Conflicting CanvasGroup writes');overrides.set(ref.pathID,alpha);
  };
  check(a.mode==='overlay'||a.mode==='canvas-group','Unknown area mode');
  if(a.mode==='canvas-group')assign(a.canvasGroup,settings.backgroundLocked,settings.backgroundUnlocked);
  assign(a.areaNameCanvasGroup,settings.nameLocked,settings.nameUnlocked);
 }
 const groupAt=new Map<string,number>();
 for(const g of groups){
  check(byNode.has(g.node)&&validAlpha(g.alpha)&&g.enabled&&!g.ignoreParentGroups,'Unsupported CanvasGroup state');
  check(!groupAt.has(g.node),'Multiple CanvasGroups on one node');groupAt.set(g.node,overrides.get(g.pathID)??g.alpha);
 }
 const result=new Map<string,number>();
 function walk(id:string,visiting:Set<string>):number{
  if(id==='0')return 1;
  const old=result.get(id);if(old!==undefined)return old;
  const n=byNode.get(id);check(n&&!visiting.has(id),'Invalid native parent graph');visiting.add(id);
  const alpha=(groupAt.get(id)??1)*walk(n.parent,visiting);visiting.delete(id);result.set(id,alpha);return alpha;
 }
 for(const n of nodes)walk(n.rectTransform,new Set());return result;
}
