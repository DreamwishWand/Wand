<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import {base} from '$app/paths';
  import type {ItemMasterLocale} from './public-item-master';
  import {currentItemViewMaster} from './item-view-master';
  import {readItemProductionContext,type ItemProductionContext} from './item-page-production-context';
  import {itemEntityHref} from './entity-item-url';
  import ItemArtwork from '$lib/collection/ItemArtwork.svelte';
  export let itemId:number;
  export let locale:ItemMasterLocale;
  let active=false,sequence=0,context:ItemProductionContext|null=null;
  const labels:Record<string,readonly string[]>={
    ja:['栽培・生産','種','収穫物','成長時間','生産間隔','収穫数','水やり回数','料理材料の種類','生産設備','最大生産数','生産時間','原本設定。実際の収穫時間・入手可否は条件により異なります。','秒','分','時間','生産無効（原本設定）'],
    en:['Growing & production','Seed','Product','Growth time','Production interval','Configured yield','Waterings','Cooking ingredient type','Production machine','Maximum yield','Production time','Source configuration. Actual timing and availability depend on conditions.','s','min','h','Production disabled (source)'],
    fr:['Culture et production','Graine','Produit','Croissance','Intervalle de production','Rendement configuré','Arrosages','Type d’ingrédient','Équipement','Rendement maximal','Durée de production','Configuration source ; disponibilité et durée réelles variables.','s','min','h','Production désactivée (source)'],
    it:['Coltivazione e produzione','Seme','Prodotto','Crescita','Intervallo di produzione','Resa configurata','Annaffiature','Tipo di ingrediente','Macchinario','Resa massima','Tempo di produzione','Configurazione originale; tempi e disponibilità effettivi variabili.','s','min','h','Produzione disattivata (fonte)'],
    de:['Anbau und Produktion','Samen','Erzeugnis','Wachstumszeit','Produktionsintervall','Konfigurierter Ertrag','Gießvorgänge','Zutatentyp','Produktionsgerät','Maximaler Ertrag','Produktionsdauer','Originalkonfiguration; tatsächliche Dauer und Verfügbarkeit abhängig von Bedingungen.','s','min','h','Produktion deaktiviert (Quelle)'],
    'es-ES':['Cultivo y producción','Semilla','Producto','Crecimiento','Intervalo de producción','Rendimiento configurado','Riegos','Tipo de ingrediente','Equipo de producción','Rendimiento máximo','Tiempo de producción','Configuración original; disponibilidad y duración reales variables.','s','min','h','Producción desactivada (origen)'],
    'zh-CN':['种植与生产','种子','产物','生长时间','生产间隔','设定产量','浇水次数','烹饪食材类型','生产设备','最大产量','生产时间','原始设定，实际收获时间及可获得性取决于条件。','秒','分钟','小时','生产已禁用（原始设定）'],
    'pt-BR':['Cultivo e produção','Semente','Produto','Crescimento','Intervalo de produção','Rendimento configurado','Regas','Tipo de ingrediente','Equipamento','Rendimento máximo','Tempo de produção','Configuração original; duração e disponibilidade reais variam.','s','min','h','Produção desativada (fonte)']
  };
  $: words=labels[locale]??labels.en;
  onMount(()=>{active=true;});onDestroy(()=>{sequence++;});
  async function load(id:number,language:ItemMasterLocale){
    const ticket=++sequence;context=null;
    try{const db=await currentItemViewMaster(base);const value=await readItemProductionContext(db,id,language);if(ticket===sequence)context=value;}
    catch{/* optional source metadata; no fabricated fallback */}
  }
  $: if(active)void load(itemId,locale);
  function time(value:number,language:ItemMasterLocale,copy:readonly string[]):string{
    const parts:string[]=[];let remain=value;
    const h=Math.floor(remain/3600);remain-=h*3600;
    const m=Math.floor(remain/60);remain-=m*60;
    if(h)parts.push(h.toLocaleString(language)+copy[14]);
    if(m)parts.push(m.toLocaleString(language)+copy[13]);
    if(remain||!parts.length)parts.push(remain.toLocaleString(language,{maximumFractionDigits:3})+copy[12]);
    return parts.join(' ');
  }
</script>
{#if context&&(context.ingredientType||context.growing.length||context.machines.length)}
  <section class="production-context">
    <h2>{words[0]}</h2>
    {#if context.ingredientType}<p><strong>{words[7]}</strong> {context.ingredientType}</p>{/if}
    {#each context.growing as row (row.seed.seedItemId)}
      <div class="production-row">
        {#if row.counterpartId!==null&&row.counterpartName}
          <a class="production-link" href={itemEntityHref(base,row.counterpartId,locale)}><span class="art"><ItemArtwork itemId={row.counterpartId} alt="" allowHistoricalFallback={false}/></span><span><small>{row.seed.seedItemId===itemId?words[2]:words[1]}</small>{row.counterpartName}</span></a>
        {/if}
        {#if row.seed.producesItemField===false}<p>{words[15]}</p>{:else}
          <dl>
            {#if row.seed.growthPeriod?.configuredSeconds!=null&&row.seed.growthPeriod.configuredSeconds>=0}<dt>{words[3]}</dt><dd>{time(row.seed.growthPeriod.configuredSeconds,locale,words)}</dd>{/if}
            {#if row.seed.productionPeriod?.configuredSeconds!=null&&row.seed.productionPeriod.configuredSeconds>0}<dt>{words[4]}</dt><dd>{time(row.seed.productionPeriod.configuredSeconds,locale,words)}</dd>{/if}
            {#if row.seed.configuredYield!==null}<dt>{words[5]}</dt><dd>{row.seed.configuredYield.toLocaleString(locale)}</dd>{/if}
            {#if row.seed.wateringCount!==null}<dt>{words[6]}</dt><dd>{row.seed.wateringCount.toLocaleString(locale)}</dd>{/if}
          </dl>
        {/if}
      </div>
    {/each}
    {#each context.machines as row (row.source.machineItemId)}
      <div class="production-row">
        {#if row.name}<a class="production-link" href={itemEntityHref(base,row.source.machineItemId,locale)}><span class="art"><ItemArtwork itemId={row.source.machineItemId} alt="" allowHistoricalFallback={false}/></span><span><small>{words[8]}</small>{row.name}</span></a>{/if}
        <dl>
          {#if row.source.minimumProductionDuration?.configuredSeconds!=null&&row.source.maximumProductionDuration?.configuredSeconds!=null&&row.source.minimumProductionDuration.configuredSeconds>=0&&row.source.maximumProductionDuration.configuredSeconds>=0}
            <dt>{words[10]}</dt><dd>{time(row.source.minimumProductionDuration.configuredSeconds,locale,words)} – {time(row.source.maximumProductionDuration.configuredSeconds,locale,words)}</dd>
          {/if}
          {#if row.source.maximumProduced!==null}<dt>{words[9]}</dt><dd>{row.source.maximumProduced.toLocaleString(locale)}</dd>{/if}
        </dl>
      </div>
    {/each}
    {#if context.growing.length||context.machines.length}<small>{words[11]}</small>{/if}
  </section>
{/if}
<style>
  .production-context{margin:16px 0;min-width:0}h2{font-size:16px;margin:0 0 10px}
  .production-row{padding:8px 0;border-bottom:1px solid var(--wand-line)}
  .production-link{display:flex;align-items:center;gap:10px;color:inherit;min-width:0;text-decoration:none}
  .production-link:hover{text-decoration:underline}.production-link small{display:block}
  .art{width:56px;height:56px;flex:none;overflow:hidden}
  dl{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin:8px 0}dt,small{color:var(--wand-muted)}dd{margin:0;font-weight:600}
</style>
