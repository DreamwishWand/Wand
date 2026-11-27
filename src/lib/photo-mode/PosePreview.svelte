<script lang="ts">
  import {onMount} from 'svelte';
  import {poseSpeeds,type PoseSpeed,type PosePlaybackState} from './playback';
  import {PoseSceneSession,type PoseScene} from './scene-session';
  import {GpuPoseRenderer} from './gpu-renderer';

  type BodyOption={id:string;iconUrl:string;label:string;load:(signal:AbortSignal)=>Promise<PoseScene>};
  type Copy={play:string;pause:string;restart:string;loop:string;speed:string;time:string;zoom:string;resetView:string;orbit:string;loading:string;unavailable:string;bodyType:string};
  // The caller must provide verified native body icons and approved scene sources.
  let {options,copy}:{options:readonly BodyOption[];copy:Copy}=$props();
  let canvas:HTMLCanvasElement;
  let session:PoseSceneSession|undefined;
  let selected=$state('');
  let status=$state<'loading'|'ready'|'error'>('loading');
  let snapshot=$state<PosePlaybackState>({time:0,duration:1,playing:false,loop:true,speed:1});
  let actors=$state<readonly {id:string;label:string;canHide:boolean}[]>([]);
  let hidden=$state<readonly string[]>([]);
  let zoom=$state(1);
  let abort:AbortController|undefined;
  let generation=0,frame=0,last:number|undefined;
  let pointer:{id:number;x:number;y:number}|undefined;
  function refresh(){if(session){snapshot=session.state;hidden=session.hiddenActors;zoom=session.camera.zoom}}
  function release(){session?.dispose();session=undefined}
  async function choose(option:BodyOption){
    if(selected===option.id&&status!=='error')return;
    selected=option.id;status='loading';const token=++generation;abort?.abort();abort=new AbortController();
    const settings=session?.state;release();actors=[];hidden=[];last=undefined;let scene:PoseScene|undefined;let renderer:GpuPoseRenderer|undefined;
    try{
      scene=await option.load(abort.signal);if(token!==generation){scene.dispose();return}
      renderer=new GpuPoseRenderer(canvas,scene);session=new PoseSceneSession(scene,renderer);
      scene=undefined;renderer=undefined;
      if(settings){session.clock.setSpeed(settings.speed);session.clock.setLoop(settings.loop)}
      actors=session.scene.actors.filter(a=>a.canHide);status='ready';refresh();
    }catch{renderer?.dispose();scene?.dispose();if(token===generation){release();status='error'}}
  }
  function tick(now:number){if(session&&status==='ready'&&snapshot.playing){try{if(last!==undefined)session.clock.tick(Math.min(.1,(now-last)/1000));refresh()}catch{release();status='error'}}last=now;frame=requestAnimationFrame(tick)}
  function act(fn:(s:PoseSceneSession)=>void){if(!session)return;try{fn(session);refresh()}catch{release();status='error'}}
  function down(e:PointerEvent){if(!session||pointer||e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId)}
  function move(e:PointerEvent){if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer.x=e.clientX;pointer.y=e.clientY;const r=canvas.getBoundingClientRect();if(r.width&&r.height)act(s=>s.move(dx,dy,r.width,r.height))}
  function up(e:PointerEvent){if(pointer?.id===e.pointerId)pointer=undefined}
  function key(e:KeyboardEvent){const r=canvas.getBoundingClientRect();if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();if(e.key==='Home')act(s=>s.resetView());else if(r.width&&r.height)act(s=>s.move(e.key==='ArrowLeft'?-r.width/24:e.key==='ArrowRight'?r.width/24:0,e.key==='ArrowUp'?-r.height/24:e.key==='ArrowDown'?r.height/24:0,r.width,r.height))}
  function lost(e:Event){e.preventDefault();release();status='error'}
  onMount(()=>{canvas.addEventListener('webglcontextlost',lost);const observer=new ResizeObserver(()=>act(s=>s.redraw()));observer.observe(canvas);if(options.length)void choose(options[0]);else status='error';frame=requestAnimationFrame(tick);return()=>{generation++;abort?.abort();cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('webglcontextlost',lost);release()}});
</script>

<section class="pose-preview" aria-label={copy.bodyType}>
  <div class="viewport">
    <canvas bind:this={canvas} tabindex="0" aria-label={copy.orbit} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onlostpointercapture={up} onkeydown={key}></canvas>
    <div class="body-options" aria-label={copy.bodyType}>
      {#each options as option (option.id)}
        <button type="button" title={option.label} aria-label={option.label} aria-pressed={selected===option.id} onclick={()=>void choose(option)}><img src={option.iconUrl} alt="" width="44" height="44"/></button>
      {/each}
    </div>
    {#if status!=='ready'}<p role="status">{status==='loading'?copy.loading:copy.unavailable}</p>{/if}
  </div>
  <div class="controls">
    <button type="button" title={snapshot.playing?copy.pause:copy.play} aria-label={snapshot.playing?copy.pause:copy.play} disabled={status!=='ready'} onclick={()=>act(s=>{last=undefined;s.state.playing?s.clock.pause():s.clock.play()})}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{#if snapshot.playing}<path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3"/>{:else}<path d="m7 4 14 8-14 8z" fill="currentColor"/>{/if}</svg>
    </button>
    <button type="button" title={copy.restart} aria-label={copy.restart} disabled={status!=='ready'} onclick={()=>act(s=>{last=undefined;s.clock.restart()})}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg></button>
    <input class="seek" type="range" aria-label={copy.time} min="0" max={snapshot.duration} step="0.001" value={snapshot.time} disabled={status!=='ready'} oninput={e=>act(s=>s.clock.seek(e.currentTarget.valueAsNumber))}/>
    <output>{snapshot.time.toFixed(1)} / {snapshot.duration.toFixed(1)} s</output>
    <select aria-label={copy.speed} value={snapshot.speed} disabled={status!=='ready'} onchange={e=>act(s=>{last=undefined;s.speed(Number(e.currentTarget.value) as PoseSpeed)})}>{#each poseSpeeds as speed}<option value={speed}>{speed}×</option>{/each}</select>
    <button type="button" title={copy.loop} aria-label={copy.loop} aria-pressed={snapshot.loop} disabled={status!=='ready'} onclick={()=>act(s=>s.clock.setLoop(!s.state.loop))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/></svg></button>
  </div>
  <div class="controls">
    <input type="range" aria-label={copy.zoom} min=".5" max="4" step=".05" value={zoom} disabled={status!=='ready'} oninput={e=>act(s=>s.zoom(e.currentTarget.valueAsNumber))}/>
    <button type="button" disabled={status!=='ready'} onclick={()=>act(s=>s.resetView())}>{copy.resetView}</button>
    {#each actors as actor (actor.id)}<label><input type="checkbox" checked={!hidden.includes(actor.id)} onchange={e=>act(s=>s.clock.setActorVisible(actor.id,e.currentTarget.checked))}/>{actor.label}</label>{/each}
  </div>
</section>
<style>
  .pose-preview{background:var(--wand-card);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:12px;overflow:hidden}
  .viewport{position:relative;min-height:240px;aspect-ratio:4/3;background:var(--wand-bg)}
  canvas{display:block;width:100%;height:100%;position:absolute;inset:0;touch-action:none;cursor:grab}
  canvas:active{cursor:grabbing}
  .body-options{position:absolute;top:8px;right:8px;display:flex;gap:4px}
  .body-options img{display:block;object-fit:contain}
  .viewport p{position:absolute;inset:40% 12px auto;text-align:center;color:var(--wand-muted);pointer-events:none}
  .controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px}
  button,select{background:var(--wand-menu);color:var(--wand-text);border:1px solid var(--wand-line);border-radius:6px;min-height:36px;padding:4px 8px}
  button[aria-pressed=true]{border-color:var(--wand-accent);background:var(--wand-header-hover)}
  button:disabled,select:disabled{opacity:.45}
  button:focus-visible,input:focus-visible,select:focus-visible,canvas:focus-visible{outline:2px solid var(--wand-focus);outline-offset:2px}
  svg{display:block;width:20px;height:20px}
  input{accent-color:var(--wand-accent)}
  .seek{flex:1;min-width:65px}
  output{font-size:.75rem;white-space:nowrap}
  label{display:flex;align-items:center;gap:4px;font-size:.85rem}
</style>
