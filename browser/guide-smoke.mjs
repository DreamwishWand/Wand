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
  console.log('Public Guide browser: static index, lazy details, 8-language UI, mobile width, SHA tamper rejection passed');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
