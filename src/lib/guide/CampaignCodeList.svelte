<script lang="ts">
 import {onMount} from 'svelte';
 import {OFFICIAL_CAMPAIGNS} from '../acquisition/official-campaigns.ts';
 import {campaignCodeEntries,type CodeWindowState} from './campaign-code-view.ts';
 import {announcementCopy} from './community-announcement-copy.ts';
 import type {Announcement} from './community-announcements.ts';
 import type {WandLanguage} from '$lib/ui/preferences.ts';
 export let language:WandLanguage;
 export let community:readonly Announcement[]=[];
 export let share:()=>void;
 let now=0,showEnded=false,copied='',copyError=false;
 onMount(()=>{now=Date.now();const timer=setInterval(()=>now=Date.now(),60000);return ()=>clearInterval(timer);});
 const labels:Record<WandLanguage,readonly string[]>={
 ja:['コピー','コピー済み','コピー失敗','公式発表','利用者報告','公式発表では無期限','公開期間内','開始前','掲載期限経過','有効性未確認','終了済みを表示','公式発表・利用者報告を表示しています。実際の引き換え可否は未確認です。'],
 en:['Copy','Copied','Copy failed','Official publication','Community report','No expiry stated by publisher','Within published period','Scheduled','Published deadline passed','Validity unverified','Show ended','Official publications and community reports; actual redemption is unverified.'],
 fr:['Copier','Copié','Échec de copie','Publication officielle','Signalement communautaire','Sans expiration annoncée','Dans la période publiée','À venir','Date limite passée','Validité non vérifiée','Afficher les codes terminés','Publications officielles et signalements ; utilisation non vérifiée.'],
 it:['Copia','Copiato','Copia non riuscita','Pubblicazione ufficiale','Segnalazione community','Nessuna scadenza annunciata','Nel periodo pubblicato','In arrivo','Scadenza superata','Validità non verificata','Mostra scaduti','Pubblicazioni e segnalazioni; riscatto non verificato.'],
 de:['Kopieren','Kopiert','Kopieren fehlgeschlagen','Offizielle Meldung','Community-Meldung','Offiziell ohne Ablauf','Im veröffentlichten Zeitraum','Geplant','Frist abgelaufen','Gültigkeit ungeprüft','Abgelaufene anzeigen','Offizielle Meldungen und Community-Berichte; Einlösung ungeprüft.'],
 'es-ES':['Copiar','Copiado','Error al copiar','Publicación oficial','Informe comunitario','Sin caducidad anunciada','Dentro del periodo publicado','Próximamente','Plazo publicado vencido','Validez sin verificar','Mostrar caducados','Publicaciones e informes; canje sin verificar.'],
 'zh-CN':['复制','已复制','复制失败','官方公告','社区报告','官方声明无期限','在公告期间内','尚未开始','公告期限已过','有效性未验证','显示已结束','官方公告和社区报告；实际兑换未验证。'],
 'pt-BR':['Copiar','Copiado','Falha ao copiar','Publicação oficial','Relato da comunidade','Sem expiração anunciada','Dentro do período publicado','Agendado','Prazo publicado encerrado','Validade não verificada','Mostrar encerrados','Publicações e relatos; resgate não verificado.']
 };
 $: words=labels[language];
 $: copy=announcementCopy(language);
 $: states=({'no-expiry-published':words[5],'within-published-window':words[6],scheduled:words[7],ended:words[8],unknown:words[9]}) satisfies Record<CodeWindowState,string>;
 $: entries=now?campaignCodeEntries(OFFICIAL_CAMPAIGNS,community,now):[];
 $: visible=entries.filter(row=>showEnded||row.state!=='ended');
 async function copyCode(code:string){
  copyError=false;copied='';
  try{await navigator.clipboard.writeText(code);copied=code;}catch{copyError=true;}
 }
</script>
<section class="campaign-codes" aria-label={copy.kinds.code}>
 <header><h3>{copy.kinds.code}</h3><button type="button" on:click={share}>{copy.share}</button></header>
 <p>{words[11]}</p>
 <label class="ended"><input type="checkbox" bind:checked={showEnded}/>{words[10]}</label>
 <div class="codes">
  {#each visible as entry (entry.code)}
   <article>
    <div class="code"><strong>{entry.code}</strong><button type="button" disabled={entry.state==='ended'||entry.state==='scheduled'} on:click={()=>copyCode(entry.code)} aria-label={words[0]+' '+entry.code}>{copied===entry.code?words[1]:words[0]}</button></div>
    <small>{states[entry.state]} · {entry.sourceKind==='official'?words[3]:words[4]}</small>
    {#if entry.end}<small>{copy.end}: <time datetime={entry.end}>{entry.end}</time></small>{/if}
    {#if entry.rewards.length}
     <ul>{#each entry.rewards as reward}<li>{reward.name}{#if reward.quantity!==null} × {reward.quantity}{/if}</li>{/each}</ul>
    {/if}
    {#if entry.sourceUrl}<a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">{copy.source}</a>{/if}
   </article>
  {/each}
 </div>
 {#if copyError}<p role="alert">{words[2]}</p>{:else if copied}<p class="sr-only" role="status">{words[1]}</p>{/if}
</section>
<style>
 .campaign-codes{display:grid;gap:8px;margin-top:12px;border-top:1px solid var(--wand-line);padding-top:12px}
 header,.code{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
 h3{font-size:15px;margin:0}p,small,label{font-size:12px;color:var(--wand-muted);margin:0}
 .ended{display:flex;align-items:center;gap:6px}
 .codes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:8px}
 article{display:grid;gap:5px;align-content:start;min-width:0;background:var(--wand-menu);border:1px solid var(--wand-line);border-radius:8px;padding:10px;overflow-wrap:anywhere}
 button{font:inherit;font-size:12px;color:var(--wand-text);background:var(--wand-bg);border:1px solid var(--wand-line);border-radius:6px;padding:6px 9px;cursor:pointer}
 button:disabled{opacity:.5;cursor:default}a{font-size:12px;color:var(--wand-accent);width:fit-content}ul{padding-left:18px;margin:3px 0;font-size:12px}
 .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style>
