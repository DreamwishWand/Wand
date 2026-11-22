<script lang="ts">
  import '../app.css';
  import '$lib/ui/shell.css';
  import '$lib/ui/themes.css';
  import {base} from '$app/paths';
  import {page} from '$app/stores';
  import {onMount} from 'svelte';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {launcherServices} from '$lib/ui/services';
  import {shellCopy,type TutorialKey} from '$lib/ui/shell-copy';
  import {afterNavigate} from '$app/navigation';
  import {
    UI_LANGUAGES,UI_THEMES,readWandLanguage,setWandLanguage,readWandTheme,setWandTheme,
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
  let uiTheme:WandTheme='night';
  let languageButton:HTMLButtonElement|null=null;
  const LANGUAGE_SHORT=Object.fromEntries(UI_LANGUAGES.map(x=>[x.code,x.short]));
  function closeMenus(){navOpen=false;filesOpen=false;languageOpen=false;}
  function switchLanguage(code:WandLanguage){
    setWandLanguage(code);
    closeMenus();
    languageButton?.focus();
  }
  function switchTheme(next:WandTheme){
    uiTheme=next;
    setWandTheme(next);
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
  $: copy=shellCopy(uiLocale);
  $: tutorial=copy.tutorials[(service as TutorialKey)]??copy.tutorials.home;
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
    <span class="shell-brand-mark" aria-hidden="true"><img src="{base}/DreamwishWand.svg" alt="" width="34" height="34" /></span>
    <a class="header-home-button" href="{base}/" aria-label={copy.home} title={copy.home}><WandIcon name="home" size={21}/></a>
    {#if service==='home'}<span class="shell-home-brand">Dreamwish Wand</span>{/if}
    <nav class="shell-nav-root" aria-label={copy.serviceNav} bind:this={navRoot}>
      <button class="header-icon-button shell-nav-trigger" type="button" bind:this={navButton}
        aria-label={copy.switchService} title={copy.switchService} aria-expanded={navOpen}
        on:click={()=>{navOpen=!navOpen;filesOpen=false;languageOpen=false;}}>
        <WandIcon name="grid" size={19}/><span>{copy.services}</span><WandIcon name="chevron" size={14}/>
      </button>
      {#if navOpen}
        <div class="shell-menu" role="group" aria-label={copy.serviceList}>
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
                <span class="shell-menu-state">{copy.planned}</span>
              </span>
            {/if}
          {/each}
          <div class="shell-menu-divider"></div>
          <button class="shell-menu-help" type="button" on:click={()=>{closeMenus();tutorialOpen=true;}}>
            <WandIcon name="help" size={18}/><span class="shell-menu-title">{copy.help}</span>
          </button>
          <button class="shell-menu-account" type="button" on:click={openAccount}>
            <WandIcon name="character" size={18}/><span class="shell-menu-title">{copy.account}</span>
          </button>
        </div>
      {/if}
    </nav>
    <div class="shell-shortcuts" aria-label={copy.quickServices}>
      <a class="shell-shortcut" href="{base}/collection/" aria-current={service==='collection'?'page':undefined} title="Collection">
        <WandIcon name="collection" size={17}/><span>Collection</span>
      </a>
      <a class="shell-shortcut" href="{base}/guide/" aria-current={service==='guide'||service==='starpath'||service==='characters'?'page':undefined} title="Guide">
        <WandIcon name="guide" size={17}/><span>Guide</span>
      </a>
    </div>
    {#if service!=='home'}<span class="shell-current">{service==='collection'?'Collection':service==='starpath'?'Star Path':service==='characters'?'Characters':service==='guide'?'Guide':service==='world'?'World':'Save'}</span>{/if}
    <div class="header-spacer"></div>
    <div class="site-actions" aria-label={copy.pageActions}>
      {#if service==='collection'}
        <div class="header-context-tools" role="group" aria-label={copy.collectionTools}>
          <button class="header-icon-button header-context-optional" type="button" on:click={focusContextSearch} aria-label={copy.collectionSearch} title={copy.search}><WandIcon name="search" size={20}/></button>
          <button class="header-icon-button header-context-optional" type="button" on:click={()=>window.dispatchEvent(new Event('wand:collection-filters'))} aria-label={copy.filter} title={copy.filter}><WandIcon name="filter" size={20}/></button>
        </div>
      {:else if service==='starpath'||service==='characters'||route.includes('/guide/quests')}
        <div class="header-context-tools" role="group" aria-label={copy.guideTools}>
          <button class="header-icon-button" type="button" on:click={focusContextSearch} aria-label={copy.guideSearch} title={copy.search}><WandIcon name="search" size={20}/></button>
        </div>
      {:else if service==='world'}
        <div class="header-context-tools" role="group" aria-label={copy.worldTools}>
          <button class="header-icon-button" type="button" on:click={openWorldSource} aria-label={copy.worldSource} title={copy.worldSource}><WandIcon name="folder" size={20}/></button>
        </div>
      {:else if service==='save'&&route.includes('/diagnostics')}
        <div class="header-context-tools" role="group" aria-label={copy.saveTools}>
          <button class="header-icon-button header-context-optional" type="button" on:click={()=>window.dispatchEvent(new Event('wand:save-clear'))} aria-label={copy.saveClear} title={copy.saveClear}><WandIcon name="close" size={20}/></button>
        </div>
      {/if}
      {#if service==='collection'||service==='save'}
        <div class="header-file-tools" role="group" aria-label={copy.fileTools}>
          <div class="shell-file-desktop">
            <button class="header-icon-button" type="button" on:click={openSaveFile} disabled={service==='collection'&&collectionBusy}
              aria-label={copy.readSave} title={copy.readSave}>
              <WandIcon name="upload" size={20}/>
            </button>
            {#if service==='collection'}
              <button class="header-icon-button" type="button" on:click={backupCollection}
                aria-label={copy.collectionBackup} title={copy.collectionBackup}><WandIcon name="download" size={20}/></button>
              <button class="header-icon-button" type="button" on:click={restoreCollection} disabled={collectionBusy}
                aria-label={copy.collectionRestore} title={copy.collectionRestore}><WandIcon name="restore" size={20}/></button>
            {/if}
          </div>
          <div class="shell-file-mobile shell-file-root" bind:this={filesRoot}>
            <button class="header-icon-button" type="button" bind:this={filesButton}
              aria-label={copy.fileTools} aria-expanded={filesOpen}
              on:click={()=>{filesOpen=!filesOpen;navOpen=false;languageOpen=false;}} title={copy.fileTools}>
              <WandIcon name="folder" size={19}/>
            </button>
            {#if filesOpen}
              <div class="shell-menu shell-file-menu" role="group" aria-label={copy.fileTools}>
                <button type="button" disabled={service==='collection'&&collectionBusy}
                  on:click={()=>{filesOpen=false;openSaveFile();}}><WandIcon name="upload" size={18}/>{copy.readSave}</button>
                {#if service==='collection'}
                  <button type="button" on:click={()=>{filesOpen=false;backupCollection();}}><WandIcon name="download" size={18}/>{copy.backup}</button>
                  <button type="button" disabled={collectionBusy} on:click={()=>{filesOpen=false;restoreCollection();}}><WandIcon name="restore" size={18}/>{copy.restore}</button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}
      <div class="header-preference-tools" role="group" aria-label={copy.preferences}>
        <div class="header-language-menu" bind:this={languageRoot}>
          <button bind:this={languageButton} class="header-icon-button header-language-button" type="button"
            aria-label={copy.languageSwitch} title={copy.languageSwitch} aria-expanded={languageOpen}
            on:click={()=>{languageOpen=!languageOpen;navOpen=false;filesOpen=false;}}>
            <WandIcon name="languages" size={19}/><span class="header-locale-code">{LANGUAGE_SHORT[uiLocale]}</span>
          </button>
          {#if languageOpen}
            <div class="language-popover" role="group" aria-label={copy.languageList}>
              {#each UI_LANGUAGES as item (item.code)}
                <button type="button" class:chosen={uiLocale===item.code}
                  aria-pressed={uiLocale===item.code} on:click={()=>switchLanguage(item.code)}>
                  <span>{item.label}</span>{#if uiLocale===item.code}<WandIcon name="check" size={17}/>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="shell-theme-options" role="group" aria-label={copy.themeSelect}>
          {#each UI_THEMES as item (item.code)}
            <button class="header-icon-button shell-theme-option" type="button"
              class:active={uiTheme===item.code}
              aria-label={copy.themes[item.code]} title={copy.themes[item.code]}
              aria-pressed={uiTheme===item.code}
              on:click={()=>switchTheme(item.code)}>
              <WandIcon name={item.icon} size={22}/>
            </button>
          {/each}
        </div>
      </div>
      <div class="header-support-tools" role="group" aria-label={copy.support}>
        <button class="header-icon-button help-action" bind:this={helpButton} type="button"
          on:click={()=>{closeMenus();tutorialOpen=true;}} aria-label={copy.tutorialHelp} title={copy.help}><WandIcon name="help" size={20}/></button>
        <button class="header-icon-button shell-account-header" bind:this={accountButton} type="button"
          on:click={openAccount} aria-label={copy.accountOpen} title={copy.accountPreparing}><WandIcon name="character" size={20}/></button>
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
          aria-label={copy.tutorialClose}><WandIcon name="close" size={22}/></button>
      </header>
      <ol class="tutorial-steps">
        {#each tutorial.steps as step,i (i)}
          <li><span>{i+1}</span><p>{step}</p></li>
        {/each}
      </ol>
      <button type="button" class="tutorial-done" on:click={()=>tutorialOpen=false}>{copy.close}</button>
    </div>
  </div>
{/if}

{#if accountOpen}
  <div class="tutorial-backdrop">
    <div class="tutorial-dialog" role="dialog" aria-modal="true" aria-label={copy.account}>
      <header class="tutorial-top">
        <div><WandIcon name="character" size={24}/><h2>{copy.account}</h2></div>
        <button type="button" class="header-icon-button" on:click={closeAccount} aria-label={copy.close}><WandIcon name="close" size={22}/></button>
      </header>
      <p class="header-account-info">{copy.accountInfo}</p>
      <button type="button" class="tutorial-done" on:click={()=>accountOpen=false}>{copy.close}</button>
    </div>
  </div>
{/if}
