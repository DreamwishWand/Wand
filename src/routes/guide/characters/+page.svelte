<script lang="ts">
  import {onMount} from 'svelte';
  import {base} from '$app/paths';
  import {watchWandLanguage,type WandLanguage} from '$lib/ui/preferences';
  import {autoAppend} from '$lib/ui/auto-append';
  import {collectWindow} from '$lib/ui/collect-window.mjs';
  import {verifyPublicQuestIndex,formatPublicGuideText} from '$lib/guide/public-guide.ts';
  import {
    derivePublicGuideCharacters,sourceCharacterName,filterPublicGuideCharacters,
    findPublicCharacterByLink,
    type PublicCharacterDirectory,type PublicCharacterEntry,type PublicCharacterQuest
  } from '$lib/guide/public-characters.ts';

  let directory:PublicCharacterDirectory|null=null;
  let selected:PublicCharacterEntry|null=null;
  let loading=true;
  let error='';
  let locale:WandLanguage='ja';
  let query='';
  let mode:'all'|'withQuests'|'withoutQuests'='all';
  let limit=48;
  $: filtered=directory?collectWindow((offset:number,batch:number)=>filterPublicGuideCharacters(directory!,{
    query:query.slice(0,120),locale,mode,offset,limit:batch
  }),limit,'rows'):{total:0,rows:[]};
  $: linkedQuests=selected?[...selected.quests].sort((a:PublicCharacterQuest,b:PublicCharacterQuest)=>
    (a.names?.[locale]||a.names?.en||a.id).localeCompare(
      b.names?.[locale]||b.names?.en||b.id,locale==='ja'?'ja':'en')):[];

  function questName(quest:PublicCharacterQuest){
    return formatPublicGuideText(quest.names?.[locale]||quest.names?.en||quest.id);
  }
  function selectCharacter(row:PublicCharacterEntry,updateAddress=true){
    selected=row;
    if(updateAddress){
      const url=new URL(window.location.href);
      if(url.searchParams.getAll('character').length!==1||
        url.searchParams.get('character')!==row.id){
        url.searchParams.set('character',row.id);
        window.history.pushState(window.history.state,'',url);
      }
    }
  }
  function restoreAddress(){
    if(!directory)return;
    selected=findPublicCharacterByLink(directory,window.location.search);
  }
  async function load(){
    loading=true;error='';
    try{
      const res=await fetch(`${base}/guide/public/quest-index.json`);
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const index=verifyPublicQuestIndex(await res.json());
      directory=derivePublicGuideCharacters(index);
      restoreAddress();
    }catch(e){error=e instanceof Error?e.message:String(e)}
    finally{loading=false}
  }
  onMount(()=>{
    const unwatch=watchWandLanguage(next=>{locale=next;limit=48;});
    window.addEventListener('popstate',restoreAddress);
    void load();
    return ()=>{unwatch();window.removeEventListener('popstate',restoreAddress);};
  });
</script>

<svelte:head>
  <title>キャラクター名称索引 | Dreamwish Wand</title>
  <meta name="description" content="Disney Dreamlight Valleyの原本由来のキャラクター関連名称142件と、直接関連付けられたクエストを8言語で検索できます。" />
</svelte:head>

<main class="character-guide">
  <header>
    <div class="eyebrow">DREAMWISH WAND · GUIDE</div>
    <h1>キャラクター名称索引</h1>
    <p>Steam v1.26.2のクエスト原本と照合した名称・関連クエストの索引です。保存ファイルやゲームのインストールは必要ありません。</p>
    <p class="note">ここにある名称にはNPC・オブジェクト・内部仮名称が含まれます。登場、解放、所持、居住、DLC所有、実際の進捗を示す一覧ではありません。</p>
  </header>
  {#if loading}
    <p role="status">原本由来の名称を照合しています…</p>
  {:else if error}
    <p role="alert" class="error">索引を読み込めませんでした：{error}</p>
    <button class="retry" on:click={load}>再読み込み</button>
  {:else if directory}
    <div class="counts" aria-label="索引の対象件数">
      <span><strong>{directory.counts.labels}</strong> 件の名称</span>
      <span><strong>{directory.counts.withLinkedQuests}</strong> 件にクエスト関連付けあり</span>
      <span><strong>{directory.counts.withoutLinkedQuests}</strong> 件に直接関連付けなし</span>
    </div>
    <div class="controls">
      <label>名前・IDで検索
        <input type="search" aria-label="キャラクター名称を検索" bind:value={query} maxlength="120" on:input={()=>limit=48} placeholder="日本語・English・ID" />
      </label>
      <label>クエスト関連付け
        <select aria-label="関連クエストで絞り込み" bind:value={mode} on:change={()=>limit=48}>
          <option value="all">すべて</option>
          <option value="withQuests">あり</option>
          <option value="withoutQuests">なし（この索引内）</option>
        </select>
      </label>
    </div>
    <div class="workspace">
      <section class="characters" aria-label="原本の名称一覧">
        <p class="match-count">{filtered.total} 件の名称が一致</p>
        {#each filtered.rows as row (row.id)}
          <button class:active={selected?.id===row.id} class="person" aria-pressed={selected?.id===row.id}
            on:click={()=>selectCharacter(row)}>
            <strong>{sourceCharacterName(row,locale)}</strong>
            <small>ID {row.id} · 直接関連クエスト {row.quests.length} 件{row.internal?' · 内部表記':''}</small>
          </button>
        {/each}
        {#if filtered.total===0}<p class="empty">一致する名称はありません。</p>{/if}
        {#if filtered.total>limit}
          <div class="auto-sentinel" use:autoAppend={{hasMore:()=>filtered.total>limit,load:()=>limit+=48}} role="status" aria-label="スクロールでキャラクターを追加表示"></div>
        {/if}
      </section>
      <section class="details" aria-label="関連クエスト">
        {#if selected}
          <div class="detail-head">
            <small>ゲーム原本の名称ID {selected.id}</small>
            <h2>{sourceCharacterName(selected,locale)}</h2>
            <a class="permalink" href={`${base}/guide/characters/?character=${selected.id}`}>この名称への直接リンク</a>
          </div>
          {#if selected.internal}
            <p class="warning">原本に仮名称・翻訳指示の内部マーカーがあります。正式なキャラクター表示名と断定できません。</p>
          {/if}
          <p class="related-count">このクエスト索引で直接関連付けられたクエスト：{selected.quests.length} 件</p>
          {#if linkedQuests.length}
            <ul class="linked">
              {#each linkedQuests as quest (quest.id)}
                <li><a href={`${base}/guide/quests/?quest=${quest.id}`}>
                  <strong>{questName(quest)}</strong>
                  <small>クエストID {quest.id}</small>
                </a></li>
              {/each}
            </ul>
          {:else}
            <p class="empty">この索引には直接関連付けられたクエストがありません。ゲーム内にクエストが存在しないことを意味しません。</p>
          {/if}
        {:else}
          <p class="empty">左の一覧から名称を選択すると、原本で直接関連付けられたクエストを表示します。</p>
        {/if}
      </section>
    </div>
  {/if}
  <footer>
    <a href={`${base}/guide/quests/`}>クエストガイドへ</a>
    <p>733件の公開クエスト索引と同じ原本を参照しています。キャラクターを操作・解放する機能ではありません。コンテンツは各権利者に帰属します。</p>
  </footer>
</main>

<style>
  .character-guide{max-width:1260px;margin:auto;padding:28px 24px 82px;color:var(--wand-text)}
  header h1{font-size:clamp(27px,4vw,40px);margin:10px 0}
  header>p{font-size:14px;color:var(--wand-text);line-height:1.65;max-width:850px}
  .eyebrow{font-size:11px;letter-spacing:.17em;color:var(--wand-muted);font-weight:700}
  .note{font-size:12px!important;color:var(--wand-muted)!important}
  .counts{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0;font-size:12px;color:var(--wand-muted)}
  .counts strong{font-size:21px;color:var(--wand-muted)}
  .controls{display:grid;grid-template-columns:2fr 1fr 1.25fr;gap:11px;margin:17px 0}
  .controls label{display:grid;gap:7px;font-size:12px;color:var(--wand-text)}
  .controls input,.controls select{min-width:0;width:100%;box-sizing:border-box;background:var(--wand-control);border:1px solid var(--wand-line);color:var(--wand-text);border-radius:9px;padding:11px;font:inherit}
  .workspace{display:grid;grid-template-columns:minmax(260px,1fr) minmax(0,1.5fr);align-items:start;gap:15px}
  .characters,.details{min-width:0;background:var(--wand-surface);border:1px solid var(--wand-line);border-radius:14px;padding:15px}
  .match-count{font-size:12px;color:var(--wand-muted);margin:0 3px 8px}
  button{cursor:pointer}
  .person{display:flex;width:100%;flex-direction:column;align-items:start;gap:5px;padding:13px;border:1px solid transparent;border-radius:9px;color:var(--wand-text);background:transparent;text-align:left;overflow-wrap:anywhere}
  .person:hover,.person.active{background:var(--wand-selected);border-color:var(--wand-selected-line)}
  .person strong{font-size:14px}.person small{font-size:11px;color:var(--wand-muted)}
  .retry{width:100%;padding:12px;background:var(--wand-surface-raised);border:1px solid var(--wand-line);border-radius:9px;color:var(--wand-text)}.auto-sentinel{height:18px}
  .details{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow:auto}
  .detail-head{border-bottom:1px solid var(--wand-line);padding-bottom:15px}
  .detail-head h2{font-size:22px;margin:9px 0;overflow-wrap:anywhere}
  .detail-head small,.related-count{font-size:12px;color:var(--wand-muted)}
  .permalink{font-size:12px;color:var(--wand-link)}
  .warning{font-size:12px;color:var(--wand-warning);line-height:1.7}
  .linked{list-style:none;display:grid;gap:8px;padding:0}
  .linked a{display:grid;gap:4px;background:var(--wand-surface-raised);color:var(--wand-link);border:1px solid var(--wand-line);padding:11px 12px;border-radius:9px;text-decoration:none}
  .linked a:hover{border-color:var(--wand-selected-line)}
  .linked strong{font-size:13px}.linked small{font-size:11px;color:var(--wand-muted)}
  .empty{font-size:13px;color:var(--wand-muted);line-height:1.65;padding:16px 4px}
  .error{color:var(--wand-danger)}footer{margin-top:30px;font-size:12px;color:var(--wand-muted)}
  footer a{color:var(--wand-muted)}
  @media(max-width:850px){.workspace{grid-template-columns:1fr}.details{position:static;max-height:none}.controls{grid-template-columns:1fr 1fr}}
  @media(max-width:520px){.character-guide{padding:18px 13px 70px}.controls{grid-template-columns:1fr}}
</style>
