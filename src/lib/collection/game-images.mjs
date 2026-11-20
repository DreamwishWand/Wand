export const GAME_IMAGE_VARIANT = 'steam-1.25.3-schema626-lossless160-v1';
export const GAME_IMAGE_SOURCE = Object.freeze({
  platform: 'Steam Windows',
  gameVersion: '1.25.3',
  schema: 626
});
export const GAME_IMAGE_PINS = Object.freeze({
  '40300045': Object.freeze({
    hash: 'be04cf5698b094a1597bac8ceafa9c43d696c4bf75c8be8db2504ce764b58489',
    bytes: 15310
  }),
  '40006110': Object.freeze({
    hash: '4f1ed414b3f554a69dbc7b4e682507274c58ad327ace7e22808469aa1e56eff4',
    bytes: 28176
  }),
  '40005160': Object.freeze({
    hash: '461f6484256c69e5a528adc3af7054301841fc324c237d8bc0d4534830345bec',
    bytes: 5796
  })
});
export function gameImagePath(itemId) {
  const key = String(itemId);
  if (!/^[1-9][0-9]{0,15}$/.test(key)) return null;
  const pin = Object.hasOwn(GAME_IMAGE_PINS, key) ? GAME_IMAGE_PINS[key] : null;
  if (!pin || !/^[a-f0-9]{64}$/.test(pin.hash)) return null;
  return `ddv/item-images/${GAME_IMAGE_VARIANT}/${pin.hash.slice(0,2)}/${pin.hash}.webp`;
}
export function gameImageHref(basePath, itemId, sourcePath = '') {
  const historical = typeof sourcePath === 'string' && /^ddv\/game-thumbnails\/r39\/[0-9a-f]{2}\/[0-9a-f]{64}\.webp$/.test(sourcePath) ? sourcePath : null;
  const path = gameImagePath(itemId) ?? historical;
  if (!path) return null;
  if (typeof basePath !== 'string' || !/^\/?(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(basePath)) return null;
  return (basePath ? '/' + basePath.replace(/^\/+|\/+$/g, '') : '') + '/' + path;
}
