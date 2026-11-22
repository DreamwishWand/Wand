<script lang="ts">
  import '../app.css';
  import '$lib/ui/shell.css';
  import '$lib/ui/themes.css';
  import {base} from '$app/paths';
  import {page} from '$app/stores';
  import {onMount,tick} from 'svelte';
  import {editHistory,historyView,type HistoryArea} from '$lib/ui/edit-history';
  import {localSaveSession,selectLocalSaveFile,closeLocalSaveFile} from '$lib/ui/local-save-session';
  import WandIcon from '$lib/ui/WandIcon.svelte';
  import {shellCopy,type TutorialKey} from '$lib/ui/shell-copy';
  import {afterNavigate} from '$app/navigation';
  import {
    UI_LANGUAGES,UI_THEMES,readWandLanguage,setWandLanguage,readWandTheme,setWandTheme,
    watchWandLanguage,type WandLanguage,type WandTheme
  } from '$lib/ui/preferences';

  let tutorialOpen=false;
  let accountOpen=false;
  let historyOpen=false;
  let historyArea:HistoryArea='collection';
  let historyButton:HTMLButtonElement|null=null;
  let historyCloseButton:HTMLButtonElement|null=null;
  let collectionBusy=false;
  let languageOpen=false;
  let saveMenuOpen=false;
  let moreOpen=false;
  let draggingFile=false;
  let dragDepth=0;
  $: selectedSave=$localSaveSession.file;
  let saveError='';
  let globalSaveInput:HTMLInputElement;
  let saveRoot:HTMLElement|null=null;
  let saveButton:HTMLButtonElement|null=null;
  let moreRoot:HTMLElement|null=null;
  let moreButton:HTMLButtonElement|null=null;
  let filesOpen=false;
  let languageRoot:HTMLElement|null=null;
  let filesRoot:HTMLElement|null=null;
  let filesButton:HTMLButtonElement|null=null;
  let helpButton:HTMLButtonElement|null=null;
  let accountButton:HTMLButtonElement|null=null;
  let uiLocale:WandLanguage='ja';
  let uiTheme:WandTheme='night';
  let languageButton:HTMLButtonElement|null=null;
  const LANGUAGE_SHORT=Object.fromEntries(UI_LANGUAGES.map(x=>[x.code,x.short]));
  function closeMenus(){saveMenuOpen=false;moreOpen=false;filesOpen=false;languageOpen=false;}
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
    if(saveMenuOpen&&!saveRoot?.contains(event.target))saveMenuOpen=false;
    if(moreOpen&&!moreRoot?.contains(event.target))moreOpen=false;
    if(filesOpen&&!filesRoot?.contains(event.target))filesOpen=false;
    if(languageOpen&&!languageRoot?.contains(event.target))languageOpen=false;
  }

  function openGlobalSavePicker():void{
    saveMenuOpen=false;
    globalSaveInput?.click();
  }
  function setSelectedSave(file:File|undefined):void{
    if(!file)return;
    const filename=file.name.toLowerCase();
    if(!/\.(profile|dat|bin|json)$/.test(filename)||file.size<1){
      saveError=copy.saveInvalid;
      return;
    }
    selectLocalSaveFile(file);saveError='';saveMenuOpen=false;
  }
  function globalSavePicked(event:Event):void{
    const input=event.currentTarget as HTMLInputElement;
    setSelectedSave(input.files?.[0]);
    input.value='';
  }
  function rawSaveBackup():void{
    if(!selectedSave)return;
    const source=URL.createObjectURL(selectedSave);
    const link=document.createElement('a');
    link.href=source;link.download='backup_'+selectedSave.name;
    document.body.append(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(source),1000);
    saveMenuOpen=false;
  }
  function closeSelectedSave():void{
    // Only the untouched File object is held in browser memory.
    closeLocalSaveFile();saveError='';saveMenuOpen=false;
  }
  function onGlobalDragEnter(event:DragEvent):void{
    if(!event.dataTransfer?.types.includes('Files'))return;
    event.preventDefault();dragDepth++;draggingFile=true;
  }
  function onGlobalDragLeave(event:DragEvent):void{
    if(!draggingFile)return;
    event.preventDefault();dragDepth=Math.max(0,dragDepth-1);
    if(dragDepth===0)draggingFile=false;
  }
  function onGlobalDragOver(event:DragEvent):void{
    if(event.dataTransfer?.types.includes('Files'))event.preventDefault();
  }
  function onGlobalDrop(event:DragEvent):void{
    if(!event.dataTransfer?.files?.length)return;
    event.preventDefault();dragDepth=0;draggingFile=false;
    setSelectedSave(event.dataTransfer.files[0]);
  }
  async function openHistory():Promise<void>{
    closeMenus();historyOpen=true;historyArea='collection';
    await tick();historyCloseButton?.focus();
  }
  function closeHistory():void{historyOpen=false;historyButton?.focus();}
  function openAccount(){closeMenus();accountOpen=true;}
  function closeAccount(){accountOpen=false;accountButton?.focus();}
  function closeTutorial(){tutorialOpen=false;helpButton?.focus();}
  afterNavigate(()=>closeMenus());
  onMount(()=>{
    window.addEventListener('pointerdown',outsideMenus);
    window.addEventListener('dragenter',onGlobalDragEnter);
    window.addEventListener('dragleave',onGlobalDragLeave);
    window.addEventListener('dragover',onGlobalDragOver);
    window.addEventListener('drop',onGlobalDrop);
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
      window.removeEventListener('dragenter',onGlobalDragEnter);
      window.removeEventListener('dragleave',onGlobalDragLeave);
      window.removeEventListener('dragover',onGlobalDragOver);
      window.removeEventListener('drop',onGlobalDrop);
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
  function focusContextSearch():boolean{
    const label=service==='collection'?'8言語のアイテム名で検索':
      service==='starpath'?'通常タスクを検索':
      service==='characters'?'キャラクター名称を検索':'クエスト名・IDを検索';
    const field=Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(
      input=>input.getAttribute('aria-label')===label&&!input.disabled);
    if(!field)return false;
    field.focus();field.scrollIntoView({block:'nearest'});
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
    const hadSave=saveMenuOpen,hadMore=moreOpen,hadFiles=filesOpen,hadLanguage=languageOpen;
    closeMenus();
    if(historyOpen)closeHistory();
    else if(tutorialOpen)closeTutorial();
    else if(accountOpen)closeAccount();
    else if(hadSave)saveButton?.focus();
    else if(hadMore)moreButton?.focus();
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
    {#if service!=='home'}<span class="shell-current">{service==='collection'?'Collection':service==='starpath'?'Star Path':service==='characters'?'Characters':service==='guide'?'Guide':service==='world'?'World':'Save'}</span>{/if}
    <div class="header-spacer"></div>
    <div class="site-actions" aria-label={copy.pageActions}>
      {#if service==='world'}
        <div class="header-context-tools" role="group" aria-label={copy.worldTools}>
          <button class="header-icon-button" type="button" on:click={openWorldSource} aria-label={copy.worldSource} title={copy.worldSource}><WandIcon name="folder" size={20}/></button>
        </div>
      {:else if service==='save'&&route.includes('/diagnostics')}
        <div class="header-context-tools" role="group" aria-label={copy.saveTools}>
          <button class="header-icon-button header-context-optional" type="button" on:click={()=>window.dispatchEvent(new Event('wand:save-clear'))} aria-label={copy.saveClear} title={copy.saveClear}><WandIcon name="close" size={20}/></button>
        </div>
      {/if}
      {#if service==='collection'}
        <div class="header-file-tools" role="group" aria-label={copy.fileTools}>
          <div class="shell-file-desktop">
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
              on:click={()=>{filesOpen=!filesOpen;moreOpen=false;languageOpen=false;}} title={copy.fileTools}>
              <WandIcon name="folder" size={19}/>
            </button>
            {#if filesOpen}
              <div class="shell-menu shell-file-menu" role="group" aria-label={copy.fileTools}>
                {#if service==='collection'}
                  <button type="button" on:click={()=>{filesOpen=false;backupCollection();}}><WandIcon name="download" size={18}/>{copy.backup}</button>
                  <button type="button" disabled={collectionBusy} on:click={()=>{filesOpen=false;restoreCollection();}}><WandIcon name="restore" size={18}/>{copy.restore}</button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}
      <button class="header-icon-button shell-history-button" bind:this={historyButton}
        type="button" aria-label={copy.history} title={copy.history} aria-expanded={historyOpen}
        on:click={()=>{void openHistory();}}>
        <WandIcon name="history" size={21}/>
      </button>
      <div class="header-save-root" bind:this={saveRoot}>
        <button class="header-icon-button shell-save-button" bind:this={saveButton} type="button"
          aria-label={selectedSave?copy.saveManager:copy.readSave}
          title={selectedSave?copy.saveManager:copy.readSave}
          aria-expanded={selectedSave?saveMenuOpen:undefined}
          on:click={()=>{if(selectedSave){saveMenuOpen=!saveMenuOpen;moreOpen=false;filesOpen=false;languageOpen=false;}else openGlobalSavePicker();}}>
          <WandIcon name={selectedSave?'save':'upload'} size={21}/>
        </button>
        {#if selectedSave&&saveMenuOpen}
          <div class="shell-menu shell-save-menu" role="group" aria-label={copy.saveManager}>
            <div class="shell-save-filename" title={selectedSave.name}><WandIcon name="save" size={18}/><span>{selectedSave.name}</span></div>
            <div class="shell-save-status">{$localSaveSession.collectionStatus==='reading'?copy.saveReading:
              $localSaveSession.collectionStatus==='parsed'?copy.saveParsed:
              $localSaveSession.collectionStatus==='invalid'?copy.saveInvalid:copy.saveNotParsed}</div>
            <div class="shell-menu-divider"></div>
            <button type="button" on:click={rawSaveBackup}><WandIcon name="download" size={18}/>{copy.saveBackupOriginal}</button>
            <button type="button" disabled title={copy.saveEditUnavailable}><WandIcon name="download" size={18}/>{copy.saveExportEdited}</button>
            <button type="button" disabled title={copy.saveEditUnavailable}><WandIcon name="edit" size={18}/>{copy.saveOpenEditor}</button>
            <button type="button" on:click={openGlobalSavePicker}><WandIcon name="folder" size={18}/>{copy.saveReplace}</button>
            <div class="shell-menu-divider"></div>
            <button type="button" on:click={closeSelectedSave}><WandIcon name="close" size={18}/>{copy.saveClose}</button>
          </div>
        {/if}
      </div>
      <div class="header-account-tools">
        <button class="header-icon-button shell-account-header" bind:this={accountButton} type="button"
          on:click={openAccount} aria-label={copy.accountOpen} title={copy.accountPreparing}><WandIcon name="character" size={20}/></button>
      </div>
      <div class="header-support-tools" role="group" aria-label={copy.support}>
        <button class="header-icon-button help-action" bind:this={helpButton} type="button"
          on:click={()=>{closeMenus();tutorialOpen=true;}} aria-label={copy.tutorialHelp} title={copy.help}><WandIcon name="help" size={20}/></button>
      </div>
      <div class="shell-more-root" bind:this={moreRoot}>
        <button class="header-icon-button" bind:this={moreButton} type="button"
          aria-label={copy.moreActions} title={copy.moreActions} aria-expanded={moreOpen}
          on:click={()=>{moreOpen=!moreOpen;saveMenuOpen=false;filesOpen=false;languageOpen=false;}}>
          <WandIcon name="ellipsis" size={21}/>
        </button>
        {#if moreOpen}
          <div class="shell-menu shell-more-menu" role="group" aria-label={copy.moreActions}>
            <button type="button" class="shell-more-history" on:click={()=>{void openHistory();}}>
              <WandIcon name="history" size={18}/>{copy.history}
            </button>
            <button type="button" on:click={()=>{moreOpen=false;tutorialOpen=true;}}><WandIcon name="help" size={18}/>{copy.help}</button>
            <button type="button" on:click={openAccount}><WandIcon name="character" size={18}/>{copy.account}</button>
            {#if service==='collection'}
              <div class="shell-menu-divider"></div>
              <button type="button" on:click={()=>{moreOpen=false;backupCollection();}}><WandIcon name="download" size={18}/>{copy.collectionBackup}</button>
              <button type="button" disabled={collectionBusy} on:click={()=>{moreOpen=false;restoreCollection();}}><WandIcon name="restore" size={18}/>{copy.collectionRestore}</button>
            {/if}
          </div>
        {/if}
      </div>
      <div class="header-preference-tools" role="group" aria-label={copy.preferences}>
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
        <div class="header-language-menu" bind:this={languageRoot}>
          <button bind:this={languageButton} class="header-icon-button header-language-button" type="button"
            aria-label={copy.languageSwitch} title={copy.languageSwitch} aria-expanded={languageOpen}
            on:click={()=>{languageOpen=!languageOpen;moreOpen=false;filesOpen=false;saveMenuOpen=false;}}>
            <WandIcon name="globe" size={19}/><span class="header-locale-code">{LANGUAGE_SHORT[uiLocale]}</span>
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
      </div>
    </div>
  </header>
  <input class="visually-hidden" bind:this={globalSaveInput} type="file"
    accept=".profile,.dat,.bin,.json,application/json,application/octet-stream"
    aria-label={copy.readSave} aria-hidden="true" tabindex="-1" on:change={globalSavePicked}/>
  {#if saveError}<div class="shell-save-error" role="alert">{saveError}<button type="button" on:click={()=>saveError=''} aria-label={copy.close}>×</button></div>{/if}
  {#if draggingFile}<div class="shell-save-drop" role="status"><WandIcon name="upload" size={44}/><span>{copy.saveDrop}</span></div>{/if}
  <main class="site-main"><slot/></main>
</div>
{#if historyOpen}
  <div class="shell-history-overlay">
    <button class="shell-history-shade" type="button" on:click={closeHistory} aria-label={copy.close}></button>
    <div class="shell-history-panel" role="dialog" aria-modal="true" aria-label={copy.history}>
      <header class="shell-history-head">
        <div><WandIcon name="history" size={21}/><strong>{copy.history}</strong></div>
        <button class="header-icon-button" type="button" bind:this={historyCloseButton}
          on:click={closeHistory} aria-label={copy.close}><WandIcon name="close" size={21}/></button>
      </header>
      <div class="shell-history-tabs" role="group" aria-label={copy.history}>
        <button type="button" class:active={historyArea==='collection'}
          aria-pressed={historyArea==='collection'}
          on:click={()=>historyArea='collection'}>{copy.historyCollection}</button>
        <button type="button" class:active={historyArea==='world'}
          aria-pressed={historyArea==='world'}
          on:click={()=>historyArea='world'}>{copy.historyWorld}</button>
      </div>
      {#if historyArea==='collection'}
        <div class="shell-history-actions">
          <button type="button" disabled={$historyView.busy||$historyView.cursor===0}
            on:click={()=>void editHistory.undo()} title={copy.historyUndo}>
            <WandIcon name="undo" size={20}/><span>{copy.historyUndo}</span>
          </button>
          <button type="button" disabled={$historyView.busy||$historyView.cursor===$historyView.entries.length}
            on:click={()=>void editHistory.redo()} title={copy.historyRedo}>
            <WandIcon name="redo" size={20}/><span>{copy.historyRedo}</span>
          </button>
        </div>
        {#if $historyView.error}
          <p class="shell-history-error" role="alert">{$historyView.error==='stale'?copy.historyStale:copy.historyFailed}</p>
        {/if}
        {#if $historyView.busy}
          <p class="shell-history-working" role="status">{copy.historyWorking}</p>
        {/if}
        <div class="shell-history-timeline">
          {#if $historyView.entries.length===0}
            <p class="shell-history-empty">{copy.historyEmpty}</p>
          {:else}
            {#each [...$historyView.entries].reverse() as entry,i (entry.id)}
              <button type="button" class="shell-history-entry"
                class:active={$historyView.cursor===$historyView.entries.length-i}
                class:undone={$historyView.cursor<$historyView.entries.length-i}
                aria-current={$historyView.cursor===$historyView.entries.length-i?'step':undefined}
                disabled={$historyView.busy}
                on:click={()=>void editHistory.travelCollection($historyView.entries.length-i)}>
                <span class="shell-history-entry-top">
                  <strong>{entry.title}</strong>
                  <time>{new Date(entry.timestamp).toLocaleTimeString(uiLocale,{hour:'2-digit',minute:'2-digit'})}</time>
                </span>
                <span class="shell-history-change">{entry.change}</span>
              </button>
            {/each}
            <button class="shell-history-entry" type="button" class:active={$historyView.cursor===0}
              aria-current={$historyView.cursor===0?'step':undefined}
              disabled={$historyView.busy}
              on:click={()=>void editHistory.travelCollection(0)}>{copy.historyInitial}</button>
          {/if}
        </div>
      {:else}
        <p class="shell-history-empty">{copy.historyUnavailable}</p>
      {/if}
    </div>
  </div>
{/if}

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
