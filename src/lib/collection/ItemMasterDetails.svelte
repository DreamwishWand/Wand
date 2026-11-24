<script lang="ts" context="module">
  import {openPublicItemMaster,type PublicItemMaster} from '$lib/items/public-item-master';

  // DB-01 owns these version-pinned, SHA-verified source shards. One index
  // and one exact-ID bucket are fetched lazily; Collection never duplicates
  // the Item ID database or fetches all 13,202 records for an inspector.
  let sharedMaster:Promise<PublicItemMaster>|null=null;
  function getItemMaster(base:string):Promise<PublicItemMaster> {
    if(sharedMaster)return sharedMaster;
    const request=openPublicItemMaster(base,fetch,{scope:'complete'});
    sharedMaster=request;
    void request.catch(()=>{if(sharedMaster===request)sharedMaster=null;});
    return request;
  }
</script>

<script lang="ts">
  import {base} from '$app/paths';
  import {onDestroy} from 'svelte';
  import type {ItemMasterLocale,ItemMasterRecord} from '$lib/items/public-item-master';
  import WandIcon from '$lib/ui/WandIcon.svelte';

  export let itemId:number;
  export let locale:string;

  let record:ItemMasterRecord|null=null;
  let requestSequence=0;
  let error=false;
  const locales=['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'] as const;
  const captions:Record<string,{tags:string;more:string;names:string;type:string;source:string}>={
    ja:{tags:'ゲーム原本のタグ',more:'原本の分類・タグ',names:'各言語の名称',type:'種類',source:'原本参照タグ。ワールドやコレクションの所属・入手可能性を示すものではありません。'},
    en:{tags:'Source tags',more:'Source type and tags',names:'Names in other languages',type:'Type',source:'Original item tags do not establish Collection/world membership or availability.'},
    fr:{tags:'Tags source',more:'Type et tags source',names:'Noms par langue',type:'Type',source:'Les tags source ne prouvent ni appartenance ni disponibilité.'},
    it:{tags:'Tag originali',more:'Tipo e tag originali',names:'Nomi nelle altre lingue',type:'Tipo',source:'I tag originali non confermano appartenenza o disponibilità.'},
    de:{tags:'Original-Tags',more:'Original-Typ und Tags',names:'Namen in anderen Sprachen',type:'Typ',source:'Original-Tags belegen keine Zugehörigkeit oder Verfügbarkeit.'},
    'es-ES':{tags:'Etiquetas de origen',more:'Tipo y etiquetas',names:'Nombres en otros idiomas',type:'Tipo',source:'Las etiquetas no confirman pertenencia ni disponibilidad.'},
    'zh-CN':{tags:'原始标签',more:'原始类型与标签',names:'多语言名称',type:'类型',source:'原始标签不代表收藏或世界归属及可获取性。'},
    'pt-BR':{tags:'Tags originais',more:'Tipo e tags originais',names:'Nomes em outros idiomas',type:'Tipo',source:'Tags originais não comprovam pertencimento ou disponibilidade.'}
  };
  $: copy=captions[locale]??captions.en;
  $: nativeType=record?.itemType.subtypeNameVerified
    ? record.itemType.subtypeName??'' : '';
  // A source-area tag is not proof of user-visible world membership.
  // Show non-area keys as browse hints; keep every original tag accessible
  // inside the optional source details without inventing translations.
  $: shortTags=(record?.tags??[]).filter(tag=>!/^is[A-Z]|^Is[A-Z]/.test(tag.key));
  $: previewTags=shortTags.slice(0,6);
  $: otherNames=record?locales.filter(lang=>
    lang!==locale&&typeof record?.names[lang]==='string'&&record.names[lang]!==record.names[locale as ItemMasterLocale]):[];
  async function load(id:number):Promise<void>{
    const current=++requestSequence;
    record=null;error=false;
    try{
      const master=await getItemMaster(base);
      const found=await master.getItem(id);
      if(current!==requestSequence)return;
      record=found?.itemId===id?found:null;
    }catch{
      if(current!==requestSequence)return;
      error=true;
    }
  }
  $: if(Number.isSafeInteger(itemId)&&itemId>0)void load(itemId);
  onDestroy(()=>{requestSequence++;});
</script>

{#if record}
  <div class="collection-item-master" data-item-id={itemId}>
    {#if nativeType}
      <div class="master-type"><WandIcon name="info" size={13}/><span>{nativeType}</span></div>
    {/if}
    {#if previewTags.length}
      <div class="master-chips" aria-label={copy.tags}>
        {#each previewTags as tag,index (index)}
          <span title={tag.key+' · '+tag.facet}>{tag.key}</span>
        {/each}
      </div>
    {/if}
    {#if record.tags.length||otherNames.length}
      <details class="master-more">
        <summary><WandIcon name="chevron" size={14}/>{copy.more}</summary>
        {#if record.tags.length}
          <p class="master-note">{copy.source}</p>
          <div class="master-chips">
            {#each record.tags as tag, index (index)}
              <span title={tag.facet}>{tag.key}</span>
            {/each}
          </div>
        {/if}
        {#if otherNames.length}
          <div class="master-names">
            <strong>{copy.names}</strong>
            <dl>
              {#each otherNames as lang}
                <dt>{lang}</dt><dd>{record.names[lang as ItemMasterLocale]}</dd>
              {/each}
            </dl>
          </div>
        {/if}
      </details>
    {/if}
  </div>
{:else if error}
  <!-- The optional DB-01 overlay must not block Collection or manual edits. -->
{/if}

<style>
  .collection-item-master{margin:8px 0 12px;font-size:11px;color:#c4b1d2}
  .master-type{display:flex;align-items:center;gap:5px;margin:0 0 7px}
  .master-chips{display:flex;flex-wrap:wrap;gap:5px}
  .master-chips span{max-width:100%;overflow-wrap:anywhere;padding:5px 7px;
    border-radius:7px;border:1px solid #ffffff23;background:#ffffff09}
  .master-more{margin-top:9px}
  .master-more summary{display:flex;align-items:center;gap:5px;cursor:pointer;
    color:inherit;list-style:none;padding:3px 0}
  .master-more summary::-webkit-details-marker{display:none}
  .master-note{line-height:1.5;color:#a698b0;font-size:10px;margin:7px 0}
  .master-names{margin-top:12px}
  .master-names dl{display:grid;grid-template-columns:50px 1fr;gap:6px 9px;
    margin:7px 0}
  .master-names dt{color:#9e8bad}
  .master-names dd{margin:0;overflow-wrap:anywhere}
</style>
