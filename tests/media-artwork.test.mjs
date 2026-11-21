import test from 'node:test';
import assert from 'node:assert/strict';
import { publicItemImage, itemArtworkSet, PUBLIC_MEDIA_SCHEMA } from '../src/lib/media/item-artwork.mjs';

const hash = 'a'.repeat(64);
const published = {
  schema: PUBLIC_MEDIA_SCHEMA,
  publicationApproved: true,
  items: {
    '30000031': {
      publicationApproved: true,
      identityVerified: true,
      variants: {
        thumbnail: { path: 'ddv/media/steam-1262/thumbnail/aa/' + hash + '.webp', sha256: hash, width: 128, height: 80 },
        detail: { path: 'ddv/media/steam-1262/detail/aa/' + hash + '.webp', sha256: hash, width: 512, height: 320 }
      }
    }
  }
};

test('public media resolver returns strict relative image paths only', () => {
  assert.equal(publicItemImage(published, 30000031, 'detail', '/Wand')?.href,
               '/Wand/ddv/media/steam-1262/detail/aa/' + hash + '.webp');
  assert.equal(itemArtworkSet(published, 30000031)?.original, null);
  assert.equal(publicItemImage(published, 30000031, 'thumbnail', 'https://example.org'), null);
});

test('private/native manifests cannot become publicly fetchable by mistake', () => {
  assert.equal(publicItemImage({...published, publicationApproved:false}, 30000031), null);
  assert.equal(publicItemImage({...published, schema:'wand.src04.steam-native@1'}, 30000031), null);
  assert.equal(publicItemImage({...published, items:{'30000031':{
    ...published.items['30000031'], publicationApproved:false }}}, 30000031), null);
});

test('unknown, ambiguous and path injected images remain unresolved', () => {
  assert.equal(publicItemImage(published, 1), null);
  assert.equal(publicItemImage(published, '__proto__'), null);
  const edited = structuredClone(published);
  edited.items['30000031'].variants.thumbnail.path = '../private/images/a.webp';
  assert.equal(publicItemImage(edited, 30000031), null);
  edited.items['30000031'].variants.thumbnail.path = published.items['30000031'].variants.thumbnail.path;
  edited.items['30000031'].conflicted = true;
  assert.equal(itemArtworkSet(edited, 30000031), null);
});
