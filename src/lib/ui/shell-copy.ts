import type {WandLanguage,WandTheme} from './preferences';

/** Shell-owned copy. Game item names are sourced separately from versioned DB records. */
export type TutorialKey='home'|'collection'|'guide'|'characters'|'starpath'|'world'|'save';
export type ShellCopy={
  home:string;services:string;switchService:string;serviceNav:string;serviceList:string;
  quickServices:string;pageActions:string;preferences:string;themeSelect:string;support:string;
  collectionTools:string;guideTools:string;worldTools:string;saveTools:string;
  fileTools:string;languageSwitch:string;languageList:string;account:string;
  accountOpen:string;accountPreparing:string;accountInfo:string;
  help:string;tutorialHelp:string;tutorialClose:string;close:string;
  readSave:string;collectionBackup:string;collectionRestore:string;
  saveManager:string;saveNotParsed:string;saveBackupOriginal:string;
  saveExportEdited:string;saveEditUnavailable:string;saveOpenEditor:string;
  saveReplace:string;saveClose:string;saveInvalid:string;saveDrop:string;moreActions:string;
  backup:string;restore:string;worldSource:string;collectionSearch:string;
  guideSearch:string;search:string;filter:string;saveClear:string;planned:string;
  themes:Record<WandTheme,string>;
  tutorials:Record<TutorialKey,{title:string;steps:string[]}>;
};
export const SHELL_COPY={
ja:{
  home:'ホームへ戻る',services:'サービス',switchService:'サービスを切り替える',serviceNav:'サービスナビゲーション',serviceList:'サービス一覧',
  quickServices:'よく使うサービス',pageActions:'ページ操作',preferences:'表示設定',themeSelect:'テーマを選択',support:'ヘルプとアカウント',
  collectionTools:'Collectionツールバー',guideTools:'Guideツールバー',worldTools:'Worldツールバー',saveTools:'Saveツールバー',
  fileTools:'ファイル操作',languageSwitch:'表示言語を切り替える',languageList:'表示言語',account:'アカウント',
  accountOpen:'ログイン・アカウント',accountPreparing:'ログイン・アカウント（準備中）',accountInfo:'ログイン機能は準備中です。Collectionの記録は現在の端末に保存されます。セーブファイルをサーバーへ送信することなく利用できます。',
  help:'ヘルプ',tutorialHelp:'このページのチュートリアル',tutorialClose:'チュートリアルを閉じる',close:'閉じる',
  readSave:'セーブファイルを読み込む',collectionBackup:'Collectionバックアップ出力',collectionRestore:'Collectionバックアップ復元',
  backup:'バックアップ',restore:'復元',worldSource:'World原本ZIPを開く',collectionSearch:'Collectionを検索',
  guideSearch:'ガイドを検索',search:'検索',filter:'絞り込み',saveClear:'診断結果を破棄',planned:'準備中',
  saveManager:"セーブファイル管理",
  saveNotParsed:"ファイルを選択済み（未解析・未編集）",
  saveBackupOriginal:"原本をバックアップ",
  saveExportEdited:"編集済みセーブを出力",
  saveEditUnavailable:"セーブ編集・書き出し機能はまだ利用できません",
  saveOpenEditor:"セーブエディターを開く",
  saveReplace:"別のセーブを選択",
  saveClose:"ファイルを閉じる",
  saveInvalid:"対応するセーブファイルを選択してください",
  saveDrop:"ここにセーブファイルをドロップ",
  moreActions:"その他の操作",
  themes:{dawn:'黄昏の日の出',coral:'太陽に照らされた透き通るサンゴ礁',night:'魔法の夜空'},
  tutorials:{
    home:{title:'Wandの使い方',steps:['利用するサービスのタイルを選びます。','準備中のタイルは選択できません。','ホームボタンでサービス一覧へ戻れます。','Collectionはセーブなしでも利用できます。']},
    collection:{title:'Collection',steps:['アイテムを検索するかカテゴリを選択します。下へスクロールすると続きを自動表示します。','アイテムを選んで所持状況・お気に入り・所持数を記録できます。','ヘッダーの読み込みからセーブを選択すると、確認できた発見・所持状態が手動記録に優先されます。','ヘッダーからCollection記録をバックアップ・復元できます。元のゲームセーブは変更しません。']},
    guide:{title:'Guide',steps:['クエスト・キャラクターを検索します。長い一覧はスクロールで自動表示します。','項目を選ぶと詳細を確認できます。公開データはセーブなしで閲覧できます。']},
    characters:{title:'Characters',steps:['キャラクターを検索・絞り込みます。','キャラクターを選択して関連クエストを確認します。']},
    starpath:{title:'Star Path',steps:['シーズンとタスク・報酬のタブを選択します。','検索で対象を絞り、下へスクロールすると追加のタスクを表示します。']},
    world:{title:'World（原本プレビュー）',steps:['ゲーム原本から抽出したZIPを端末内で読み込みます。','地域・レイアウトを選ぶと初期配置の参照を確認できます。原本の記録はプレイヤーの所有証明ではありません。']},
    save:{title:'Save（開発用）',steps:['ヘッダーの読み込みでセーブを選択します。','診断と変更プレビューは開発用です。完成したセーブ書き換え機能ではありません。','元ファイルを変更せず端末内で処理します。']}
  }
},
en:{
  home:'Go to home',services:'Services',switchService:'Switch service',serviceNav:'Service navigation',serviceList:'All services',
  quickServices:'Quick access',pageActions:'Page actions',preferences:'Display preferences',themeSelect:'Choose theme',support:'Help and account',
  collectionTools:'Collection toolbar',guideTools:'Guide toolbar',worldTools:'World toolbar',saveTools:'Save toolbar',
  fileTools:'File actions',languageSwitch:'Change display language',languageList:'Display language',account:'Account',
  accountOpen:'Sign in or manage account',accountPreparing:'Sign in and account (coming soon)',accountInfo:'Sign-in is coming soon. Collection records are stored on this device. Save files stay in your browser and are not uploaded to a server.',
  help:'Help',tutorialHelp:'Help for this page',tutorialClose:'Close tutorial',close:'Close',
  readSave:'Open save file',collectionBackup:'Export Collection backup',collectionRestore:'Restore Collection backup',
  backup:'Backup',restore:'Restore',worldSource:'Open World source ZIP',collectionSearch:'Search Collection',
  guideSearch:'Search Guide',search:'Search',filter:'Filters',saveClear:'Discard diagnostic results',planned:'Coming soon',
  saveManager:"Save file",
  saveNotParsed:"File selected (not yet parsed or edited)",
  saveBackupOriginal:"Back up original",
  saveExportEdited:"Export edited save",
  saveEditUnavailable:"Save editing and export are not yet available",
  saveOpenEditor:"Open Save Editor",
  saveReplace:"Choose another save",
  saveClose:"Close file",
  saveInvalid:"Select a supported save file",
  saveDrop:"Drop a save file here",
  moreActions:"More actions",
  themes:{dawn:'Soft lavender sunrise',coral:'Sunlit coral reef',night:'Magical night sky'},
  tutorials:{
    home:{title:'Using Wand',steps:['Choose a service tile.','Unavailable tiles cannot be opened.','Use Home to return to the service list.','Collection works without a save file.']},
    collection:{title:'Collection',steps:['Search for items or choose a category. Scroll to load more.','Select an item to record ownership, favorites or quantity.','Loading a save file takes precedence over manual discovery and ownership records when verified.','Back up or restore Collection records from the header. Your original game save is never modified.']},
    guide:{title:'Guide',steps:['Search quests and characters. Scroll to load more.','Select an entry for details. Public data can be viewed without a save file.']},
    characters:{title:'Characters',steps:['Search or filter characters.','Select a character to see related quests.']},
    starpath:{title:'Star Path',steps:['Choose a season and the tasks or rewards tab.','Search to filter entries and scroll to load more tasks.']},
    world:{title:'World (source preview)',steps:['Load the extracted game-source ZIP locally.','Choose an area and layout to inspect initial placements. Source records do not prove player ownership.']},
    save:{title:'Save (development)',steps:['Open a save through the header.','Diagnostics and edit previews are for development; this is not a completed save editor.','Your original file is not changed and is processed locally.']}
  }
},
fr:{
  home:'Accueil',services:'Services',switchService:'Changer de service',serviceNav:'Navigation des services',serviceList:'Tous les services',
  quickServices:'Accès rapide',pageActions:'Actions de la page',preferences:"Préférences d’affichage",themeSelect:'Choisir un thème',support:'Aide et compte',
  collectionTools:'Outils Collection',guideTools:'Outils Guide',worldTools:'Outils World',saveTools:'Outils Save',
  fileTools:'Fichiers',languageSwitch:'Changer la langue',languageList:"Langue d’affichage",account:'Compte',
  accountOpen:'Connexion et compte',accountPreparing:'Connexion et compte (bientôt)',accountInfo:'La connexion sera disponible prochainement. Vos données Collection restent sur cet appareil. Les sauvegardes sont traitées dans le navigateur, sans envoi au serveur.',
  help:'Aide',tutorialHelp:'Aide pour cette page',tutorialClose:'Fermer le tutoriel',close:'Fermer',
  readSave:'Ouvrir une sauvegarde',collectionBackup:'Exporter la sauvegarde Collection',collectionRestore:'Restaurer Collection',
  backup:'Sauvegarder',restore:'Restaurer',worldSource:'Ouvrir le ZIP source World',collectionSearch:'Rechercher dans Collection',
  guideSearch:'Rechercher dans Guide',search:'Rechercher',filter:'Filtres',saveClear:'Effacer le diagnostic',planned:'Bientôt',
  saveManager:"Fichier de sauvegarde",
  saveNotParsed:"Fichier sélectionné (non analysé ni modifié)",
  saveBackupOriginal:"Sauvegarder l’original",
  saveExportEdited:"Exporter la sauvegarde modifiée",
  saveEditUnavailable:"Modification et exportation indisponibles pour le moment",
  saveOpenEditor:"Ouvrir Save Editor",
  saveReplace:"Choisir une autre sauvegarde",
  saveClose:"Fermer le fichier",
  saveInvalid:"Sélectionnez une sauvegarde compatible",
  saveDrop:"Déposez une sauvegarde ici",
  moreActions:"Plus d’actions",
  themes:{dawn:'Aube lavande',coral:'Récif corallien ensoleillé',night:'Ciel nocturne magique'},
  tutorials:{
    home:{title:'Utiliser Wand',steps:['Choisissez une vignette de service.','Les services en préparation ne sont pas accessibles.','Utilisez Accueil pour revenir à la liste des services.','Collection fonctionne sans sauvegarde.']},
    collection:{title:'Collection',steps:['Recherchez un objet ou une catégorie. Faites défiler pour afficher la suite.','Sélectionnez un objet pour enregistrer sa possession, ses favoris ou sa quantité.','Lors du chargement, les données de sauvegarde vérifiées priment sur les saisies manuelles.','Exportez ou restaurez Collection depuis l’en-tête. La sauvegarde du jeu reste intacte.']},
    guide:{title:'Guide',steps:['Recherchez des quêtes ou des personnages. Faites défiler pour charger la suite.','Sélectionnez une entrée pour les détails. La sauvegarde n’est pas nécessaire.']},
    characters:{title:'Characters',steps:['Recherchez ou filtrez les personnages.','Sélectionnez un personnage pour voir ses quêtes.']},
    starpath:{title:'Star Path',steps:['Choisissez une saison et l’onglet tâches ou récompenses.','Recherchez ou faites défiler pour afficher plus de tâches.']},
    world:{title:'World (aperçu des sources)',steps:['Chargez localement le ZIP des données extraites du jeu.','Choisissez une zone et une disposition. Les données sources ne prouvent pas la possession.']},
    save:{title:'Save (développement)',steps:['Ouvrez une sauvegarde depuis l’en-tête.','Le diagnostic et l’aperçu des modifications sont expérimentaux.','Le fichier original reste intact et est traité localement.']}
  }
},
it:{
  home:'Vai alla home',services:'Servizi',switchService:'Cambia servizio',serviceNav:'Navigazione servizi',serviceList:'Tutti i servizi',
  quickServices:'Accesso rapido',pageActions:'Azioni pagina',preferences:'Preferenze di visualizzazione',themeSelect:'Scegli il tema',support:'Aiuto e account',
  collectionTools:'Strumenti Collection',guideTools:'Strumenti Guide',worldTools:'Strumenti World',saveTools:'Strumenti Save',
  fileTools:'Operazioni file',languageSwitch:'Cambia lingua',languageList:'Lingua di visualizzazione',account:'Account',
  accountOpen:'Accesso e account',accountPreparing:'Accesso e account (in arrivo)',accountInfo:'L’accesso sarà disponibile prossimamente. I dati Collection restano su questo dispositivo. I salvataggi vengono elaborati nel browser e non inviati al server.',
  help:'Aiuto',tutorialHelp:'Guida per questa pagina',tutorialClose:'Chiudi la guida',close:'Chiudi',
  readSave:'Apri salvataggio',collectionBackup:'Esporta backup Collection',collectionRestore:'Ripristina Collection',
  backup:'Backup',restore:'Ripristina',worldSource:'Apri ZIP sorgente World',collectionSearch:'Cerca in Collection',
  guideSearch:'Cerca in Guide',search:'Cerca',filter:'Filtri',saveClear:'Elimina diagnostica',planned:'In arrivo',
  saveManager:"File di salvataggio",
  saveNotParsed:"File selezionato (non analizzato né modificato)",
  saveBackupOriginal:"Salva copia originale",
  saveExportEdited:"Esporta salvataggio modificato",
  saveEditUnavailable:"Modifica ed esportazione non ancora disponibili",
  saveOpenEditor:"Apri Save Editor",
  saveReplace:"Scegli un altro salvataggio",
  saveClose:"Chiudi file",
  saveInvalid:"Seleziona un salvataggio supportato",
  saveDrop:"Trascina qui un salvataggio",
  moreActions:"Altre azioni",
  themes:{dawn:'Alba lavanda',coral:'Barriera corallina al sole',night:'Cielo notturno magico'},
  tutorials:{
    home:{title:'Come usare Wand',steps:['Scegli un riquadro del servizio.','I servizi in preparazione non sono disponibili.','Usa Home per tornare all’elenco dei servizi.','Collection funziona anche senza salvataggio.']},
    collection:{title:'Collection',steps:['Cerca un oggetto o scegli una categoria. Scorri per caricare altri risultati.','Seleziona un oggetto per registrare possesso, preferiti o quantità.','Caricando un salvataggio, i dati verificati prevalgono su quelli manuali.','Esporta o ripristina Collection dall’intestazione. Il salvataggio originale non cambia.']},
    guide:{title:'Guide',steps:['Cerca missioni o personaggi. Scorri per caricarne altri.','Seleziona una voce per i dettagli. I dati pubblici non richiedono un salvataggio.']},
    characters:{title:'Characters',steps:['Cerca o filtra i personaggi.','Seleziona un personaggio per vedere le missioni.']},
    starpath:{title:'Star Path',steps:['Scegli una stagione e la scheda attività o ricompense.','Cerca o scorri per caricare altre attività.']},
    world:{title:'World (anteprima delle fonti)',steps:['Carica localmente lo ZIP dei dati di gioco estratti.','Scegli area e disposizione. Le fonti non dimostrano il possesso degli oggetti.']},
    save:{title:'Save (sviluppo)',steps:['Apri un salvataggio dall’intestazione.','Diagnostica e anteprima delle modifiche sono sperimentali.','Il file originale resta intatto e viene elaborato localmente.']}
  }
},
de:{
  home:'Zur Startseite',services:'Dienste',switchService:'Dienst wechseln',serviceNav:'Dienstnavigation',serviceList:'Alle Dienste',
  quickServices:'Schnellzugriff',pageActions:'Seitenaktionen',preferences:'Anzeigeeinstellungen',themeSelect:'Design wählen',support:'Hilfe und Konto',
  collectionTools:'Collection-Werkzeuge',guideTools:'Guide-Werkzeuge',worldTools:'World-Werkzeuge',saveTools:'Save-Werkzeuge',
  fileTools:'Dateiaktionen',languageSwitch:'Sprache wechseln',languageList:'Anzeigesprache',account:'Konto',
  accountOpen:'Anmeldung und Konto',accountPreparing:'Anmeldung und Konto (in Vorbereitung)',accountInfo:'Die Anmeldung ist noch in Vorbereitung. Collection-Daten bleiben auf diesem Gerät. Spielstände werden im Browser verarbeitet und nicht auf den Server hochgeladen.',
  help:'Hilfe',tutorialHelp:'Hilfe für diese Seite',tutorialClose:'Anleitung schließen',close:'Schließen',
  readSave:'Spielstand öffnen',collectionBackup:'Collection-Sicherung exportieren',collectionRestore:'Collection-Sicherung wiederherstellen',
  backup:'Sichern',restore:'Wiederherstellen',worldSource:'World-Quell-ZIP öffnen',collectionSearch:'Collection durchsuchen',
  guideSearch:'Guide durchsuchen',search:'Suchen',filter:'Filter',saveClear:'Diagnoseergebnisse verwerfen',planned:'In Vorbereitung',
  saveManager:"Spielstand",
  saveNotParsed:"Datei ausgewählt (noch nicht analysiert oder bearbeitet)",
  saveBackupOriginal:"Original sichern",
  saveExportEdited:"Bearbeiteten Spielstand exportieren",
  saveEditUnavailable:"Bearbeiten und Exportieren noch nicht verfügbar",
  saveOpenEditor:"Save Editor öffnen",
  saveReplace:"Anderen Spielstand wählen",
  saveClose:"Datei schließen",
  saveInvalid:"Unterstützte Spielstanddatei auswählen",
  saveDrop:"Spielstand hier ablegen",
  moreActions:"Weitere Aktionen",
  themes:{dawn:'Lavendelfarbene Morgendämmerung',coral:'Sonnenbeschienenes Korallenriff',night:'Magischer Nachthimmel'},
  tutorials:{
    home:{title:'Wand verwenden',steps:['Wähle eine Dienst-Kachel.','Noch nicht verfügbare Kacheln lassen sich nicht öffnen.','Über Home gelangst du zur Dienstübersicht.','Collection funktioniert ohne Spielstand.']},
    collection:{title:'Collection',steps:['Suche nach Gegenständen oder wähle eine Kategorie. Scrolle für weitere Einträge.','Wähle einen Gegenstand, um Besitz, Favoriten und Menge zu speichern.','Beim Laden haben bestätigte Spielstanddaten Vorrang vor manuellen Einträgen.','Sichere oder stelle Collection über die Kopfzeile wieder her. Der originale Spielstand bleibt unverändert.']},
    guide:{title:'Guide',steps:['Suche Quests oder Figuren. Scrolle für weitere Einträge.','Wähle einen Eintrag für Details. Ein Spielstand ist nicht nötig.']},
    characters:{title:'Characters',steps:['Suche oder filtere Figuren.','Wähle eine Figur, um ihre Quests anzuzeigen.']},
    starpath:{title:'Star Path',steps:['Wähle eine Saison und den Aufgaben- oder Belohnungen-Tab.','Suche oder scrolle für weitere Aufgaben.']},
    world:{title:'World (Quelldatenvorschau)',steps:['Lade die extrahierte ZIP-Datei lokal.','Wähle Gebiet und Layout. Quelldaten beweisen keinen Besitz.']},
    save:{title:'Save (Entwicklung)',steps:['Öffne einen Spielstand über die Kopfzeile.','Diagnose und Änderungsvorschau sind Entwicklungsfunktionen.','Die Originaldatei bleibt unverändert und wird lokal verarbeitet.']}
  }
},
'es-ES':{
  home:'Ir al inicio',services:'Servicios',switchService:'Cambiar servicio',serviceNav:'Navegación de servicios',serviceList:'Todos los servicios',
  quickServices:'Acceso rápido',pageActions:'Acciones de la página',preferences:'Preferencias de visualización',themeSelect:'Elegir tema',support:'Ayuda y cuenta',
  collectionTools:'Herramientas de Collection',guideTools:'Herramientas de Guide',worldTools:'Herramientas de World',saveTools:'Herramientas de Save',
  fileTools:'Acciones de archivos',languageSwitch:'Cambiar idioma',languageList:'Idioma de visualización',account:'Cuenta',
  accountOpen:'Inicio de sesión y cuenta',accountPreparing:'Inicio de sesión y cuenta (próximamente)',accountInfo:'El inicio de sesión estará disponible próximamente. Los datos de Collection se guardan en este dispositivo. Los archivos de partida se procesan en el navegador y no se envían al servidor.',
  help:'Ayuda',tutorialHelp:'Ayuda para esta página',tutorialClose:'Cerrar tutorial',close:'Cerrar',
  readSave:'Abrir partida guardada',collectionBackup:'Exportar copia de Collection',collectionRestore:'Restaurar Collection',
  backup:'Copia de seguridad',restore:'Restaurar',worldSource:'Abrir ZIP de origen World',collectionSearch:'Buscar en Collection',
  guideSearch:'Buscar en Guide',search:'Buscar',filter:'Filtros',saveClear:'Descartar resultados del diagnóstico',planned:'Próximamente',
  saveManager:"Partida guardada",
  saveNotParsed:"Archivo seleccionado (sin analizar ni editar)",
  saveBackupOriginal:"Guardar copia del original",
  saveExportEdited:"Exportar partida editada",
  saveEditUnavailable:"La edición y exportación aún no están disponibles",
  saveOpenEditor:"Abrir Save Editor",
  saveReplace:"Elegir otra partida",
  saveClose:"Cerrar archivo",
  saveInvalid:"Selecciona un archivo de partida compatible",
  saveDrop:"Suelta aquí una partida guardada",
  moreActions:"Más acciones",
  themes:{dawn:'Amanecer lavanda',coral:'Arrecife de coral soleado',night:'Cielo nocturno mágico'},
  tutorials:{
    home:{title:'Cómo usar Wand',steps:['Elige un servicio.','Los servicios en preparación no están disponibles.','Usa Inicio para volver a la lista de servicios.','Collection funciona sin partida guardada.']},
    collection:{title:'Collection',steps:['Busca objetos o elige una categoría. Desplázate para cargar más.','Selecciona un objeto para registrar posesión, favoritos o cantidad.','Al cargar una partida, los datos verificados prevalecen sobre los registros manuales.','Exporta o restaura Collection desde la cabecera. La partida original no se modifica.']},
    guide:{title:'Guide',steps:['Busca misiones o personajes. Desplázate para cargar más.','Selecciona una entrada para ver detalles. No hace falta una partida guardada.']},
    characters:{title:'Characters',steps:['Busca o filtra personajes.','Selecciona un personaje para ver sus misiones.']},
    starpath:{title:'Star Path',steps:['Elige una temporada y la pestaña de tareas o recompensas.','Busca o desplázate para cargar más tareas.']},
    world:{title:'World (vista previa de origen)',steps:['Carga localmente el ZIP extraído del juego.','Elige una zona y distribución. Los datos de origen no demuestran propiedad.']},
    save:{title:'Save (desarrollo)',steps:['Abre una partida desde la cabecera.','Los diagnósticos y las vistas previas son funciones de desarrollo.','El archivo original no se modifica y se procesa localmente.']}
  }
},
'zh-CN':{
  home:'返回主页',services:'服务',switchService:'切换服务',serviceNav:'服务导航',serviceList:'所有服务',
  quickServices:'快捷入口',pageActions:'页面操作',preferences:'显示设置',themeSelect:'选择主题',support:'帮助与账户',
  collectionTools:'Collection 工具栏',guideTools:'Guide 工具栏',worldTools:'World 工具栏',saveTools:'Save 工具栏',
  fileTools:'文件操作',languageSwitch:'切换显示语言',languageList:'显示语言',account:'账户',
  accountOpen:'登录与账户',accountPreparing:'登录与账户（即将推出）',accountInfo:'登录功能即将推出。Collection 记录保存在此设备上。存档文件仅在浏览器中处理，不会上传至服务器。',
  help:'帮助',tutorialHelp:'本页面帮助',tutorialClose:'关闭教程',close:'关闭',
  readSave:'打开存档文件',collectionBackup:'导出 Collection 备份',collectionRestore:'恢复 Collection 备份',
  backup:'备份',restore:'恢复',worldSource:'打开 World 原始 ZIP',collectionSearch:'搜索 Collection',
  guideSearch:'搜索 Guide',search:'搜索',filter:'筛选',saveClear:'清除诊断结果',planned:'开发中',
  saveManager:"存档文件",
  saveNotParsed:"已选择文件（尚未解析或编辑）",
  saveBackupOriginal:"备份原始文件",
  saveExportEdited:"导出编辑后的存档",
  saveEditUnavailable:"存档编辑和导出功能尚未开放",
  saveOpenEditor:"打开存档编辑器",
  saveReplace:"选择其他存档",
  saveClose:"关闭文件",
  saveInvalid:"请选择支持的存档文件",
  saveDrop:"将存档文件拖放到此处",
  moreActions:"更多操作",
  themes:{dawn:'淡紫色黎明',coral:'阳光下的珊瑚礁',night:'魔法夜空'},
  tutorials:{
    home:{title:'Wand 使用指南',steps:['选择要使用的服务卡片。','尚未开放的服务无法进入。','通过主页按钮返回服务列表。','Collection 无需存档也可以使用。']},
    collection:{title:'Collection',steps:['搜索物品或选择分类。向下滚动可加载更多内容。','选择物品以记录拥有状态、收藏及数量。','加载存档后，已验证的发现和拥有状态优先于手动记录。','可在页眉备份或恢复 Collection 记录。不会修改原始游戏存档。']},
    guide:{title:'Guide',steps:['搜索任务或角色。向下滚动可加载更多内容。','选择条目查看详情。无需存档即可查看公开数据。']},
    characters:{title:'Characters',steps:['搜索或筛选角色。','选择角色以查看关联任务。']},
    starpath:{title:'Star Path',steps:['选择赛季以及任务或奖励选项卡。','搜索或滚动以加载更多任务。']},
    world:{title:'World（原始数据预览）',steps:['在本地加载从游戏提取的 ZIP 文件。','选择区域和布局。原始数据不代表玩家实际拥有。']},
    save:{title:'Save（开发中）',steps:['通过页眉打开存档。','诊断和修改预览仅供开发使用，尚不是完整的存档编辑器。','原始文件不会被修改，所有处理均在本地进行。']}
  }
},
'pt-BR':{
  home:'Voltar ao início',services:'Serviços',switchService:'Trocar serviço',serviceNav:'Navegação de serviços',serviceList:'Todos os serviços',
  quickServices:'Acesso rápido',pageActions:'Ações da página',preferences:'Preferências de exibição',themeSelect:'Escolher tema',support:'Ajuda e conta',
  collectionTools:'Ferramentas Collection',guideTools:'Ferramentas Guide',worldTools:'Ferramentas World',saveTools:'Ferramentas Save',
  fileTools:'Ações de arquivos',languageSwitch:'Alterar idioma',languageList:'Idioma de exibição',account:'Conta',
  accountOpen:'Entrar ou gerenciar conta',accountPreparing:'Login e conta (em breve)',accountInfo:'O login estará disponível em breve. Os registros da Collection ficam neste dispositivo. Os saves são processados no navegador e não são enviados ao servidor.',
  help:'Ajuda',tutorialHelp:'Ajuda desta página',tutorialClose:'Fechar tutorial',close:'Fechar',
  readSave:'Abrir arquivo de save',collectionBackup:'Exportar backup da Collection',collectionRestore:'Restaurar Collection',
  backup:'Backup',restore:'Restaurar',worldSource:'Abrir ZIP de origem World',collectionSearch:'Pesquisar na Collection',
  guideSearch:'Pesquisar no Guide',search:'Pesquisar',filter:'Filtros',saveClear:'Descartar diagnósticos',planned:'Em breve',
  saveManager:"Arquivo de save",
  saveNotParsed:"Arquivo selecionado (não analisado nem editado)",
  saveBackupOriginal:"Fazer backup do original",
  saveExportEdited:"Exportar save editado",
  saveEditUnavailable:"Edição e exportação ainda não disponíveis",
  saveOpenEditor:"Abrir Save Editor",
  saveReplace:"Escolher outro save",
  saveClose:"Fechar arquivo",
  saveInvalid:"Selecione um arquivo de save compatível",
  saveDrop:"Solte um save aqui",
  moreActions:"Mais ações",
  themes:{dawn:'Amanhecer lavanda',coral:'Recife de coral ensolarado',night:'Céu noturno mágico'},
  tutorials:{
    home:{title:'Como usar o Wand',steps:['Escolha um serviço.','Serviços em preparação ainda não podem ser abertos.','Use Início para voltar à lista de serviços.','A Collection funciona sem arquivo de save.']},
    collection:{title:'Collection',steps:['Pesquise itens ou escolha uma categoria. Role para carregar mais.','Selecione um item para registrar posse, favoritos ou quantidade.','Ao carregar um save, os dados verificados prevalecem sobre os registros manuais.','Faça backup ou restaure a Collection pelo cabeçalho. O save original não é modificado.']},
    guide:{title:'Guide',steps:['Pesquise missões ou personagens. Role para carregar mais.','Selecione um item para ver detalhes. Não é necessário ter um save.']},
    characters:{title:'Characters',steps:['Pesquise ou filtre personagens.','Selecione um personagem para ver as missões relacionadas.']},
    starpath:{title:'Star Path',steps:['Escolha uma temporada e a aba de tarefas ou recompensas.','Pesquise ou role para carregar mais tarefas.']},
    world:{title:'World (prévia de origem)',steps:['Carregue localmente o ZIP extraído do jogo.','Escolha uma área e um layout. Os dados de origem não comprovam posse.']},
    save:{title:'Save (desenvolvimento)',steps:['Abra um save pelo cabeçalho.','Diagnósticos e prévias de edição são recursos de desenvolvimento.','O arquivo original permanece intacto e é processado localmente.']}
  }
}
} satisfies Record<WandLanguage,ShellCopy>;
export function shellCopy(locale:WandLanguage):ShellCopy{return SHELL_COPY[locale];}
