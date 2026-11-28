import type {LimboMaterial} from './limbo-material.ts';
import {PosePlayback,type PosePlaybackState,type PoseSpeed} from './playback.ts';

export interface PosePrimitive {
  readonly actorId:string;
  readonly positions:Float32Array;
  readonly normals:Float32Array;
  readonly uv:Float32Array;
  readonly joints:Uint16Array;
  readonly weights:Float32Array;
  readonly indices:Uint16Array|Uint32Array;
  readonly skin:number;
  readonly color:readonly [number,number,number,number];
  readonly texture?:ImageBitmap;
  readonly limbo?:LimboMaterial;
}
export interface PoseScene {
  readonly duration:number;
  readonly primitives:readonly PosePrimitive[];
  readonly jointCounts:readonly number[];
  readonly actors:readonly {id:string;label:string;canHide:boolean}[];
  readonly center:readonly [number,number,number];
  readonly radius:number;
  /** Absolute-time joint palettes, in world space, column-major. All actors
   * are evaluated together, including hidden actors and their constraints. */
  sample(seconds:number):readonly Float32Array[];
  dispose():void;
}
export interface PoseView {readonly yaw:number;readonly pitch:number;readonly zoom:number;readonly targetOffset?:readonly [number,number,number]}
export interface PoseComparison {readonly playback:PosePlaybackState;readonly view:PoseView;readonly hidden:readonly string[]}
export interface PoseRenderer {
  draw(palettes:readonly Float32Array[],view:PoseView,hidden:ReadonlySet<string>):void;
  dispose():void;
}
export function orbit(view:PoseView,dx:number,dy:number,width:number,height:number):PoseView {
  if(![dx,dy,width,height,view.yaw,view.pitch,view.zoom].every(Number.isFinite)||width<=0||height<=0)throw new RangeError('Invalid orbit');
  const turn=2*Math.PI;
  return {...view,yaw:((view.yaw+turn*dx/width)%turn+turn)%turn,pitch:Math.max(-Math.PI*.48,Math.min(Math.PI*.48,view.pitch+Math.PI*dy/height))};
}
/** Translate the orbit pivot in the camera plane, in scene-radius units.
 * Keep the same world-space target during zoom and orbit. */
export function pan(view:PoseView,dx:number,dy:number,width:number,height:number):PoseView{
  const old=view.targetOffset??[0,0,0];
  if(![dx,dy,width,height,view.yaw,view.pitch,view.zoom,...old].every(Number.isFinite)||width<=0||height<=0||view.zoom<=0)throw new RangeError('Invalid pan');
  const k=2/(Math.min(width,height)*view.zoom),cy=Math.cos(view.yaw),sy=Math.sin(view.yaw),cp=Math.cos(view.pitch),sp=Math.sin(view.pitch);
  const a=-dx*k,b=dy*k;
  const next:[number,number,number]=[old[0]+a*cy-b*sp*sy,old[1]+b*cp,old[2]-a*sy-b*sp*cy];
  const length=Math.hypot(...next);
  if(!Number.isFinite(length))throw new RangeError('Invalid pan offset');
  const limit=8;const targetOffset:readonly [number,number,number]=length>limit?[next[0]*limit/length,next[1]*limit/length,next[2]*limit/length]:next;
  return {...view,targetOffset};
}
export class PoseSceneSession {
  readonly clock:PosePlayback;
  private view:PoseView={yaw:0,pitch:0,zoom:1};
  private hidden=new Set<string>();
  private palettes:readonly Float32Array[]=[];
  private disposed=false;
  readonly scene:PoseScene;
  private readonly renderer:PoseRenderer;
  constructor(scene:PoseScene,renderer:PoseRenderer){
    this.scene=scene;this.renderer=renderer;
    this.clock=new PosePlayback(scene.duration,{sample:t=>{
      this.palettes=scene.sample(t);
      if(this.palettes.length!==scene.jointCounts.length||this.palettes.some((p,i)=>p.length!==scene.jointCounts[i]*16))throw new Error('Invalid pose palette');
      this.redraw();
    },setVisible:(id,visible)=>{
      if(!scene.actors.some(a=>a.id===id&&a.canHide))throw new Error('Actor is not independently hideable');
      if(visible)this.hidden.delete(id);else this.hidden.add(id);
      this.redraw();
    }});
  }
  get state():PosePlaybackState{return this.clock.snapshot}
  get camera():PoseView{return {...this.view}}
  get hiddenActors():readonly string[]{return [...this.hidden]}
  comparison(previous?:PoseComparison):PoseComparison{
    const hidden=new Set(previous?.hidden??[]);
    for(const actor of this.scene.actors){if(actor.canHide){if(this.hidden.has(actor.id))hidden.add(actor.id);else hidden.delete(actor.id)}}
    return {playback:this.state,view:this.camera,hidden:[...hidden]};
  }
  restoreComparison(saved:PoseComparison):void{
    this.view={...saved.view};
    this.hidden=new Set(this.scene.actors.filter(a=>a.canHide&&saved.hidden.includes(a.id)).map(a=>a.id));
    this.clock.setSpeed(saved.playback.speed);
    this.clock.setLoop(saved.playback.loop);
    this.clock.seek(saved.playback.time);
    if(saved.playback.playing&&this.state.time<this.scene.duration)this.clock.play();
    else this.clock.pause();
  }
  redraw(){if(!this.disposed)this.renderer.draw(this.palettes,this.view,this.hidden)}
  move(dx:number,dy:number,width:number,height:number){this.view=orbit(this.view,dx,dy,width,height);this.redraw()}
  pan(dx:number,dy:number,width:number,height:number){this.view=pan(this.view,dx,dy,width,height);this.redraw()}
  zoom(value:number){if(!Number.isFinite(value))throw new RangeError('Invalid zoom');this.view={...this.view,zoom:Math.max(.5,Math.min(4,value))};this.redraw()}
  resetView(){this.view={yaw:0,pitch:0,zoom:1};this.redraw()}
  speed(value:PoseSpeed){this.clock.setSpeed(value)}
  dispose(){if(this.disposed)return;this.disposed=true;this.clock.pause();try{this.renderer.dispose()}finally{this.scene.dispose()}}
}
