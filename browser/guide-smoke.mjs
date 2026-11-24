/** Public Guide must work with shipped static assets, no owner-private imports. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const url = 'http://127.0.0.1:4177/Wand/guide/quests/';
const languageLabels={ja:'日本語',en:'English',fr:'Français',it:'Italiano',de:'Deutsch','es-ES':'Español','zh-CN':'简体中文','pt-BR':'Português'};
async function chooseLanguage(page,code){
  // The accessible label follows the current locale; use a stable control selector.
  await page.locator('.header-language-button').click();
  await page.locator('.language-popover')
    .getByRole('button',{name:languageLabels[code],exact:true}).click();
}
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4177'], {
  env: {...process.env, BASE_PATH: '/Wand'}, stdio: 'pipe'
});
let serverOutput = '';
server.stderr.on('data', value => { serverOutput += String(value); });
server.stdout.on('data', value => { serverOutput += String(value); });
async function waitForPreview() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error('PUBLIC_GUIDE_PREVIEW_NOT_READY ' + serverOutput);
}
let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = [];
  const downloaded = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (response.url().includes('/guide/public/')) downloaded.push(response.url());
  });
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.getByRole('navigation',{name:'ゲーム内のクエスト分類'})
    .waitFor({timeout:30000});
  assert.equal(await page.locator('.catalog-meta').evaluate(el=>el.open),false,
    'static source counters and source details should not bury the quest list');
  assert.match(await page.locator('.numbers').textContent(), /733[\s\S]*7,878[\s\S]*11,782/);
  assert.equal(await page.locator('.hero .eyebrow').count(),0);
  assert.match(await page.locator('.hero h1').innerText(),/^クエスト$/);
  assert.equal(await page.locator('main.site-main input[type=file]').count(), 0,
    'Guide itself has no file picker; the shared shell owns global Save selection');
  assert.equal(downloaded.filter(value => value.endsWith('/quest-index.json')).length, 1);
  assert.equal(downloaded.filter(value => value.includes('quest-details-')).length, 0, 'lazy details must not prefetch');
  assert.equal(await page.locator('header.site-header .site-nav').count(),0);
  assert.equal(await page.getByRole('link',{name:'ホームへ戻る'}).count(),1);

  const search = page.getByRole('textbox', {name: 'クエスト名・IDを検索'});
  await search.fill('ドリームライトバレーへようこそ');
  await page.waitForFunction(() => document.querySelector('.count')?.textContent?.includes('1件'));
  await page.locator('.quest-row').first().click();
  await page.locator('.detail .step').first().waitFor({timeout: 20000});
  assert.match(await page.locator('.detail-header').innerText(), /ドリームライトバレーへようこそ/);
  assert.match(await page.locator('.detail').innerText(), /家に入ってみよう/);
  assert.equal(downloaded.filter(value => value.includes('quest-details-')).length, 1, 'one lazy detail part');
  assert.equal(await page.locator('.detail').innerText().then(value => value.includes('<ActivityItem>')), false, 'do not display raw game text tags');

  await chooseLanguage(page,'en');
  await page.waitForFunction(() => document.querySelector('.detail-header h2')?.textContent?.includes('Welcome to Dreamlight Valley'));
  assert.match(await page.locator('.detail-header').innerText(), /Welcome to Dreamlight Valley/);
  assert.match(await page.locator('.detail').innerText(), /Try to enter the House/);
  await search.fill('Welcome to Dreamlight Valley');
  await page.waitForFunction(() => document.querySelector('.count')?.textContent?.includes('1件'));
  await search.fill('2070000620');
  await page.waitForFunction(() => document.querySelector('.count')?.textContent?.includes('1件'));

  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, 'mobile horizontal overflow');
  await search.fill('');
  await page.waitForFunction(()=>document.querySelectorAll('.quest-row').length>=35);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
    'mobile full quest list with long untranslated/native names must wrap without horizontal overflow');
  await chooseLanguage(page,'ja');
  // The new Story-first home intentionally does not blend Village/Realm
  // quests into the main narrative. Generic original-ID search uses All.
  await page.getByRole('button',{name:'すべて',exact:true}).first().click();
  await page.waitForFunction(()=>
    document.querySelector('.count')?.textContent?.includes('733件'));

  // Original-native selector ID 30000031 resolves through the published,
  // exact current Steam 1.26.2 names, without requiring an owner source archive.
  await search.fill('2070000688');
  await page.locator('.quest-row').first().click();
  await page.locator('.target-chip').filter({hasText:'ピュアナイトシャード'}).first().waitFor({timeout:20000});
  assert.match(await page.locator('.detail').innerText(), /必要数 5/);
  assert.match(await page.locator('.target-chip').first().getAttribute('title'), /30000031/);
  assert.doesNotMatch(await page.locator('.target-chip').first().innerText(), /30000031/,
    'technical item IDs stay accessible on hover, not in the main task content');
  assert.equal(await page.locator('.detail .source-id').first().evaluate(el=>el.open),false,
    'source identifiers default to collapsed');
  await chooseLanguage(page,'en');
  await page.locator('.target-chip').filter({hasText:'Purified Night Shard'}).first().waitFor({timeout:20000});
  await chooseLanguage(page,'ja');

  // Corrupt a *different*, uncached part; browser must fail closed on SHA.
  await page.route('**/guide/public/quest-details-00.json', async route => {
    const original = await route.fetch();
    const bytes = Buffer.from(await original.body());
    bytes[50] ^= 1;
    await route.fulfill({response: original, body: bytes});
  });
  await search.fill('2070000651');
  await page.waitForFunction(() => document.querySelector('.count')?.textContent?.includes('1件'));
  await page.locator('.quest-row').first().click();
  await page.locator('.detail [role="alert"]').waitFor({timeout: 20000});
  assert.match(await page.locator('.detail [role="alert"]').innerText(), /fingerprint/);
  assert.equal(await page.locator('.detail .step').count(), 0, 'corrupted content must never render');
  assert.deepEqual(errors, [], errors.join('\n'));
  await page.close();

  // Foundational Quest UX: source-native story arcs, separate Realm, and a
  // character-first Friendship browser, rather than a 733-row flat list.
  const browse=await browser.newPage({viewport:{width:1280,height:820}});
  const browseErrors=[];
  browse.on('pageerror',err=>browseErrors.push(String(err)));
  await browse.goto(url,{waitUntil:'domcontentloaded'});
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('43件'));
  assert.match(await browse.locator('.quest-row').first().innerText(),
    /ドリームライトバレーへようこそ/,
    'the first screen must follow the source-numbered original Valley story');
  assert.equal(await browse.locator('.story-arcs button').count(),6);
  await browse.getByRole('button',{name:'時間の裂け目',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('30件'));
  await browse.getByRole('button',{name:'思い出の海',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('25件'));
  await browse.getByRole('button',{name:'世界クエスト',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('61件'));
  assert.equal(await browse.locator('.story-arcs').count(),0,
    'Realm quests must not be mixed into Story arcs');
  await browse.getByRole('button',{name:'友情クエスト',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('341件'));
  assert.equal(await browse.locator('.character-rail button').count(),78,
    'exactly 77 source-native Village quest characters plus All');
  await browse.locator('.character-rail button').filter({hasText:'グーフィー'}).first().click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('5件'));
  assert.match(await browse.locator('.quest-row').first().innerText(),/温かい歓迎/,
    'friendship Quests must follow the source-native Goofy 010/030/040/050/070 series');
  await browse.setViewportSize({width:390,height:844});
  assert.equal(await browse.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
    'character roster remains within the mobile viewport');
  await browse.getByRole('button',{name:'イベントクエスト',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('66件'));
  await browse.getByRole('button',{name:'デイリークエスト',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('9件'));
  await browse.locator('.quest-unclassified summary').click();
  await browse.getByRole('button',{name:'追加クエスト',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('70件'));
  await browse.getByRole('button',{name:'ドリームパッククエスト',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('19件'));
  await browse.getByRole('button',{name:'導入用',exact:true}).click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('1件'));
  await browse.getByRole('button',{name:'すべて',exact:true}).first().click();
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('733件'));
  await browse.getByRole('textbox',{name:'クエスト名・IDを検索'}).fill('2070000793');
  await browse.waitForFunction(()=>document.querySelector('.count')?.textContent?.includes('1件'));
  assert.match(await browse.locator('.quest-row').first().innerText(),
    /名称未確認（ID 2070000793）/,
    'missing source translations cannot be replaced with internal Mission symbols');
  assert.doesNotMatch(await browse.locator('.quest-row').first().innerText(),/SEC_Goof_010/);
  assert.deepEqual(browseErrors,[],browseErrors.join('\\n'));
  await browse.close();

  // Direct links from Collection/DB-02 resolve only from the verified index.
  // Clicking another quest updates the URL, and back restores the original.
  const direct = await browser.newPage();
  const deepErrors = [];
  direct.on('pageerror',error=>deepErrors.push(String(error)));
  await direct.goto(url+'?quest=2070000620',{waitUntil:'domcontentloaded'});
  await direct.locator('.detail .step').first().waitFor({timeout:20000});
  assert.match(await direct.locator('.detail-header').innerText(),/ドリームライトバレーへようこそ/);
  const questHelp=direct.locator('.guide-community');
  assert.equal(await questHelp.getAttribute('data-subject-kind'),'quest');
  assert.equal(await questHelp.getAttribute('data-subject-id'),'2070000620');
  assert.equal(await questHelp.locator('button:disabled').count(),3);
  assert.equal(await questHelp.locator('a').count(),0);
  assert.match(await questHelp.innerText(),/準備中/);

  assert.equal(await direct.locator('.quest-permalink').getAttribute('href'),'/Wand/guide/quests/?quest=2070000620');
  assert.equal(await direct.locator('.detail .step').count(),1,'one step initially visible to avoid wall of text');
  assert.match(await direct.locator('.detail .step h3').innerText(),/ステップ 1/);
  assert.equal(await direct.getByRole('button',{name:'前のステップ'}).isDisabled(),true);
  await direct.getByRole('button',{name:'次のステップ'}).click();
  await direct.waitForFunction(()=>location.search.includes('step=2'));
  assert.match(await direct.locator('.detail .step h3').innerText(),/ステップ 2/);
  assert.equal(await direct.getByRole('link',{name:'選択中のステップへの直接リンク'}).getAttribute('href'),
    '/Wand/guide/quests/?quest=2070000620&step=2');
  await direct.getByRole('button',{name:'全ステップ表示'}).click();
  assert.equal(await direct.locator('.detail .step').count(),5,'optional full view preserves all 5 original source steps');
  await direct.getByRole('button',{name:'1ステップ表示'}).click();
  assert.equal(await direct.locator('.detail .step').count(),1);
  await direct.goBack();
  await direct.waitForFunction(()=>location.search==='?quest=2070000620');
  assert.match(await direct.locator('.detail .step h3').innerText(),/ステップ 1/);
  await direct.goForward();
  await direct.waitForFunction(()=>location.search.includes('step=2'));
  assert.match(await direct.locator('.detail .step h3').innerText(),/ステップ 2/);
  await direct.getByRole('textbox',{name:'クエスト名・IDを検索'}).fill('2070000688');
  await direct.locator('.quest-row').first().click();
  await direct.waitForFunction(()=>location.search.includes('quest=2070000688'));
  await direct.goBack();
  await direct.waitForFunction(()=>location.search.includes('quest=2070000620'));
  await direct.locator('.detail-header h2').filter({hasText:'ドリームライトバレーへようこそ'}).waitFor({timeout:20000});
  assert.deepEqual(deepErrors,[],deepErrors.join('\n'));
  await direct.close();

  // DB-03 source-pinned objective Item-ID reverse lookup: direct link to
  // exact Quest and first relevant step, then native in-page Item-ID search.
  const targetDeep=await browser.newPage({viewport:{width:390,height:844}});
  const targetErrors=[];
  targetDeep.on('pageerror',error=>targetErrors.push(String(error)));
  await targetDeep.goto(url+'?target=30000031&quest=2070000688',
    {waitUntil:'domcontentloaded'});
  await targetDeep.locator('.reward-focus').waitFor({timeout:25000});
  assert.match(await targetDeep.locator('.reward-focus').innerText(),
    /目標アイテムの候補に関連するクエスト.*Item ID 30000031/);
  await targetDeep.locator('.detail .step li.target-item-match').first()
    .waitFor({timeout:25000});
  await targetDeep.locator('.target-chip').filter({hasText:'ピュアナイトシャード'})
    .first().waitFor({timeout:25000});
  const questItemLink=targetDeep.locator('.target-chip')
    .filter({hasText:'ピュアナイトシャード'}).first()
    .getByRole('link',{name:'Collectionで開く：ピュアナイトシャード'});
  await questItemLink.waitFor({timeout:20000});
  assert.equal(await questItemLink.getAttribute('href'),'/Wand/collection/?item=30000031');
  await questItemLink.click();
  await targetDeep.locator('.item-inspector h2').waitFor({timeout:30000});
  assert.match(await targetDeep.locator('.item-inspector h2').innerText(),
    /ピュアナイトシャード|Purified Night Shard/,
    'verified original Quest objective Item must open its Collection inspector');
  await targetDeep.goBack({waitUntil:'domcontentloaded'});
  await targetDeep.locator('.target-chip').filter({hasText:'ピュアナイトシャード'})
    .first().waitFor({timeout:25000});
  assert.equal(await targetDeep.locator('.detail .step').count(),1,
    'only the relevant source Quest step should initially render');
  assert.match(await targetDeep.locator('.detail .step h3').innerText(),/ステップ 1/);
  const targetSearch=targetDeep.getByRole('textbox',{name:'クエスト名・IDを検索'});
  await targetSearch.fill('30000031');
  await targetDeep.waitForFunction(()=>
    document.querySelector('.reward-focus')?.textContent?.includes('Item ID 30000031'));
  assert.equal(await targetDeep.locator('.quest-row').count(),16,
    'source Item-ID reverse search groups duplicate objective references per Quest');
  await targetSearch.fill('');
  await targetDeep.getByRole('button',{name:'すべて',exact:true}).first().click();
  await targetDeep.waitForFunction(()=>
    document.querySelector('.count')?.textContent?.includes('733件'));
  assert.equal(await targetDeep.locator('.reward-focus').count(),0,
    'normal Quest search restores all results without stale Item-ID deep-link focus');
  assert.equal(await targetDeep.evaluate(()=>
    document.documentElement.scrollWidth<=innerWidth+2),true,
    'focused Quest target result list does not overflow mobile viewport');
  assert.deepEqual(targetErrors,[],targetErrors.join('\\n'));
  await targetDeep.close();

  // Source-exact Quest override reward: original Mission reference ->
  // Steam v1.26.2 LootTable -> static candidate Item ID, never a grant.
  const override=await browser.newPage({viewport:{width:390,height:844}});
  const overrideErrors=[];
  override.on('pageerror',err=>overrideErrors.push(String(err)));
  await override.goto(url+'?item=40004032',{waitUntil:'domcontentloaded'});
  await override.locator('.reward-focus').filter({hasText:'40004032'}).waitFor({timeout:25000});
  await override.locator('.detail .quest-rewards .reward-item-match')
    .filter({hasText:'40004032'}).first().waitFor({timeout:25000});
  assert.equal(await override.locator('.quest-row').count(),1);
  assert.match(await override.locator('.detail .quest-rewards').innerText(),
    /別定義のLoot Table候補/);
  assert.doesNotMatch(await override.locator('.detail .quest-rewards').innerText(),
    /参照先未解決の追加報酬設定/);
  // The current verified public DB-00 release exposes a native, localized
  // Mine Cart Popcorn Bucket definition for this original Quest Loot candidate.
  const overrideCollectionLink=override.getByRole('link',
    {name:'Collectionで開く：ポップコーンバケット（荷車）'});
  await overrideCollectionLink.waitFor({timeout:25000});
  assert.equal(await overrideCollectionLink.getAttribute('href'),'/Wand/collection/?item=40004032');
  await overrideCollectionLink.click();
  await override.locator('.item-inspector h2').waitFor({timeout:30000});
  assert.match(await override.locator('.item-inspector h2').innerText(),
    /ポップコーンバケット（荷車）|Mine Cart Popcorn Bucket/);
  await override.goBack({waitUntil:'domcontentloaded'});
  await override.locator('.detail .quest-rewards .reward-item-match')
    .filter({hasText:'40004032'}).first().waitFor({timeout:25000});
  await override.goto(url+'?item=30200002&quest=2070001383',
    {waitUntil:'domcontentloaded'});
  await override.locator('.detail .quest-rewards .reward-item-match')
    .filter({hasText:'30200002'}).first().waitFor({timeout:25000});
  assert.match(await override.locator('.detail .quest-rewards').innerText(),
    /原本の抽選回数欄は最大値の特殊値/);
  const appleLink=override.locator(
    '.detail .quest-rewards a.reward-collection-link[href="/Wand/collection/?item=30200002"]').first();
  await appleLink.waitFor({timeout:25000});
  assert.equal(await appleLink.getAttribute('href'),'/Wand/collection/?item=30200002');
  // Source currency IDs not present in the published native ItemList remain
  // visible in the Guide but must never acquire invented Collection links.
  await override.goto(url+'?item=80000000&quest=2070000672',
    {waitUntil:'domcontentloaded'});
  const unknownCurrency=override.locator('.quest-reward-block li.reward-item-match')
    .filter({hasText:'80000000'}).first();
  await unknownCurrency.waitFor({timeout:25000});
  assert.equal(await unknownCurrency.locator('.reward-collection-link').count(),0);
  assert.equal(await override.evaluate(()=>
    document.documentElement.scrollWidth<=innerWidth+2),true);
  assert.deepEqual(overrideErrors,[],overrideErrors.join('\\n'));
  await override.close();

  // Verified published DB-00 names locate source Quest rewards directly,
  // including the 1.26.2 override Loot Table and English name fallback.
  const namedReward=await browser.newPage({viewport:{width:390,height:844}});
  const namedRewardErrors=[];
  namedReward.on('pageerror',err=>namedRewardErrors.push(String(err)));
  await namedReward.goto(url,{waitUntil:'domcontentloaded'});
  const rewardNameInput=namedReward.getByRole('textbox',{name:'クエスト名・IDを検索'});
  await rewardNameInput.fill('リンゴ');
  await namedReward.locator('.reward-focus').filter({
    hasText:'報酬名に一致するクエスト：1件'
  }).waitFor({timeout:30000});
  assert.equal(await namedReward.locator('.quest-row').count(),1);
  await namedReward.locator('.quest-row').first().click();
  await namedReward.locator('.quest-rewards .reward-item-match')
    .filter({hasText:'30200002'}).first().waitFor({timeout:25000});
  assert.equal(await namedReward.locator('.quest-rewards').getAttribute('open'),'',
    'a name-filtered Quest opens the relevant static reward evidence');
  await rewardNameInput.fill('Mine Cart Popcorn');
  await namedReward.locator('.reward-focus').filter({
    hasText:'報酬名に一致するクエスト：1件'
  }).waitFor({timeout:25000});
  assert.equal(await namedReward.locator('.quest-row').count(),1);
  await namedReward.locator('.quest-row').first().click();
  await namedReward.locator('.quest-rewards .reward-item-match')
    .filter({hasText:'40004032'}).first().waitFor({timeout:25000});
  assert.equal(await namedReward.locator('.quest-rewards').getAttribute('open'),'');
  await rewardNameInput.fill('ポップコーンバケット');
  await namedReward.locator('.reward-focus').filter({
    hasText:'報酬名に一致するクエスト：3件'
  }).waitFor({timeout:25000});
  assert.equal(await namedReward.locator('.quest-row').count(),3);
  await rewardNameInput.fill('80000000');
  await namedReward.waitForFunction(()=>!
    document.querySelector('.reward-focus')?.textContent?.includes('報酬名に一致する'));
  await rewardNameInput.fill('');
  await namedReward.getByRole('button',{name:'すべて',exact:true}).first().click();
  await namedReward.waitForFunction(()=>
    document.querySelector('.count')?.textContent?.includes('733件'));
  assert.deepEqual(namedRewardErrors,[],namedRewardErrors.join('\\n'));
  await namedReward.close();

  const stepLink=await browser.newPage();
  await stepLink.goto(url+'?quest=2070000620&step=4',{waitUntil:'domcontentloaded'});
  await stepLink.locator('.detail .step').first().waitFor({timeout:20000});
  assert.match(await stepLink.locator('.detail .step h3').innerText(),/ステップ 4/,
    'shared step deep link restores the exact source step after lazy verified detail');
  await stepLink.getByRole('combobox',{name:'クエストのステップを選択'}).selectOption('1');
  assert.match(await stepLink.locator('.detail .step h3').innerText(),/ステップ 2/);
  assert.match(new URL(stepLink.url()).search,/step=2/);
  await stepLink.close();

  const invalidStep=await browser.newPage();
  await invalidStep.goto(url+'?quest=2070000620&step=3&step=4',{waitUntil:'domcontentloaded'});
  await invalidStep.locator('.detail .step').first().waitFor({timeout:20000});
  assert.match(await invalidStep.locator('.detail .step h3').innerText(),/ステップ 1/,
    'ambiguous duplicate query never resolves a random step');
  await invalidStep.close();

  // Native Mission groups connect related static quest definitions, never
  // imply a prerequisite or the player's unlock/finished state.
  const related=await browser.newPage({viewport:{width:390,height:844}});
  await related.goto(url+'?quest=2070000620',{waitUntil:'domcontentloaded'});
  await related.locator('.detail .step').first().waitFor({timeout:20000});
  assert.equal(await related.locator('.related-quests').evaluate(el=>el.open),false,
    'source group navigation must be collapsed until requested');
  assert.match(await related.locator('.related-quests summary').innerText(),/13件/);
  await related.locator('.related-quests summary').click();
  assert.equal(await related.locator('.related-quests a').count(),13,
    'Welcome to Dreamlight Valley has exactly 13 other source-group quests');
  assert.match(await related.locator('.related-quests').innerText(),/解放条件や達成順序を示すものではありません/);
  assert.equal(await related.locator('.related-quests a').filter({hasText:'ドリームキャッスル'}).getAttribute('href'),
    '/Wand/guide/quests/?quest=2070000629');
  await related.locator('.related-quests a').filter({hasText:'ドリームキャッスル'}).click();
  await related.waitForFunction(()=>location.search.includes('quest=2070000629'));
  await related.locator('.detail-header h2').filter({hasText:'ドリームキャッスル'}).waitFor({timeout:20000});
  await related.goBack();
  await related.waitForFunction(()=>location.search.includes('quest=2070000620'));
  await related.locator('.detail-header h2').filter({hasText:'ドリームライトバレーへようこそ'}).waitFor({timeout:20000});
  await related.locator('.related-quests summary').click();
  const relatedWidth=await related.evaluate(()=>({
    viewport:innerWidth,
    scroll:document.documentElement.scrollWidth,
    offenders:[...document.querySelectorAll('main *')].filter(el=>{
      const r=el.getBoundingClientRect();return r.right>innerWidth+2||r.left< -2;
    }).slice(0,12).map(el=>({tag:el.tagName,class:el.className?.toString().slice(0,80),
      width:Math.round(el.getBoundingClientRect().width),right:Math.round(el.getBoundingClientRect().right)}))
  }));
  assert(relatedWidth.scroll<=relatedWidth.viewport+2,
    'expanded related quest links must not overflow on phones: '+JSON.stringify(relatedWidth));
  await related.goto(url+'?quest=2070000651',{waitUntil:'domcontentloaded'});
  await related.locator('.detail .step').first().waitFor({timeout:20000});
  assert.equal(await related.locator('.related-quests').count(),0,
    'a singleton Realm group must not invent a related quest or prerequisite');
  await related.close();

  // Character names are source labels (not proof of unlocked residents).
  // Reuse only the existing verified public quest index; no private sources.
  const people=await browser.newPage({viewport:{width:390,height:844}});
  const peopleErrors=[],peopleDownloads=[];
  people.on('pageerror',e=>peopleErrors.push(String(e)));
  people.on('response',r=>{if(r.url().includes('/guide/public/'))peopleDownloads.push(r.url());});
  await people.goto('http://127.0.0.1:4177/Wand/guide/characters/',{waitUntil:'domcontentloaded'});
  await people.locator('.counts').waitFor({timeout:30000});
  assert.match(await people.locator('.counts').innerText(),/142[\s\S]*86[\s\S]*56/);
  assert.equal(peopleDownloads.filter(u=>u.endsWith('/quest-index.json')).length,1);
  assert.equal(peopleDownloads.filter(u=>u.includes('quest-details-')).length,0,
    'character names need no private or lazily loaded quest details');
  assert.equal(await people.locator('main.site-main input[type=file]').count(),0);
  const charSearch=people.getByRole('searchbox',{name:'キャラクター名称を検索'});
  await charSearch.fill('フランダー');
  assert.equal(await people.locator('.person').count(),1);
  await people.locator('.person').first().click();
  await people.waitForFunction(()=>location.search.includes('character=10000049'));
  assert.equal(await people.locator('.linked li').count(),0,'Flounder has no direct index link');
  assert.match(await people.locator('.details').innerText(),/ゲーム内にクエストが存在しないことを意味しません/);
  await chooseLanguage(people,'en');
  assert.match(await people.locator('.detail-head h2').innerText(),/Flounder/);
  await charSearch.fill('Captain Jack Sparrow');
  await people.locator('.person').first().click();
  await people.waitForFunction(()=>location.search.includes('character=10000001'));
  assert.equal(await people.locator('.detail-head .permalink').getAttribute('href'),
    '/Wand/guide/characters/?character=10000001');
  assert.ok(await people.locator('.linked li').count()>0);
  const linked=await people.locator('.linked li a').first().getAttribute('href');
  assert.match(linked,/^\/Wand\/guide\/quests\/\?quest=[1-9][0-9]+$/);
  await people.goBack();
  await people.waitForFunction(()=>location.search.includes('character=10000049'));
  assert.match(await people.locator('.detail-head').innerText(),/Flounder/);
  await people.goForward();
  await people.waitForFunction(()=>location.search.includes('character=10000001'));
  await people.getByRole('combobox',{name:'関連クエストで絞り込み'}).selectOption('withoutQuests');
  assert.equal(await people.locator('.person').count(),0,'Jack has direct linked quests');
  await people.getByRole('combobox',{name:'関連クエストで絞り込み'}).selectOption('all');
  await charSearch.fill('10000100');
  await people.locator('.person').first().click();
  assert.match(await people.locator('.warning').innerText(),/内部マーカー/);
  assert.equal(await people.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
    'mobile character directory overflow');
  assert.deepEqual(peopleErrors,[],peopleErrors.join('\n'));
  await people.close();

  const invalidCharacter=await browser.newPage();
  await invalidCharacter.goto('http://127.0.0.1:4177/Wand/guide/characters/?character=10000001&character=10000049',
    {waitUntil:'domcontentloaded'});
  await invalidCharacter.locator('.counts').waitFor({timeout:30000});
  assert.equal(await invalidCharacter.locator('.detail-head').count(),0,
    'duplicate deep link must not select any character');
  await invalidCharacter.close();

  // Guide is a future-first viewer-local event timeline. UTC task/exchange
  // instants remain exact; reset is a colored Wednesday day-marker, not a
  // claim of a verified precise server reset hour.
  const hub=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles',locale:'ja-JP'});
  const hubErrors=[];
  hub.on('pageerror',e=>hubErrors.push(String(e)));
  await hub.addInitScript(()=>{Date.now=()=>Date.parse('2026-11-22T12:00:00Z');});
  await hub.goto('http://127.0.0.1:4177/Wand/guide/',{waitUntil:'domcontentloaded'});
  await hub.locator('.timeline-row').first().waitFor({timeout:20000});
  // Repeated clicks at the original pointer coordinates must keep working
  // across month/year transitions and different date text lengths.
  for(const width of [1280,800,390,320]){
    await hub.setViewportSize({width,height:844});
    await hub.locator('.today-button').click();
    const previous=hub.locator('.nav-arrow.previous');
    const next=hub.locator('.nav-arrow.next');
    const before=await previous.boundingBox();
    const after=await next.boundingBox();
    assert(before&&after);
    const checkPosition=async()=>{
      for(const [locator,expected] of [[previous,before],[next,after]]){
        const current=await locator.boundingBox();
        assert(current&&Math.abs(current.x-expected.x)<=1&&Math.abs(current.y-expected.y)<=1,
          'calendar arrow shifted at viewport '+width);
      }
    };
    const initial=await hub.locator('.range').innerText();
    for(let i=0;i<4;i++){
      const prior=await hub.locator('.range').innerText();
      await hub.mouse.click(before.x+before.width/2,before.y+before.height/2);
      await hub.waitForFunction(old=>document.querySelector('.range')?.textContent?.trim()!==old,prior);
      await checkPosition();
    }
    for(let i=0;i<4;i++){
      const prior=await hub.locator('.range').innerText();
      await hub.mouse.click(after.x+after.width/2,after.y+after.height/2);
      await hub.waitForFunction(old=>document.querySelector('.range')?.textContent?.trim()!==old,prior);
      await checkPosition();
    }
    assert.equal(await hub.locator('.range').innerText(),initial);
  }
  await hub.setViewportSize({width:390,height:844});
  await hub.locator('.today-button').click();
  assert.equal(await hub.locator('.guide-sections a.service-card').count(),2);
  assert.equal(await hub.locator('.guide-sections a[href="/Wand/guide/quests/"]').count(),1);
  assert.equal(await hub.locator('.guide-sections a[href="/Wand/guide/star-path/"],.guide-sections a[href="/Wand/guide/events/"]').count(),0);
  assert.equal(await hub.locator('.guide-app').evaluate(root=>
    !!(root.querySelector('.timeline-panel').compareDocumentPosition(root.querySelector('.guide-sections'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,
    'calendar is first, with the two guide service cards beneath it');
  assert.equal(await hub.locator('.calendar-year').inputValue(),'2026',
    'the year control must have a visible selected year rather than a blank value');
  assert.equal(await hub.locator('.date-slot .month-label').innerText(),'12月');
  assert.equal(await hub.locator('.date-slot .month-label').evaluate(el=>
    el.parentElement.querySelector('.date-number').textContent),'1');
  assert.equal(await hub.locator('.guide-sections a[href="/Wand/guide/systems/"]').count(),1,
    'Systems is now a working Guide service, not a disabled placeholder');
  assert.equal(await hub.locator('.timeline-row').count(),2,
    'only scheduled events overlapping the visible five-week range appear');
  assert.equal(await hub.locator('.timeline-heading .date-slot').count(),35);
  assert.equal(await hub.locator('.date-slot.reset').count(),5);
  assert.equal(await hub.locator('.date-slot.today').count(),1);
  assert.equal(await hub.locator('.reset-line,.today-line,.header-today-line').count(),0,
    'today and resets should be highlighted day cells without overlaid vertical bars');
  const dateTints=await hub.locator('.dates-grid').evaluate(grid=>{
    const style=selector=>getComputedStyle(grid.querySelector(selector)).backgroundColor;
    return {
      today:style('.date-slot.today'),
      reset:style('.date-slot.reset'),
      other:style('.date-slot:not(.today):not(.reset)')
    };
  });
  assert.notEqual(dateTints.today,dateTints.reset,
    'today and reset dates have different subtle fills');
  assert.notEqual(dateTints.today,dateTints.other);
  assert.notEqual(dateTints.reset,dateTints.other);
  assert.equal(await hub.locator('.timeline-row[data-category="starpath"]').count(),2);
  const markerRatio=await hub.locator('.date-slot.today').evaluate(el=>{
    const scroll=el.closest('.timeline-scroll');
    const sidebar=scroll.querySelector('.date-label').getBoundingClientRect().width;
    const header=el.closest('.dates-grid').getBoundingClientRect();
    const track=header.width;
    return (el.getBoundingClientRect().left+el.getBoundingClientRect().width/2-header.left)/track;
  });
  assert(markerRatio>.1&&markerRatio<.16,'today should be in the left 10–15% of the date axis');

  assert.match(await hub.locator('.calendar-nav').innerText(),/2026年11月18日.*2026年12月22日/);
  assert.match(await hub.locator('.timeline-content').innerText(),/ホーンテッド・エレガンス/);
  assert.match(await hub.locator('.timeline-content').innerText(),/マリンアドベンチャー/);
  assert.equal(await hub.locator('.timeline-bar.task').count(),2);
  assert.equal(await hub.locator('.timeline-bar.exchange').count(),2);
  assert(await hub.locator('.timeline-panel').evaluate(panel=>
    panel.getBoundingClientRect().bottom-panel.querySelector('.timeline-content').getBoundingClientRect().bottom<36),
    'calendar must not reserve unused vertical event rows');
  for(const [code,title] of [
    ['en','Haunting Elegance'],['fr','Élégance spectrale'],['it','Eleganza stregata'],
    ['de','Geisterhafte Eleganz'],['es-ES','Elegancia Aterradora'],['zh-CN','幽魅典雅'],
    ['pt-BR','Elegância Assombrosa'],['ja','ホーンテッド・エレガンス']
  ]){
    await hub.evaluate(code=>{
      localStorage.setItem('dreamwishwand.ui.language.v1',code);
      window.dispatchEvent(new CustomEvent('wand:ui-language',{detail:code}));
    },code);
    await hub.locator('.event-name').filter({hasText:title}).waitFor();
  }
  const eventLegend=await hub.locator('.timeline-key').innerText();
  assert.match(eventLegend,/スターパス/);
  assert.match(eventLegend,/フローティングフェスティバル/);
  assert.match(eventLegend,/その他のイベント/);
  assert.doesNotMatch(eventLegend,/スターパス\s*[・·]\s*タスク|交換|猶予期間/);
  assert.equal((eventLegend.match(/スターパス/g)||[]).length,1,
    'the stripe remains within Star Path, with no separate named calendar category');
  const barStyles=await hub.locator('.timeline-bar.task,.timeline-bar.exchange')
    .evaluateAll(items=>items.map(item=>({
      phase:item.classList.contains('exchange')?'grace':'regular',
      background:getComputedStyle(item).backgroundImage
    })));
  assert.equal(barStyles.filter(x=>x.phase==='regular').length,2);
  assert.equal(barStyles.filter(x=>x.phase==='grace').length,2);
  assert(barStyles.every(x=>x.background.includes('linear-gradient')),
    'both task and grace periods retain the same purple gradient');
  assert(barStyles.filter(x=>x.phase==='grace')
    .every(x=>x.background.includes('repeating-linear-gradient')),
    'grace-only phase is identifiable by a stripe overlay');
  assert(barStyles.filter(x=>x.phase==='regular')
    .every(x=>!x.background.includes('repeating-linear-gradient')),
    'the regular Star Path is not striped');
  assert.match(await hub.locator('.timeline-bar.exchange').first().getAttribute('aria-label'),/報酬交換のみ/);
  assert.equal(await hub.locator('.timeline-bar span').count(),0,
    'short timeline strips convey the phase visually without redundant text');

  assert.equal(await hub.locator('.timeline-bar.limited').count(),0);
  assert.equal(await hub.locator('.events-list,.schedule-card,.day').count(),0,
    'do not duplicate daily events into a second text-heavy schedule');
  assert.equal(await hub.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
    'timeline should scroll internally without overflowing the mobile viewport');
  assert.equal(await hub.locator('.timeline-scroll').evaluate(el=>el.scrollWidth>el.clientWidth),true,
    'dates remain horizontally scrollable on narrow screens');
  await hub.locator('.source-info summary').click();
  assert.match(await hub.locator('.source-info').innerText(),
    /日程は保存済みの情報です/);
  await hub.locator('.source-info summary').click();
  await hub.getByRole('button',{name:'前の期間'}).click();
  assert.match(await hub.locator('.calendar-nav').innerText(),/2026年10月14日.*2026年11月17日/);
  assert.equal(await hub.locator('.timeline-bar.limited').count(),2);
  assert.equal(await hub.locator('.timeline-bar.floating').count(),1);
  assert.equal(await hub.locator('.timeline-bar.other').count(),1,
    'official 2026 Trick or Treat dates are now part of historical calendar');

  const festival=hub.locator('.timeline-row')
    .filter({hasText:'ホーンテッドフローティングフェスティバル'});
  await festival.locator('.timeline-bar').first().click();
  assert.match(await hub.locator('.event-inspector').innerText(),/2026\/10\/06 17:00 GMT-7/,
    'native Festival opening UTC instant must convert to Los Angeles local time');
  assert.match(await hub.locator('.event-inspector').innerText(),/2026\/10\/31 16:59 GMT-7/);
  assert.doesNotMatch(await hub.locator('.event-inspector').innerText(),/時刻未確認/,
    'source-native timestamps are present and must not be presented as date-only');
  const festivalCalendarHref='/Wand/guide/events/?event=HauntedFloatingFestival2026';
  assert.equal(await hub.locator('.event-inspector a.primary').getAttribute('href'),
    festivalCalendarHref);
  assert.equal(await festival.locator('a.event-label').getAttribute('href'),festivalCalendarHref);
  await festival.locator('a.event-label').click();
  await hub.locator('.reward-detail .native-id')
    .filter({hasText:'HauntedFloatingFestival2026'}).waitFor({timeout:20000});
  assert.equal(await hub.locator('.reward-detail .reward-row').count(),9,
    'the timeline opens the 2026 native Festival, not the old 5-reward version');
  await hub.goBack({waitUntil:'domcontentloaded'});
  await hub.locator('.timeline-row').first().waitFor({timeout:20000});
  // Week range navigation is local state, not a URL that persists on Back.
  assert.match(await hub.locator('.calendar-nav').innerText(),/2026年11月18日.*2026年12月22日/);
  const seafaringCalendarHref='/Wand/guide/star-path/?season=Seafaring2026';
  const seafaringRow=hub.locator('.timeline-row').filter({hasText:'マリンアドベンチャー'});
  await seafaringRow.locator('.timeline-bar.task').click();
  assert.equal(await hub.locator('.event-inspector a.primary').getAttribute('href'),
    seafaringCalendarHref);
  assert.match(await hub.locator('.event-inspector').innerText(),/2026\/12\/01 06:00 GMT-8/,
    'the player sees exact source deadline in the browser-local timezone');
  assert.equal(await seafaringRow.locator('a.event-label').getAttribute('href'),seafaringCalendarHref);
  await seafaringRow.locator('a.event-label').click();
  await hub.locator('.seasons button.selected')
    .filter({hasText:'Seafaring Star Path'}).waitFor({timeout:20000});
  assert.match(await hub.locator('.seasons button.selected').innerText(),/Seafaring Star Path/);
  await hub.goto('http://127.0.0.1:4177/Wand/guide/',{waitUntil:'domcontentloaded'});
  await hub.locator('.timeline-row').first().waitFor({timeout:20000});
  await hub.locator('.calendar-year').selectOption('2022');
  assert.equal(await hub.locator('.calendar-year').inputValue(),'2022');
  await hub.waitForFunction(()=>document.querySelector('.calendar-nav .range')?.textContent?.includes('2022')||
    document.querySelector('.timeline-content')?.textContent?.includes('ピクサーフェスト'));
  assert.match(await hub.locator('.timeline-content').innerText(),/ピクサーフェスト/);
  assert.equal(await hub.locator('.timeline-bar.exchange').count(),0,
    'do not fabricate an unconfirmed 2022 rewards-only grace period');
  await hub.locator('.timeline-row').filter({hasText:'ピクサーフェスト'})
    .locator('button.event-label').click();
  assert.match(await hub.locator('.event-inspector').innerText(),/2022\/10\/11 06:00 GMT-7/);
  assert.match(await hub.locator('.event-inspector').innerText(),/過去のスターパスは再参加不可/);
  assert.equal(await hub.locator('.event-inspector a.primary').count(),0,
    'historic online-only passes must not link to current season duties');
  assert.equal(await hub.locator('.event-inspector a[href^="https://disneydreamlightvalley.com/"]').count(),0);
  await hub.locator('.calendar-year').selectOption('2025');
  assert.match(await hub.locator('.timeline-content').innerText(),/幸運のクローバー/,
    '2025 first native event is now visible without nonofficial wiki data');
  await hub.locator('.calendar-year').selectOption('2023');
  assert.match(await hub.locator('.timeline-content').innerText(),/100周年/);
  await hub.getByRole('button',{name:'次の期間'}).click();
  assert.match(await hub.locator('.timeline-content').innerText(),/イースター|ディズニーパーク/);
  assert.equal(await hub.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
    'adding the year selector must not cause mobile page overflow');
  // 2022 must not require dozens of repeated backward clicks.
  await hub.goto('http://127.0.0.1:4177/Wand/guide/systems/',{waitUntil:'domcontentloaded'});
  await hub.locator('.system-categories button').first().waitFor({timeout:20000});
  assert.equal(await hub.locator('.system-categories button').count(),7);
  assert.equal(await hub.locator('.topic-buttons button').count(),16);
  await hub.locator('.system-categories button').nth(3).click();
  assert.equal(await hub.locator('.topic-buttons button').count(),21);
  await hub.locator('.system-search input').fill('浮島');
  assert.equal(await hub.locator('.topic-buttons button').count(),1);
  assert.match(await hub.locator('.topic-buttons button').innerText(),/浮島/);
  await hub.locator('.topic-buttons button').click();
  assert.equal(await hub.locator('.topic-detail').count(),1);
  assert.equal(await hub.locator('.topic-detail a.related').getAttribute('href'),'/Wand/world/preview/');
  assert.deepEqual(hubErrors,[],hubErrors.join('\\n'));
  await hub.close();

  const limited=await browser.newPage();
  await limited.goto('http://127.0.0.1:4177/Wand/guide/events/',{waitUntil:'domcontentloaded'});
  await limited.getByRole('heading',{name:'イベント・友情報酬'}).waitFor({timeout:20000});
  await limited.locator('.event-option').first().waitFor({timeout:20000});
  assert.equal(await limited.locator('.event-option').count(),23,
    '23 user-facing native source event definitions; placeholder excluded');
  await limited.getByRole('searchbox',{name:'イベントや報酬を検索'}).fill('人食い宝箱');
  await limited.getByText('人食い宝箱',{exact:true}).first().waitFor({timeout:20000});
  assert.match(await limited.locator('.reward-detail').innerText(),/ID 40006319/);
  await limited.getByRole('button',{name:'友情報酬'}).click();
  assert.equal(await limited.locator('.friendship-level').count(),4);
  assert.equal(await limited.locator('.friendship .reward-row').count(),16);
  await limited.locator('.official summary').click();
  assert.match(await limited.locator('.official').innerText(),/Oogie Boogie/);
  assert.equal(await limited.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
    'event rewards must not overflow desktop');
  // DB-02 and Collection can deep-link from original Item ID to the exact
  // native event reward, without requiring any player save or live server.
  await limited.goto('http://127.0.0.1:4177/Wand/guide/events/?item=40006319',
    {waitUntil:'domcontentloaded'});
  await limited.getByText('人食い宝箱',{exact:true}).first().waitFor({timeout:20000});
  assert.match(await limited.locator('.reward-detail').innerText(),/HauntedFloatingFestival2026/);
  assert.equal(await limited.locator('.reward-detail .reward-row').count(),1,
    'direct item link narrows the source event to the exact matching reward slot');
  const collectionReward=limited.locator('.reward-detail a.collection-reward-link');
  await collectionReward.waitFor({timeout:20000});
  assert.equal(await collectionReward.getAttribute('href'),'/Wand/collection/?item=40006319');
  await collectionReward.click();
  await limited.locator('.item-inspector h2').waitFor({timeout:30000});
  assert.match(await limited.locator('.item-inspector h2').innerText(),/人食い宝箱|Chomping Chest/,
    'published v1.26.2 reward must open its verified Collection item inspector');
  await limited.goBack({waitUntil:'domcontentloaded'});
  await limited.locator('.reward-detail .reward-row').first().waitFor({timeout:20000});
  assert.equal(await limited.locator('.reward-detail .reward-row').count(),1);
  await limited.getByRole('button',{name:'すべて表示'}).click();
  assert.equal(await limited.locator('.reward-detail .reward-row').count(),9,
    'clearing a direct Item-ID focus restores all original event reward slots');
  await limited.goto('http://127.0.0.1:4177/Wand/guide/events/?item=80000000',
    {waitUntil:'domcontentloaded'});
  await limited.locator('.friendship .reward-row').first().waitFor({timeout:20000});
  assert.equal(await limited.locator('.friendship .reward-row').count(),12,
    'friendship currency Item-ID direct link selects the default friendship section');
  assert.match(await limited.locator('.friendship .reward-row').first().innerText(),
    /Item ID 80000000/,
    'a reward outside the published DB-00 release must not acquire a fabricated name');
  assert.equal(await limited.locator('.friendship a.collection-reward-link').count(),0,
    'do not generate a Collection deep link for unpublished source Item IDs');
  // Native Duty IDs are searchable without an unattributed duty-name UI:
  // one 2026-only original duty must select the exact source Mini Event.
  await limited.goto('http://127.0.0.1:4177/Wand/guide/events/',
    {waitUntil:'domcontentloaded'});
  await limited.getByRole('searchbox',{name:'イベントや報酬を検索'}).fill('2110100374');
  await limited.locator('.event-list .event-option').first().waitFor({timeout:25000});
  assert.equal(await limited.locator('.event-list .event-option').count(),1);
  assert.equal(await limited.locator('.reward-detail .native-id').innerText(),
    'DreamlightParkFest_UI_2026');
  await limited.getByRole('searchbox',{name:'イベントや報酬を検索'}).fill('2110100411');
  await limited.locator('.event-list .event-option').first().waitFor({timeout:25000});
  assert.equal(await limited.locator('.event-list .event-option').count(),1);
  assert.equal(await limited.locator('.reward-detail .native-id').innerText(),
    'TrickOrTreat_2026');
  await limited.close();

  // Duplicate static reward Items have exact per-edition deep links.
  // Selecting another event must retain the Item focus, not claim a grant.
  const crossEvent=await browser.newPage({viewport:{width:390,height:844}});
  await crossEvent.goto('http://127.0.0.1:4177/Wand/guide/events/?event=HauntedFloatingFestival2026',
    {waitUntil:'domcontentloaded'});
  const repeated=crossEvent.locator('.reward-detail .related-item-events')
    .filter({hasText:'他のイベントを表示'}).first();
  await repeated.waitFor({timeout:20000});
  const exactHref=await repeated.getAttribute('href');
  assert.match(exactHref,/^\/Wand\/guide\/events\/\?event=HauntedFloatingFestival2026&item=\d+$/);
  const itemId=new URL(exactHref,'http://127.0.0.1').searchParams.get('item');
  await repeated.click();
  await crossEvent.locator('.event-option').filter({hasText:'ホーンテッドフローティングフェスティバル'}).first().waitFor({timeout:20000});
  assert.equal(await crossEvent.locator('.event-list .event-option').count(),2);
  assert.equal(await crossEvent.locator('.reward-detail .native-id').innerText(),'HauntedFloatingFestival2026');
  assert.equal(await crossEvent.locator('.reward-detail .reward-row').count(),1);
  await crossEvent.goBack();
  await crossEvent.locator('.reward-detail .reward-row').first().waitFor();
  assert.equal(await crossEvent.locator('.reward-detail .reward-row').count(),9,
    'browser back restores the original full-event reward view');
  await crossEvent.goForward();
  await crossEvent.locator('.reward-detail .reward-row').first().waitFor();
  assert.equal(await crossEvent.locator('.reward-detail .reward-row').count(),1,
    'browser forward restores the exact event+Item source link');
  await crossEvent.reload({waitUntil:'domcontentloaded'});
  await crossEvent.locator('.reward-detail .reward-row').first().waitFor({timeout:20000});
  assert.equal(await crossEvent.locator('.reward-detail .native-id').innerText(),'HauntedFloatingFestival2026');
  assert.equal(await crossEvent.locator('.reward-detail .reward-row').count(),1,
    'event+Item permalink must also survive a hard reload');
  await crossEvent.locator('.event-option').filter({hasText:'ホーンテッドフローティングフェスティバル'}).first().click();
  assert.equal(await crossEvent.locator('.reward-detail .native-id').innerText(),'HauntedFloatingFestival');
  assert.equal(await crossEvent.locator('.reward-detail .reward-row').count(),1);
  assert.equal(new URL(crossEvent.url()).searchParams.get('item'),itemId);
  assert.equal(new URL(crossEvent.url()).searchParams.get('event'),'HauntedFloatingFestival');
  // The exact original window follows the selected event, even when both
  // editions have the same localized name and share a reward.
  const previousWindow=crossEvent.locator('.event-schedule time');
  assert.deepEqual(await previousWindow.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('datetime'))),
    ['2025-10-22T00:00:00Z','2025-11-11T23:59:00Z']);
  assert.equal(await crossEvent.locator('.event-list .event-date-range').count(),2);
  assert.match(await previousWindow.first().innerText(),/2025/);
  await crossEvent.close();

  // Steam 1.26.2 original Scene references locate only source-linked
  // Floating Festivals, without treating a Scene ID as a live venue or access.
  const scenePage=await browser.newPage({viewport:{width:390,height:844}});
  const sceneErrors=[];
  scenePage.on('pageerror',e=>sceneErrors.push(String(e)));
  await scenePage.goto('http://127.0.0.1:4177/Wand/guide/events/?scene=1540000195',
    {waitUntil:'domcontentloaded'});
  await scenePage.waitForFunction(()=>
    document.querySelector('input[type="search"]')?.value==='1540000195',
    {timeout:25000});
  assert.equal(await scenePage.locator('.event-list .event-option').count(),2);
  const floatingNames=await scenePage.locator('.event-list .event-title').allInnerTexts();
  assert.equal(floatingNames.length,2);
  assert(floatingNames.every(name=>name.includes('ハロウィン')||name.length>0));
  await scenePage.getByRole('searchbox',{name:'イベントや報酬を検索'})
    .fill('1540000252');
  await scenePage.locator('.event-list .event-option').first().waitFor({timeout:20000});
  assert.equal(await scenePage.locator('.event-list .event-option').count(),1,
    'a 2026-only subscene belongs to the native 2026 Festival definition');
  assert.equal(await scenePage.locator('.reward-detail .native-id').innerText(),
    'HauntedFloatingFestival2026');
  assert.equal(new URL(scenePage.url()).searchParams.has('scene'),false,
    'editing search clears stale Scene deep-link query');
  assert.equal(await scenePage.evaluate(()=>
    document.documentElement.scrollWidth<=innerWidth+2),true);
  assert.deepEqual(sceneErrors,[],sceneErrors.join('\\n'));
  await scenePage.close();

  // Exact original ProtoDb Mini Event -> Quest IDs, both directions.
  // Exclude internal TestEv and do not infer active events or unlock order.
  const eventQuest=await browser.newPage({viewport:{width:390,height:844}});
  const eventQuestErrors=[];
  eventQuest.on('pageerror',e=>eventQuestErrors.push(String(e)));
  // Deep links are accepted only after the original ID graph and public
  // Quest catalogue (where required) are verified, never by URL alone.
  await eventQuest.goto('http://127.0.0.1:4177/Wand/guide/events/?quest=2070001248',
    {waitUntil:'domcontentloaded'});
  await eventQuest.waitForFunction(()=>
    document.querySelector('input[type="search"]')?.value==='2070001248',
    {timeout:25000});
  assert.equal(await eventQuest.locator('.event-list .event-option').count(),2);
  assert.equal(await eventQuest.locator('.reward-detail .native-id').innerText(),
    'DreamlightParkFest');
  await eventQuest.getByRole('searchbox',{name:'イベントや報酬を検索'})
    .fill('2070001059');
  await eventQuest.locator('.event-list .event-option').first().waitFor({timeout:25000});
  assert.equal(await eventQuest.locator('.event-list .event-option').count(),1);
  assert.equal(new URL(eventQuest.url()).searchParams.has('quest'),false,
    'manual search clears a stale Quest reverse-link focus');

  await eventQuest.goto('http://127.0.0.1:4177/Wand/guide/events/?duty=2110100289',
    {waitUntil:'domcontentloaded'});
  await eventQuest.waitForFunction(()=>
    document.querySelector('input[type="search"]')?.value==='2110100289',
    {timeout:25000});
  assert.equal(await eventQuest.locator('.event-list .event-option').count(),2);
  assert.equal(await eventQuest.locator('.reward-detail .native-id').innerText(),
    'LuckyYou_UI_2026');
  await eventQuest.goto('http://127.0.0.1:4177/Wand/guide/events/?duty=999999999',
    {waitUntil:'domcontentloaded'});
  await eventQuest.locator('.event-list .event-option').first().waitFor({timeout:25000});
  assert.equal(await eventQuest.locator('.event-list .event-option').count(),23);
  assert.equal(await eventQuest.getByRole('searchbox',{name:'イベントや報酬を検索'}).inputValue(),'',
    'unrecognized Duty must not masquerade as a verified Event source link');
  await eventQuest.goto('http://127.0.0.1:4177/Wand/guide/events/?duty=2110100289&scene=1540000195',
    {waitUntil:'domcontentloaded'});
  await eventQuest.locator('.event-list .event-option').first().waitFor({timeout:25000});
  assert.equal(await eventQuest.getByRole('searchbox',{name:'イベントや報酬を検索'}).inputValue(),'',
    'conflicting original-ID links must never choose an arbitrary relation');

  await eventQuest.goto('http://127.0.0.1:4177/Wand/guide/events/?event=DreamlightParkFest_UI_2026',
    {waitUntil:'domcontentloaded'});
  const relatedEventQuests=eventQuest.locator('.event-quests');
  await relatedEventQuests.locator('summary').waitFor({timeout:25000});
  assert.equal(await relatedEventQuests.evaluate(el=>el.open),false);
  await relatedEventQuests.locator('summary').click();
  assert.equal(await relatedEventQuests.locator('a').count(),19);
  const eventQuestHref=await relatedEventQuests.locator('a[href*="quest=2070001248"]')
    .first().getAttribute('href');
  assert.equal(eventQuestHref,'/Wand/guide/quests/?quest=2070001248');
  await eventQuest.goto(url+'?quest=2070001248',{waitUntil:'domcontentloaded'});
  const relatedQuestEvents=eventQuest.locator('.quest-events');
  await relatedQuestEvents.locator('summary').waitFor({timeout:25000});
  assert.equal(await relatedQuestEvents.evaluate(el=>el.open),false);
  await relatedQuestEvents.locator('summary').click();
  assert.equal(await relatedQuestEvents.locator('a').count(),2);
  assert.equal(await relatedQuestEvents.locator('a[href*="event=DreamlightParkFest_UI_2026"]')
    .count(),1);
  assert.equal(await eventQuest.evaluate(()=>
    document.documentElement.scrollWidth<=innerWidth+2),true,
    'native Event-to-Quest cross links stay within mobile viewport');
  // Search by a localized title from the independently verified Quest
  // catalogue, not an event title, reward label or a private DutyAch key.
  await eventQuest.goto('http://127.0.0.1:4177/Wand/guide/events/',
    {waitUntil:'domcontentloaded'});
  await eventQuest.getByRole('searchbox',{name:'イベントや報酬を検索'})
    .fill('動物のオヤツ');
  await eventQuest.waitForFunction(()=>
    document.querySelectorAll('.event-list .event-option').length===2,
    {timeout:25000});
  assert.equal(await eventQuest.locator('.event-list .event-option').count(),2);
  assert.deepEqual(await eventQuest.locator('.event-list .event-option .event-title').allInnerTexts(),
    ['ドリームライトパークフェス','ドリームライトパークフェス']);
  await eventQuest.getByRole('searchbox',{name:'イベントや報酬を検索'})
    .fill('実在しないクエスト');
  await eventQuest.locator('.event-list .empty').waitFor({timeout:15000});
  assert.equal(await eventQuest.locator('.event-list .event-option').count(),0);
  assert.deepEqual(eventQuestErrors,[],eventQuestErrors.join('\\n'));
  await eventQuest.close();

  // Public Star Path is source-pinned static cache data, not a personal import.
  const star = await browser.newPage({viewport:{width:390,height:844}});
  await star.addInitScript(()=>{Date.now=()=>Date.parse('2026-11-22T12:00:00Z');});
  const starErrors = [];
  const inactiveMediaRequests = [];
  star.on('pageerror',e=>starErrors.push(String(e)));
  star.on('request',r=>{if(/starpath-media-[a-f0-9]+|\/media\/steam-v1\.26\.2\//.test(r.url()))inactiveMediaRequests.push(r.url());});
  await star.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await star.getByRole('button',{name:'Seafaring Star Path'}).waitFor({timeout:20000});
  assert.match(await star.locator('.deadline-strip').innerText(),/タスク期限/);
  assert.equal(await star.locator('.historic-starpaths').evaluate(el=>el.open),false,
    'official-only history must not obscure the verified current Star Path tasks');
  await star.locator('.historic-starpaths summary').click();
  assert.equal(await star.locator('.historic-starpaths li').count(),21,
    'all 21 source-backed official historical season references are available');
  assert.equal(await star.locator('.historic-starpaths a').first().getAttribute('href'),
    'https://disneydreamlightvalley.com/news/early-access-play-now');
  assert.match(await star.locator('.historic-starpaths').innerText(),/報酬アイテムIDは未確認/,
    'official announcements are not native reward-item grants');
  await star.locator('.historic-starpaths summary').click();
  assert.equal(await star.locator('.entries li').count()>0,true,
    'archived reference links must not interfere with authenticated Star Path duties');
  assert.equal(await star.locator('.season-more').evaluate(el=>el.open),false,
    'verbose source metadata must not displace the duty list by default');
  await star.locator('.season-more summary').click();
  assert.match(await star.locator('.summary').innerText(),/121 \/ 21/);
  assert.match(await star.locator('.entries li').first().innerText(),/闇のトゲを引っこ抜く/);
  assert.match(await star.locator('.entries li').first().innerText(),/目標 3個/,'source goal visible for initial duty');
  await chooseLanguage(star,'en');
  assert.match(await star.locator('.entries li').first().innerText(),/Uproot Night Thorns/);
  assert.match(await star.locator('.entries li').first().innerText(),/Goal 3 items/,
    'verified goal units follow the global English language selector');
  await chooseLanguage(star,'ja');
  await star.getByRole('searchbox',{name:'通常タスクを検索'}).fill('Task17');
  assert.match(await star.locator('.entries li').first().innerText(),/ドナルドダックを同行者/);
  assert.match(await star.locator('.entries li').first().innerText(),/目標 10分/,'hangout source minutes');
  await star.getByRole('searchbox',{name:'通常タスクを検索'}).fill('ジャック');
  assert.match(await star.locator('.entries').first().innerText(),/ジャック・スケリントン/,
    'indexed riddle identifies named source-guarded character');
  await star.getByRole('searchbox',{name:'通常タスクを検索'}).fill('存在しないタスク');
  assert.match(await star.getByRole('status').filter({hasText:'一致する通常タスクはありません'}).innerText(),/一致する通常タスク/);
  await star.getByRole('searchbox',{name:'通常タスクを検索'}).fill('闇のトゲ');
  assert.match(await star.locator('.entries li').first().innerText(),/闇のトゲ/);
  await star.getByRole('searchbox',{name:'通常タスクを検索'}).fill('');
  assert.equal(await star.locator('main.site-main input[type=file]').count(),0);
  await star.getByRole('button',{name:'Seafaring Star Path'}).click();
  assert.match(await star.locator('.summary').innerText(),/25 \/ 18/);
  assert.match(await star.locator('.entries li').first().innerText(),/魚を釣る/);
  await chooseLanguage(star,'fr');
  assert.match(await star.locator('.entries li').first().innerText(),/Attrape des poissons/);
  assert.match(await star.locator('.entries li').first().innerText(),/Objectif 10 poissons/,
    'French goal uses localized display units with the pinned cache amount');
  await chooseLanguage(star,'ja');
  await star.getByRole('searchbox',{name:'通常タスクを検索'}).fill('Task19');
  assert.match(await star.locator('.entries li').first().innerText(),/ピーター・パン/);
  await star.getByRole('searchbox',{name:'通常タスクを検索'}).fill('');
  await star.getByRole('button',{name:'週間タスク'}).click();
  assert.equal(await star.locator('.week').count(),6);
  await star.getByRole('searchbox',{name:'週間タスクを検索'}).fill('アリエル');
  assert.match(await star.locator('.week').first().innerText(),/アリエル/,
    'weekly indexed editorial interpretation is discoverable');
  await star.getByRole('searchbox',{name:'週間タスクを検索'}).fill('存在しない週間タスク');
  assert.match(await star.getByRole('status').filter({hasText:'一致する週間タスクはありません'}).innerText(),/一致する週間タスク/);
  await star.getByRole('searchbox',{name:'週間タスクを検索'}).fill('');
  assert.equal(await star.locator('.week').count(),6,'all original weekly groups restored');
  assert.match(await star.locator('.week').first().innerText(),/魚を20匹釣る/);
  assert.match(await star.locator('.week').first().innerText(),/目標 20匹/,'weekly source goal quantity');
  await chooseLanguage(star,'en');
  assert.match(await star.locator('.week').first().innerText(),/Catch 20 fish/);
  await chooseLanguage(star,'de');
  assert.match(await star.locator('.week').nth(2).innerText(),/Fange 20 Fische am schillernden Strand/);
  assert.match(await star.locator('.week').nth(2).innerText(),/Ziel 25 Fische/,
    'verified cache goal retains 25 without rewriting official German text');
  assert.match(await star.locator('.week').nth(2).innerText(),/Abweichung im Spieltext: 20 Fische/,
    'show a transparent, source-verified localized discrepancy');
  await chooseLanguage(star,'ja');
  assert.match(await star.locator('.week').nth(2).innerText(),/輝きの浜辺で魚を25匹釣る/);
  await star.getByRole('button',{name:'報酬'}).click();
  assert.equal(await star.locator('.week').count(),4);
  assert.equal(await star.locator('.reward-entry').count(),17,
    'all 10 original, 1 bonus and 6 Vault rewards must render as cards');
  assert.equal(await star.locator('.reward-provenance').evaluate(el=>el.open),false,
    'source technical caveats should not consume card space by default');
  await star.locator('.reward-provenance summary').click();
  assert.match(await star.locator('.reward-provenance').innerText(),/SRC-04の正式公開後/);
  assert.equal(await star.locator('.reward-source').first().evaluate(el=>el.open),false,
    'raw item IDs should stay collapsed');
  assert.match(await star.locator('.reward-entry').first().innerText(),/×1/);
  assert.match(await star.locator('.reward-entry').first().innerText(),/プレミアム/);
  assert.match(await star.locator('.reward-entry').first().innerText(),/100 Doubloon Tokens/,
    'reward price must show the actual source token currency');
  await star.locator('.reward-source summary').first().click();
  assert.match(await star.locator('.reward-source').first().innerText(),/120000253/);
  assert.equal(await star.locator('.reward-entry img').count(),0,'non-public SRC04 must not render images');
  assert.match(await star.locator('.week').first().innerText(),/アクアマーメイドバックパック/);
  assert.match(await star.locator('.week').first().innerText(),/サル（大尉）/);
  assert.match(await star.locator('.week').first().innerText(),/ムーンストーン/);
  assert.match(await star.locator('.week').first().innerText(),/モチーフ（正式名称なし）/);
  assert.equal(await star.locator('.reward-grid').count(),4,'render 4 distinct reward groups');
  assert.match(await star.locator('.summary').innerText(),/700 ムーンストーン/);
  await chooseLanguage(star,'en');
  assert.match(await star.locator('.week').first().innerText(),/Aqua Mermaid Backpack/);
  assert.match(await star.locator('.summary').innerText(),/700 Moonstone/);
  assert.match(await star.locator('.week').first().innerText(),/Lieutenant Monkey/);
  assert.match(await star.locator('.week').first().innerText(),/Motif \(no official display name\)/);
  const rewardSearch=star.getByRole('textbox',{name:'報酬を検索'});
  const rewardTier=star.getByRole('combobox',{name:'報酬の入手枠'});
  await rewardSearch.fill('Lieutenant Monkey');
  assert.equal(await star.locator('.reward-entry').count(),1,'localized reward name search');
  assert.match(await star.locator('.reward-entry .reward-name').innerText(),/Lieutenant Monkey/);
  await rewardTier.selectOption('free');
  assert.equal(await star.locator('.reward-entry').count(),0,'free tier excludes premium monkey');
  assert.match(await star.getByRole('status').filter({hasText:'一致する報酬はありません。'}).innerText(),/一致する報酬はありません/);
  await rewardTier.selectOption('premium');
  assert.equal(await star.locator('.reward-entry').count(),1,'premium tier shows premium monkey');
  await rewardSearch.fill('80100000');
  await rewardTier.selectOption('free');
  assert.equal(await star.locator('.reward-entry').count(),1,'free Moonstone excludes paid and recurrent');
  assert.match(await star.locator('.reward-entry').innerText(),/Moonstone/);
  assert.match(await star.locator('.reward-entry').innerText(),/×100/,
    'source reward quantity is not hidden in the token price');
  await rewardSearch.fill('');
  await rewardTier.selectOption('all');
  assert.equal(await star.locator('.week').count(),4,'all reward pages restored');
  assert.equal(await star.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'Star Path mobile overflow');
  assert.deepEqual(inactiveMediaRequests,[],'inactive media release must not make requests');
  assert.deepEqual(starErrors,[],starErrors.join('\n'));
  await star.close();
  // A season is archived after its original schedule, but its source-verified
  // tasks and rewards must remain useful without pretending it is live.
  const expired=await browser.newPage();
  await expired.addInitScript(()=>{Date.now=()=>Date.parse('2026-12-10T00:00:00Z');});
  await expired.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await expired.getByRole('button',{name:/Seafaring Star Path.*終了/}).waitFor({timeout:20000});
  assert.equal(await expired.getByRole('button',{name:/Haunting Elegance.*終了/}).count(),1);
  assert.match(await expired.locator('.archive-notice').innerText(),/終了済みのスターパス/);
  assert.match(await expired.locator('.entries li').first().innerText(),/闇のトゲ/,
    'verified archived duties remain browsable even after the final exchange deadline');
  await expired.getByRole('button',{name:/Seafaring Star Path.*終了/}).click();
  assert.match(await expired.locator('.entries li').first().innerText(),/魚を釣る/);
  await expired.getByRole('button',{name:'報酬'}).click();
  assert.equal(await expired.locator('.reward-entry').count(),17,
    'expired archived rewards remain available for reference without player-state claims');
  await expired.close();

  // Deep links address exact verified source duties regardless of old event dates,
  // and can reach beyond the 60-row progressive render window.
  const normalLink=await browser.newPage();
  await normalLink.addInitScript(()=>{Date.now=()=>Date.parse('2026-12-10T00:00:00Z');});
  await normalLink.goto('http://127.0.0.1:4177/Wand/guide/star-path/?season=HauntingElegance2026&task=Task120',
    {waitUntil:'domcontentloaded'});
  await normalLink.locator('#starpath-HauntingElegance2026-Task120.permalink-focused').waitFor({timeout:20000});
  assert(await normalLink.locator('.entries li').count()>100,
    'deep link must expose the requested duty beyond the first 60 rows');
  assert.equal(await normalLink.locator('.tabs button.active').innerText(),'通常タスク');
  assert.match(await normalLink.locator('#starpath-HauntingElegance2026-Task120').innerText(),/前菜/);
  assert.equal(await normalLink.getByRole('link',{name:'タスク Task120 の共有リンク'}).getAttribute('href'),
    '/Wand/guide/star-path/?season=HauntingElegance2026&task=Task120');
  assert.match(await normalLink.locator('.archive-notice').innerText(),/終了済み/);
  await normalLink.getByRole('button',{name:'週間タスク'}).click();
  assert.equal(new URL(normalLink.url()).search,'','manual tab changes clear stale permalink parameters');
  assert.equal(await normalLink.locator('.permalink-focused').count(),0);
  await normalLink.close();

  const weeklyLink=await browser.newPage();
  await weeklyLink.goto('http://127.0.0.1:4177/Wand/guide/star-path/?season=HauntingElegance2026&task=Week02Task03',
    {waitUntil:'domcontentloaded'});
  await weeklyLink.locator('#starpath-HauntingElegance2026-Week02Task03.permalink-focused').waitFor({timeout:20000});
  assert.equal(await weeklyLink.locator('.tabs button.active').innerText(),'週間タスク');
  assert.match(await weeklyLink.locator('.permalink-focused').innerText(),/Candy Cane Door/,
    'specific original photo target is included at its shareable weekly link');
  await weeklyLink.getByRole('link',{name:'タスク Week01Task01 の共有リンク'}).click();
  await weeklyLink.waitForFunction(()=>location.search.includes('task=Week01Task01'));
  await weeklyLink.locator('#starpath-HauntingElegance2026-Week01Task01.permalink-focused').waitFor();
  await weeklyLink.goBack();
  await weeklyLink.waitForFunction(()=>location.search.includes('task=Week02Task03'));
  await weeklyLink.locator('#starpath-HauntingElegance2026-Week02Task03.permalink-focused').waitFor();
  await weeklyLink.close();

  // DB-03 reward slot links are stable across page reload and browser history.
  // The selection is a static source slot, not a player's owned reward.
  const rewardLink=await browser.newPage();
  await rewardLink.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await rewardLink.getByRole('button',{name:'報酬'}).click();
  const firstRewardLink=rewardLink.locator('.reward-entry .duty-permalink').first();
  await firstRewardLink.waitFor({timeout:20000});
  const exactRewardHref=await firstRewardLink.getAttribute('href');
  assert.match(exactRewardHref,/^\/Wand\/guide\/star-path\/\?season=[^&]+&reward=[^&]+%2F[^&]+%2F\d+$/);
  await firstRewardLink.click();
  await rewardLink.waitForFunction(()=>location.search.includes('reward='));
  await rewardLink.locator('.reward-entry.permalink-focused').waitFor({timeout:20000});
  assert.equal(await rewardLink.locator('.reward-entry.permalink-focused').count(),1,
    'a specific reward slot, not every item with the same Item ID, is highlighted');
  assert.equal(await rewardLink.locator('.tabs button.active').innerText(),'報酬');
  assert.equal(await rewardLink.locator('.reward-entry.permalink-focused .duty-permalink').getAttribute('href'),
    exactRewardHref);
  await rewardLink.goBack();
  await rewardLink.waitForFunction(()=>!location.search.includes('reward='));
  assert.equal(await rewardLink.locator('.reward-entry.permalink-focused').count(),0);
  await rewardLink.goForward();
  await rewardLink.locator('.reward-entry.permalink-focused').waitFor({timeout:20000});
  await rewardLink.goto('http://127.0.0.1:4177'+exactRewardHref,{waitUntil:'domcontentloaded'});
  await rewardLink.locator('.reward-entry.permalink-focused').waitFor({timeout:20000});
  await rewardLink.getByRole('button',{name:'通常タスク'}).click();
  assert.equal(new URL(rewardLink.url()).search,'','tab change clears reward deep link');
  assert.equal(await rewardLink.locator('.permalink-focused').count(),0);
  await rewardLink.close();

  const unknownDuty=await browser.newPage();
  await unknownDuty.goto('http://127.0.0.1:4177/Wand/guide/star-path/?season=Seafaring2026&task=Task999',
    {waitUntil:'domcontentloaded'});
  await unknownDuty.locator('.entries li').first().waitFor({timeout:20000});
  assert.equal(await unknownDuty.locator('.permalink-focused').count(),0,
    'foreign task IDs must not highlight a different duty');
  await unknownDuty.close();

  const exchangeOnly=await browser.newPage();
  await exchangeOnly.addInitScript(()=>{Date.now=()=>Date.parse('2026-12-01T14:30:00Z');});
  await exchangeOnly.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await exchangeOnly.getByRole('button',{name:/Seafaring Star Path.*交換期間/}).waitFor({timeout:20000});
  await exchangeOnly.getByRole('button',{name:/Seafaring Star Path.*交換期間/}).click();
  assert.match(await exchangeOnly.locator('.archive-notice').innerText(),/タスク期間は終了しています/);
  assert.match(await exchangeOnly.locator('.archive-notice').innerText(),/サーバーの開催状態は未確認/);
  assert.match(await exchangeOnly.locator('.entries li').first().innerText(),/魚を釣る/);
  await exchangeOnly.close();
  const tampered=await browser.newPage();
  await tampered.route('**/guide/public/starpath-cache-2026-11-22.json',async route=>{
    const original=await route.fetch(),bytes=Buffer.from(await original.body());
    bytes[100]^=1;
    await route.fulfill({response:original,body:bytes});
  });
  await tampered.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await tampered.getByRole('alert').waitFor({timeout:20000});
  assert.match(await tampered.getByRole('alert').innerText(),/fingerprint/);
  await tampered.close();
  const tamperedLocales=await browser.newPage();
  await tamperedLocales.route('**/guide/public/starpath-weekly-locales-2026-11-22.json',async route=>{
    const original=await route.fetch(),bytes=Buffer.from(await original.body());bytes[100]^=1;
    await route.fulfill({response:original,body:bytes});
  });
  await tamperedLocales.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await tamperedLocales.getByRole('alert').waitFor({timeout:20000});
  assert.match(await tamperedLocales.getByRole('alert').innerText(),/fingerprint/);
  await tamperedLocales.close();
  const tamperedDaily=await browser.newPage();
  await tamperedDaily.route('**/guide/public/starpath-daily-haunting-2026-11-22.json',async route=>{
    const original=await route.fetch(),bytes=Buffer.from(await original.body());bytes[100]^=1;
    await route.fulfill({response:original,body:bytes});
  });
  await tamperedDaily.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await tamperedDaily.getByRole('alert').waitFor({timeout:20000});
  assert.match(await tamperedDaily.getByRole('alert').innerText(),/fingerprint/);
  await tamperedDaily.close();
  const badRewards=await browser.newPage();
  await badRewards.route('**/guide/public/starpath-reward-extras-2026-11-22.json',async route=>{
    const original=await route.fetch(),bytes=Buffer.from(await original.body());bytes[100]^=1;
    await route.fulfill({response:original,body:bytes});
  });
  await badRewards.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await badRewards.getByRole('alert').waitFor({timeout:20000});
  assert.match(await badRewards.getByRole('alert').innerText(),/fingerprint/);
  await badRewards.close();
  console.log('Public Star Path: 2 source-pinned seasons, 185 tasks, reward pages, mobile and SHA tamper rejection passed');
  console.log('Public Guide browser: verified static index, lazy details, multi-language labels, target IDs, mobile layout, tamper rejection, quest deep links and history passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
