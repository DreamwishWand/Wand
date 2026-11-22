/** Public Guide must work with shipped static assets, no owner-private imports. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const url = 'http://127.0.0.1:4177/Wand/guide/quests/';
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
  await page.locator('.numbers').waitFor({timeout: 30000});
  assert.match(await page.locator('.numbers').innerText(), /733[\s\S]*7,878[\s\S]*11,782/);
  assert.equal(await page.locator('input[type=file]').count(), 0);
  assert.equal(downloaded.filter(value => value.endsWith('/quest-index.json')).length, 1);
  assert.equal(downloaded.filter(value => value.includes('quest-details-')).length, 0, 'lazy details must not prefetch');
  assert.equal(await page.locator('header.site-header a[href$="/guide/"]').count(), 1, 'main nav must link to unified Guide hub');

  const search = page.getByRole('textbox', {name: 'クエスト名・IDを検索'});
  await search.fill('ドリームライトバレーへようこそ');
  await page.waitForFunction(() => document.querySelector('.count')?.textContent?.includes('1件'));
  await page.locator('.quest-row').first().click();
  await page.locator('.detail .step').first().waitFor({timeout: 20000});
  assert.match(await page.locator('.detail-header').innerText(), /ドリームライトバレーへようこそ/);
  assert.match(await page.locator('.detail').innerText(), /家に入ってみよう/);
  assert.equal(downloaded.filter(value => value.includes('quest-details-')).length, 1, 'one lazy detail part');
  assert.equal(await page.locator('.detail').innerText().then(value => value.includes('<ActivityItem>')), false, 'do not display raw game text tags');

  await page.getByRole('combobox', {name: '表示言語'}).selectOption('en');
  await page.waitForFunction(() => document.querySelector('.detail-header h2')?.textContent?.includes('Welcome to Dreamlight Valley'));
  assert.match(await page.locator('.detail-header').innerText(), /Welcome to Dreamlight Valley/);
  assert.match(await page.locator('.detail').innerText(), /Try to enter the House/);
  await search.fill('Welcome to Dreamlight Valley');
  await page.waitForFunction(() => document.querySelector('.count')?.textContent?.includes('1件'));
  await search.fill('2070000620');
  await page.waitForFunction(() => document.querySelector('.count')?.textContent?.includes('1件'));

  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, 'mobile horizontal overflow');
  await page.getByRole('combobox', {name: '表示言語'}).selectOption('ja');

  // Original-native selector ID 30000031 resolves through the published,
  // exact current Steam 1.26.2 names, without requiring an owner source archive.
  await search.fill('2070000688');
  await page.locator('.quest-row').filter({hasText:'2070000688'}).click();
  await page.locator('.target-chip').filter({hasText:'ピュアナイトシャード'}).first().waitFor({timeout:20000});
  assert.match(await page.locator('.detail').innerText(), /原本の設定数量：5/);
  assert.match(await page.locator('.target-chip').first().innerText(), /ID 30000031/);
  await page.getByRole('combobox',{name:'表示言語'}).selectOption('en');
  await page.locator('.target-chip').filter({hasText:'Purified Night Shard'}).first().waitFor({timeout:20000});
  await page.getByRole('combobox',{name:'表示言語'}).selectOption('ja');

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

  // Direct links from Collection/DB-02 resolve only from the verified index.
  // Clicking another quest updates the URL, and back restores the original.
  const direct = await browser.newPage();
  const deepErrors = [];
  direct.on('pageerror',error=>deepErrors.push(String(error)));
  await direct.goto(url+'?quest=2070000620',{waitUntil:'domcontentloaded'});
  await direct.locator('.detail .step').first().waitFor({timeout:20000});
  assert.match(await direct.locator('.detail-header').innerText(),/ドリームライトバレーへようこそ/);
  assert.equal(await direct.locator('.quest-permalink').getAttribute('href'),'/Wand/guide/quests/?quest=2070000620');
  await direct.getByRole('textbox',{name:'クエスト名・IDを検索'}).fill('2070000688');
  await direct.locator('.quest-row').first().click();
  await direct.waitForFunction(()=>location.search.includes('quest=2070000688'));
  await direct.goBack();
  await direct.waitForFunction(()=>location.search.includes('quest=2070000620'));
  await direct.locator('.detail-header h2').filter({hasText:'ドリームライトバレーへようこそ'}).waitFor({timeout:20000});
  assert.deepEqual(deepErrors,[],deepErrors.join('\n'));
  await direct.close();

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
  assert.equal(await people.locator('input[type=file]').count(),0);
  const charSearch=people.getByRole('searchbox',{name:'キャラクター名称を検索'});
  await charSearch.fill('フランダー');
  assert.equal(await people.locator('.person').count(),1);
  await people.locator('.person').first().click();
  await people.waitForFunction(()=>location.search.includes('character=10000049'));
  assert.equal(await people.locator('.linked li').count(),0,'Flounder has no direct index link');
  assert.match(await people.locator('.details').innerText(),/ゲーム内にクエストが存在しないことを意味しません/);
  await people.getByRole('combobox',{name:'キャラクター名称の表示言語'}).selectOption('en');
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

  // Guide is the top-level user destination; calendar is client-date-driven
  // but explicitly NOT a live API / proof of server availability.
  const hub=await browser.newPage({viewport:{width:390,height:844}});
  const hubErrors=[];
  hub.on('pageerror',e=>hubErrors.push(String(e)));
  await hub.addInitScript(()=>{Date.now=()=>Date.parse('2026-11-22T12:00:00Z');});
  await hub.goto('http://127.0.0.1:4177/Wand/guide/',{waitUntil:'domcontentloaded'});
  await hub.locator('.events-list .schedule-card').first().waitFor({timeout:20000});
  assert.equal(await hub.locator('.guide-sections a').count(),3);
  assert.match(await hub.locator('.calendar-nav').innerText(),/2026年11月/);
  assert.equal(await hub.locator('.events-list .schedule-card').count(),3);
  assert.match(await hub.locator('.events-list').innerText(),/Haunting Elegance/);
  assert.match(await hub.locator('.events-list').innerText(),/Seafaring Star Path/);
  assert.match(await hub.locator('.events-list').innerText(),/The Haunted Floating Festival/);
  assert.match(await hub.locator('.events-list').innerText(),/終了した日程/);
  assert.match(await hub.locator('.events-list').innerText(),/日程上のタスク期間内/);
  assert.match(await hub.locator('.source-note').first().innerText(),/ゲームサーバーの開催状態をリアルタイム取得したものではありません/);
  await hub.getByRole('button',{name:'前の月'}).click();
  assert.match(await hub.locator('.calendar-nav').innerText(),/2026年10月/);
  assert.equal(await hub.locator('.day[aria-label="2026-10-07"] .limited').count(),1);
  assert.equal(await hub.locator('.day[aria-label="2026-10-31"] .limited').count(),1);
  assert.equal(await hub.locator('.day[aria-label="2026-11-01"] .limited').count(),0);
  assert.equal(await hub.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
    'mobile event calendar overflow');
  assert.deepEqual(hubErrors,[],hubErrors.join('\\n'));
  await hub.close();

  const limited=await browser.newPage();
  await limited.goto('http://127.0.0.1:4177/Wand/guide/events/',{waitUntil:'domcontentloaded'});
  await limited.getByRole('heading',{name:'The Haunted Floating Festival'}).waitFor({timeout:20000});
  assert.equal(await limited.locator('.entries article').count(),2);
  assert.match(await limited.locator('.entries').innerText(),/Oogie Boogie/);
  assert.match(await limited.locator('.entries').innerText(),/時刻は未確認/);
  await limited.close();

  // Public Star Path is source-pinned static cache data, not a personal import.
  const star = await browser.newPage({viewport:{width:390,height:844}});
  await star.addInitScript(()=>{Date.now=()=>Date.parse('2026-11-22T12:00:00Z');});
  const starErrors = [];
  const inactiveMediaRequests = [];
  star.on('pageerror',e=>starErrors.push(String(e)));
  star.on('request',r=>{if(/starpath-media-[a-f0-9]+|\/media\/steam-v1\.26\.2\//.test(r.url()))inactiveMediaRequests.push(r.url());});
  await star.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await star.getByRole('button',{name:'Seafaring Star Path'}).waitFor({timeout:20000});
  assert.match(await star.locator('.summary').innerText(),/121 \/ 21/);
  assert.match(await star.locator('.entries li').first().innerText(),/闇のトゲを引っこ抜く/);
  assert.match(await star.locator('.entries li').first().innerText(),/目標 3個/,'source goal visible for initial duty');
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('en');
  assert.match(await star.locator('.entries li').first().innerText(),/Uproot Night Thorns/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('ja');
  await star.getByRole('textbox',{name:'通常タスクを検索'}).fill('Task17');
  assert.match(await star.locator('.entries li').first().innerText(),/ドナルドダックを同行者/);
  assert.match(await star.locator('.entries li').first().innerText(),/目標 10分/,'source hangout duration');
  await star.getByRole('textbox',{name:'通常タスクを検索'}).fill('闇のトゲ');
  assert.match(await star.locator('.entries li').first().innerText(),/闇のトゲ/);
  await star.getByRole('textbox',{name:'通常タスクを検索'}).fill('');
  assert.equal(await star.locator('input[type=file]').count(),0);
  await star.getByRole('button',{name:'Seafaring Star Path'}).click();
  assert.match(await star.locator('.summary').innerText(),/25 \/ 18/);
  assert.match(await star.locator('.entries li').first().innerText(),/魚を釣る/);
  assert.match(await star.locator('.entries li').first().innerText(),/目標 10匹/,'source Seafaring fish target');
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('fr');
  assert.match(await star.locator('.entries li').first().innerText(),/Attrape des poissons/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('ja');
  await star.getByRole('textbox',{name:'通常タスクを検索'}).fill('Task19');
  assert.match(await star.locator('.entries li').first().innerText(),/ピーター・パン/);
  await star.getByRole('textbox',{name:'通常タスクを検索'}).fill('');
  await star.getByRole('button',{name:'週間タスク'}).click();
  assert.equal(await star.locator('.week').count(),6);
  assert.match(await star.locator('.week').first().innerText(),/魚を20匹釣る/);
  assert.match(await star.locator('.week').first().innerText(),/目標 20匹/,'weekly source goal quantity');
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('en');
  assert.match(await star.locator('.week').first().innerText(),/Catch 20 fish/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('de');
  assert.match(await star.locator('.week').nth(2).innerText(),/Fange 20 Fische am schillernden Strand/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('ja');
  assert.match(await star.locator('.week').nth(2).innerText(),/輝きの浜辺で魚を25匹釣る/);
  await star.getByRole('button',{name:'報酬'}).click();
  assert.equal(await star.locator('.week').count(),4);
  assert.match(await star.locator('.hint').first().innerText(),/報酬画像はSRC-04の正式な公開後/);
  assert.equal(await star.locator('.reward-entry img').count(),0,'non-public SRC04 must not render images');
  assert.match(await star.locator('.week').first().innerText(),/アクアマーメイドバックパック/);
  assert.match(await star.locator('.week').first().innerText(),/サル（大尉）/);
  assert.match(await star.locator('.week').first().innerText(),/ムーンストーン/);
  assert.match(await star.locator('.week').first().innerText(),/モチーフ（正式名称なし）/);
  assert.match(await star.locator('.summary').innerText(),/700 ムーンストーン/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('en');
  assert.match(await star.locator('.week').first().innerText(),/Aqua Mermaid Backpack/);
  assert.match(await star.locator('.summary').innerText(),/700 Moonstone/);
  assert.match(await star.locator('.week').first().innerText(),/Lieutenant Monkey/);
  assert.match(await star.locator('.week').first().innerText(),/Motif \(no official display name\)/);
  const rewardSearch=star.getByRole('textbox',{name:'報酬を検索'});
  const rewardTier=star.getByRole('combobox',{name:'報酬の入手枠'});
  await rewardSearch.fill('Lieutenant Monkey');
  assert.equal(await star.locator('.reward-entry').count(),1,'localized reward name search');
  await rewardTier.selectOption('free');
  assert.equal(await star.locator('.reward-entry').count(),0,'free tier excludes premium monkey');
  assert.match(await star.getByRole('status').innerText(),/一致する報酬はありません/);
  await rewardTier.selectOption('premium');
  assert.equal(await star.locator('.reward-entry').count(),1,'premium tier shows premium monkey');
  await rewardSearch.fill('80100000');
  await rewardTier.selectOption('free');
  assert.equal(await star.locator('.reward-entry').count(),1,'free Moonstone excludes paid and recurrent');
  assert.match(await star.locator('.reward-entry').innerText(),/Moonstone/);
  await rewardSearch.fill('');
  await rewardTier.selectOption('all');
  assert.equal(await star.locator('.week').count(),4,'all reward pages restored');
  assert.equal(await star.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'Star Path mobile overflow');
  assert.deepEqual(inactiveMediaRequests,[],'inactive media release must not make requests');
  assert.deepEqual(starErrors,[],starErrors.join('\n'));
  await star.close();
  // The archived season cannot remain actionable after its task deadline.
  const expired=await browser.newPage();
  await expired.addInitScript(()=>{Date.now=()=>Date.parse('2026-12-10T00:00:00Z');});
  await expired.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await expired.getByRole('status').filter({hasText:'タスク期間内と確認できるスターパスはありません'}).waitFor({timeout:20000});
  assert.equal(await expired.getByRole('button',{name:'Seafaring Star Path'}).count(),0);
  assert.equal(await expired.locator('.entries li').count(),0,'ended source cache is not an active task guide');
  await expired.close();
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
