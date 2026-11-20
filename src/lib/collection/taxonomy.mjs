import { collectionFamilyLabel } from './copy.js';

export const CATEGORY_ORDER = Object.freeze([
  'Furniture', 'Landscaping', 'Roads & Fences', 'Wallpaper & Flooring',
  'Buildings', 'Environment Effects', 'Clothing', 'Appearance',
  'Touch of Magic', 'Photo Mode', 'Tools', 'Upgrades',
  'Characters', 'Companions', 'Critters', 'Mounts',
  'Crafting', 'Meals', 'Ingredients', 'Foraging', 'Fish', 'Gems',
  'Timebending', 'Memories', 'Board Game', 'Snippets',
  'Lorekeeper Tales', 'Quest Puzzles', 'Exhibition'
]);

const SPECIAL = {
  en: { Memories: 'Memories', 'Quest Puzzles': 'Quest Puzzles', Exhibition: 'Exhibition' },
  ja: { Memories: '思い出', 'Quest Puzzles': 'クエストのパズル', Exhibition: '展示' },
  fr: { Memories: 'Souvenirs', 'Quest Puzzles': 'Énigmes de quête', Exhibition: 'Exposition' },
  it: { Memories: 'Ricordi', 'Quest Puzzles': 'Enigmi delle missioni', Exhibition: 'Esposizione' },
  de: { Memories: 'Erinnerungen', 'Quest Puzzles': 'Quest-Rätsel', Exhibition: 'Ausstellung' },
  'es-ES': { Memories: 'Recuerdos', 'Quest Puzzles': 'Puzles de misiones', Exhibition: 'Exposición' },
  'zh-CN': { Memories: '回忆', 'Quest Puzzles': '任务谜题', Exhibition: '展览' },
  'pt-BR': { Memories: 'Memórias', 'Quest Puzzles': 'Quebra-cabeças de missões', Exhibition: 'Exposição' }
};

export function categoryLabel(locale, category) {
  return SPECIAL[locale]?.[category] ?? collectionFamilyLabel(locale, category);
}

export function categorySummaries(records, entries) {
  const groups = new Map(CATEGORY_ORDER.map(id => [id, { id, total: 0, tracked: 0, owned: 0, missing: 0 }]));
  for (const record of records) {
    const group = groups.get(record.family);
    if (!group) continue;
    group.total++;
    const status = entries[String(record.itemId)]?.status;
    if (status === 'owned') group.owned++;
    if (status === 'missing') group.missing++;
    if (status === 'owned' || status === 'missing') group.tracked++;
  }
  return Array.from(groups.values());
}

export function filterItems(records, options) {
  const { query = '', category = '', world = '', universe = '', expansion = '', state = 'all', entries = {} } = options ?? {};
  const text = String(query).trim().toLocaleLowerCase();
  return records.filter(item =>
    (!text || item.searchText.includes(text) || String(item.itemId).includes(text)) &&
    (!category || item.family === category) &&
    (!world || item.worlds.includes(world)) &&
    (!universe || item.universes.includes(universe)) &&
    (!expansion || item.expansions.includes(expansion)) &&
    (state === 'all' || entries[String(item.itemId)]?.status === state)
  );
}

export function facetSummaries(records, field, labels, entries = {}) {
  const groups = new Map();
  for (const item of records) {
    for (const id of item[field] ?? []) {
      const value = groups.get(id) ?? { id, total: 0, tracked: 0 };
      value.total++;
      if (entries[String(item.itemId)]?.status) value.tracked++;
      groups.set(id, value);
    }
  }
  return Array.from(groups.values()).map(item => ({ ...item, label: labels(item.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
