<script lang="ts">
  import {resolveShopArtwork,type PublishedShopArtwork} from './shop-artwork-composition.ts';
  let {artwork, label, detail=false}: {artwork:PublishedShopArtwork|null;label:string;detail?:boolean}=$props();
  let composition=$derived(resolveShopArtwork('https://media.dreamwishwand.com',artwork,detail));
  const pct=(n:number,d:number)=> (100*n/d)+'%';
  const inset=(n:number,w:number)=> (100*n/w)+'cqw';
</script>

{#snippet image(layer:NonNullable<NonNullable<typeof composition>['background']>, width:number)}
  <img src={layer.url} alt="" loading="lazy" decoding="async"
    style:object-fit={layer.fill}
    style:top={inset(layer.margins[0],width)}
    style:right={inset(layer.margins[1],width)}
    style:bottom={inset(layer.margins[2],width)}
    style:left={inset(layer.margins[3],width)}
    style:width={'calc(100% - '+inset(layer.margins[1]+layer.margins[3],width)+')'}
    style:height={'calc(100% - '+inset(layer.margins[0]+layer.margins[2],width)+')'} />
{/snippet}

{#if composition}
  {@const t=composition.template}
  <div class="artwork" role="img" aria-label={label} style:aspect-ratio={t.artworkWidth+' / '+t.artworkHeight}>
    {#if composition.background}
      <div class="background">{@render image(composition.background,t.artworkWidth)}</div>
    {/if}
    {#each composition.slots as slot (slot.binding)}
      {#if slot.image}
        <div class="slot" style:left={pct(slot.x,t.artworkWidth)} style:width={pct(slot.width,t.artworkWidth)}>
          {@render image(slot.image,t.artworkWidth)}
        </div>
      {/if}
    {/each}
    {#each t.separators as separator (separator.x)}
      <div class="separator" aria-hidden="true" style:left={pct(separator.x,t.artworkWidth)} style:width={pct(separator.width,t.artworkWidth)}>+</div>
    {/each}
    {#if t.scroll}
      {@const sc=t.scroll}
      <div class="scroll" style:left={pct(sc.x,t.artworkWidth)} style:width={pct(sc.width,t.artworkWidth)}>
        {#each composition.scrollItems as item,i (i)}
          {#if item}
            <div class="scroll-item" style:width={inset(sc.itemWidth,t.artworkWidth)}>
              <div class="scroll-image" style:inset-inline={inset(sc.imageInset/2,t.artworkWidth)}>
                {@render image(item,t.artworkWidth)}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/if}
<style>
  .artwork{position:relative;width:100%;container-type:inline-size;overflow:hidden}
  .background,.slot,.separator,.scroll{position:absolute;top:0;height:100%;overflow:hidden}
  .background{inset:0}
  img{position:absolute;display:block}
  .separator{display:grid;place-items:center;font-size:8cqw;line-height:1;color:inherit}
  .scroll{display:flex;overflow-x:auto;overflow-y:hidden}
  .scroll-item{position:relative;flex:none;height:100%}
  .scroll-image{position:absolute;top:0;bottom:0}
</style>
