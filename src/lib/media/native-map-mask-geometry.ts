export type MaskAffine=readonly [number,number,number,number,number,number];
function check(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
function finiteAffine(m:MaskAffine){check(Array.isArray(m)&&m.length===6&&m.every(Number.isFinite),'Invalid mask geometry');}
/** Both input quads map top-down unit UV into the same root or canvas coordinate system. */
export function overlayToMaskUv(overlay:MaskAffine,mask:MaskAffine):MaskAffine{
 finiteAffine(overlay);finiteAffine(mask);
 const [a,b,c,d,x,y]=overlay,[e,f,g,h,u,v]=mask,det=e*h-f*g;
 check(Number.isFinite(det)&&Math.abs(det)>1e-8,'Degenerate mask quad');
 const px=x-u,py=y-v;
 return [(h*a-g*b)/det,(-f*a+e*b)/det,(h*c-g*d)/det,(-f*c+e*d)/det,(h*px-g*py)/det,(-f*px+e*py)/det];
}
export interface LockOverlayCandidate{
 readonly node:string;readonly drawOrder:number;readonly quad:MaskAffine;
 readonly mode:'area-lock'|'inactive-uncontrolled';readonly activeInPrefab:boolean;readonly graphicEnabled:boolean;
 readonly areaType?:number;readonly mask?:{readonly quad:MaskAffine;readonly kind:'graphic-alpha'|'texture-alpha'|'solid-fallback'};
}
/** Plan only: no guess at runtime lock predicates or CanvasGroup alpha. */
export function selectLockOverlayCandidates<T extends LockOverlayCandidate>(rows:readonly T[],locked:ReadonlyMap<number,boolean>){
 const result:{overlay:T;overlayToMaskUv:MaskAffine}[]=[];let last=-1;
 for(const row of rows){
  check(Number.isSafeInteger(row.drawOrder)&&row.drawOrder>last,'Invalid native overlay order');last=row.drawOrder;
  if(row.mode==='inactive-uncontrolled'){check(!row.activeInPrefab,'Uncontrolled active overlay');continue;}
  check(row.mode==='area-lock'&&typeof row.areaType==='number'&&Number.isSafeInteger(row.areaType)&&row.mask&&row.graphicEnabled,'Invalid lock overlay');
  const state=locked.get(row.areaType);check(typeof state==='boolean','Unknown area lock state: '+row.areaType);
  if(!state)continue;
  check(['graphic-alpha','texture-alpha','solid-fallback'].includes(row.mask.kind),'Unsupported mask');
  result.push({overlay:row,overlayToMaskUv:overlayToMaskUv(row.quad,row.mask.quad)});
 }
 return result;
}
