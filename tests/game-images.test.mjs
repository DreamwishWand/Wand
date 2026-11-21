import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GAME_IMAGE_PINS, gameImagePath, gameImageHref } from '../src/lib/collection/game-images.ts';

test('packaged game images retain verified ItemID, size and WebP content digests', async () => {
  assert.equal(Object.keys(GAME_IMAGE_PINS).length, 3);
  for (const [id, pin] of Object.entries(GAME_IMAGE_PINS)) {
    const path = gameImagePath(id);
    assert.ok(path?.endsWith(pin.hash + '.webp'));
    const bytes = await readFile(new URL('../static/' + path, import.meta.url));
    assert.equal(bytes.byteLength, pin.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.hash);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');
    assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.equal(bytes.toString('ascii',12,16),'VP8L');
    assert.equal(gameImageHref('/Wand', Number(id)), '/Wand/' + path);
  }
});
test('missing and noncanonical item images never invent a matching thumbnail', () => {
  assert.equal(gameImagePath(1), null);
  assert.equal(gameImagePath('__proto__'), null);
  assert.equal(gameImagePath('40000047'), null);
  assert.equal(gameImageHref('https://untrusted.example.com',40300045), null);
});
