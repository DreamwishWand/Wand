import type {Affine} from '../world/media-map-calibration.ts';
export interface NativeRegistrationInputs{
 readonly cameraXZ:readonly [number,number];
 readonly orthographicSize:number;
 readonly holderScale:readonly [number,number];
 readonly holderAnchor:readonly [number,number];
 readonly rootAnchor:readonly [number,number];
 readonly rootToCanvas:Affine;
}
const finite=(v:readonly number[])=>v.every(Number.isFinite);
function check(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
/** Static source candidate only: assumes centered marker anchors and unchanged holder geometry.
 * This is NOT the calibrated original-image manifest or Save-write authority.
 */
export function nativeRegistrationCandidate(i:NativeRegistrationInputs){
 const [cx,cz]=i.cameraXZ,[sx,sy]=i.holderScale,[hx,hy]=i.holderAnchor,[rx,ry]=i.rootAnchor,[a,b,c,d,tx,ty]=i.rootToCanvas;
 check(finite([cx,cz,sx,sy,hx,hy,rx,ry,a,b,c,d,tx,ty,i.orthographicSize])&&sx>0&&sy>0&&i.orthographicSize>0&&a===1&&b===0&&c===0&&d===-1,'Invalid source registration basis');
 const kx=540/i.orthographicSize/sx,ky=540/i.orthographicSize/sy;
 const worldXZToCanvas:Affine=[kx,0,0,-ky,tx-kx*cx-hx/sx-rx,ty+ky*cz+hy/sy+ry];
 const halfWorldTicksToCanvas:Affine=[kx/2,0,0,ky/2,worldXZToCanvas[4],worldXZToCanvas[5]];
 check(finite(worldXZToCanvas)&&finite(halfWorldTicksToCanvas),'Nonfinite registration');
 return {worldXZToCanvas,halfWorldTicksToCanvas,worldPlacementVerified:false as const,runtimeMarkerAnchorVerified:false as const};
}
