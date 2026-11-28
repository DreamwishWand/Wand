/** Enable only when Collection's real service-neutral Item Page is part of
 * this build. The narrowly scoped lazy glob is evaluated by Vite at build time:
 * no route probe, no HTTP request, no imported page execution. Once both PRs
 * merge, the next normal build activates the link without a manual flag flip. */
const routes=import.meta.glob('/src/routes/*locale=wandLocale*/*itemId=itemId*/*slug=entitySlug*/+page.svelte');
export const ITEM_ENTITY_PAGE_AVAILABLE=Object.hasOwn(routes,
  '/src/routes/[locale=wandLocale]/[itemId=itemId]/[[slug=entitySlug]]/+page.svelte');
