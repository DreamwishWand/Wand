# Dreamwish Wand — repository-wide implementation instructions

## Architecture and workflow

Use Svelte 5 + TypeScript + Rust/WASM + Web Workers; no new production JavaScript. Python is for offline source extraction and generation. Work from current main and retain unrelated streams' changes. Prioritize finished user-facing functionality. Never upload private saves or overwrite their originals.

## Mandatory shared theme contract (Owner, 2026-11-24)

Applies to every present and future service: Collection, Decorate/Explore/Moodboard, Guide, World Editor, Save Editor (Inventory, Chest and other editors), Presets, Gallery, DreamSnaps, Community Help Center and common shell.

- Every service must react immediately to the shared Dawn (`dawn`), Noon (`coral`), Midnight (`night`) selection on the root `data-wand-theme` attribute. Do not maintain a separate theme state.
- Use semantic CSS variables defined by UI-00 in `src/lib/ui/themes.css`: `--wand-bg`, `--wand-menu`, `--wand-card`, `--wand-text`, `--wand-muted`, `--wand-line`, `--wand-accent`, `--wand-accent-strong`, `--wand-accent-contrast`, `--wand-header-hover`, `--wand-focus`. Request missing tokens from UI-00 rather than creating a separate palette.
- Theme all service chrome: surfaces, cards, text, inputs, lists, menus, panels, dialogs, toolbars, borders, buttons, hover/selected/disabled/focus states. Do not hardcode a legacy light/dark UI palette. Preserve game artwork, data-encoded map colors, item swatches and event-type colors; preserve accessible status distinctions.
- New UI must comply from its first implementation. Update existing UI alongside the next relevant implementation task. Do not wait for a cross-service styling PR.
- Verify actual service rendering and legibility in all three themes. Header-only changes or merely declaring CSS variables do not satisfy this requirement.

Shared palette ownership belongs to UI-00; each service stream owns its component styles. See [Owner instruction #666](https://github.com/DreamwishWand/Wand/issues/666).
