<script lang="ts">
  import {onMount,tick} from 'svelte';
  import type {WandLanguage} from './preferences';
  import type {TourStep} from './contextual-tour';
  import {TOUR_NAVIGATION} from './contextual-tour';
  import {dialogFocus} from './dialog-focus';

  export let title:string;
  export let steps:readonly TourStep[];
  export let locale:WandLanguage;
  export let closeLabel:string;
  export let onClose:()=>void;
  export let focusReturn:()=>HTMLElement|null;

  type Outline={left:number;top:number;width:number;height:number};
  type CardPosition={left:number;top:number;width:number;below:boolean};
  let current=0;
  let outline:Outline|null=null;
  let position:CardPosition={left:12,top:72,width:320,below:true};
  let panel:HTMLElement;
  let frame=0;
  let target:HTMLElement|null=null;
  $: navigation=TOUR_NAVIGATION[locale];
  $: description=steps[current]?.description??'';
  $: canPrevious=steps.slice(0,current).some(step=>Boolean(findTarget(step)));
  $: canNext=steps.slice(current+1).some(step=>Boolean(findTarget(step)));

  /** Prefer a visible, non-empty element; inactive tabs and hidden mobile controls are skipped. */
  function findTarget(step:TourStep):HTMLElement|null{
    for(const selector of step.selectors){
      const element=document.querySelector<HTMLElement>(selector);
      if(!element||!element.isConnected||element.closest('[aria-hidden="true"]'))continue;
      const rect=element.getBoundingClientRect();
      if(rect.width>0&&rect.height>0&&element.getClientRects().length>0)return element;
    }
    return null;
  }

  function measure():void{
    if(!target?.isConnected)return;
    const rect=target.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return;
    const vw=window.innerWidth,vh=window.innerHeight;
    const left=Math.max(5,Math.min(vw-5,rect.left-5));
    const top=Math.max(5,Math.min(vh-5,rect.top-5));
    const right=Math.max(left+1,Math.min(vw-5,rect.right+5));
    const bottom=Math.max(top+1,Math.min(vh-5,rect.bottom+5));
    outline={left,top,width:right-left,height:bottom-top};
    const width=Math.max(140,Math.min(360,vw-24));
    const height=panel?.getBoundingClientRect().height??160;
    const wantedLeft=rect.left+rect.width/2-width/2;
    const cardLeft=Math.max(12,Math.min(vw-width-12,wantedLeft));
    const fitsBelow=rect.bottom+14+height<=vh-12;
    const fitsAbove=rect.top-14-height>=12;
    const wantedTop=fitsBelow?rect.bottom+14:fitsAbove?rect.top-height-14:vh-height-12;
    position={
      left:cardLeft,top:Math.max(12,Math.min(vh-height-12,wantedTop)),
      width,below:fitsBelow||!fitsAbove
    };
  }
  function refresh():void{
    if(frame)return;
    frame=window.requestAnimationFrame(()=>{frame=0;measure();});
  }
  async function showStep(scroll:boolean):Promise<void>{
    await tick();
    target=findTarget(steps[current]);
    if(!target){outline=null;return;}
    const rect=target.getBoundingClientRect();
    if(scroll&&(rect.top<8||rect.bottom>window.innerHeight-8)){
      target.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
    }
    measure();
    refresh();
  }
  async function move(direction:1|-1):Promise<void>{
    for(let i=current+direction;i>=0&&i<steps.length;i+=direction){
      if(findTarget(steps[i])){
        current=i;
        await showStep(true);
        return;
      }
    }
    if(direction===1)onClose();
  }

  onMount(()=>{
    const first=steps.findIndex(step=>Boolean(findTarget(step)));
    if(first<0){onClose();return;}
    current=first;
    void showStep(true);
    window.addEventListener('resize',refresh);
    window.addEventListener('scroll',refresh,true);
    return ()=>{
      window.removeEventListener('resize',refresh);
      window.removeEventListener('scroll',refresh,true);
      if(frame)window.cancelAnimationFrame(frame);
    };
  });
</script>

<div class="wand-tour-layer">
  <div class="wand-tour-shield" aria-hidden="true"></div>
  {#if outline}
    <div class="wand-tour-spotlight" aria-hidden="true"
      style:left="{outline.left}px" style:top="{outline.top}px"
      style:width="{outline.width}px" style:height="{outline.height}px"></div>
  {/if}
  <div class="wand-tour-card" class:below={position.below} class:above={!position.below}
    role="dialog" aria-modal="true" aria-label={title}
    style:left="{position.left}px" style:top="{position.top}px" style:width="{position.width}px"
    bind:this={panel} use:dialogFocus={{fallback:focusReturn}}>
    <header class="wand-tour-heading">
      <strong>{title}</strong>
      <button type="button" class="wand-tour-close" aria-label={closeLabel} on:click={onClose}>×</button>
    </header>
    <p class="wand-tour-description" aria-live="polite">{description}</p>
    <div class="wand-tour-footer">
      <span class="wand-tour-count">{navigation.progress} {current+1} / {steps.length}</span>
      <div class="wand-tour-controls">
        <button type="button" disabled={!canPrevious} on:click={()=>void move(-1)}>{navigation.previous}</button>
        <button type="button" class="wand-tour-primary" on:click={()=>void move(1)}>
          {canNext?navigation.next:navigation.done}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .wand-tour-layer{position:fixed;inset:0;z-index:105;pointer-events:none}
  .wand-tour-shield{position:fixed;inset:0;z-index:0;pointer-events:auto;background:transparent}
  .wand-tour-spotlight{
    position:fixed;z-index:1;pointer-events:none;border-radius:12px;
    outline:3px solid var(--wand-focus,#D8B96B);
    box-shadow:0 0 0 100vmax rgba(4,10,30,.73),0 0 0 6px rgba(255,255,255,.1);
    transition:top .18s ease,left .18s ease,width .18s ease,height .18s ease
  }
  .wand-tour-card{
    position:fixed;z-index:2;pointer-events:auto;box-sizing:border-box;
    max-height:calc(100dvh - 24px);overflow-y:auto;
    background:var(--wand-menu,#111);color:var(--wand-text,#fff);
    border:1px solid var(--wand-accent,#aaa);border-radius:14px;
    box-shadow:0 12px 36px #0008;
    padding:12px 14px 14px;
    transition:top .18s ease,left .18s ease
  }
  .wand-tour-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .wand-tour-heading strong{font-size:14px;font-weight:750;min-width:0}
  .wand-tour-close{border:0;background:transparent;color:inherit;font-size:24px;
    width:36px;height:36px;border-radius:8px;flex:none;cursor:pointer}
  .wand-tour-description{font-size:14px;line-height:1.55;margin:7px 0 15px}
  .wand-tour-footer{display:flex;gap:8px;align-items:center;justify-content:space-between}
  .wand-tour-count{font-size:11px;color:var(--wand-muted,#bbb);white-space:nowrap}
  .wand-tour-controls{display:flex;gap:6px;align-items:center}
  .wand-tour-controls button{
    border:1px solid var(--wand-line,#888);border-radius:8px;
    background:var(--wand-header-hover,#fff1);color:inherit;
    min-height:38px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer
  }
  .wand-tour-controls button:disabled{opacity:.35;cursor:default}
  .wand-tour-controls .wand-tour-primary{
    background:var(--wand-accent-strong,#345a8b);color:var(--wand-accent-contrast,#fff);
    border-color:var(--wand-accent-strong,#345a8b);font-weight:750
  }
  .wand-tour-card :global(button:focus-visible){outline:3px solid var(--wand-focus,#D8B96B);outline-offset:2px}
  @media(max-width:400px){
    .wand-tour-card{padding:10px 11px}
    .wand-tour-description{font-size:13px}
    .wand-tour-controls button{padding:6px 8px}
  }
  @media(prefers-reduced-motion:reduce){
    .wand-tour-spotlight,.wand-tour-card{transition:none}
  }
</style>
