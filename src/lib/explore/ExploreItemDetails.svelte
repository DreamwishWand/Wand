<script lang="ts">
  import {base} from '$app/paths';
  import {openCurrentItemDetails} from '$lib/items/public-item-details';
  import type {ItemPriceDetails} from '$lib/items/public-item-price-details';
  import type {WandLanguage} from '$lib/ui/preferences';
  import AcquisitionEvidence from '$lib/collection/AcquisitionEvidence.svelte';
  let {itemId,locale}:{itemId:number;locale:WandLanguage}=$props();
  let price=$state.raw<Readonly<ItemPriceDetails>|null>(null);
  let loading=$state(false);
  let expanded=$state(false);
  let client:ReturnType<typeof openCurrentItemDetails>|undefined;
  const langs=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
  const words={
    title:['設定価格','Configured prices','Prix configurés','Prezzi configurati','Konfigurierte Preise','Precios configurados','设定价格','Preços configurados'],
    buy:['購入','Purchase','Achat','Acquisto','Kauf','Compra','购买','Compra'],
    sell:['売却','Sell','Vente','Vendita','Verkauf','Venta','出售','Venda'],
    unavailable:['価格情報なし','No price data','Prix indisponible','Prezzo non disponibile','Keine Preisdaten','Sin datos de precio','无价格数据','Sem preço'],
    loading:['読み込み中…','Loading…','Chargement…','Caricamento…','Laden…','Cargando…','加载中…','Carregando…']
  };
  const l=(key:keyof typeof words)=>words[key][langs.indexOf(locale)]??words[key][1];
  $effect(()=>{
    const id=itemId,lang=locale,open=expanded;
    if(!open)return;
    let current=true;
    loading=true;price=null;
    client??=openCurrentItemDetails(base);
    void client.then(c=>c.getItemPriceDetails([id],lang)).then(([p])=>{if(current){price=p;loading=false;}},()=>{if(current){loading=false;client=undefined;}});
    return()=>{current=false;};
  });
  const buy=$derived(price?.purchase.filter(v=>v.amountFieldPresent&&v.amount!==null&&v.currency?.name)??[]);
  const sell=$derived(price?.sell.filter(v=>v.amountFieldPresent&&v.amount!==null&&v.currency?.name)??[]);
</script>
<details ontoggle={(e)=>expanded=e.currentTarget.open}>
  <summary>{l('title')}</summary>
  {#if expanded}
    {#if loading}<p>{l('loading')}</p>
    {:else if !buy.length&&!sell.length}<p>{l('unavailable')}</p>
    {:else}
      {#each [[l('buy'),buy],[l('sell'),sell]] as pair}
        {#if typeof pair[0]==='string'&&Array.isArray(pair[1])&&pair[1].length}
          <div class="price-row"><strong>{pair[0]}</strong>{#each pair[1] as cost}<span>{cost.amount?.toLocaleString(locale)} {cost.currency?.name}</span>{/each}</div>
        {/if}
      {/each}
    {/if}
  {/if}
</details>
<AcquisitionEvidence {itemId} {locale}/>
<style>
  details{margin:6px 0;font-size:.82rem}
  summary{cursor:pointer}
  .price-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:5px}
  p{margin:4px 0}
</style>
