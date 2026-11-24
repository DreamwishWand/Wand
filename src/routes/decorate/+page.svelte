<script lang="ts">
  import {base} from '$app/paths';
  import {onMount} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  let locale=$state<WandLanguage>('ja');
  onMount(()=>watchWandLanguage(v=>locale=v));
</script>
<svelte:head><title>Decorate · Dreamwish Wand</title></svelte:head>
<section class="entry">
  <h1>Decorate</h1>
  <div class="choices">
    <a href={base+'/decorate/explore/'}><WandIcon name="palette" size={48}/><strong>Explore</strong><span>{locale==='ja'?'アイテムを探し、アイデアをまとめる':'Discover the pieces, gather your vision'}</span></a>
    <a href={base+'/world/'}><WandIcon name="world" size={48}/><strong>World Editor <small>β</small></strong><span>{locale==='ja'?'ワールドの配置を編集':'Edit your world layout'}</span></a>
  </div>
</section>
<style>
  .entry{padding:16px;min-width:0}
  h1{font-size:1.3rem;margin:0 0 14px}
  .choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .choices>a,.disabled{display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;min-height:clamp(180px,56vh,600px);border:1px solid var(--wand-line,#66577c);border-radius:12px;text-decoration:none;color:inherit;background:var(--wand-panel,#292337);padding:12px;text-align:center}
  strong{font-size:clamp(18px,3vw,30px)}.disabled{opacity:.48}.choices>a:hover{border-color:var(--wand-accent,#d1b8ff)}
  @media(max-width:600px){.choices{grid-template-columns:1fr}.choices>a,.disabled{min-height:180px}}
</style>
