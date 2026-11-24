/** Public game-art paths. Version and semantic identity belong in the manifest. */
export type ImageVariant = 'original' | 'thumbnail';
const SHA = /^[0-9a-f]{64}$/;
const KEY = /^(original|thumbnail)\/([0-9a-f]{2})\/([0-9a-f]{64})\.webp$/;
export function publicImageKey(variant: ImageVariant, sha256: string): string {
  if ((variant !== 'original' && variant !== 'thumbnail') || !SHA.test(sha256))
    throw new TypeError('Invalid public image identity');
  return variant + '/' + sha256.slice(0, 2) + '/' + sha256 + '.webp';
}
export function parsePublicImageKey(key: unknown): {variant: ImageVariant; sha256: string} | null {
  if (typeof key !== 'string') return null;
  const m = KEY.exec(key);
  if (!m || m[2] !== m[3].slice(0, 2)) return null;
  return {variant: m[1] as ImageVariant, sha256: m[3]};
}
export function publicMediaOrigin(input: string): string {
  const u = new URL(input);
  if (u.protocol !== 'https:' || !['media.dreamwishwand.com', 'cdn.dreamwishwand.com'].includes(u.hostname)
      || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash)
    throw new TypeError('Unapproved public media origin');
  return u.origin;
}
export function publicImageUrl(origin: string, variant: ImageVariant, sha256: string): string {
  return publicMediaOrigin(origin) + '/' + publicImageKey(variant, sha256);
}
