<script lang="ts">
  import '../app.css';
  import {base} from '$app/paths';
  import {page} from '$app/stores';
  import {onMount} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';

  let tutorialOpen=false;
  let collectionBusy=false;
  onMount(()=>{
    const update=(event:Event)=>collectionBusy=Boolean((event as CustomEvent<boolean>).detail);
    window.addEventListener('wand:collection-busy',update);
    return()=>window.removeEventListener('wand:collection-busy',update);
  });
  $: route=$page.url.pathname.replace(/\/+$/,'')||'/';
  $: service=route.includes('/collection')?'collection':
    route.includes('/guide/star-path')?'starpath':
    route.includes('/guide/characters')?'characters':
    route.includes('/guide')?'guide':
    route.includes('/world')?'world':
    route.includes('/save')?'save':'home';
  $: tutorial=({
    home:{title:'Wandの使い方',steps:['カードを選ぶと各サービスへ移動します。','利用可能なサービスは明るく、開発中のサービスは選択できません。','Collectionはセーブなしでも利用できます。']},
    collection:{title:'Collection',steps:['アイテムを検索するかカテゴリを選択します。下へスクロールすると続きを自動表示します。','アイテムを選んで所持状況・お気に入り・所持数を記録できます。','ヘッダーの読み込みからセーブを選択すると、確認できた発見・所持状態が手動記録に優先されます。','ヘッダーからCollection記録をバックアップ・復元できます。元のゲームセーブは変更しません。']},
    guide:{title:'Guide',steps:['クエスト・キャラクターを検索します。長い一覧はスクロールで自動表示します。','項目を選ぶと詳細を確認できます。公開データはセーブなしで閲覧できます。']},
    characters:{title:'Characters',steps:['キャラクターを検索・絞り込みます。','キャラクターを選択して関連クエストを確認します。']},
    starpath:{title:'Star Path',steps:['シーズンとタスク・報酬のタブを選択します。','検索で対象を絞り、下へスクロールすると追加のタスクを表示します。']},
    world:{title:'World（原本プレビュー）',steps:['ゲーム原本から抽出したZIPを端末内で読み込みます。','地域・レイアウトを選ぶと初期配置の参照を確認できます。原本の記録はプレイヤーの所有証明ではありません。']},
    save:{title:'Save（開発用）',steps:['ヘッダーの読み込みでセーブを選択します。','診断と変更プレビューは開発用です。完成したセーブ書き換え機能ではありません。','元ファイルを変更せず端末内で処理します。']}
  } as Record<string,{title:string;steps:string[]}>)[service];
  const links=[
    {href:'/collection/',name:'Collection',icon:'collection'},
    {href:'/guide/quests/',name:'Guide',icon:'guide'},
    {href:'/guide/star-path/',name:'Star Path',icon:'star'},
    {href:'/world/preview/',name:'World',icon:'world'}
  ];
  function openSaveFile(){
    const label=service==='collection'?'DDVのセーブファイルを選択':
      route.includes('/diagnostics')?'DDVセーブまたは復号済みJSONを選択':'検証用セーブファイル';
    const inputs=Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    inputs.find(input=>input.getAttribute('aria-label')===label && !input.disabled)?.click();
  }
  function backupCollection(){window.dispatchEvent(new Event('wand:collection-backup'));}
  function restoreCollection(){
    document.querySelector<HTMLInputElement>('input[aria-label="Collectionバックアップを選択"]')?.click();
  }
</script>
<svelte:window on:keydown={(event:KeyboardEvent)=>{if(event.key==='Escape')tutorialOpen=false;}}/>
<div class="site-shell">
  <header class="site-header">
    <a class="brand" href="{base}/" aria-label="Dreamwish Wand ホーム">
      <span class="brand-mark"><WandIcon name="sparkles" size={21}/></span>
      <span class="brand-text">Dreamwish <strong>Wand</strong></span>
    </a>
    <nav aria-label="サービス" class="site-nav">
      {#each links as link (link.href)}
        <a class="nav-link" href="{base}{link.href}" class:active={route===link.href.replace(/\/+$/,'')}
          aria-current={route===link.href.replace(/\/+$/,'')?'page':undefined}
          title={link.name}>
          <WandIcon name={link.icon} size={19}/><span>{link.name}</span>
        </a>
      {/each}
    </nav>
    <div class="site-actions" aria-label="ページ操作">
      {#if service==='collection'||service==='save'}
        <button class="header-icon-button" type="button" on:click={openSaveFile} disabled={service==='collection'&&collectionBusy}
          aria-label="セーブファイルを読み込む" title="セーブファイルを読み込む">
          <WandIcon name="upload" size={21}/>
        </button>
      {/if}
      {#if service==='collection'}
        <button class="header-icon-button" type="button" on:click={backupCollection}
          aria-label="Collectionバックアップ出力" title="Collectionバックアップ出力">
          <WandIcon name="download" size={21}/>
        </button>
        <button class="header-icon-button" type="button" on:click={restoreCollection} disabled={collectionBusy}
          aria-label="Collectionバックアップ復元" title="Collectionバックアップ復元">
          <WandIcon name="restore" size={21}/>
        </button>
      {/if}
      <button class="header-icon-button help-action" type="button" on:click={()=>tutorialOpen=true}
        aria-label="このページのチュートリアル" title="このページのチュートリアル">
        <WandIcon name="help" size={22}/>
      </button>
    </div>
  </header>
  <main class="site-main"><slot/></main>
  {#if service==='home'}
    <footer class="site-footer">Unofficial fan project · Not affiliated with Disney or Gameloft.</footer>
  {/if}
</div>
{#if tutorialOpen}
  <div class="tutorial-backdrop">
    <div class="tutorial-dialog" role="dialog" aria-modal="true" aria-label={tutorial.title}>
      <header class="tutorial-top">
        <div><WandIcon name="help" size={24}/><h2>{tutorial.title}</h2></div>
        <button type="button" class="header-icon-button" on:click={()=>tutorialOpen=false}
          aria-label="チュートリアルを閉じる"><WandIcon name="close" size={22}/></button>
      </header>
      <ol class="tutorial-steps">
        {#each tutorial.steps as step,i (i)}
          <li><span>{i+1}</span><p>{step}</p></li>
        {/each}
      </ol>
      <button type="button" class="tutorial-done" on:click={()=>tutorialOpen=false}>閉じる</button>
    </div>
  </div>
{/if}
