<script lang="ts">
  import '../app.css';
  import {base} from '$app/paths';
  import {page} from '$app/stores';
  import {onMount} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {WAND_LOCALES, readWandLocale, changeWandLocale, onWandLocaleChange, type WandLocale} from '$lib/ui/wand-locale';

  type Modal = 'tutorial'|'account'|null;
  type Theme = 'violet'|'midnight';
  let modal:Modal=null;
  let languageOpen=false;
  let locale:WandLocale='ja';
  let theme:Theme='violet';
  let collectionBusy=false;

  onMount(()=>{
    locale=readWandLocale();
    document.documentElement.lang=locale;
    const stored=(()=>{try{return window.localStorage.getItem('dreamwishwand.ui.theme.v1')}catch{return null}})();
    theme=stored==='midnight'?'midnight':'violet';
    const stopLocale=onWandLocaleChange(next=>locale=next);
    const updateBusy=(event:Event)=>collectionBusy=Boolean((event as CustomEvent<boolean>).detail);
    const closeLanguage=(event:MouseEvent)=>{
      const target=event.target;
      if(target instanceof Node && !document.querySelector('.header-language-wrap')?.contains(target))languageOpen=false;
    };
    window.addEventListener('wand:collection-busy',updateBusy);
    window.addEventListener('click',closeLanguage);
    return()=>{
      stopLocale();
      window.removeEventListener('wand:collection-busy',updateBusy);
      window.removeEventListener('click',closeLanguage);
    };
  });

  $: route=$page.url.pathname.replace(/\/+$/,'')||'/';
  $: service=route.includes('/collection')?'collection':
    route.includes('/guide/star-path')?'starpath':
    route.includes('/guide/characters')?'characters':
    route.includes('/guide')?'guide':
    route.includes('/world')?'world':
    route.includes('/save')?'save':'home';
  $: tutorial=({
    home:{title:'Wandの使い方',steps:['6つの主要サービスから目的のカードを選択します。','開発中のサービスは選択できません。','Collectionと公開Guideはログインやセーブなしで利用できます。']},
    collection:{title:'Collection',steps:['アイテムを検索するかカテゴリを選択します。下へスクロールすると続きを自動表示します。','アイテムの所持状況・お気に入り・所持数を記録できます。','ヘッダーのセーブボタンで読み込むと、検証された所持・発見状況が手動記録に優先されます。','ヘッダーのバックアップ・復元を利用できます。元のゲームセーブは変更しません。']},
    guide:{title:'Guide',steps:['クエスト、イベントやキャラクターを選択します。','クエストは検索でき、長い一覧はスクロールで自動表示します。','公開ガイドの閲覧にセーブファイルは必要ありません。']},
    characters:{title:'Characters',steps:['キャラクターを検索・絞り込みます。','キャラクターを選択すると関連クエストを確認できます。']},
    starpath:{title:'Star Path',steps:['シーズンとタスク・報酬のタブを選択します。','検索で対象を絞ることができます。','ゲーム原本キャッシュの情報は現在のオンライン開催状況の保証ではありません。']},
    world:{title:'World（原本プレビュー）',steps:['ヘッダーのフォルダーアイコンからゲーム原本の抽出ZIPを選択します。','地域・レイアウトを選ぶと初期配置や地形の参考情報を確認できます。','現在は読み取り専用で、配置変更やセーブ書き戻しはできません。']},
    save:{title:'Save（開発用）',steps:['ヘッダーのセーブボタンからローカルファイルを選択します。','現在は読み取り専用の診断です。セーブの編集・書き出しは未完成です。','解析はブラウザー内で行い、元ファイルは変更しません。']}
  } as Record<string,{title:string;steps:string[]}>)[service];

  const links=[
    {href:'',name:'Decorate',icon:'palette'},
    {href:'/collection/',name:'Collection',icon:'collection'},
    {href:'/guide/',name:'Guide',icon:'guide'},
    {href:'',name:'Presets',icon:'sparkles'},
    {href:'',name:'Gallery',icon:'gallery'},
    {href:'',name:'DreamSnaps',icon:'camera'}
  ];

  function openSaveFile(){
    const label=service==='collection'?'DDVのセーブファイルを選択':'DDVセーブまたは復号済みJSONを選択';
    const input=Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
      .find(item=>item.getAttribute('aria-label')===label&&!item.disabled);
    input?.click();
  }
  function backupCollection(){window.dispatchEvent(new Event('wand:collection-backup'));}
  function restoreCollection(){
    document.querySelector<HTMLInputElement>('input[aria-label="Collectionバックアップを選択"]:not(:disabled)')?.click();
  }
  function toolbarSearch(){
    const target=service==='collection'?'8言語のアイテム名で検索':
      service==='starpath'?'通常タスクを検索':
      service==='characters'?'キャラクター名称を検索':'クエスト名・IDを検索';
    const input=document.querySelector<HTMLInputElement>(`input[aria-label="${target}"]`);
    input?.focus();
    input?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function switchTheme(){
    theme=theme==='violet'?'midnight':'violet';
    try{window.localStorage.setItem('dreamwishwand.ui.theme.v1',theme)}catch{/* Private mode */}
  }
  function chooseLocale(value:string){
    changeWandLocale(value);
    languageOpen=false;
  }
  function openWorldZip(){
    document.querySelector<HTMLInputElement>('.world-preview input[type="file"][accept*=".zip"]:not(:disabled)')?.click();
  }
</script>
<svelte:window on:keydown={(event:KeyboardEvent)=>{
  if(event.key==='Escape'){modal=null;languageOpen=false;}
}}/>
<div class="site-shell" data-theme={theme}>
  <header class="site-header">
    <a class="brand" href="{base}/" aria-label="Dreamwish Wand ホーム">
      <span class="brand-mark"><WandIcon name="sparkles" size={21}/></span>
      <span class="brand-text">Dreamwish <strong>Wand</strong></span>
    </a>
    <nav aria-label="サービス" class="site-nav">
      {#each links as link (link.name)}
        {#if link.href}
          <a class="nav-link" href="{base}{link.href}"
            class:active={link.name==='Guide'?route.startsWith('/guide'):route===link.href.replace(/\/+$/,'')}
            aria-current={(link.name==='Guide'?route.startsWith('/guide'):route===link.href.replace(/\/+$/,''))?'page':undefined}
            title={link.name}>
            <WandIcon name={link.icon} size={19}/><span>{link.name}</span>
          </a>
        {:else}
          <span class="nav-link unavailable" aria-label={link.name+'（開発中）'} aria-disabled="true" title={link.name+'（開発中）'}>
            <WandIcon name={link.icon} size={19}/><span>{link.name}</span>
          </span>
        {/if}
      {/each}
    </nav>
    <div class="site-actions" aria-label="ページ操作">
      {#if service==='collection'}
        <div class="header-context-tools" role="group" aria-label="Collection ツールバー">
          <button class="header-icon-button toolbar-optional" type="button" on:click={toolbarSearch} title="Collectionを検索" aria-label="Collectionを検索"><WandIcon name="search" size={20}/></button>
          <button class="header-icon-button toolbar-optional" type="button" on:click={()=>window.dispatchEvent(new Event('wand:collection-filters'))} title="フィルターを切り替え" aria-label="絞り込みを切り替える"><WandIcon name="filter" size={20}/></button>
          <button class="header-icon-button" type="button" on:click={backupCollection} title="Collectionバックアップ" aria-label="Collectionバックアップ出力"><WandIcon name="download" size={20}/></button>
          <button class="header-icon-button" type="button" on:click={restoreCollection} disabled={collectionBusy} title="Collectionを復元" aria-label="Collectionバックアップ復元"><WandIcon name="restore" size={20}/></button>
        </div>
      {:else if (service==='guide' && route.includes('/quests')) || service==='starpath' || service==='characters'}
        <div class="header-context-tools" role="group" aria-label="Guide ツールバー">
          <button class="header-icon-button" type="button" on:click={toolbarSearch} title="このページを検索" aria-label="Guideを検索"><WandIcon name="search" size={20}/></button>
        </div>
      {:else if service==='world'}
        <div class="header-context-tools" role="group" aria-label="World ツールバー">
          <button class="header-icon-button" type="button" on:click={openWorldZip} title="WorldのローカルZIPを開く" aria-label="World原本ZIPを開く"><WandIcon name="folder" size={20}/></button>
        </div>
      {:else if service==='save' && route.includes('/diagnostics')}
        <div class="header-context-tools" role="group" aria-label="Save ツールバー">
          <button class="header-icon-button" type="button" on:click={()=>window.dispatchEvent(new Event('wand:save-clear'))} title="診断内容を破棄" aria-label="Save診断をクリア"><WandIcon name="trash" size={20}/></button>
        </div>
      {/if}
      <span class="header-tool-divider" aria-hidden="true"></span>
      {#if service==='collection' || service==='save' && route.includes('/diagnostics')}
        <button class="header-icon-button" type="button" on:click={openSaveFile} disabled={service==='collection'&&collectionBusy}
          aria-label="セーブファイルを読み込む" title="セーブファイルを読み込む"><WandIcon name="save" size={20}/></button>
      {:else}
        <a class="header-icon-button" href="{base}/save/diagnostics/" aria-label="セーブファイルを開く（開発用診断）" title="セーブファイルを開く"><WandIcon name="save" size={20}/></a>
      {/if}
      <button class="header-icon-button help-action" type="button" on:click={()=>modal='tutorial'}
        aria-label="このページのチュートリアル" title="このページのチュートリアル"><WandIcon name="help" size={21}/></button>
      <button class="header-icon-button" type="button" on:click={switchTheme}
        aria-label={theme==='violet'?'ミッドナイトテーマに切り替え':'バイオレットテーマに切り替え'}
        title={theme==='violet'?'テーマ: バイオレット':'テーマ: ミッドナイト'}
        aria-pressed={theme==='midnight'}><WandIcon name={theme==='violet'?'moon':'sun'} size={20}/></button>
      <div class="header-language-wrap">
        <button class="header-icon-button" type="button" on:click={()=>languageOpen=!languageOpen}
          aria-label="表示言語を切り替える" title="表示言語: {locale}" aria-expanded={languageOpen} aria-controls="wand-language-menu">
          <WandIcon name="language" size={20}/>
        </button>
        {#if languageOpen}
          <div id="wand-language-menu" class="header-language-menu" role="group" aria-label="表示言語">
            {#each WAND_LOCALES as option (option.id)}
              <button type="button" class:current={locale===option.id} aria-pressed={locale===option.id}
                on:click={()=>chooseLocale(option.id)}>{option.name}{#if locale===option.id}<WandIcon name="check" size={16}/>{/if}</button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="header-icon-button" type="button" on:click={()=>modal='account'}
        aria-label="ログイン・アカウント" title="ログイン・アカウント"><WandIcon name="account" size={20}/></button>
    </div>
  </header>
  <main class="site-main"><slot/></main>
  {#if service==='home'}
    <footer class="site-footer">Unofficial fan project · Not affiliated with Disney or Gameloft.</footer>
  {/if}
</div>
{#if modal==='tutorial'}
  <div class="tutorial-backdrop">
    <div class="tutorial-dialog" role="dialog" aria-modal="true" aria-label={tutorial.title}>
      <header class="tutorial-top">
        <div><WandIcon name="help" size={24}/><h2>{tutorial.title}</h2></div>
        <button type="button" class="header-icon-button" on:click={()=>modal=null}
          aria-label="チュートリアルを閉じる"><WandIcon name="close" size={22}/></button>
      </header>
      <ol class="tutorial-steps">
        {#each tutorial.steps as step,i (i)}
          <li><span>{i+1}</span><p>{step}</p></li>
        {/each}
      </ol>
      <button type="button" class="tutorial-done" on:click={()=>modal=null}>閉じる</button>
    </div>
  </div>
{:else if modal==='account'}
  <div class="tutorial-backdrop">
    <div class="tutorial-dialog" role="dialog" aria-modal="true" aria-label="アカウント">
      <header class="tutorial-top">
        <div><WandIcon name="account" size={24}/><h2>アカウント</h2></div>
        <button type="button" class="header-icon-button" on:click={()=>modal=null}
          aria-label="アカウントを閉じる"><WandIcon name="close" size={22}/></button>
      </header>
      <p class="header-account-description">ログイン機能は準備中です。現在のCollectionの手動記録はこの端末に保存され、ログインせずに利用できます。セーブファイルもサーバーへ送信しません。</p>
      <button type="button" class="tutorial-done" on:click={()=>modal=null}>閉じる</button>
    </div>
  </div>
{/if}
