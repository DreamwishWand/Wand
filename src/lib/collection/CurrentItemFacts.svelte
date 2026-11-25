<script lang="ts">
  import {base} from '$app/paths';
  import {onDestroy} from 'svelte';
  import {ITEM_MASTER_LOCALES,type ItemMasterLocale} from '$lib/items/public-item-master.ts';
  import {loadCompleteCollection} from './db01-complete-catalog.ts';
  import {readCollectionItemFacts,type CollectionItemFacts} from './current-item-facts.ts';
  import {collectionDb01AcquisitionLabel} from './db01-browse-labels.ts';
  import ItemArtwork from './ItemArtwork.svelte';
  export let itemId:number;
  export let locale:string;
  let open=false;
  let facts:CollectionItemFacts|null=null;
  let error=false;
  let loading=false;
  let sequence=0;
  const languages=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
  const labels=[
    ['入手・レシピ・価格','Acquisition, recipes & prices','Obtention, recettes et prix','Acquisizione, ricette e prezzi','Erhalt, Rezepte und Preise','Obtención, recetas y precios','获取、配方与价格','Obtenção, receitas e preços'],
    ['購入価格（原本設定）','Configured purchase price','Prix d’achat configuré','Prezzo d’acquisto configurato','Konfigurierter Kaufpreis','Precio de compra configurado','原始购买价格','Preço de compra configurado'],
    ['売却価格（原本設定）','Configured sell price','Prix de vente configuré','Prezzo di vendita configurato','Konfigurierter Verkaufspreis','Precio de venta configurado','原始出售价格','Preço de venda configurado'],
    ['レシピ','Recipes','Recettes','Ricette','Rezepte','Recetas','配方','Receitas'],
    ['入手元','Sources','Sources','Fonti','Quellen','Fuentes','来源','Fontes'],
    ['シリーズ','Series','Série','Serie','Serie','Serie','系列','Série'],
    ['一部の情報は未確認です','Some details are unavailable','Certaines données sont indisponibles','Alcuni dati non sono disponibili','Einige Angaben fehlen','Algunos datos no están disponibles','部分信息未确认','Alguns dados estão indisponíveis'],
    ['不明','Unknown','Inconnu','Sconosciuto','Unbekannt','Desconocido','未知','Desconhecido'],
    ['原本の設定・候補。現在の販売・入手可否は未確認。','Source configuration/candidates; current availability is unverified.','Configuration source ; disponibilité non vérifiée.','Configurazione originale; disponibilità non verificata.','Originalkonfiguration; Verfügbarkeit nicht bestätigt.','Configuración original; disponibilidad no verificada.','原始设定；当前可获得性未确认。','Configuração original; disponibilidade não verificada.'],
    ['キャッシュ値','Cached value','Valeur en cache','Valore in cache','Cachewert','Valor en caché','缓存值','Valor em cache'],
    ['読み込み中','Loading','Chargement','Caricamento','Laden','Cargando','加载中','Carregando'],
    ['再試行','Retry','Réessayer','Riprova','Erneut versuchen','Reintentar','重试','Tentar novamente'],
    ['関連する原本タグ','Source tags','Tags source','Tag originali','Original-Tags','Etiquetas originales','原始标签','Etiquetas originais']
  ];
  function t(n:number,l:string){return labels[n][languages.indexOf(l)]??labels[n][1];}
  function fmt(n:number,l:string){return n.toLocaleString(l);}
  async function load(id:number,l:string){
    const request=++sequence;facts=null;error=false;loading=true;
    try{
      const master=(await loadCompleteCollection(base)).master;
      const lang=ITEM_MASTER_LOCALES.includes(l as ItemMasterLocale)?l as ItemMasterLocale:'en';
      const result=await readCollectionItemFacts(master,id,lang);
      if(request===sequence)facts=result;
    }catch{if(request===sequence)error=true;}
    finally{if(request===sequence)loading=false;}
  }
  $: if(open)void load(itemId,locale);
  $: tags=[...new Set(facts?.taxonomy?.tags.flatMap(row=>row.identity?.name?[row.identity.name]:[])??[])];
  $: sourceNames=[...new Set([
    ...(facts?.sources?.indexed.filter(row=>row.evidence.category!==null).map(row=>row.identity?.name)??[]),
    ...(facts?.sources?.additional.map(row=>row.identity?.name)??[])
  ].filter((name):name is string=>Boolean(name)))];
  $: purchase=facts?.prices?.purchase.filter(row=>row.amount!==null&&row.amountFieldPresent&&row.currency?.name)??[];
  $: sell=facts?.prices?.sell.filter(row=>row.amount!==null&&row.amountFieldPresent&&row.currency?.name)??[];
  onDestroy(()=>{sequence++;});
</script>
<details class="inspector-details collection-current-facts" on:toggle={event=>open=event.currentTarget.open}>
  <summary>{t(0,locale)}</summary>
  {#if open}
    {#if loading}<p role="status">{t(10,locale)}</p>
    {:else if error}<p role="alert">{t(6,locale)} <button type="button" on:click={()=>void load(itemId,locale)}>{t(11,locale)}</button></p>
    {:else if facts}
      {#if facts.taxonomy?.sourceSet?.name}<p><strong>{t(5,locale)}:</strong> {facts.taxonomy.sourceSet.name}</p>{/if}
      {#if tags.length}<div class="fact-tags" aria-label={t(12,locale)}>{#each tags as tag}<span>{tag}</span>{/each}</div>{/if}
      {#if facts.sources?.effectiveCategories.length||sourceNames.length}
        <h4>{t(4,locale)}</h4>
        <div class="fact-tags">{#each facts.sources?.effectiveCategories??[] as category}<span>{collectionDb01AcquisitionLabel(locale,category)}</span>{/each}</div>
        {#each sourceNames as name}<p>{name}</p>{/each}
      {/if}
      {#each [{rows:purchase,label:t(1,locale)},{rows:sell,label:t(2,locale)}] as section}
        {#if section.rows.length}
          <h4>{section.label}</h4>
          {#each section.rows as row}
            <div class="fact-price"><span class="fact-icon"><ItemArtwork itemId={row.currencyItemId}/></span>
              <span>{fmt(row.amount!,locale)} {row.currency?.name}{row.source==='dynamic_cache'?' · '+t(9,locale):''}</span></div>
          {/each}
        {/if}
      {/each}
      {#if facts.recipes.length}
        <h4>{t(3,locale)}</h4>
        {#each facts.recipes as recipe (recipe.recipeId)}
          <div class="fact-recipe" data-recipe-kind={recipe.kind}>
            {#each recipe.ingredients as part}
              <div class="fact-ingredient">
                {#if part.kind==='item'}
                  <span class="fact-icon"><ItemArtwork itemId={part.itemId}/></span>
                  <span>{facts.names.get(part.itemId)??t(7,locale)}</span>
                {:else if part.kind==='ingredient_type'}
                  <span>{facts.names.get(part.tagId)??t(7,locale)}</span>
                {:else}
                  <span>{(part.kind==='item_alternatives'?part.itemIds:part.tagIds).map(id=>facts?.names.get(id)??t(7,locale)).join(part.kind==='item_alternatives'?' / ':' + ')}</span>
                {/if}
                <span class="fact-quantity">×{part.quantity}</span>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
      <p class="fact-note">{t(8,locale)}{facts.partial?' '+t(6,locale):''}</p>
    {/if}
  {/if}
</details>
<style>
  .collection-current-facts{font-size:12px;color:var(--wand-text)}
  h4{font-size:12px;margin:8px 0 4px}
  p{margin:4px 0}
  .fact-tags{display:flex;gap:4px;flex-wrap:wrap}
  .fact-tags span{border:1px solid var(--wand-line);padding:2px 5px;border-radius:4px}
  .fact-price,.fact-ingredient{display:flex;align-items:center;gap:5px;min-height:25px}
  .fact-icon{width:24px;height:24px;flex:none}
  .fact-quantity{margin-left:auto;white-space:nowrap}
  .fact-recipe{border-bottom:1px solid var(--wand-line);padding:4px 0}
  .fact-note{font-size:10px;color:var(--wand-muted);line-height:1.4}
</style>
