<script lang="ts">
 import {onMount} from 'svelte';
 import {nativeFrameRect} from '../media/native-frame-rect.ts';
 import {NativeMapRenderer,type Layer,type View,type ImageSource} from '../media/native-map-renderer.ts';
 export let layers:readonly Layer[];
 export let view:View;
 export let source:ImageSource;
 export let activeKey:string;
 export let onStatus:(status:'drawing'|'ready'|'error')=>void=()=>{};
 let host:HTMLDivElement,canvas:HTMLCanvasElement;
 let renderer:NativeMapRenderer|null=null;
 let stage:HTMLCanvasElement|null=null;
 let ready=false,closed=false,error='';
 let pixelWidth=1,pixelHeight=1,hostWidth=1,hostHeight=1;
 let drawnView:View|null=null;
 $: rect=drawnView?nativeFrameRect(view,drawnView,hostWidth,hostHeight):null;
 let revision=0,busy=false;
 let pending:{id:number;layers:readonly Layer[];view:View;source:ImageSource;key:string;w:number;h:number}|null=null;
 let active:AbortController|null=null,currentKey='';
 let currentSource:ImageSource|undefined;
 onMount(()=>{
  stage=document.createElement('canvas');
  try{renderer=new NativeMapRenderer(stage);}
  catch(e){error=e instanceof Error?e.message:'WebGL 2 unavailable';onStatus('error');}
  const resize=()=>{
   const rect=host.getBoundingClientRect(),ratio=Math.min(2,devicePixelRatio||1);
   hostWidth=rect.width;hostHeight=rect.height;
   pixelWidth=Math.max(1,Math.round(rect.width*ratio));
   pixelHeight=Math.max(1,Math.round(rect.height*ratio));
  };
  const observer=new ResizeObserver(resize);observer.observe(host);resize();ready=true;
  return ()=>{closed=true;pending=null;active?.abort();observer.disconnect();renderer?.dispose();renderer=null;stage=null;};
 });
 $: if(ready&&renderer)queue(layers,view,source,activeKey,pixelWidth,pixelHeight);
 function queue(ls:readonly Layer[],v:View,src:ImageSource,key:string,w:number,h:number){
  const fit=Math.min(w/v.width,h/v.height);
  const scale=Math.min(fit,4096/v.width,4096/v.height,Math.sqrt(4_194_304/(v.width*v.height)));
  if(!Number.isFinite(scale)||scale<=0)return;
  const changed=key!==currentKey||src!==currentSource;
  if(changed){currentKey=key;currentSource=src;active?.abort();drawnView=null;canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);}
  pending={id:++revision,layers:ls,view:v,source:src,key,w:Math.max(1,Math.round(v.width*scale)),h:Math.max(1,Math.round(v.height*scale))};
  error='';onStatus('drawing');void drain();
 }
 async function drain(){
  if(busy||!renderer||!stage)return;
  busy=true;
  try{
   while(pending&&!closed){
    const job=pending;pending=null;
    const r=renderer,buffer=stage,controller=new AbortController();active=controller;
    if(!r||!buffer)break;
    try{
     buffer.width=job.w;buffer.height=job.h;
     await r.render(job.layers,job.view,job.source,controller.signal);
     if(closed||controller.signal.aborted||job.id!==revision)continue;
     canvas.width=job.w;canvas.height=job.h;
     const context=canvas.getContext('2d');if(!context)throw Error('Canvas unavailable');
     context.drawImage(buffer,0,0);drawnView=job.view;onStatus('ready');
    }catch(e){
     if(!closed&&!controller.signal.aborted&&job.id===revision){error=e instanceof Error?e.message:'Rendering failed';onStatus('error');}
    }finally{if(active===controller)active=null;}
   }
  }finally{busy=false;}
 }
</script>
<div bind:this={host} class="native-canvas">
 <canvas bind:this={canvas} draggable="false" aria-label="Native map background preview"
  style:left={rect?rect.left+'px':'0px'} style:top={rect?rect.top+'px':'0px'}
  style:width={rect?rect.width+'px':'0px'} style:height={rect?rect.height+'px':'0px'}
  style:visibility={rect?'visible':'hidden'}></canvas>
 {#if error}<div class="error" role="alert">{error}</div>{/if}
</div>
<style>
 .native-canvas{position:absolute;inset:0;overflow:hidden;pointer-events:none;min-width:0;min-height:0;contain:layout paint}
 canvas{position:absolute;display:block;max-width:none;max-height:none;min-width:0;min-height:0;pointer-events:none;user-select:none;-webkit-user-drag:none}
 .error{position:absolute;inset:auto 8px 8px;padding:8px;background:#181820;color:white;font-size:12px}
</style>
