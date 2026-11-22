<script lang="ts">
  import '../app.css';
  import '$lib/ui/shell.css';
  import {base} from '$app/paths';
  import {page} from '$app/stores';
  import {onMount} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {launcherServices} from '$lib/ui/services';
  import {afterNavigate} from '$app/navigation';
  import {
    UI_LANGUAGES,readWandLanguage,setWandLanguage,readWandTheme,setWandTheme,
    watchWandLanguage,type WandLanguage,type WandTheme
  } from '$lib/ui/preferences';

  let tutorialOpen=false;
  let accountOpen=false;
  let collectionBusy=false;
  let languageOpen=false;
  let navOpen=false;
  let filesOpen=false;
  let navRoot:HTMLElement|null=null;
  let languageRoot:HTMLElement|null=null;
  let filesRoot:HTMLElement|null=null;
  let navButton:HTMLButtonElement|null=null;
  let filesButton:HTMLButtonElement|null=null;
  let helpButton:HTMLButtonElement|null=null;
  let accountButton:HTMLButtonElement|null=null;
  let uiLocale:WandLanguage='ja';
  let uiTheme:WandTheme='dark';
  let languageButton:HTMLButtonElement|null=null;
  const LANGUAGE_SHORT=Object.fromEntries(UI_LANGUAGES.map(x=>[x.code,x.short]));
  function closeMenus(){navOpen=false;filesOpen=false;languageOpen=false;}
  function switchLanguage(code:WandLanguage){
    setWandLanguage(code);
    closeMenus();
    languageButton?.focus();
  }
  function switchTheme(){
    uiTheme=uiTheme==='dark'?'light':'dark';
    setWandTheme(uiTheme);
  }
  function outsideMenus(event:PointerEvent){
    if(!(event.target instanceof Node))return;
    if(navOpen&&!navRoot?.contains(event.target))navOpen=false;
    if(filesOpen&&!filesRoot?.contains(event.target))filesOpen=false;
    if(languageOpen&&!languageRoot?.contains(event.target))languageOpen=false;
  }
  function openAccount(){closeMenus();accountOpen=true;}
  function closeAccount(){accountOpen=false;accountButton?.focus();}
  function closeTutorial(){tutorialOpen=false;helpButton?.focus();}
  afterNavigate(()=>closeMenus());
  onMount(()=>{
    window.addEventListener('pointerdown',outsideMenus);
    const update=(event:Event)=>collectionBusy=Boolean((event as CustomEvent<boolean>).detail);
    window.addEventListener('wand:collection-busy',update);
    const unwatch=watchWandLanguage(value=>uiLocale=value);
    // Apply the stored preferences to the DOM before any user action.
    setWandLanguage(readWandLanguage());
    uiTheme=readWandTheme();
    setWandTheme(uiTheme);
    return()=>{
      window.removeEventListener('wand:collection-busy',update);
      window.removeEventListener('pointerdown',outsideMenus);
      unwatch();
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
    home:{title:'Wandの使い方',steps:['利用するサービスのタイルを選びます。','準備中のタイルは選択できません。','左上のサービスメニューから利用可能な画面に移動できます。','Collectionはセーブなしでも利用できます。']},
    collection:{title:'Collection',steps:['アイテムを検索するかカテゴリを選択します。下へスクロールすると続きを自動表示します。','アイテムを選んで所持状況・お気に入り・所持数を記録できます。','ヘッダーの読み込みからセーブを選択すると、確認できた発見・所持状態が手動記録に優先されます。','ヘッダーからCollection記録をバックアップ・復元できます。元のゲームセーブは変更しません。']},
    guide:{title:'Guide',steps:['クエスト・キャラクターを検索します。長い一覧はスクロールで自動表示します。','項目を選ぶと詳細を確認できます。公開データはセーブなしで閲覧できます。']},
    characters:{title:'Characters',steps:['キャラクターを検索・絞り込みます。','キャラクターを選択して関連クエストを確認します。']},
    starpath:{title:'Star Path',steps:['シーズンとタスク・報酬のタブを選択します。','検索で対象を絞り、下へスクロールすると追加のタスクを表示します。']},
    world:{title:'World（原本プレビュー）',steps:['ゲーム原本から抽出したZIPを端末内で読み込みます。','地域・レイアウトを選ぶと初期配置の参照を確認できます。原本の記録はプレイヤーの所有証明ではありません。']},
    save:{title:'Save（開発用）',steps:['ヘッダーの読み込みでセーブを選択します。','診断と変更プレビューは開発用です。完成したセーブ書き換え機能ではありません。','元ファイルを変更せず端末内で処理します。']}
  } as Record<string,{title:string;steps:string[]}>)[service];
  function openSaveFile(){
    const label=service==='collection'?'DDVのセーブファイルを選択':
      route.includes('/diagnostics')?'DDVセーブまたは復号済みJSONを選択':'検証用セーブファイル';
    const inputs=Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    inputs.find(input=>input.getAttribute('aria-label')===label && !input.disabled)?.click();
  }
  function focusContextSearch():boolean{
    const label=service==='collection'?'8言語のアイテム名で検索':
      service==='starpath'?'通常タスクを検索':
      service==='characters'?'キャラクター名称を検索':'クエスト名・IDを検索';
    const field=Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
      input=>input.getAttribute('aria-label')===label && !input.disabled);
    if(!field)return false;
    field.focus();
    field.scrollIntoView({block:'nearest'});
    return true;
  }
  function openWorldSource(){
    document.querySelector<HTMLInputElement>('.world-preview input[type="file"][accept*=".zip"]:not(:disabled)')?.click();
  }
  function backupCollection(){window.dispatchEvent(new Event('wand:collection-backup'));}
  function restoreCollection(){
    document.querySelector<HTMLInputElement>('input[aria-label="Collectionバックアップを選択"]')?.click();
  }
</script>
<svelte:window on:keydown={(event:KeyboardEvent)=>{
  if(event.key==='Escape'){
    const hadNav=navOpen,hadFiles=filesOpen,hadLanguage=languageOpen;
    closeMenus();
    if(tutorialOpen)closeTutorial();
    else if(accountOpen)closeAccount();
    else if(hadNav)navButton?.focus();
    else if(hadFiles)filesButton?.focus();
    else if(hadLanguage)languageButton?.focus();
  }
  if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.repeat
    &&!(event.target instanceof HTMLInputElement)
    &&!(event.target instanceof HTMLTextAreaElement)
    &&!(event.target instanceof HTMLSelectElement)
    &&!(event.target instanceof HTMLElement&&event.target.isContentEditable)){
    if(focusContextSearch())event.preventDefault();
  }
}}/>
<div class="site-shell">
  <header class="site-header">
    <a class="header-home-button" href="{base}/" aria-label="ホームへ戻る" title="ホームへ戻る"><WandIcon name="home" size={21}/></a>
    {#if service==='home'}<span class="shell-home-brand">Dreamwish Wand</span>{/if}
    <nav class="shell-nav-root" aria-label="サービスナビゲーション" bind:this={navRoot}>
      <button class="header-icon-button shell-nav-trigger" type="button" bind:this={navButton}
        aria-label="サービスを切り替える" title="サービスを切り替える" aria-expanded={navOpen}
        on:click={()=>{navOpen=!navOpen;filesOpen=false;languageOpen=false;}}>
        <WandIcon name="grid" size={19}/><span>サービス</span><WandIcon name="chevron" size={14}/>
      </button>
      {#if navOpen}
        <div class="shell-menu" role="group" aria-label="サービス一覧">
          <a href="{base}/" aria-current={service==='home'?'page':undefined} on:click={closeMenus}>
            <WandIcon name="home" size={18}/><span class="shell-menu-title">Home</span>
          </a>
          <div class="shell-menu-divider"></div>
          {#each launcherServices as destination (destination.key)}
            {#if destination.href}
              <a href="{base}{destination.href}" aria-current={service===destination.key||route.startsWith(destination.href)?'page':undefined} on:click={closeMenus}>
                <WandIcon name={destination.icon} size={18}/><span class="shell-menu-title">{destination.name}</span>
              </a>
            {:else}
              <span class="shell-unavailable" aria-disabled="true">
                <WandIcon name={destination.icon} size={18}/><span class="shell-menu-title">{destination.name}</span>
                <span class="shell-menu-state">準備中</span>
              </span>
            {/if}
          {/each}
          <div class="shell-menu-divider"></div>
          <button class="shell-menu-account" type="button" on:click={openAccount}>
            <WandIcon name="character" size={18}/><span class="shell-menu-title">アカウント</span>
          </button>
        </div>
      {/if}
    </nav>
    <div class="shell-shortcuts" aria-label="よく使うサービス">
      <a class="shell-shortcut" href="{base}/collection/" aria-current={service==='collection'?'page':undefined} title="Collection">
        <WandIcon name="collection" size={17}/><span>Collection</span>
      </a>
      <a class="shell-shortcut" href="{base}/guide/" aria-current={service==='guide'||service==='starpath'||service==='characters'?'page':undefined} title="Guide">
        <WandIcon name="guide" size={17}/><span>Guide</span>
      </a>
    </div>
    {#if service!=='home'}<span class="shell-current">{service==='collection'?'Collection':service==='starpath'?'Star Path':service==='characters'?'Characters':service==='guide'?'Guide':service==='world'?'World':'Save'}</span>{/if}
    <div class="header-spacer"></div>
    <div class="site-actions" aria-label="ページ操作">
      {#if service==='collection'}
        <div class="header-context-tools" role="group" aria-label="Collectionツールバー">
          <button class="header-icon-button header-context-optional" type="button" on:click={focusContextSearch} aria-label="Collectionを検索" title="検索"><WandIcon name="search" size={20}/></button>
          <button class="header-icon-button header-context-optional" type="button" on:click={()=>window.dispatchEvent(new Event('wand:collection-filters'))} aria-label="絞り込みを切り替える" title="絞り込み"><WandIcon name="filter" size={20}/></button>
        </div>
      {:else if service==='starpath'||service==='characters'||route.includes('/guide/quests')}
        <div class="header-context-tools" role="group" aria-label="Guideツールバー">
          <button class="header-icon-button" type="button" on:click={focusContextSearch} aria-label="ガイドを検索" title="このページを検索"><WandIcon name="search" size={20}/></button>
        </div>
      {:else if service==='world'}
        <div class="header-context-tools" role="group" aria-label="Worldツールバー">
          <button class="header-icon-button" type="button" on:click={openWorldSource} aria-label="World原本ZIPを開く" title="World原本ZIPを開く"><WandIcon name="folder" size={20}/></button>
        </div>
      {:else if service==='save'&&route.includes('/diagnostics')}
        <div class="header-context-tools" role="group" aria-label="Saveツールバー">
          <button class="header-icon-button header-context-optional" type="button" on:click={()=>window.dispatchEvent(new Event('wand:save-clear'))} aria-label="Save診断結果を破棄" title="診断結果を破棄"><WandIcon name="close" size={20}/></button>
        </div>
      {/if}
      {#if service==='collection'||service==='save'}
        <div class="header-file-tools" role="group" aria-label="ファイル操作">
          <div class="shell-file-desktop">
            <button class="header-icon-button" type="button" on:click={openSaveFile} disabled={service==='collection'&&collectionBusy}
              aria-label="セーブファイルを読み込む" title="セーブファイルを読み込む">
              <WandIcon name="upload" size={20}/>
            </button>
            {#if service==='collection'}
              <button class="header-icon-button" type="button" on:click={backupCollection}
                aria-label="Collectionバックアップ出力" title="Collectionバックアップ出力"><WandIcon name="download" size={20}/></button>
              <button class="header-icon-button" type="button" on:click={restoreCollection} disabled={collectionBusy}
                aria-label="Collectionバックアップ復元" title="Collectionバックアップ復元"><WandIcon name="restore" size={20}/></button>
            {/if}
          </div>
          <div class="shell-file-mobile shell-file-root" bind:this={filesRoot}>
            <button class="header-icon-button" type="button" bind:this={filesButton}
              aria-label="ファイル操作を開く" aria-expanded={filesOpen}
              on:click={()=>{filesOpen=!filesOpen;navOpen=false;languageOpen=false;}} title="ファイル操作">
              <WandIcon name="folder" size={19}/>
            </button>
            {#if filesOpen}
              <div class="shell-menu shell-file-menu" role="group" aria-label="ファイル操作">
                <button type="button" disabled={service==='collection'&&collectionBusy}
                  on:click={()=>{filesOpen=false;openSaveFile();}}><WandIcon name="upload" size={18}/>セーブファイルを読み込む</button>
                {#if service==='collection'}
                  <button type="button" on:click={()=>{filesOpen=false;backupCollection();}}><WandIcon name="download" size={18}/>バックアップ</button>
                  <button type="button" disabled={collectionBusy} on:click={()=>{filesOpen=false;restoreCollection();}}><WandIcon name="restore" size={18}/>復元</button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}
      <div class="header-preference-tools" role="group" aria-label="表示設定">
        <div class="header-language-menu" bind:this={languageRoot}>
          <button bind:this={languageButton} class="header-icon-button header-language-button" type="button"
            aria-label="表示言語を切り替える" title="表示言語を切り替える" aria-expanded={languageOpen}
            on:click={()=>{languageOpen=!languageOpen;navOpen=false;filesOpen=false;}}>
            <WandIcon name="languages" size={19}/><span class="header-locale-code">{LANGUAGE_SHORT[uiLocale]}</span>
          </button>
          {#if languageOpen}
            <div class="language-popover" role="group" aria-label="表示言語">
              {#each UI_LANGUAGES as item (item.code)}
                <button type="button" class:chosen={uiLocale===item.code}
                  aria-pressed={uiLocale===item.code} on:click={()=>switchLanguage(item.code)}>
                  <span>{item.label}</span>{#if uiLocale===item.code}<WandIcon name="check" size={17}/>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="header-icon-button" type="button" on:click={switchTheme}
          aria-label="テーマを切り替える" title={uiTheme==='dark'?'ライトテーマへ':'ダークテーマへ'}>
          <WandIcon name={uiTheme==='dark'?'sun':'moon'} size={19}/>
        </button>
      </div>
      <div class="header-support-tools" role="group" aria-label="ヘルプとアカウント">
        <button class="header-icon-button help-action" bind:this={helpButton} type="button"
          on:click={()=>{closeMenus();tutorialOpen=true;}} aria-label="このページのチュートリアル" title="ヘルプ"><WandIcon name="help" size={20}/></button>
        <button class="header-icon-button shell-account-header" bind:this={accountButton} type="button"
          on:click={openAccount} aria-label="ログイン・アカウント" title="ログイン・アカウント（準備中）"><WandIcon name="character" size={20}/></button>
      </div>
    </div>
  </header>
  <main class="site-main"><slot/></main>
</div>
{#if tutorialOpen}
  <div class="tutorial-backdrop">
    <div class="tutorial-dialog" role="dialog" aria-modal="true" aria-label={tutorial.title}>
      <header class="tutorial-top">
        <div><WandIcon name="help" size={24}/><h2>{tutorial.title}</h2></div>
        <button type="button" class="header-icon-button" on:click={closeTutorial}
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

{#if accountOpen}
  <div class="tutorial-backdrop">
    <div class="tutorial-dialog" role="dialog" aria-modal="true" aria-label="アカウント">
      <header class="tutorial-top">
        <div><WandIcon name="character" size={24}/><h2>アカウント</h2></div>
        <button type="button" class="header-icon-button" on:click={closeAccount} aria-label="アカウント画面を閉じる"><WandIcon name="close" size={22}/></button>
      </header>
      <p class="header-account-info">ログイン機能は準備中です。Collectionの記録は現在の端末に保存されます。セーブファイルをサーバーへ送信することなく利用できます。</p>
      <button type="button" class="tutorial-done" on:click={()=>accountOpen=false}>閉じる</button>
    </div>
  </div>
{/if}
