// Publication-gated media resolver usable by all Wand surfaces.
// A private SRC-04 native manifest is deliberately not a public manifest.
export const PUBLIC_MEDIA_SCHEMA = 'wand.media.public@1';

const ITEM_ID = /^[1-9][0-9]{0,15}$/;
const ASSET = /^ddv\/media\/[a-zA-Z0-9_-]+\/(?:thumbnail|detail|original)\/[0-9a-f]{2}\/[0-9a-f]{64}\.(?:webp|png)$/;
const HASH = /^[0-9a-f]{64}$/;
const VARIANTS = new Set(['thumbnail', 'detail', 'original']);

function cleanBasePath(basePath) {
  if (typeof basePath !== 'string' ||
      !/^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath)) return null;
  return basePath.replace(/^\/|\/$/g, '');
}

export function publicItemImage(manifest, itemId, variant = 'thumbnail', basePath = '') {
  if (!manifest || manifest.schema !== PUBLIC_MEDIA_SCHEMA ||
      manifest.publicationApproved !== true ||
      typeof manifest.items !== 'object' || !manifest.items ||
      !VARIANTS.has(variant)) return null;
  const id = String(itemId);
  if (!ITEM_ID.test(id) || !Object.hasOwn(manifest.items, id)) return null;
  const entry = manifest.items[id];
  if (!entry || entry.publicationApproved !== true ||
      entry.identityVerified !== true || entry.conflicted === true ||
      !entry.variants || typeof entry.variants !== 'object') return null;
  const media = entry.variants[variant];
  if (!media || typeof media.path !== 'string' || !ASSET.test(media.path) ||
      !HASH.test(media.sha256) || !Number.isInteger(media.width) ||
      !Number.isInteger(media.height) || media.width < 1 || media.height < 1) return null;
  const base = cleanBasePath(basePath);
  if (base === null) return null;
  return {
    href: '/' + (base ? base + '/' : '') + media.path,
    width: media.width,
    height: media.height,
    sha256: media.sha256,
    variant,
    itemId: id
  };
}

export function itemArtworkSet(manifest, itemId, basePath = '') {
  const thumbnail = publicItemImage(manifest, itemId, 'thumbnail', basePath);
  const detail = publicItemImage(manifest, itemId, 'detail', basePath);
  const original = publicItemImage(manifest, itemId, 'original', basePath);
  return thumbnail ? { thumbnail, detail, original } : null;
}
