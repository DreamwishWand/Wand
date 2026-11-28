import type {BlobEntry} from '../../../tools/photo-mode/split-loader.ts';
export const expressionParameters=['smile_small','smile_medium','smile_big','wink_left','wink_right'] as const;
type Curve={kind:'constant';value:number}|{kind:'dense';begin:number;rate:number;values:number[]}|{kind:'stream';keys:[number,[number,number,number,number]][]};
export type ExpressionWeights=readonly [number,number,number,number,number];
export type ExpressionClip={name:string;start:number;end:number;loop:boolean;parameters:Partial<Record<typeof expressionParameters[number],Curve>>};
export type ExpressionIndex={meshes:Record<string,{vertices:number;asset:BlobEntry}>;clips:Record<string,BlobEntry>};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const hash=(v:string)=>/^[a-f0-9]{64}$/.test(v);
const asset=(v:BlobEntry)=>!!v&&hash(v.sha256)&&Number.isSafeInteger(v.bytes)&&v.bytes>0&&v.bytes<=2*1024*1024;
export function validExpressionIndex(x:unknown):x is ExpressionIndex{
 if(!x||typeof x!=='object')return false;
 const m=x as ExpressionIndex;
 return !!m.meshes&&!!m.clips&&Object.keys(m.meshes).length<=32&&Object.keys(m.clips).length<=170&&Object.entries(m.meshes).every(([k,v])=>hash(k)&&v&&Number.isSafeInteger(v.vertices)&&v.vertices>0&&v.vertices<=100000&&asset(v.asset)&&v.asset.bytes>=28&&(v.asset.bytes-28)%16===0&&v.asset.bytes<=28+80*v.vertices)&&Object.entries(m.clips).every(([k,v])=>hash(k)&&asset(v));
}
function validCurve(c:Curve):boolean{
 if(!c)return false;
 if(c.kind==='constant')return finite(c.value);
 if(c.kind==='dense')return finite(c.begin)&&finite(c.rate)&&c.rate>0&&Array.isArray(c.values)&&c.values.length>0&&c.values.length<=10000&&c.values.every(finite);
 return c.kind==='stream'&&Array.isArray(c.keys)&&c.keys.length>0&&c.keys.length<=10000&&c.keys.every((k,i)=>Array.isArray(k)&&k.length===2&&finite(k[0])&&(i===0||k[0]>c.keys[i-1][0])&&Array.isArray(k[1])&&k[1].length===4&&k[1].every(finite));
}
export function parseExpressionClip(raw:ArrayBuffer):ExpressionClip{
 const c=JSON.parse(new TextDecoder().decode(raw)) as ExpressionClip;
 if(!c||typeof c.name!=='string'||!finite(c.start)||!finite(c.end)||c.start<0||c.end<=c.start||c.end>600||typeof c.loop!=='boolean'||!c.parameters||!Object.keys(c.parameters).length||!Object.entries(c.parameters).every(([k,v])=>expressionParameters.includes(k as typeof expressionParameters[number])&&validCurve(v)))throw Error('Invalid expression clip');
 return c;
}
function scalar(c:Curve,t:number):number{
 if(c.kind==='constant')return c.value;
 if(c.kind==='dense'){const x=Math.max(0,Math.min(c.values.length-1,(t-c.begin)*c.rate)),i=Math.floor(x);return c.values[i]+(c.values[Math.min(i+1,c.values.length-1)]-c.values[i])*(x-i)}
 let lo=0,hi=c.keys.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(c.keys[mid][0]<=t)lo=mid;else hi=mid}
 const [at,[a,b,d,e]]=c.keys[lo],dt=at< -1e30?0:Math.max(0,t-at);return ((a*dt+b)*dt+d)*dt+e
}
/** Native Animator values are passed directly to SetBlendShapeWeight. Convert only
 * from percent to the original full-weight=100 delta scale; do not clamp. */
export function sampleExpression(c:ExpressionClip,t:number,loopPeriod?:number):ExpressionWeights{
 if(!finite(t)||t<0||loopPeriod!==undefined&&(!finite(loopPeriod)||loopPeriod<=0))throw Error('Invalid expression time');
 const time=Math.max(c.start,Math.min(c.end,c.start+(loopPeriod===undefined?t:t%loopPeriod)));
 const out=expressionParameters.map(k=>{const v=c.parameters[k];return v?scalar(v,time)/100:0});
 if(!out.every(finite))throw Error('Invalid expression sample');return out as unknown as ExpressionWeights;
}
export function decodeExpressionDeltas(raw:ArrayBuffer,n:number):Float32Array[]{
 const v=new DataView(raw);const fail=()=>{throw Error('Invalid expression geometry')};
 if(!Number.isSafeInteger(n)||n<1||n>100000||raw.byteLength<28||v.getUint32(0,true)!==0x314d4557||v.getUint32(4,true)!==n)fail();
 const frames:Float32Array[]=[];let off=8;
 for(let f=0;f<5;f++){if(off+4>v.byteLength)fail();const count=v.getUint32(off,true);off+=4;if(count>n||off+16*count>v.byteLength)fail();const seen=new Set<number>(),d=new Float32Array(n*3);
  for(let i=0;i<count;i++,off+=16){const k=v.getUint32(off,true);if(k>=n||seen.has(k))fail();seen.add(k);for(let j=0;j<3;j++){const x=v.getFloat32(off+4+4*j,true);if(!finite(x))fail();d[k*3+j]=x}}frames.push(d)
 }
 if(off!==v.byteLength)fail();return frames
}
