import type {NativeHairInputs} from './native-hair-inputs.ts';
import type {PosePrimitive} from './scene-session.ts';

/** Native Hair forward state uses _src/_dst, ZWrite On, ZTest LEqual.
 * Queue -1 resolves to the shader's Geometry queue (2000).
 * Within Geometry, preview draws opaque first and blends in source order;
 * Transparent queue 3000 sorts by skinned mesh centroid, a documented
 * approximation of Unity renderer bounds sorting. RGB blend uses source
 * factors; alpha tracks coverage for the transparent browser canvas. */
export function attachmentRenderQueue(h:NativeHairInputs|undefined):2000|3000{return h?.shader==='PBR/PBR Hair'&&h.dst===10?h.renderQueue??2000:2000}
/** Precompute weighted homogeneous coordinates by joint. The animated mean
 * then needs one matrix multiply per bone, not CPU skinning every vertex. */
export function attachmentSortCenter(p:Pick<PosePrimitive,'positions'|'joints'|'weights'>,jointCount:number):Float64Array{
 const count=p.positions.length/3,out=new Float64Array(jointCount*4);
 if(!Number.isInteger(count)||count<1||p.joints.length!==count*4||p.weights.length!==count*4)throw Error('Attachment sort geometry');
 for(let v=0;v<count;v++)for(let k=0;k<4;k++){const i=v*4+k,w=p.weights[i]/count,j=p.joints[i]*4;if(j+3>=out.length)throw Error('Attachment sort joint');out[j]+=p.positions[v*3]*w;out[j+1]+=p.positions[v*3+1]*w;out[j+2]+=p.positions[v*3+2]*w;out[j+3]+=w}
 return out;
}
export function attachmentDepth(c:Float64Array,palette:Float32Array,camera:Float32Array):number{
 if(palette.length!==c.length*4||camera.length!==16)throw Error('Attachment sort palette');
 const pos=[0,0,0,0];
 for(let j=0;j<c.length;j+=4)for(let row=0;row<4;row++)for(let k=0;k<4;k++)pos[row]+=palette[j*4+k*4+row]*c[j+k];
 const z=camera[2]*pos[0]+camera[6]*pos[1]+camera[10]*pos[2]+camera[14]*pos[3],w=camera[3]*pos[0]+camera[7]*pos[1]+camera[11]*pos[2]+camera[15]*pos[3];
 return Math.abs(w)>1e-8?z/w:z;
}
