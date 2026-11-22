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
  assert.equal(await page.locator('header.site-header a[href$="/guide/quests/"]').count(), 1, 'main nav must link to public Guide');

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
  // Public Star Path is source-pinned static cache data, not a personal import.
  const star = await browser.newPage({viewport:{width:390,height:844}});
  const starErrors = [];
  const inactiveMediaRequests = [];
  star.on('pageerror',e=>starErrors.push(String(e)));
  star.on('request',r=>{if(/starpath-media-[a-f0-9]+|\/media\/steam-v1\.26\.2\//.test(r.url()))inactiveMediaRequests.push(r.url());});
  await star.goto('http://127.0.0.1:4177/Wand/guide/star-path/',{waitUntil:'domcontentloaded'});
  await star.getByRole('button',{name:'Seafaring Star Path'}).waitFor({timeout:20000});
  assert.match(await star.locator('.summary').innerText(),/121 \/ 21/);
  assert.match(await star.locator('.entries li').first().innerText(),/闇のトゲを引っこ抜く/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('en');
  assert.match(await star.locator('.entries li').first().innerText(),/Uproot Night Thorns/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('ja');
  await star.getByRole('textbox',{name:'通常タスクを検索'}).fill('闇のトゲ');
  assert.match(await star.locator('.entries li').first().innerText(),/闇のトゲ/);
  await star.getByRole('textbox',{name:'通常タスクを検索'}).fill('');
  assert.equal(await star.locator('input[type=file]').count(),0);
  await star.getByRole('button',{name:'Seafaring Star Path'}).click();
  assert.match(await star.locator('.summary').innerText(),/25 \/ 18/);
  assert.match(await star.locator('.entries li').first().innerText(),/魚を釣る/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('fr');
  assert.match(await star.locator('.entries li').first().innerText(),/Attrape des poissons/);
  await star.getByRole('combobox',{name:'スターパスの表示言語'}).selectOption('ja');
  await star.getByRole('button',{name:'週間タスク'}).click();
  assert.equal(await star.locator('.week').count(),6);
  assert.match(await star.locator('.week').first().innerText(),/魚を20匹釣る/);
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
