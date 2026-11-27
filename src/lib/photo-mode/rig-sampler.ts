export type RigPath='translation'|'rotation'|'scale';
export interface RigNode {parent:number;translation:readonly number[];rotation:readonly number[];scale:readonly number[]}
export interface RigTrack {node:number;path:RigPath;times:Float32Array;values:Float32Array}
export interface RigSkin {joints:readonly number[];inverseBind:Float32Array}
function check(x:unknown,m:string):asserts x{if(!x)throw Error(m)}
function mul(a:ArrayLike<number>,b:ArrayLike<number>){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let sum=0;for(let k=0;k<4;k++)sum+=a[k*4+r]*b[c*4+k];out[c*4+r]=sum}return out}
function matrix(t:readonly number[],q:readonly number[],s:readonly number[]){const [x,y,z,w]=q,[a,b,c]=s;return new Float32Array([(1-2*y*y-2*z*z)*a,(2*x*y+2*z*w)*a,(2*x*z-2*y*w)*a,0,(2*x*y-2*z*w)*b,(1-2*x*x-2*z*z)*b,(2*y*z+2*x*w)*b,0,(2*x*z+2*y*w)*c,(2*y*z-2*x*w)*c,(1-2*x*x-2*y*y)*c,0,...t,1])}
function interpolate(track:RigTrack,time:number){const {times,values,path}=track,d=path==='rotation'?4:3;let lo=0,hi=times.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(times[m]<=time)lo=m;else hi=m}const f=hi===lo?0:Math.max(0,Math.min(1,(time-times[lo])/(times[hi]-times[lo])));const a=Array.from(values.subarray(lo*d,(lo+1)*d)),b=Array.from(values.subarray(hi*d,(hi+1)*d));if(d===3)return a.map((x,i)=>x+(b[i]-x)*f);let dot=a.reduce((s,x,i)=>s+x*b[i],0);if(dot<0){dot=-dot;for(let i=0;i<4;i++)b[i]=-b[i]}const angle=Math.acos(Math.min(1,dot)),sin=Math.sin(angle);const out=sin<1e-5?a.map((x,i)=>x+(b[i]-x)*f):a.map((x,i)=>(Math.sin((1-f)*angle)*x+Math.sin(f*angle)*b[i])/sin);const len=Math.hypot(...out);check(len>0,'Zero quaternion');return out.map(x=>x/len)}
/** Small skeletal matrix evaluation only. Geometry deformation is performed by GPU. */
export class RigSampler {
 readonly duration:number;readonly jointCounts:readonly number[];
 constructor(private nodes:readonly RigNode[],private skins:readonly RigSkin[],private tracks:readonly RigTrack[]){
  check(nodes.length>0&&nodes.length<=4096&&skins.length>0&&tracks.length>0,'Invalid rig');
  for(const [i,n] of nodes.entries())check(Number.isSafeInteger(n.parent)&&n.parent>=-1&&n.parent<i&&n.translation.length===3&&n.scale.length===3&&n.rotation.length===4&&[...n.translation,...n.scale,...n.rotation].every(Number.isFinite)&&Math.abs(Math.hypot(...n.rotation)-1)<.001,'Invalid rest transform');
  for(const s of skins)check(s.joints.length>0&&s.joints.every(j=>Number.isSafeInteger(j)&&j>=0&&j<nodes.length)&&s.inverseBind.length===s.joints.length*16&&s.inverseBind.every(Number.isFinite),'Invalid skin');
  const keys=new Set<string>();let duration=0;
  for(const t of tracks){const d=t.path==='rotation'?4:3,key=t.node+':'+t.path;check(Number.isSafeInteger(t.node)&&t.node>=0&&t.node<nodes.length&&['translation','rotation','scale'].includes(t.path)&&!keys.has(key)&&t.times.length>0&&t.values.length===t.times.length*d&&t.times.every((x,i)=>Number.isFinite(x)&&x>=0&&(i===0||x>t.times[i-1]))&&t.values.every(Number.isFinite),'Invalid track');keys.add(key);if(d===4)for(let i=0;i<t.values.length;i+=4)check(Math.abs(Math.hypot(...t.values.subarray(i,i+4))-1)<.001,'Invalid key quaternion');duration=Math.max(duration,t.times[t.times.length-1])}
  check(duration>0,'Empty animation');this.duration=duration;this.jointCounts=skins.map(s=>s.joints.length);
 }
 sample(seconds:number):readonly Float32Array[]{check(Number.isFinite(seconds),'Invalid time');const t=Math.min(this.duration,Math.max(0,seconds)),nodes=this.nodes.map(n=>({...n}));for(const track of this.tracks)nodes[track.node][track.path]=interpolate(track,t);const world:Float32Array[]=[];for(const n of nodes){const m=matrix(n.translation,n.rotation,n.scale);world.push(n.parent<0?m:mul(world[n.parent],m))}return this.skins.map(s=>{const out=new Float32Array(s.joints.length*16);s.joints.forEach((j,i)=>out.set(mul(world[j],s.inverseBind.subarray(i*16,i*16+16)),i*16));check(out.every(Number.isFinite),'Invalid sampled matrix');return out})}
}
